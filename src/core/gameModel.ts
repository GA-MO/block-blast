import { Grid } from "./grid";
import { generateSmartTray } from "./generator";
import { SHAPES, NUM_COLORS } from "./pieces";
import { placementScore, clearScore, explosionScore, feverMultiplier, SCORING } from "./scoring";
import { Rng, SystemRng } from "./rng";
import {
  COLLECTIBLES,
  type Collectible,
  type Collected,
  type Coord,
  type Piece,
  type PlaceResult,
  type SpecialKind,
} from "./types";

export type GameMode = "classic" | "daily" | "adventure" | "collect" | "rush";

/** The 1×1 shape used by Power Blocks (always placeable somewhere). */
const SINGLE_SHAPE = SHAPES.find((s) => s.cells.length === 1)!;

type CollectRecord = Record<Collectible, number>;
function zeroCollect(): CollectRecord {
  const r = {} as CollectRecord;
  for (const t of COLLECTIBLES) r[t] = 0;
  return r;
}

export type GoalType = "score" | "lines" | "perfect" | "collect";
export interface Goal {
  type: GoalType;
  target: number;
}

/** Initial board contents for a level (filled cells + collectibles). */
export interface LevelPreset {
  /** Pre-filled cells: [row, col, colorIndex]. */
  cells?: [number, number, number][];
  /** Collectibles attached to cells: [row, col, type]. Cell is auto-filled if empty. */
  collectibles?: [number, number, Collectible][];
  /** Ice/locked cells (need 2 line-clears): [row, col, colorIndex]. */
  ice?: [number, number, number][];
  /** Bomb cells (detonate a 3×3 area when their line clears): [row, col, colorIndex]. */
  bombs?: [number, number, number][];
  /** Layered collectibles ("armored stars"): [row, col, type, hits]. The cell is
   *  pre-filled with `hits` health — each line-clear cracks one layer; only the
   *  final clear (health→1) collects the star. Counts toward the collect quota. */
  layered?: [number, number, Collectible, number][];
}

export interface GameModelOptions {
  mode?: GameMode;
  /** Seeded Rng for deterministic (daily/adventure) play. */
  rng?: Rng;
  /** Tray generator; defaults to the anti-frustration smart generator. */
  generator?: (grid: Grid, rng: Rng) => Piece[];
  /** Adventure goal; when met, `won` becomes true. */
  goal?: Goal;
  /** Adventure move limit; running out without meeting the goal ends the game. */
  movesLimit?: number;
  /** Initial board setup (Adventure/Collect). */
  preset?: LevelPreset;
  /** Collect-mode quotas per collectible type (gems arrive via tray pieces). */
  collectQuota?: Partial<Record<Collectible, number>>;
  /** How many of the dispensed gems arrive ARMORED (2 line-clears each). */
  armoredGems?: number;
  /** Lines to charge one Power Block (default SCORING.chargeLines; Rush uses fewer). */
  chargeLines?: number;
}

/** Aggregate stats for achievements/analytics. */
export interface GameStats {
  linesClearedTotal: number;
  perfectClears: number;
  maxCombo: number;
  movesUsed: number;
}

/**
 * Orchestrates a single play session across all modes. Pure logic — drives a
 * renderer via the structured PlaceResult it returns. No Phaser, no DOM.
 */
export class GameModel {
  readonly grid: Grid;
  readonly mode: GameMode;
  private rng: Rng;
  private generator: (grid: Grid, rng: Rng) => Piece[];
  readonly goal?: Goal;
  readonly movesLimit?: number;
  private preset?: LevelPreset;
  private collectQuota: CollectRecord = zeroCollect();
  /** Collect mode: gems already handed out via tray pieces (per type). */
  private dispensed: CollectRecord = zeroCollect();
  /** Collect mode: armored gems to dispense (configured total + live remaining). */
  private armoredGemsTotal = 0;
  private armoredRemaining = 0;

  tray: Piece[] = [];
  score = 0;
  combo = 0;
  /** Lines banked toward the next Power Block. */
  charge = 0;
  /** Lines needed to charge one Power Block. */
  readonly chargeLines: number;
  /** A charged Power Block waiting to be dealt into the next tray. */
  pendingSpecial: SpecialKind | null = null;
  /** Separate stream for Power Block rolls, so dispensing never perturbs the
   *  main tray Rng (keeps seeded Daily/Adventure trays stable). */
  private specialRng = new Rng(0x51ec1a7);
  over = false;
  won = false;
  stats: GameStats = { linesClearedTotal: 0, perfectClears: 0, maxCombo: 0, movesUsed: 0 };
  /** How many of each collectible remain to be collected. */
  remainingCollect: CollectRecord = zeroCollect();
  totalCollect: CollectRecord = zeroCollect();

  constructor(opts: GameModelOptions = {}) {
    this.grid = new Grid();
    this.mode = opts.mode ?? "classic";
    this.rng = opts.rng ?? new SystemRng();
    this.generator = opts.generator ?? ((g, r) => generateSmartTray(g, r, this.assistDifficulty()));
    this.goal = opts.goal;
    this.movesLimit = opts.movesLimit;
    this.preset = opts.preset;
    if (opts.collectQuota) for (const t of COLLECTIBLES) this.collectQuota[t] = opts.collectQuota[t] ?? 0;
    this.armoredGemsTotal = opts.armoredGems ?? 0;
    this.chargeLines = opts.chargeLines ?? SCORING.chargeLines;
  }

  start(): void {
    this.grid.reset();
    this.score = 0;
    this.combo = 0;
    this.charge = 0;
    this.pendingSpecial = null;
    this.specialRng = new Rng(0x51ec1a7);
    this.over = false;
    this.won = false;
    this.stats = { linesClearedTotal: 0, perfectClears: 0, maxCombo: 0, movesUsed: 0 };
    this.remainingCollect = zeroCollect();
    this.totalCollect = zeroCollect();
    this.dispensed = zeroCollect();
    this.armoredRemaining = this.armoredGemsTotal;
    this.applyPreset();
    // Gems-on-pieces mode (standalone Collect, or any level with a collectQuota):
    // gems arrive attached to tray pieces instead of being preset on the board.
    if (this.usesGemPieces()) {
      for (const t of COLLECTIBLES) {
        this.totalCollect[t] += this.collectQuota[t];
        this.remainingCollect[t] += this.collectQuota[t];
      }
      this.tray = this.buildCollectTray();
    } else {
      this.tray = this.generator(this.grid, this.rng);
    }
  }

  /** True when gems should arrive on tray pieces (a positive collectQuota). */
  private usesGemPieces(): boolean {
    return COLLECTIBLES.some((t) => this.collectQuota[t] > 0);
  }

  /**
   * Difficulty ramp for the endless modes (Classic/Daily), in [0, 1]. The
   * anti-frustration assist fades and hard pentominoes mix in as score climbs:
   * fully friendly below 300, fully ramped at 2500. Goal-driven modes
   * (Adventure/Collect) always play at 0 so their balance is untouched.
   */
  assistDifficulty(): number {
    if (this.mode !== "classic" && this.mode !== "daily") return 0;
    return Math.max(0, Math.min(1, (this.score - 300) / 2200));
  }

  /** Charge-meter fill in [0,1] (1 also when a Power Block is already waiting). */
  chargeProgress(): number {
    if (this.pendingSpecial) return 1;
    return Math.min(1, this.charge / this.chargeLines);
  }

  /** Deal a waiting Power Block into the given fresh tray (replaces one piece).
   *  Never replaces a gem-carrying piece, so Collect quotas are untouched. */
  private dispenseSpecial(pieces: Piece[]): void {
    if (!this.pendingSpecial) return;
    const slots = pieces.filter((p) => !p.used && !(p.collectibles?.length));
    if (slots.length === 0) return;
    const target = slots[this.specialRng.int(slots.length)];
    pieces[pieces.indexOf(target)] = {
      shape: SINGLE_SHAPE,
      color: this.specialRng.int(NUM_COLORS),
      used: false,
      special: this.pendingSpecial,
    };
    this.pendingSpecial = null;
  }

  /** Collect mode: a normal tray, with gems sprinkled onto pieces for any
   *  type whose quota hasn't been fully handed out yet. */
  private buildCollectTray(): Piece[] {
    const pieces = generateSmartTray(this.grid, this.rng);
    const need = COLLECTIBLES.filter((t) => this.dispensed[t] < this.collectQuota[t]);
    // Hand out up to 2 gems per tray (most-needed types first) so the board
    // doesn't flood, but quotas still arrive steadily.
    let handed = 0;
    for (const type of need) {
      if (handed >= 2) break;
      if (this.rng.next() > 0.85) continue; // small chance to skip, for variety
      const open = pieces.filter((p) => !p.used);
      if (open.length === 0) break;
      const piece = open[this.rng.int(open.length)];
      const cell = piece.shape.cells[this.rng.int(piece.shape.cells.length)];
      piece.collectibles = piece.collectibles ?? [];
      if (piece.collectibles.some((g) => g.dr === cell[0] && g.dc === cell[1])) continue;
      const armored = this.armoredRemaining > 0;
      if (armored) this.armoredRemaining -= 1;
      piece.collectibles.push({ dr: cell[0], dc: cell[1], type, ...(armored ? { hits: 2 } : {}) });
      this.dispensed[type] += 1;
      handed += 1;
    }
    return pieces;
  }

  private applyPreset(): void {
    if (!this.preset) return;
    for (const [r, c, color] of this.preset.cells ?? []) {
      if (this.grid.inBounds(r, c)) this.grid.cells[r][c] = color;
    }
    for (const [r, c, color] of this.preset.ice ?? []) {
      if (!this.grid.inBounds(r, c)) continue;
      this.grid.cells[r][c] = color;
      this.grid.health[r][c] = 2;
    }
    for (const [r, c, color] of this.preset.bombs ?? []) {
      if (!this.grid.inBounds(r, c)) continue;
      this.grid.cells[r][c] = color;
      this.grid.bombs[r][c] = true;
    }
    for (const [r, c, type] of this.preset.collectibles ?? []) {
      if (!this.grid.inBounds(r, c)) continue;
      if (this.grid.cells[r][c] === null) this.grid.cells[r][c] = 5; // default block color
      this.grid.attachments[r][c] = type;
      this.totalCollect[type] += 1;
      this.remainingCollect[type] += 1;
    }
    // Layered ("armored") collectibles: a filled cell with health = hits that
    // must be line-cleared `hits` times before its star is collected.
    for (const [r, c, type, hits] of this.preset.layered ?? []) {
      if (!this.grid.inBounds(r, c)) continue;
      this.grid.cells[r][c] = this.grid.cells[r][c] ?? 5;
      this.grid.health[r][c] = Math.max(1, hits);
      this.grid.attachments[r][c] = type;
      this.totalCollect[type] += 1;
      this.remainingCollect[type] += 1;
    }
  }

  remainingPieces(): Piece[] {
    return this.tray.filter((p) => !p.used);
  }

  hasValidMove(): boolean {
    return this.remainingPieces().some((p) => this.grid.canPlaceAnywhere(p.shape));
  }

  movesLeft(): number | undefined {
    return this.movesLimit === undefined ? undefined : Math.max(0, this.movesLimit - this.stats.movesUsed);
  }

  canPlace(trayIndex: number, row: number, col: number): boolean {
    const piece = this.tray[trayIndex];
    if (!piece || piece.used) return false;
    return this.grid.canPlace(piece.shape, row, col);
  }

  place(trayIndex: number, row: number, col: number): PlaceResult {
    const result: PlaceResult = {
      ok: false,
      placedCells: [],
      placedColor: 0,
      clearedRows: [],
      clearedCols: [],
      clearedCells: [],
      cracked: [],
      exploded: [],
      collected: [],
      gainedPlacement: 0,
      gainedClear: 0,
      combo: this.combo,
      fever: false,
      perfectClear: false,
      refilled: false,
      gameOver: this.over,
      won: this.won,
      score: this.score,
    };

    const piece = this.tray[trayIndex];
    if (this.over || !piece || piece.used || !this.grid.canPlace(piece.shape, row, col)) {
      return result;
    }

    result.ok = true;
    result.placedColor = piece.color;
    result.placedCells = this.grid.place(piece.shape, piece.color, row, col);
    // Transfer any gems carried by this piece onto the board (armored gems also
    // set the cell's health so it must be line-cleared `hits` times).
    for (const g of piece.collectibles ?? []) {
      const gr = row + g.dr;
      const gc = col + g.dc;
      if (!this.grid.inBounds(gr, gc)) continue;
      this.grid.attachments[gr][gc] = g.type;
      if (g.hits && g.hits > 1) this.grid.health[gr][gc] = g.hits;
    }
    piece.used = true;
    this.stats.movesUsed += 1;

    const gainedPlacement = placementScore(piece.shape.cells.length);
    this.score += gainedPlacement;
    result.gainedPlacement = gainedPlacement;

    const { rows, cols } = this.grid.findFullLines();
    const lines = rows.length + cols.length;
    if (lines > 0) {
      this.combo += 1;
      const { cleared, cracked, exploded, collected } = this.grid.clearLines(rows, cols);
      result.cracked = cracked;
      result.exploded = exploded;
      result.collected = collected;
      for (const { type } of collected) {
        this.remainingCollect[type] = Math.max(0, this.remainingCollect[type] - 1);
      }
      const perfect = this.grid.isFullyEmpty();
      // FEVER: a hot streak (combo ≥ threshold) multiplies the whole clear.
      const mult = feverMultiplier(this.combo);
      const gainedClear = (clearScore(lines, this.combo, perfect) + explosionScore(exploded.length)) * mult;
      this.score += gainedClear;
      result.fever = mult > 1;

      this.stats.linesClearedTotal += lines;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      if (perfect) this.stats.perfectClears += 1;

      result.clearedRows = rows;
      result.clearedCols = cols;
      result.clearedCells = cleared;
      result.gainedClear = gainedClear;
      result.perfectClear = perfect;

      // Bank the lines toward the next Power Block.
      this.charge += lines;
      if (this.pendingSpecial === null && this.charge >= this.chargeLines) {
        this.charge -= this.chargeLines;
        this.pendingSpecial = this.specialRng.next() < 0.5 ? "boom" : "bolt";
      }
    } else if (!piece.special) {
      // Spending an earned Power Block never breaks a FEVER streak.
      this.combo = 0;
    }
    result.combo = this.combo;

    // Power Block effect, AFTER natural line clears so both can land.
    if (piece.special) {
      const blast = piece.special === "boom" ? this.grid.explodeAt(row, col) : this.grid.blastLine(row, col);
      for (const { type } of blast.collected) {
        this.remainingCollect[type] = Math.max(0, this.remainingCollect[type] - 1);
      }
      result.exploded = result.exploded.concat(blast.exploded);
      result.cracked = result.cracked.concat(blast.cracked);
      result.collected = result.collected.concat(blast.collected);
      const gained = explosionScore(blast.exploded.length) * feverMultiplier(this.combo);
      this.score += gained;
      result.gainedClear += gained;
      result.special = piece.special;
    }

    if (this.remainingPieces().length === 0) {
      this.tray = this.usesGemPieces() ? this.buildCollectTray() : this.generator(this.grid, this.rng);
      this.dispenseSpecial(this.tray);
      result.refilled = true;
    }

    // Goal handling. ALL goals (score/lines/perfect/collect) end the level the
    // moment they're met — each level is a pass/fail puzzle, not a star chase.
    if (this.goal && this.goalMet()) {
      this.won = true;
      this.over = true;
    }
    // Collect mode: win when every quota is fully collected.
    if (this.mode === "collect" && COLLECTIBLES.every((t) => this.remainingCollect[t] === 0)) {
      this.won = true;
      this.over = true;
    }
    // End-of-game checks: no valid move, or the move limit is reached.
    if (!this.over) {
      const noMoves = !this.hasValidMove();
      const outOfMoves = this.movesLimit !== undefined && this.stats.movesUsed >= this.movesLimit;
      if (noMoves || outOfMoves) this.over = true;
    }

    result.gameOver = this.over;
    result.won = this.won;
    result.score = this.score;
    return result;
  }

  private goalMet(): boolean {
    if (!this.goal) return false;
    switch (this.goal.type) {
      case "score":
        return this.score >= this.goal.target;
      case "lines":
        return this.stats.linesClearedTotal >= this.goal.target;
      case "perfect":
        return this.stats.perfectClears >= this.goal.target;
      case "collect":
        return COLLECTIBLES.every((t) => this.remainingCollect[t] === 0);
    }
  }

  /** Goal completion in [0,1] for progress UI. */
  goalProgress(): number {
    if (!this.goal) return 0;
    if (this.goal.type === "collect") {
      const total = COLLECTIBLES.reduce((s, t) => s + this.totalCollect[t], 0);
      if (total === 0) return 1;
      const got = total - COLLECTIBLES.reduce((s, t) => s + this.remainingCollect[t], 0);
      return Math.min(1, got / total);
    }
    let cur = 0;
    if (this.goal.type === "score") cur = this.score;
    else if (this.goal.type === "lines") cur = this.stats.linesClearedTotal;
    else cur = this.stats.perfectClears;
    return Math.min(1, cur / this.goal.target);
  }

  // ---------- Boosters ----------

  /** Swap: regenerate the whole tray (a waiting Power Block is re-dealt, not lost). */
  swapTray(): void {
    this.tray = this.generator(this.grid, this.rng);
    this.dispenseSpecial(this.tray);
    if (!this.hasValidMove()) this.over = true;
  }

  /** Hammer: remove a single filled cell. Returns true if a block was removed. */
  removeCell(row: number, col: number): boolean {
    if (!this.grid.inBounds(row, col) || this.grid.cells[row][col] === null) return false;
    this.grid.cells[row][col] = null;
    return true;
  }

  /**
   * Bomb booster: detonate a chosen 3×3 (chains through bombs). Scores the blast,
   * banks any collectibles caught in it, and re-checks win/lose. Returns the
   * affected cells for the renderer (empty `exploded` = nothing was there).
   */
  detonate(row: number, col: number): { exploded: Coord[]; cracked: Coord[]; collected: Collected[] } {
    const res = this.grid.explodeAt(row, col);
    for (const { type } of res.collected) {
      this.remainingCollect[type] = Math.max(0, this.remainingCollect[type] - 1);
    }
    this.score += explosionScore(res.exploded.length);
    if (this.goal && this.goalMet()) {
      this.won = true;
      this.over = true;
    }
    return res;
  }

  /** Revive: clear the bottom rows to make room and resume. Returns cleared coords. */
  revive(rowsToClear = 4): Coord[] {
    const cleared: Coord[] = [];
    const from = Math.max(0, this.grid.size - rowsToClear);
    for (let r = from; r < this.grid.size; r++) {
      for (let c = 0; c < this.grid.size; c++) {
        // Keep collectible cells so a revive can never destroy required items.
        if (this.grid.cells[r][c] !== null && this.grid.attachments[r][c] === null) {
          this.grid.cells[r][c] = null;
          this.grid.health[r][c] = 1;
          this.grid.bombs[r][c] = false;
          cleared.push([r, c]);
        }
      }
    }
    this.over = false;
    this.won = false;
    if (this.remainingPieces().length === 0 || !this.hasValidMove()) {
      this.tray = this.generator(this.grid, this.rng);
    }
    return cleared;
  }
}
