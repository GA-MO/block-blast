/**
 * GAME-BALANCE PLAYTESTER
 * ------------------------
 * A bot that plays every Adventure level through the REAL GameModel and reports
 * solvability / difficulty / stars / fill. Run with:  npx vitest run scripts/playtest.test.ts
 *
 * Determinism / Rng handling
 * --------------------------
 * The smart generator pulls from the seeded Rng each time the tray refills, and
 * the sequence ADAPTS to the current board. We must not consume the live Rng to
 * evaluate hypotheticals. So the bot plans ONLY within the current 3-piece tray:
 * at each "turn" it has up to 3 un-used pieces, and it searches over orderings +
 * placements of just those pieces (a real game tree of depth <= 3, no refill).
 * Once the whole tray is planned, it COMMITS the best line to the live model,
 * which then refills naturally (advancing the real Rng exactly as a human would).
 * It then re-plans the fresh tray. This is the standard "commit the tray, then
 * continue" approximation noted in the task. Within a tray we keep a beam of the
 * top states per ply so it approximates skilled (not greedy) play.
 *
 * Cloning: we never mutate the live model during search. We snapshot the parts of
 * GameModel/Grid state that matter (cells, health, attachments, score, combo,
 * stats, remainingCollect, tray.used flags) into a lightweight SimState and run a
 * faithful re-implementation of `place()`'s board/score/collect effects on it.
 * The committed moves are then replayed on the REAL model via model.place(...),
 * so all final numbers come from the genuine engine.
 */
import { describe, it } from "vitest";
import { GameModel } from "../src/core/gameModel";
import { Grid } from "../src/core/grid";
import { Rng } from "../src/core/rng";
import { generateSmartTray } from "../src/core/generator";
import { placementScore, clearScore, feverMultiplier } from "../src/core/scoring";
import type { Piece, Shape } from "../src/core/types";
import { COLLECTIBLES, type Collectible } from "../src/core/types";
import { LEVELS, getLevel, type Level } from "../src/data/levels";

type CollectRecord = Record<Collectible, number>;
function zeroCollect(): CollectRecord {
  const r = {} as CollectRecord;
  for (const t of COLLECTIBLES) r[t] = 0;
  return r;
}
function cloneCollect(src: CollectRecord): CollectRecord {
  const r = {} as CollectRecord;
  for (const t of COLLECTIBLES) r[t] = src[t];
  return r;
}
function sumCollect(src: CollectRecord): number {
  let n = 0;
  for (const t of COLLECTIBLES) n += src[t];
  return n;
}

const SIZE = 8;

// ----------------------------- SimState -----------------------------------
// A cheap, mutable copy of the board + counters that we can branch on freely.
interface SimState {
  cells: (number | null)[][];
  health: number[][];
  attachments: (Collectible | null)[][];
  score: number;
  combo: number;
  /** Remaining-to-collect per type (green/gold/red). */
  rem: CollectRecord;
  linesCleared: number;
  perfectClears: number;
  maxCombo: number;
  movesUsed: number;
}

function snapshot(model: GameModel): SimState {
  const g = model.grid;
  return {
    cells: g.cells.map((row) => row.slice()),
    health: g.health.map((row) => row.slice()),
    attachments: g.attachments.map((row) => row.slice()),
    score: model.score,
    combo: model.combo,
    rem: cloneCollect(model.remainingCollect),
    linesCleared: model.stats.linesClearedTotal,
    perfectClears: model.stats.perfectClears,
    maxCombo: model.stats.maxCombo,
    movesUsed: model.stats.movesUsed,
  };
}

function cloneState(s: SimState): SimState {
  return {
    cells: s.cells.map((r) => r.slice()),
    health: s.health.map((r) => r.slice()),
    attachments: s.attachments.map((r) => r.slice()),
    score: s.score,
    combo: s.combo,
    rem: cloneCollect(s.rem),
    linesCleared: s.linesCleared,
    perfectClears: s.perfectClears,
    maxCombo: s.maxCombo,
    movesUsed: s.movesUsed,
  };
}

function canPlace(s: SimState, shape: Shape, br: number, bc: number): boolean {
  for (const [dr, dc] of shape.cells) {
    const r = br + dr;
    const c = bc + dc;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || s.cells[r][c] !== null) return false;
  }
  return true;
}

// Faithful re-implementation of GameModel.place board/score/collect effects.
function applyPlace(s: SimState, piece: Piece, br: number, bc: number): void {
  const color = piece.color;
  for (const [dr, dc] of piece.shape.cells) {
    s.cells[br + dr][bc + dc] = color;
    s.health[br + dr][bc + dc] = 1;
  }
  // Transfer any gems carried by this piece onto the sim board (mirrors the real
  // model.place: gems-on-pieces land on attachments at the placed cell).
  for (const g of piece.collectibles ?? []) {
    const r = br + g.dr;
    const c = bc + g.dc;
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      s.attachments[r][c] = g.type;
      if (g.hits && g.hits > 1) s.health[r][c] = g.hits; // armored gem
    }
  }
  s.movesUsed += 1;
  s.score += placementScore(piece.shape.cells.length);

  // find full lines
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    if (s.cells[r].every((v) => v !== null)) rows.push(r);
  }
  for (let c = 0; c < SIZE; c++) {
    let full = true;
    for (let r = 0; r < SIZE; r++) {
      if (s.cells[r][c] === null) {
        full = false;
        break;
      }
    }
    if (full) cols.push(c);
  }
  const lines = rows.length + cols.length;
  if (lines > 0) {
    s.combo += 1;
    // unique line cells
    const seen = new Set<number>();
    const lineCells: [number, number][] = [];
    const add = (r: number, c: number) => {
      const k = r * SIZE + c;
      if (!seen.has(k)) {
        seen.add(k);
        lineCells.push([r, c]);
      }
    };
    for (const r of rows) for (let c = 0; c < SIZE; c++) add(r, c);
    for (const c of cols) for (let r = 0; r < SIZE; r++) add(r, c);

    // collect (health<=1) collectibles → decrement remaining for that type
    for (const [r, c] of lineCells) {
      const a = s.attachments[r][c];
      if (a && s.health[r][c] <= 1) {
        s.rem[a] = Math.max(0, s.rem[a] - 1);
      }
    }
    // clear / crack
    for (const [r, c] of lineCells) {
      if (s.health[r][c] > 1) {
        s.health[r][c] -= 1;
      } else {
        s.cells[r][c] = null;
        s.attachments[r][c] = null;
        s.health[r][c] = 1;
      }
    }
    // perfect?
    let perfect = true;
    for (let r = 0; r < SIZE && perfect; r++)
      for (let c = 0; c < SIZE; c++)
        if (s.cells[r][c] !== null) {
          perfect = false;
          break;
        }
    // Mirror GameModel.place: FEVER streaks multiply the whole clear score.
    s.score += clearScore(lines, s.combo, perfect) * feverMultiplier(s.combo);
    s.linesCleared += lines;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    if (perfect) s.perfectClears += 1;
  } else {
    s.combo = 0;
  }
}

// ----------------------------- Heuristic ----------------------------------
function fillCount(s: SimState): number {
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (s.cells[r][c] !== null) n++;
  return n;
}

// Count empty cells fully enclosed by filled cells/edges (holes) — proxy for board health.
function holes(s: SimState): number {
  let h = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (s.cells[r][c] !== null) continue;
      let blocked = 0;
      const nb: [number, number][] = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];
      for (const [nr, nc] of nb) {
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || s.cells[nr][nc] !== null) blocked++;
      }
      if (blocked >= 3) h++;
    }
  }
  return h;
}

type GoalType = "score" | "lines" | "perfect" | "collect";

// Count filled cells in a row / column (used for gem-line proximity).
function rowFill(s: SimState, r: number): number {
  let n = 0;
  for (let c = 0; c < SIZE; c++) if (s.cells[r][c] !== null) n++;
  return n;
}
function colFill(s: SimState, c: number): number {
  let n = 0;
  for (let r = 0; r < SIZE; r++) if (s.cells[r][c] !== null) n++;
  return n;
}

// For every gem currently attached to the board, reward how close its row/column
// is to being complete (a complete line clears the gem). We take the closer of
// the gem's row/column. A gem whose best line is nearly full is "about to be
// collected" and is worth setting up; full credit when the line is one cell from
// clearing. This pushes the planner to deliberately COMPLETE gem lines rather
// than clear arbitrary lines.
function gemLineProximity(s: SimState): number {
  let v = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!s.attachments[r][c]) continue;
      const best = Math.max(rowFill(s, r), colFill(s, c)); // closer-to-full line
      // best in [0..8]; weight grows steeply as the line approaches full.
      v += (best / SIZE) ** 2;
    }
  }
  return v;
}

// Score a resulting state relative to a base state (the state before the tray)
// so we can value progress made by placements within this tray.
function evaluate(
  s: SimState,
  base: SimState,
  goalType: GoalType,
  need?: CollectRecord, // remaining quota per type at the start of this level/turn
): number {
  let v = 0;
  // Generic board-health terms (always matter — a dead board is a loss).
  v -= fillCount(s) * 1.0;
  v -= holes(s) * 6.0;

  // Reward score gained this tray.
  v += (s.score - base.score) * 0.4;
  // Reward lines cleared this tray (helps lines goals + keeps board clear).
  v += (s.linesCleared - base.linesCleared) * 12.0;

  if (goalType === "collect") {
    // Reward each type collected this tray, weighted by whether it's still
    // needed overall (types already satisfied earn nothing — avoids wasting
    // moves clearing a fully-collected type's stray gems).
    for (const t of COLLECTIBLES) {
      const got = base.rem[t] - s.rem[t];
      if (got <= 0) continue;
      const stillNeeded = need ? need[t] > 0 : true;
      v += got * (stillNeeded ? 600.0 : 120.0);
    }
    // Encourage SETTING UP gem lines: reward gems sitting on near-complete lines.
    v += gemLineProximity(s) * 120.0;
    // Keep the board open so future gem pieces can be placed and lines completed.
    v -= holes(s) * 8.0;
  } else if (goalType === "perfect") {
    v += (s.perfectClears - base.perfectClears) * 1000.0;
    // bias toward emptier boards so a perfect clear becomes reachable
    v -= fillCount(s) * 4.0;
  } else if (goalType === "lines") {
    v += (s.linesCleared - base.linesCleared) * 30.0;
  } else {
    // score goal: weight score gain more
    v += (s.score - base.score) * 1.2;
  }
  return v;
}

interface PlanStep {
  pieceIndex: number; // index into the live tray
  row: number;
  col: number;
}

// Beam search over placements of the (un-used) pieces in the current tray.
// pieces[]: live tray; usedMask handled by recursion over remaining indices.
function planTray(base: SimState, tray: Piece[], goalType: GoalType): PlanStep[] {
  const BEAM = 12;
  // Types still needed overall = those with positive remaining at turn start.
  const need = cloneCollect(base.rem);
  interface Node {
    state: SimState;
    used: boolean[];
    steps: PlanStep[];
  }
  let beam: Node[] = [
    { state: base, used: tray.map(() => false), steps: [] },
  ];

  for (let depth = 0; depth < tray.length; depth++) {
    const next: Node[] = [];
    for (const node of beam) {
      let expandedAny = false;
      for (let i = 0; i < tray.length; i++) {
        if (node.used[i]) continue;
        const piece = tray[i];
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            if (!canPlace(node.state, piece.shape, r, c)) continue;
            expandedAny = true;
            const ns = cloneState(node.state);
            applyPlace(ns, piece, r, c);
            const used = node.used.slice();
            used[i] = true;
            next.push({ state: ns, used, steps: [...node.steps, { pieceIndex: i, row: r, col: c }] });
          }
        }
      }
      // If no remaining piece can be placed from this node, keep it as terminal.
      if (!expandedAny) next.push(node);
    }
    if (next.length === 0) break;
    // keep best BEAM by heuristic
    next.sort((a, b) => evaluate(b.state, base, goalType, need) - evaluate(a.state, base, goalType, need));
    beam = next.slice(0, BEAM);
  }

  // Choose the best full line. Prefer the node with the best evaluation; if a
  // node achieves the (collect) goal, that's captured by the collect reward.
  beam.sort((a, b) => evaluate(b.state, base, goalType, need) - evaluate(a.state, base, goalType, need));
  return beam[0]?.steps ?? [];
}

// ----------------------------- Driver -------------------------------------
interface LevelReport {
  id: number;
  name: string;
  goalType: GoalType;
  target: number;
  result: "WIN" | "LOSS";
  reason?: string;
  movesUsed: number;
  movesLimit?: number;
  finalScore: number;
  collected: number;
  totalCollect: number;
  peakFillPct: number;
}

function playLevel(level: Level): LevelReport {
  const model = new GameModel({
    mode: "adventure",
    rng: new Rng(level.seed),
    generator: generateSmartTray,
    goal: level.goal,
    movesLimit: level.movesLimit,
    preset: level.preset,
    collectQuota: level.collectQuota,
    armoredGems: level.armoredGems,
  });
  model.start();

  const goalType = level.goal.type as GoalType;
  let peakFill = 0;
  let guard = 0;

  while (!model.over) {
    guard++;
    if (guard > 2000) break; // safety

    const base = snapshot(model);
    const fillNow = fillCount(base) / (SIZE * SIZE);
    if (fillNow > peakFill) peakFill = fillNow;

    const plan = planTray(base, model.tray, goalType);
    if (plan.length === 0) break; // no legal move at all -> dead board

    // Commit the plan, re-checking legality on the live model each step
    // (board changes between steps; plan was computed consistently so this holds).
    for (const step of plan) {
      if (model.over) break;
      if (!model.canPlace(step.pieceIndex, step.row, step.col)) continue;
      model.place(step.pieceIndex, step.row, step.col);
      const f = fillCount(snapshot(model)) / (SIZE * SIZE);
      if (f > peakFill) peakFill = f;
      if (model.over) break;
    }
    // If the tray didn't refill (e.g. some pieces unplaceable & game not over),
    // the loop re-snapshots; if no progress possible the next planTray returns [].
    if (!model.over && model.remainingPieces().length > 0 && plan.length === 0) break;
  }

  const totalCollect = sumCollect(model.totalCollect);
  const collected = totalCollect - sumCollect(model.remainingCollect);

  let reason: string | undefined;
  if (!model.won) {
    if (!model.hasValidMove()) reason = "dead-board";
    else if (model.movesLimit !== undefined && model.stats.movesUsed >= model.movesLimit)
      reason = "out-of-moves";
    else reason = "goal-unreachable";
  }

  return {
    id: level.id,
    name: level.name,
    goalType,
    target: level.goal.target,
    result: model.won ? "WIN" : "LOSS",
    reason,
    movesUsed: model.stats.movesUsed,
    movesLimit: level.movesLimit,
    finalScore: model.score,
    collected,
    totalCollect,
    peakFillPct: Math.round(peakFill * 100),
  };
}

// Run the level multiple times with slight tie-break perturbation? The engine is
// fully deterministic given seed + our deterministic bot, so a single run is the
// canonical result. We also probe "best achievable score" by playing a score-
// maximizing variant to judge whether 3-star thresholds are reachable.
function playForMaxScore(level: Level): { score: number; movesUsed: number; won: boolean } {
  const model = new GameModel({
    mode: "adventure",
    rng: new Rng(level.seed),
    generator: generateSmartTray,
    // Drop the goal so the level can't end early on a win — we want the TRUE
    // best-achievable score over the full move budget (the score-target
    // reachability ceiling). Levels end immediately on goalMet() now, so keeping
    // the goal here would truncate the probe at ~target.
    goal: undefined,
    movesLimit: level.movesLimit,
    preset: level.preset,
    collectQuota: level.collectQuota,
    armoredGems: level.armoredGems,
  });
  model.start();
  let guard = 0;
  while (!model.over) {
    if (++guard > 2000) break;
    const base = snapshot(model);
    // Force a pure score/line-maximizing heuristic regardless of goal.
    const plan = planTray(base, model.tray, "score");
    if (plan.length === 0) break;
    for (const step of plan) {
      if (model.over) break;
      if (!model.canPlace(step.pieceIndex, step.row, step.col)) continue;
      model.place(step.pieceIndex, step.row, step.col);
      if (model.over) break;
    }
  }
  return { score: model.score, movesUsed: model.stats.movesUsed, won: model.won };
}

// ---------------- Standalone Collect mode ----------------
interface CollectRun {
  seed: number;
  result: "WIN" | "LOSS";
  reason?: string;
  movesUsed: number;
  collected: number;
  totalCollect: number;
  peakFillPct: number;
}

/** Play standalone Collect mode (quota green6/gold5/red7 by default) with a fixed
 *  seed for reproducibility. No movesLimit: the game ends on win (all quotas
 *  collected) or a dead board. A guard caps runaway loops. */
function playCollect(seed: number, quota: Partial<Record<Collectible, number>>): CollectRun {
  const model = new GameModel({
    mode: "collect",
    rng: new Rng(seed),
    generator: generateSmartTray,
    collectQuota: quota,
  });
  model.start();

  let peakFill = 0;
  let guard = 0;
  while (!model.over) {
    if (++guard > 4000) break;
    const base = snapshot(model);
    const f = fillCount(base) / (SIZE * SIZE);
    if (f > peakFill) peakFill = f;
    const plan = planTray(base, model.tray, "collect");
    if (plan.length === 0) break;
    for (const step of plan) {
      if (model.over) break;
      if (!model.canPlace(step.pieceIndex, step.row, step.col)) continue;
      model.place(step.pieceIndex, step.row, step.col);
      const ff = fillCount(snapshot(model)) / (SIZE * SIZE);
      if (ff > peakFill) peakFill = ff;
      if (model.over) break;
    }
  }

  const totalCollect = sumCollect(model.totalCollect);
  const collected = totalCollect - sumCollect(model.remainingCollect);
  let reason: string | undefined;
  if (!model.won) reason = model.hasValidMove() ? "stalled" : "dead-board";
  return {
    seed,
    result: model.won ? "WIN" : "LOSS",
    reason,
    movesUsed: model.stats.movesUsed,
    collected,
    totalCollect,
    peakFillPct: Math.round(peakFill * 100),
  };
}

describe("Adventure playtest", () => {
  it("plays all 18 levels and prints a balance report", () => {
    const reports: LevelReport[] = [];
    const maxScores: Record<number, number> = {};
    for (const level of LEVELS) {
      reports.push(playLevel(level));
      maxScores[level.id] = playForMaxScore(level).score;
    }

    const lines: string[] = [];
    lines.push("\n================ ADVENTURE PLAYTEST REPORT ================\n");
    for (const r of reports) {
      const goalStr =
        r.goalType === "collect"
          ? `collect ${r.collected}/${r.totalCollect}`
          : `${r.goalType} ${r.target}`;
      const movesStr = r.movesLimit !== undefined ? `${r.movesUsed}/${r.movesLimit}` : `${r.movesUsed}/∞`;
      const maxS = maxScores[r.id];
      lines.push(
        `L${String(r.id).padStart(2)} ${r.name.padEnd(15)} | ${r.result.padEnd(4)}` +
          (r.reason ? `(${r.reason})` : "") +
          ` | ${goalStr.padEnd(16)} | moves ${movesStr.padEnd(7)}` +
          ` | score ${String(r.finalScore).padStart(5)}` +
          ` | maxScore≈${maxS} | peakFill ${r.peakFillPct}%`,
      );
    }

    // Sanity analysis
    lines.push("\n---------------- SANITY ANALYSIS ----------------\n");
    for (const r of reports) {
      const notes: string[] = [];
      if (r.result === "LOSS") notes.push(`LOSS via ${r.reason}`);
      if (r.movesLimit !== undefined && r.result === "WIN") {
        const slack = r.movesLimit - r.movesUsed;
        if (slack >= Math.ceil(r.movesLimit * 0.4)) notes.push(`movesLimit loose (+${slack} spare)`);
        if (slack <= 1) notes.push(`movesLimit tight (${slack} spare)`);
      }
      if (notes.length) lines.push(`L${r.id} ${r.name}: ${notes.join("; ")}`);
    }

    lines.push("\n==========================================================\n");
    console.log(lines.join("\n"));
  });

  it("plays standalone Collect mode across several seeds", () => {
    const quota = { green: 6, gold: 5, red: 7 }; // mirrors GameScene collect mode
    const seeds = [2001, 2002, 2003, 2004, 2005];
    const runs = seeds.map((s) => playCollect(s, quota));

    const lines: string[] = ["\n=========== STANDALONE COLLECT MODE ===========\n"];
    lines.push(`quota green:${quota.green} gold:${quota.gold} red:${quota.red} (total ${quota.green + quota.gold + quota.red})\n`);
    for (const r of runs) {
      lines.push(
        `seed ${r.seed} | ${r.result.padEnd(4)}` +
          (r.reason ? `(${r.reason})` : "") +
          ` | collected ${r.collected}/${r.totalCollect}` +
          ` | moves ${String(r.movesUsed).padStart(3)} | peakFill ${r.peakFillPct}%`,
      );
    }
    const wins = runs.filter((r) => r.result === "WIN");
    const winMoves = wins.map((r) => r.movesUsed);
    const avg = winMoves.length ? Math.round(winMoves.reduce((a, b) => a + b, 0) / winMoves.length) : 0;
    const min = winMoves.length ? Math.min(...winMoves) : 0;
    const max = winMoves.length ? Math.max(...winMoves) : 0;
    lines.push(
      `\nwin-rate ${wins.length}/${runs.length}` +
        (winMoves.length ? ` | moves-to-complete avg ${avg} (min ${min}, max ${max})` : ""),
    );
    lines.push("\n===============================================\n");
    console.log(lines.join("\n"));
  });

  it("validates a sample of procedural levels are solvable", () => {
    // Dense early band (where the curve matters most) + sparse high spot-checks.
    const sample = [...Array.from({ length: 32 }, (_, i) => i + 19), 70, 100, 150];
    const lines: string[] = ["\n=========== PROCEDURAL LEVEL SAMPLE ===========\n"];
    let losses = 0;
    for (const id of sample) {
      const level = getLevel(id)!;
      const r = playLevel(level);
      if (r.result === "LOSS") losses++;
      const goalStr =
        r.goalType === "collect" ? `collect ${r.collected}/${r.totalCollect}` : `${r.goalType} ${r.target}`;
      lines.push(
        `L${String(id).padStart(3)} ${r.name.padEnd(14)} | ${r.result.padEnd(4)}` +
          (r.reason ? `(${r.reason})` : "") +
          ` | ${goalStr.padEnd(16)} | moves ${r.movesUsed}/${r.movesLimit} | peakFill ${r.peakFillPct}%`,
      );
    }
    lines.push(`\n${sample.length - losses}/${sample.length} solvable by the bot.`);

    // Score-target reachability: the points-per-move factor ramps with level, so
    // verify the (rising) target stays within the best-achievable score over the
    // full move budget. maxScore is full-budget maximizing play (goal dropped).
    lines.push("\n--- score-target reachability (target vs maxScore) ---");
    for (const id of [21, 51, 81, 138, 201, 303]) {
      const level = getLevel(id)!;
      if (level.goal.type !== "score") continue;
      const max = playForMaxScore(level).score;
      const margin = max - level.goal.target;
      lines.push(
        `L${String(id).padStart(3)} target ${String(level.goal.target).padStart(4)}` +
          ` | maxScore≈${String(max).padStart(4)} | margin ${margin >= 0 ? "+" : ""}${margin}` +
          (margin < 0 ? "  *** UNREACHABLE ***" : ""),
      );
    }
    lines.push("\n===============================================\n");
    console.log(lines.join("\n"));
  });
});
