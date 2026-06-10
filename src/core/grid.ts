import type { Cell, Collectible, Collected, Coord, Shape } from "./types";

export const BOARD_SIZE = 8;

/** Pure board model: placement validity + line detection/clearing. */
export class Grid {
  readonly size: number;
  cells: Cell[][];
  /** Collectible attached to a cell (Collect mode), parallel to `cells`. */
  attachments: (Collectible | null)[][];
  /** Remaining hits to fully clear a cell (1 = normal, 2 = ice/locked). */
  health: number[][];
  /** Bomb markers: a filled cell that detonates a 3×3 area when its line clears. */
  bombs: boolean[][];

  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.cells = Grid.empty(size);
    this.attachments = Grid.emptyAttachments(size);
    this.health = Grid.emptyHealth(size);
    this.bombs = Grid.emptyBombs(size);
  }

  static emptyBombs(size: number): boolean[][] {
    return Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  }

  static empty(size: number): Cell[][] {
    return Array.from({ length: size }, () => Array<Cell>(size).fill(null));
  }

  static emptyAttachments(size: number): (Collectible | null)[][] {
    return Array.from({ length: size }, () => Array<Collectible | null>(size).fill(null));
  }

  static emptyHealth(size: number): number[][] {
    return Array.from({ length: size }, () => Array<number>(size).fill(1));
  }

  reset(): void {
    this.cells = Grid.empty(this.size);
    this.attachments = Grid.emptyAttachments(this.size);
    this.health = Grid.emptyHealth(this.size);
    this.bombs = Grid.emptyBombs(this.size);
  }

  inBounds(r: number, c: number): boolean {
    return r >= 0 && r < this.size && c >= 0 && c < this.size;
  }

  isEmpty(r: number, c: number): boolean {
    return this.inBounds(r, c) && this.cells[r][c] === null;
  }

  /** Can `shape` be placed with its (0,0) at (baseR, baseC)? */
  canPlace(shape: Shape, baseR: number, baseC: number): boolean {
    for (const [dr, dc] of shape.cells) {
      const r = baseR + dr;
      const c = baseC + dc;
      if (!this.inBounds(r, c) || this.cells[r][c] !== null) return false;
    }
    return true;
  }

  /** Is there ANY position where `shape` fits? */
  canPlaceAnywhere(shape: Shape): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.canPlace(shape, r, c)) return true;
      }
    }
    return false;
  }

  /** Place a shape (assumes canPlace). Returns the filled coords. */
  place(shape: Shape, color: number, baseR: number, baseC: number): Coord[] {
    const placed: Coord[] = [];
    for (const [dr, dc] of shape.cells) {
      const r = baseR + dr;
      const c = baseC + dc;
      this.cells[r][c] = color;
      this.health[r][c] = 1; // placed blocks are normal (1 hit)
      this.bombs[r][c] = false;
      placed.push([r, c]);
    }
    return placed;
  }

  /** Rows and columns that are completely filled. */
  findFullLines(): { rows: number[]; cols: number[] } {
    const rows: number[] = [];
    const cols: number[] = [];
    for (let r = 0; r < this.size; r++) {
      if (this.cells[r].every((v) => v !== null)) rows.push(r);
    }
    for (let c = 0; c < this.size; c++) {
      let full = true;
      for (let r = 0; r < this.size; r++) {
        if (this.cells[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) cols.push(c);
    }
    return { rows, cols };
  }

  /** Unique cells covered by the given full rows + columns. */
  lineCells(rows: number[], cols: number[]): Coord[] {
    const seen = new Set<string>();
    const cells: Coord[] = [];
    const add = (r: number, c: number) => {
      const k = `${r},${c}`;
      if (!seen.has(k)) {
        seen.add(k);
        cells.push([r, c]);
      }
    };
    for (const r of rows) for (let c = 0; c < this.size; c++) add(r, c);
    for (const c of cols) for (let r = 0; r < this.size; r++) add(r, c);
    return cells;
  }

  /**
   * Resolve full rows/cols. Cells with health > 1 (ice/locked) lose one hit and
   * STAY filled (cracked); cells at health 1 are emptied. Emptying a bomb cell
   * detonates its 3×3 neighbourhood (single level, no chain). Collectibles on
   * any emptied cell are reported in `collected`.
   */
  clearLines(
    rows: number[],
    cols: number[]
  ): { cleared: Coord[]; cracked: Coord[]; exploded: Coord[]; collected: Collected[] } {
    const cleared: Coord[] = [];
    const cracked: Coord[] = [];
    const exploded: Coord[] = [];
    const collected: Collected[] = [];
    const visited = new Set<string>();
    const bombCells: Coord[] = [];

    const empty = (r: number, c: number, into: Coord[]) => {
      visited.add(`${r},${c}`);
      const a = this.attachments[r][c];
      if (a) collected.push({ type: a, row: r, col: c });
      if (this.bombs[r][c]) bombCells.push([r, c]);
      this.cells[r][c] = null;
      this.attachments[r][c] = null;
      this.bombs[r][c] = false;
      this.health[r][c] = 1;
      into.push([r, c]);
    };

    // 1) Resolve the full lines.
    for (const [r, c] of this.lineCells(rows, cols)) {
      const k = `${r},${c}`;
      if (visited.has(k)) continue;
      if (this.health[r][c] > 1) {
        this.health[r][c] -= 1;
        cracked.push([r, c]);
        visited.add(k);
      } else {
        empty(r, c, cleared);
      }
    }

    // 2) Detonate bombs that were just cleared — explosions CHAIN through any
    //    other bombs caught in the blast.
    this.detonateChain(bombCells, visited, cracked, collected, exploded);
    return { cleared, cracked, exploded, collected };
  }

  /**
   * Detonate the 3×3 area around each origin, chaining: a bomb destroyed by a
   * blast becomes a new origin. Mutates the passed result arrays + `visited`.
   */
  private detonateChain(
    origins: Coord[],
    visited: Set<string>,
    cracked: Coord[],
    collected: Collected[],
    exploded: Coord[]
  ): void {
    const queue: Coord[] = [...origins];
    while (queue.length > 0) {
      const [br, bc] = queue.shift() as Coord;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = br + dr;
          const c = bc + dc;
          if (!this.inBounds(r, c) || this.cells[r][c] === null) continue;
          const k = `${r},${c}`;
          if (visited.has(k)) continue;
          if (this.health[r][c] > 1) {
            this.health[r][c] -= 1;
            cracked.push([r, c]);
            visited.add(k);
          } else {
            visited.add(k);
            const wasBomb = this.bombs[r][c];
            const a = this.attachments[r][c];
            if (a) collected.push({ type: a, row: r, col: c });
            this.cells[r][c] = null;
            this.attachments[r][c] = null;
            this.bombs[r][c] = false;
            this.health[r][c] = 1;
            exploded.push([r, c]);
            if (wasBomb) queue.push([r, c]); // chain!
          }
        }
      }
    }
  }

  /**
   * Bolt Power Block: blast every filled cell in `row` and `col` (ice loses a
   * hit instead of clearing; bombs caught in the blast chain). Returns the
   * affected cells, same contract as `explodeAt`.
   */
  blastLine(row: number, col: number): { exploded: Coord[]; cracked: Coord[]; collected: Collected[] } {
    const exploded: Coord[] = [];
    const cracked: Coord[] = [];
    const collected: Collected[] = [];
    const visited = new Set<string>();
    const bombs: Coord[] = [];
    const targets: Coord[] = [];
    for (let c = 0; c < this.size; c++) targets.push([row, c]);
    for (let r = 0; r < this.size; r++) if (r !== row) targets.push([r, col]);
    for (const [r, c] of targets) {
      if (!this.inBounds(r, c) || this.cells[r][c] === null) continue;
      const k = `${r},${c}`;
      if (visited.has(k)) continue;
      if (this.health[r][c] > 1) {
        this.health[r][c] -= 1;
        cracked.push([r, c]);
        visited.add(k);
      } else {
        visited.add(k);
        const wasBomb = this.bombs[r][c];
        const a = this.attachments[r][c];
        if (a) collected.push({ type: a, row: r, col: c });
        this.cells[r][c] = null;
        this.attachments[r][c] = null;
        this.bombs[r][c] = false;
        this.health[r][c] = 1;
        exploded.push([r, c]);
        if (wasBomb) bombs.push([r, c]);
      }
    }
    this.detonateChain(bombs, visited, cracked, collected, exploded);
    return { exploded, cracked, collected };
  }

  /**
   * Bomb-booster: detonate a chosen 3×3 centred at (row,col), chaining through
   * any bombs in the blast. Returns the affected cells (cleared/cracked/collected).
   */
  explodeAt(row: number, col: number): { exploded: Coord[]; cracked: Coord[]; collected: Collected[] } {
    const exploded: Coord[] = [];
    const cracked: Coord[] = [];
    const collected: Collected[] = [];
    this.detonateChain([[row, col]], new Set<string>(), cracked, collected, exploded);
    return { exploded, cracked, collected };
  }

  isFullyEmpty(): boolean {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.cells[r][c] !== null) return false;
      }
    }
    return true;
  }
}
