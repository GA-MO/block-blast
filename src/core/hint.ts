import { Grid } from "./grid";
import { COLLECTIBLES, type Collectible } from "./types";
import type { GameModel } from "./gameModel";

/**
 * Pure "best move" suggester powering the in-game Hint button.
 *
 * For every un-used tray piece and every legal placement, it simulates the move
 * on a throwaway clone of the real Grid (so the actual game state is never
 * touched) and scores the resulting board with a heuristic. The highest-scoring
 * placement wins; ties break deterministically by (trayIndex, row, col).
 */

/** A clone of `src` that shares no mutable state with it. */
function cloneGrid(src: Grid): Grid {
  const g = new Grid(src.size);
  g.cells = src.cells.map((row) => row.slice());
  g.health = src.health.map((row) => row.slice());
  g.attachments = src.attachments.map((row) => row.slice());
  g.bombs = src.bombs.map((row) => row.slice());
  return g;
}

/** Count of filled cells on the board. */
function fillCount(grid: Grid): number {
  let n = 0;
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (grid.cells[r][c] !== null) n++;
    }
  }
  return n;
}

/** Empty cells that have at least one filled cell above them in the same column. */
function holes(grid: Grid): number {
  let n = 0;
  for (let c = 0; c < grid.size; c++) {
    let seenFilled = false;
    for (let r = 0; r < grid.size; r++) {
      if (grid.cells[r][c] !== null) seenFilled = true;
      else if (seenFilled) n++;
    }
  }
  return n;
}

/**
 * Bonus for leaving rows/columns close to completion (sets up future clears).
 * Counts only lines with one or two empty cells, weighted toward "almost done".
 */
function nearCompleteBonus(grid: Grid): number {
  let bonus = 0;
  const score = (empty: number): number => {
    if (empty === 1) return 6;
    if (empty === 2) return 2;
    return 0;
  };
  for (let r = 0; r < grid.size; r++) {
    let empty = 0;
    for (let c = 0; c < grid.size; c++) if (grid.cells[r][c] === null) empty++;
    if (empty > 0) bonus += score(empty);
  }
  for (let c = 0; c < grid.size; c++) {
    let empty = 0;
    for (let r = 0; r < grid.size; r++) if (grid.cells[r][c] === null) empty++;
    if (empty > 0) bonus += score(empty);
  }
  return bonus;
}

/**
 * Heuristic weights (documented). Higher = more desirable. All applied to the
 * board state *after* the candidate placement and any resulting line clears.
 */
const W = {
  /** Per collectible of a still-NEEDED type that this move collects. Dominant
   *  when the model has a collect quota/goal, so hints chase objectives. */
  neededCollect: 1000,
  /** Per collectible collected regardless of need (still generally good). */
  anyCollect: 40,
  /** Per line cleared. */
  lineCleared: 50,
  /** Per cell destroyed by a bomb explosion. */
  exploded: 20,
  /** Flat reward for a perfect clear (empty board). */
  perfectClear: 300,
  /** Penalty per filled cell remaining (discourages crowding the board). */
  fillPenalty: 1.5,
  /** Penalty per hole (empty cell trapped under a filled cell). */
  holePenalty: 12,
  /** Weight for the near-complete row/column setup bonus. */
  setup: 1,
};

/** Whether the model currently has any outstanding collect requirement. */
function hasCollectObjective(model: GameModel): boolean {
  const objectiveGoal = model.goal?.type === "collect";
  const anyRemaining = COLLECTIBLES.some((t) => model.remainingCollect[t] > 0);
  return objectiveGoal || anyRemaining;
}

/**
 * Suggest a strong placement for one of the current tray pieces.
 * Returns `{ trayIndex, row, col }`, or `null` if nothing is placeable.
 * Pure: never mutates `model` or its grid.
 */
export function suggestMove(
  model: GameModel
): { trayIndex: number; row: number; col: number } | null {
  const grid = model.grid;
  const collectObjective = hasCollectObjective(model);
  // When an objective is active, scale needed-collect weight up so it dominates.
  const neededWeight = collectObjective ? W.neededCollect : W.anyCollect;

  let best: { trayIndex: number; row: number; col: number } | null = null;
  let bestScore = -Infinity;

  for (let trayIndex = 0; trayIndex < model.tray.length; trayIndex++) {
    const piece = model.tray[trayIndex];
    if (!piece || piece.used) continue;

    for (let row = 0; row < grid.size; row++) {
      for (let col = 0; col < grid.size; col++) {
        if (!grid.canPlace(piece.shape, row, col)) continue;

        const clone = cloneGrid(grid);
        clone.place(piece.shape, piece.color, row, col);
        // Transfer the piece's carried collectibles onto the clone, mirroring
        // GameModel.place so simulated clears can collect them.
        for (const g of piece.collectibles ?? []) {
          const gr = row + g.dr;
          const gc = col + g.dc;
          if (clone.inBounds(gr, gc)) clone.attachments[gr][gc] = g.type;
        }

        const { rows, cols } = clone.findFullLines();
        const lines = rows.length + cols.length;
        let collected: { type: Collectible }[] = [];
        let exploded = 0;
        if (lines > 0) {
          const res = clone.clearLines(rows, cols);
          collected = res.collected;
          exploded = res.exploded.length;
        }

        let neededCollected = 0;
        for (const { type } of collected) {
          if (model.remainingCollect[type] > 0) neededCollected++;
        }

        let s = 0;
        s += neededCollected * neededWeight;
        s += collected.length * W.anyCollect;
        s += lines * W.lineCleared;
        s += exploded * W.exploded;
        if (clone.isFullyEmpty()) s += W.perfectClear;
        s -= fillCount(clone) * W.fillPenalty;
        s -= holes(clone) * W.holePenalty;
        s += nearCompleteBonus(clone) * W.setup;

        // Strictly-greater keeps the first-found (lowest trayIndex/row/col)
        // candidate on ties → deterministic for identical model states.
        if (s > bestScore) {
          bestScore = s;
          best = { trayIndex, row, col };
        }
      }
    }
  }

  return best;
}
