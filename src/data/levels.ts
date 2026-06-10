// Adventure mode level definitions + procedural generator. Pure (Rng is a
// pure seeded PRNG); no Phaser/DOM.
//
// Curriculum: mixed objectives that escalate. Collect is the recurring "gold"
// mechanic; collectibles sit atop columns whose bottoms are pre-filled, so the
// player builds each column up to grab them — real play (not 1 move), can't be
// grabbed en masse, and the board stays open (always solvable). Ice (2-hit)
// tiles are mid-game obstacles. Boss levels land on 5/10/15/18.
//
// Levels are pass/fail: clearing the goal completes the level (no 1–3★ grade).
// Difficulty is carried by the goal, move budget, and obstacles — balanced
// against scripts/playtest.test.ts.

import { Rng } from "../core/rng";

export type GoalType = "score" | "lines" | "perfect" | "collect";

export interface Goal {
  type: GoalType;
  target: number;
}

/** A collectible kind (Collect levels). Mirrors core's Collectible union. */
export type Collectible = "green" | "gold" | "red";

/** Initial board contents for a level. */
export interface LevelPreset {
  cells?: [number, number, number][];
  collectibles?: [number, number, Collectible][];
  ice?: [number, number, number][];
  bombs?: [number, number, number][];
  /** Layered "armored" collectibles: [row, col, type, hits]. Needs `hits` line-
   *  clears before the star is collected. */
  layered?: [number, number, Collectible, number][];
}

export interface Level {
  id: number;
  name: string;
  goal: Goal;
  movesLimit?: number;
  seed: number;
  preset?: LevelPreset;
  /** Collect "v2": gems arrive on tray pieces (per-type quota). When set, the
   *  level is gems-on-pieces instead of preset-on-board. */
  collectQuota?: Partial<Record<Collectible, number>>;
  /** How many of the dispensed gems arrive armored (2 line-clears each). */
  armoredGems?: number;
}

/** Collectible at row `gemRow` of column `col`; bottom rows `fillFrom`..7
 *  pre-filled. Staggering `gemRow` across columns prevents a single full row
 *  from grabbing every gem at once (the "grab en masse" exploit). */
function collectCol(col: number, type: Collectible, fillFrom: number, gemRow = 0): LevelPreset {
  const cells: [number, number, number][] = [];
  for (let r = fillFrom; r <= 7; r++) if (r !== gemRow) cells.push([r, col, 5]);
  return { cells, collectibles: [[gemRow, col, type]] };
}

/** Ice (2-hit) obstacle cells. */
function iceCells(coords: [number, number][], color = 4): LevelPreset {
  return { ice: coords.map(([r, c]) => [r, c, color] as [number, number, number]) };
}

/** Scatter `k` bombs in rows 3..6, avoiding the given columns. */
function scatterBombs(rng: Rng, k: number, avoidCols: number[]): LevelPreset {
  const freeCols = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => !avoidCols.includes(c));
  const used = new Set<string>();
  const bombs: [number, number, number][] = [];
  for (let i = 0; i < k && freeCols.length > 0; i++) {
    const c = rng.pick(freeCols);
    const r = 3 + rng.int(4);
    const key = `${r},${c}`;
    if (used.has(key)) continue;
    used.add(key);
    bombs.push([r, c, 0]);
  }
  return { bombs };
}

function mergePresets(...ps: LevelPreset[]): LevelPreset {
  return {
    cells: ps.flatMap((p) => p.cells ?? []),
    collectibles: ps.flatMap((p) => p.collectibles ?? []),
    ice: ps.flatMap((p) => p.ice ?? []),
    bombs: ps.flatMap((p) => p.bombs ?? []),
    layered: ps.flatMap((p) => p.layered ?? []),
  };
}

/** A collectible encased in `hits` armor layers atop column `col`; bottom rows
 *  `fillFrom`..7 pre-filled. Each line-clear over the star cracks one layer; only
 *  the final clear collects it. ("Destroy the star layer by layer.") */
function layeredCol(col: number, type: Collectible, fillFrom: number, hits = 2, gemRow = 0): LevelPreset {
  const cells: [number, number, number][] = [];
  for (let r = fillFrom; r <= 7; r++) if (r !== gemRow) cells.push([r, col, 5]);
  return { cells, layered: [[gemRow, col, type, hits]] };
}

export const LEVELS: Level[] = [
  // --- World 1: learn the basics ---
  { id: 1, name: "First Steps", goal: { type: "score", target: 130 }, movesLimit: 14, seed: 1001 },
  { id: 2, name: "Warming Up", goal: { type: "score", target: 200 }, movesLimit: 16, seed: 1002 },
  { id: 3, name: "Clear the Lines", goal: { type: "lines", target: 4 }, movesLimit: 18, seed: 1003 },
  {
    id: 4,
    name: "First Treasure",
    goal: { type: "collect", target: 1 },
    movesLimit: 9,
    seed: 1004,
    preset: collectCol(3, "gold", 3),
  },
  { id: 5, name: "Checkpoint", goal: { type: "score", target: 210 }, movesLimit: 18, seed: 1005 },

  // --- World 2: pressure + collectible pairs + ice intro ---
  { id: 6, name: "Line Rush", goal: { type: "lines", target: 6 }, movesLimit: 22, seed: 1006 },
  {
    id: 7,
    name: "Twin Stars",
    goal: { type: "collect", target: 2 },
    movesLimit: 12,
    seed: 1007,
    preset: mergePresets(collectCol(2, "gold", 4), collectCol(5, "gold", 4)),
  },
  {
    id: 8,
    name: "Cold Front",
    goal: { type: "score", target: 150 },
    movesLimit: 20,
    seed: 1008,
    preset: iceCells([
      [7, 3],
      [7, 4],
    ]),
  },
  { id: 9, name: "Line Master", goal: { type: "lines", target: 5 }, movesLimit: 19, seed: 1009 },
  {
    id: 10,
    name: "Treasure Run",
    goal: { type: "collect", target: 3 },
    movesLimit: 13,
    seed: 1010,
    preset: mergePresets(collectCol(1, "gold", 4), collectCol(4, "green", 4), collectCol(6, "gold", 4)),
  },

  // --- World 3: harder mixes ---
  { id: 11, name: "Score Sprint", goal: { type: "score", target: 320 }, movesLimit: 24, seed: 1011 },
  {
    id: 12,
    name: "Frozen Vault",
    goal: { type: "collect", target: 4 },
    movesLimit: 17,
    seed: 1012,
    // Intro to ARMORED stars: the gold star in col 2 is encased in 2 ice layers
    // (clear its line twice). Fits the frozen theme.
    preset: mergePresets(
      layeredCol(2, "gold", 4, 2),
      collectCol(1, "gold", 4),
      collectCol(4, "green", 4),
      collectCol(6, "green", 4),
      iceCells([
        [5, 3],
        [6, 3],
      ])
    ),
  },
  {
    id: 13,
    name: "Gem Rain",
    goal: { type: "collect", target: 6 },
    movesLimit: 22,
    seed: 1013,
    // v2: gems arrive on tray pieces (+ a couple of ice obstacles to manage).
    collectQuota: { green: 3, gold: 3 },
    preset: iceCells([
      [4, 4],
      [5, 4],
    ]),
  },
  {
    id: 14,
    name: "Star Cluster",
    goal: { type: "collect", target: 3 },
    movesLimit: 11,
    seed: 1014,
    preset: mergePresets(collectCol(0, "gold", 4), collectCol(3, "gold", 4), collectCol(6, "gold", 4)),
  },
  {
    id: 15,
    name: "Treasure Boss",
    goal: { type: "collect", target: 9 },
    movesLimit: 38,
    seed: 1015,
    // v2 boss: collect all three gem types via tray pieces.
    collectQuota: { green: 3, gold: 3, red: 3 },
  },

  // --- World 4: the gauntlet ---
  {
    id: 16,
    name: "Glacier",
    goal: { type: "lines", target: 9 },
    movesLimit: 26,
    seed: 1016,
    preset: iceCells([
      [0, 2],
      [0, 5],
      [3, 0],
      [3, 7],
    ]),
  },
  {
    id: 17,
    name: "Gem Hoard",
    goal: { type: "collect", target: 8 },
    movesLimit: 34,
    seed: 1017,
    // v2: green + red gems arrive on pieces.
    collectQuota: { green: 4, red: 4 },
  },
  {
    id: 18,
    name: "The Gauntlet",
    goal: { type: "collect", target: 9 },
    movesLimit: 40,
    seed: 1018,
    // v2 finale: all three gem types via pieces, with ice obstacles.
    collectQuota: { green: 3, gold: 3, red: 3 },
    preset: iceCells([
      [3, 3],
      [4, 3],
    ]),
  },
];

/** Number of hand-authored campaign levels; ids beyond this are procedural. */
export const HAND_LEVELS = LEVELS.length;

/** Scatter `k` ice obstacle cells in rows 2..6, avoiding the given columns. */
function scatterIce(rng: Rng, k: number, avoidCols: number[]): LevelPreset {
  const freeCols = [0, 1, 2, 3, 4, 5, 6, 7].filter((c) => !avoidCols.includes(c));
  const used = new Set<string>();
  const ice: [number, number, number][] = [];
  for (let i = 0; i < k && freeCols.length > 0; i++) {
    const c = rng.pick(freeCols);
    const r = 2 + rng.int(5); // rows 2..6
    const key = `${r},${c}`;
    if (used.has(key)) continue;
    used.add(key);
    ice.push([r, c, 4]);
  }
  return { ice };
}

/**
 * Deterministically generate Adventure level `n` (n > HAND_LEVELS). Difficulty
 * ramps with `n`; goals cycle for variety; bosses every 10th. Built only from
 * always-solvable `collectCol`/ice primitives and move budgets sized to the
 * scoring economy — validated by sampling in scripts/playtest.test.ts.
 */
export function proceduralLevel(n: number): Level {
  const rng = new Rng((n * 1103515245 + 12345) >>> 0);
  const t = n - HAND_LEVELS; // tiers past the campaign (≥1)
  const isBoss = n % 10 === 0;

  // Goal rotation: an even mix of the three objective types so no single mode
  // dominates the procedural run (a flat n%5 made 60% of levels Collect).
  // Bosses are always a big Collect (the signature set-piece); otherwise rotate
  // score → lines → collect, which never repeats a type back-to-back.
  const rotation: GoalType[] = ["score", "lines", "collect"];
  const kind: GoalType = isBoss ? "collect" : rotation[t % rotation.length];

  if (kind === "score") {
    // Score rush. Target = moves × a points-per-move FACTOR that climbs with
    // tier (10 → 18, plateauing ~level 138). A flat ×10 made every score level
    // the same intensity and only longer; the ramp forces efficient
    // line-clearing/combos at high levels, not just endurance. Capped at 18 so
    // the goal stays reachable on a congested board (verified by the maxScore
    // probe in scripts/playtest.test.ts).
    const movesLimit = 16 + Math.floor(t / 6);
    const factor = 10 + Math.min(8, t / 15);
    const target = Math.round(movesLimit * factor);
    // Obstacles are LIGHT on score levels: difficulty here comes from the rising
    // score bar, which needs an open board to clear lines/combos against. Heavy
    // ice+bombs choke the board and fight the higher target (and bombs aren't
    // bot-modeled, so they tank the reachability probe).
    const iceN = Math.min(2, Math.floor(t / 16));
    const bombN = Math.min(1, Math.floor(t / 22)); // 0 early, max 1 late
    return {
      id: n,
      name: "Score Rush",
      goal: { type: "score", target },
      movesLimit,
      seed: 7000 + n,
      preset: mergePresets(
        iceN > 0 ? scatterIce(rng, iceN, []) : {},
        bombN > 0 ? scatterBombs(rng, bombN, []) : {}
      ),
    };
  }

  if (kind === "lines") {
    // Line clear. A finite 8×8 congests fast under a line quota, so ramp the
    // target gently and give a generous move budget to recover the board.
    const target = 4 + Math.floor(t / 10);
    const iceN = Math.min(3, Math.floor(t / 12));
    const bombN = Math.min(1, Math.floor(t / 14));
    return {
      id: n,
      name: "Line Clear",
      goal: { type: "lines", target },
      movesLimit: target * 3 + 5,
      seed: 7000 + n,
      preset: mergePresets(iceN > 0 ? scatterIce(rng, iceN, []) : {}, bombN > 0 ? scatterBombs(rng, bombN, []) : {}),
    };
  }

  // Collect — always "Gem Rush" (v2): gems arrive on tray pieces. The old v1
  // build-the-column layout was removed (repetitive; gems were stuck at the top).
  // Depth scales with tier instead: more gem TYPES, ARMORED gems (2 line-clears
  // each), and ICE obstacles. Bosses are big multi-type armored hunts.
  let count = 3 + Math.floor(t / 10);
  if (isBoss) count += 1;
  count = Math.max(3, Math.min(6, count));
  const types: Collectible[] = t > 12 ? ["green", "gold", "red"] : ["green", "gold"];
  const quota: Partial<Record<Collectible, number>> = {};
  for (let i = 0; i < count; i++) {
    const tp = types[i % types.length];
    quota[tp] = (quota[tp] ?? 0) + 1;
  }
  // Some gems arrive armored (need two line-clears). Ramps gently with tier so
  // early bosses aren't brutal; each armored gem buys extra moves to rebuild.
  const armoredGems = isBoss
    ? Math.min(count - 1, 1 + Math.floor(t / 24))
    : Math.max(0, Math.min(count - 2, Math.floor(t / 18)));
  const iceN = Math.min(3, Math.floor(t / 14));
  const movesLimit = count * 4 + 10 + armoredGems * 3 + (isBoss ? 8 : 0);
  return {
    id: n,
    name: isBoss ? "Treasure Boss" : "Gem Rush",
    goal: { type: "collect", target: count },
    movesLimit,
    seed: 7000 + n,
    collectQuota: quota,
    armoredGems,
    preset: iceN > 0 ? scatterIce(rng, iceN, []) : undefined,
  };
}

/** Get a level by id. Ids 1..HAND_LEVELS are hand-authored; beyond that, procedural (infinite). */
export function getLevel(id: number): Level | undefined {
  if (id < 1) return undefined;
  if (id <= HAND_LEVELS) return LEVELS[id - 1];
  return proceduralLevel(id);
}
