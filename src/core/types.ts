/** Pure game-logic types. No Phaser, no DOM. */

/** A board cell: a color index, or null when empty. */
export type Cell = number | null;

/** A collectible kind that can be attached to a board cell / tray piece. */
export type Collectible = "green" | "gold" | "red";

/** All collectible kinds, in display order. */
export const COLLECTIBLES: Collectible[] = ["green", "gold", "red"];

/** A collectible released by clearing the line it sat on. */
export interface Collected {
  type: Collectible;
  row: number;
  col: number;
}

/** [row, col] coordinate. */
export type Coord = readonly [number, number];

/** A piece shape: normalized cell offsets from top-left (0,0). */
export interface Shape {
  /** Stable id (shape signature) so we can dedupe rotations. */
  readonly id: string;
  readonly cells: ReadonlyArray<Coord>;
  readonly rows: number;
  readonly cols: number;
}

/** A collectible carried by a tray piece on a specific cell of its shape. */
export interface PieceGem {
  dr: number;
  dc: number;
  type: Collectible;
  /** Armor layers: when placed, the cell gets this health (>1 = needs that many
   *  line-clears before the star is collected). Defaults to 1 (normal). */
  hits?: number;
}

/** A charged Power Block kind, earned by filling the charge meter:
 *  boom = detonates a 3×3 on placement; bolt = blasts its whole row + column. */
export type SpecialKind = "boom" | "bolt";

/** A concrete tray piece: a shape + a color (+ optional carried gems). */
export interface Piece {
  readonly shape: Shape;
  readonly color: number;
  /** Set true once placed; the slot becomes empty. */
  used: boolean;
  /** Collectibles carried on cells of this piece (Collect mode). */
  collectibles?: PieceGem[];
  /** Power Block: triggers its blast effect when placed (always a 1×1). */
  special?: SpecialKind;
}

/** Result of attempting to place a piece, with everything the renderer needs. */
export interface PlaceResult {
  ok: boolean;
  placedCells: Coord[];
  /** Color of the piece that was placed (needed to animate cleared cells). */
  placedColor: number;
  clearedRows: number[];
  clearedCols: number[];
  clearedCells: Coord[];
  /** Ice/locked cells that lost a hit (stayed filled) on this placement. */
  cracked: Coord[];
  /** Cells destroyed by a bomb's explosion this placement. */
  exploded: Coord[];
  /** A Power Block was placed: which kind (its blast lands in `exploded`). */
  special?: SpecialKind;
  /** Collectibles released by this placement's line clears (Collect mode). */
  collected: Collected[];
  gainedPlacement: number;
  gainedClear: number;
  combo: number;
  /** FEVER active for this clear (combo streak ≥ threshold → score multiplier). */
  fever: boolean;
  perfectClear: boolean;
  /** Tray was refilled with 3 new pieces after this placement. */
  refilled: boolean;
  gameOver: boolean;
  /** Adventure goal met on this placement. */
  won: boolean;
  score: number;
}
