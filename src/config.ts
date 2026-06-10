/** Design resolution + layout constants. The canvas is scaled (FIT) to the
 *  device, so we lay everything out against these fixed numbers. */
export const DESIGN = { width: 540, height: 960 } as const;

export const BOARD = {
  cells: 8,
  cellSize: 52,
  gap: 6,
  pad: 8,
} as const;

/** Board pixel width including padding + gaps. */
export const BOARD_PX =
  BOARD.pad * 2 + BOARD.gap * (BOARD.cells - 1) + BOARD.cellSize * BOARD.cells;

export const BOARD_X = Math.round((DESIGN.width - BOARD_PX) / 2);
export const BOARD_Y = 188;

export const TRAY = {
  y: BOARD_Y + BOARD_PX + 40,
  height: 150,
  scale: 0.62, // tray blocks are smaller than board blocks
} as const;

/**
 * Top-of-screen HUD zones (all above the board at y=BOARD_Y=188). Defined as
 * explicit, non-overlapping bands so the header never crowds itself again:
 *   topBar  ~ y 48  (back · level/best · moves · coins · gear)
 *   score   ~ y 98  (font 46 → spans ~75..121)
 *   objective ~ y 152 (single row: goal text OR collect counters; ~136..168)
 *   board starts at 188.
 */
export const HUD = {
  topBarY: 48,
  scoreY: 98,
  scoreFont: 46,
  objectiveY: 152,
} as const;

/** Block colors (Phaser hex ints). Index = color id used by the model. */
export const COLORS: number[] = [
  0xff2d56, // ruby red
  0xff8020, // deep amber
  0xffcc14, // rich gold
  0x1fc952, // emerald
  0x0ea5f0, // sapphire
  0xa055f5, // amethyst
  0x05cac0, // aquamarine
];

export const THEME = {
  bgTop: 0x1a1060,
  bgBottom: 0x08052a,
  boardBg: 0x100840,
  slot: 0x1e1650,
  text: "#ffffff",
  gold: "#ffc41a",
} as const;

/** Per-collectible visual metadata: fill color, dark outline, and star points. */
export const COLLECTIBLE_META: Record<string, { color: number; outline: number; points: number }> = {
  green: { color: 0x4fe06b, outline: 0x1d6e2e, points: 4 }, // diamond
  gold: { color: 0xffe44d, outline: 0x7a4b00, points: 5 }, // star
  red: { color: 0xff5b5b, outline: 0x7a1414, points: 6 }, // burst
};

/** Supersampling factor for generated textures (crisp on retina). */
export const TEX_RES = 2;

export const STORAGE_KEYS = {
  best: "blockblast.best",
} as const;

/** Center pixel of board cell (row, col). */
export function cellCenter(row: number, col: number): { x: number; y: number } {
  const step = BOARD.cellSize + BOARD.gap;
  return {
    x: BOARD_X + BOARD.pad + col * step + BOARD.cellSize / 2,
    y: BOARD_Y + BOARD.pad + row * step + BOARD.cellSize / 2,
  };
}

/** Top-left pixel of board cell (row, col). */
export function cellTopLeft(row: number, col: number): { x: number; y: number } {
  const step = BOARD.cellSize + BOARD.gap;
  return {
    x: BOARD_X + BOARD.pad + col * step,
    y: BOARD_Y + BOARD.pad + row * step,
  };
}
