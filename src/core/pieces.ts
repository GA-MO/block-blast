import type { Coord, Shape, Piece } from "./types";
import type { Rng } from "./rng";

/** Base polyomino shapes (raw offsets); rotations are derived. */
const BASE_SHAPES: Coord[][] = [
  [[0, 0]], // single
  [[0, 0], [0, 1]], // domino
  [[0, 0], [0, 1], [0, 2]], // line 3
  [[0, 0], [0, 1], [0, 2], [0, 3]], // line 4
  [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]], // line 5
  [[0, 0], [0, 1], [1, 0], [1, 1]], // square 2x2
  [
    [0, 0], [0, 1], [0, 2],
    [1, 0], [1, 1], [1, 2],
    [2, 0], [2, 1], [2, 2],
  ], // square 3x3
  [[0, 0], [1, 0], [1, 1]], // corner tri
  [[0, 0], [1, 0], [2, 0], [2, 1]], // L
  [[0, 1], [1, 1], [2, 1], [2, 0]], // J
  [[0, 0], [0, 1], [0, 2], [1, 1]], // T
  [[0, 1], [0, 2], [1, 0], [1, 1]], // S
  [[0, 0], [0, 1], [1, 1], [1, 2]], // Z
];

function normalize(cells: Coord[]): Coord[] {
  const minR = Math.min(...cells.map((c) => c[0]));
  const minC = Math.min(...cells.map((c) => c[1]));
  return cells
    .map((c) => [c[0] - minR, c[1] - minC] as Coord)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function rotate(cells: Coord[]): Coord[] {
  return cells.map(([r, c]) => [c, -r] as Coord);
}

function signature(cells: Coord[]): string {
  return cells.map((c) => c.join(",")).join("|");
}

function makeShape(cells: Coord[]): Shape {
  const norm = normalize(cells);
  const rows = Math.max(...norm.map((c) => c[0])) + 1;
  const cols = Math.max(...norm.map((c) => c[1])) + 1;
  return { id: signature(norm), cells: norm, rows, cols };
}

/** Awkward pentominoes that only enter the pool at high difficulty
 *  (Classic/Daily late game). Kept OUT of `SHAPES` so Adventure levels and the
 *  anti-frustration guarantee are untouched. */
const HARD_BASE_SHAPES: Coord[][] = [
  [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]], // plus
  [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]], // U
  [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]], // W (staircase)
  [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]], // Z5
  [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], // V (big corner)
];

function expandRotations(bases: Coord[][]): Shape[] {
  const map = new Map<string, Shape>();
  for (const base of bases) {
    let cur = base;
    for (let i = 0; i < 4; i++) {
      const shape = makeShape(cur);
      map.set(shape.id, shape);
      cur = rotate(cur);
    }
  }
  return [...map.values()];
}

/** All shapes including unique rotations, deduped. */
export const SHAPES: ReadonlyArray<Shape> = expandRotations(BASE_SHAPES);

/** Hard-mode pentominoes (unique rotations, deduped). */
export const HARD_SHAPES: ReadonlyArray<Shape> = expandRotations(HARD_BASE_SHAPES);

export const NUM_COLORS = 7;

/** Generate a single random piece. Anti-frustration weighting added in Phase 3. */
export function randomPiece(rng: Rng): Piece {
  const shape = rng.pick(SHAPES);
  const color = rng.int(NUM_COLORS);
  return { shape, color, used: false };
}

/** Generate a fresh tray of 3 pieces. */
export function generateTray(rng: Rng): Piece[] {
  return [randomPiece(rng), randomPiece(rng), randomPiece(rng)];
}
