import type { Piece, Shape } from "./types";
import { Grid } from "./grid";
import { SHAPES, HARD_SHAPES, NUM_COLORS } from "./pieces";
import { Rng } from "./rng";

/** Fraction of filled cells on the board, in [0, 1]. */
export function fillRatio(grid: Grid): number {
  const total = grid.size * grid.size;
  if (total === 0) return 0;
  let filled = 0;
  for (let r = 0; r < grid.size; r++) {
    for (let c = 0; c < grid.size; c++) {
      if (grid.cells[r][c] !== null) filled++;
    }
  }
  return filled / total;
}

/** Number of cells a shape occupies. */
function shapeSize(shape: Shape): number {
  return shape.cells.length;
}

/** Share of picks that are HARD pentominoes at full difficulty. */
const HARD_SHARE_MAX = 0.25;
/** Difficulty below which hard shapes never appear. */
const HARD_ONSET = 0.25;

/**
 * Pick a shape weighted by size with anti-frustration bias.
 * When the board is crowded (high fillRatio), smaller shapes get more weight;
 * when the board is empty, bigger shapes are allowed more often.
 *
 * `difficulty` in [0, 1] fades the assist: the crowding bias is scaled by
 * (1 - difficulty), so at full difficulty the generator no longer favours
 * small pieces on a crowded board. Above HARD_ONSET, awkward pentominoes
 * (HARD_SHAPES) blend into the pool, up to HARD_SHARE_MAX of picks.
 */
function pickWeightedShape(rng: Rng, ratio: number, difficulty: number): Shape {
  // Crowding factor in [0, 1], dampened by difficulty (assist fades).
  const crowd = Math.max(0, Math.min(1, ratio)) * (1 - difficulty);
  // Build weights. For a shape of size s (>= 1):
  //   - small-bias weight grows as size shrinks: (maxSize - s + 1)
  //   - big-allow weight grows with size: s
  // Blend them by crowd: more crowd -> lean on small-bias.
  let maxSize = 1;
  for (const shape of SHAPES) {
    const s = shapeSize(shape);
    if (s > maxSize) maxSize = s;
  }

  const weights: number[] = new Array(SHAPES.length);
  let totalWeight = 0;
  for (let i = 0; i < SHAPES.length; i++) {
    const s = shapeSize(SHAPES[i]);
    const smallBias = maxSize - s + 1; // larger for smaller shapes
    const bigAllow = s; // larger for bigger shapes
    const w = crowd * smallBias + (1 - crowd) * bigAllow;
    // Guard against zero weight (shouldn't happen since both terms >= 1 paths exist).
    const safeW = w > 0 ? w : 1;
    weights[i] = safeW;
    totalWeight += safeW;
  }

  // Hard pentominoes take a share of picks that ramps from 0 at HARD_ONSET
  // to HARD_SHARE_MAX at difficulty 1.
  const hardRamp = Math.max(0, (difficulty - HARD_ONSET) / (1 - HARD_ONSET));
  const hardShare = HARD_SHARE_MAX * hardRamp;
  if (hardShare > 0 && rng.next() < hardShare) {
    return HARD_SHAPES[rng.int(HARD_SHAPES.length)];
  }

  let roll = rng.next() * totalWeight;
  for (let i = 0; i < SHAPES.length; i++) {
    roll -= weights[i];
    if (roll < 0) return SHAPES[i];
  }
  return SHAPES[SHAPES.length - 1];
}

/**
 * Generate a smart tray of 3 pieces with anti-frustration behavior.
 *
 * - Shape selection is weighted by size relative to board crowding.
 * - Colors are random in [0, NUM_COLORS).
 * - GUARANTEE: if at least one shape in SHAPES can be placed on the current
 *   board, then at least one of the 3 returned pieces is placeable.
 * - Deterministic given the same Rng sequence and grid.
 * - `difficulty` in [0, 1] (Classic/Daily ramp): fades the crowding assist and
 *   mixes in hard pentominoes. 0 (default) = the original friendly behavior.
 */
export function generateSmartTray(grid: Grid, rng: Rng, difficulty = 0): Piece[] {
  const ratio = fillRatio(grid);
  const d = Math.max(0, Math.min(1, difficulty));

  const pieces: Piece[] = [];
  for (let i = 0; i < 3; i++) {
    const shape = pickWeightedShape(rng, ratio, d);
    const color = rng.int(NUM_COLORS);
    pieces.push({ shape, color, used: false });
  }

  // Anti-frustration guarantee: ensure at least one piece is placeable.
  const anyPlaceable = pieces.some((p) => grid.canPlaceAnywhere(p.shape));
  if (!anyPlaceable) {
    // Find a shape that can actually be placed somewhere.
    const placeableShapes = SHAPES.filter((s) => grid.canPlaceAnywhere(s));
    if (placeableShapes.length > 0) {
      // Deterministically choose which slot and which placeable shape to swap.
      const slot = rng.int(pieces.length);
      const replacement = rng.pick(placeableShapes);
      pieces[slot] = {
        shape: replacement,
        color: pieces[slot].color,
        used: false,
      };
    }
    // If no shape fits at all, leave the tray as-is (game-over situation).
  }

  return pieces;
}
