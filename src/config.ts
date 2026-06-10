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
  // Sits a touch higher so the grab zone clears the booster row below it
  // (pieces and boosters used to nearly touch, causing accidental booster taps).
  y: BOARD_Y + BOARD_PX + 34,
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

/** Crystal block colors (Phaser hex ints). Index = color id used by the model.
 *  Bright jewel tones tuned to read clearly on the light glass backdrop. */
export const COLORS: number[] = [
  0xff3b6e, // rose quartz
  0xff8a2b, // amber citrine
  0xffc81f, // topaz
  0x22c46b, // emerald
  0x2aa6ff, // sapphire
  0x9d5cf5, // amethyst
  0x18c6c0, // aquamarine
];

/**
 * Dark "deep space / aurora" theme. Near-black space gradient with light text
 * and an aurora cyan-green brand accent (deliberately NOT the purple+gold of
 * Block Blast). Vibrant gem blocks glow against the dark backdrop.
 */
export const THEME = {
  bgTop: 0x112138, // deep space blue
  bgBottom: 0x05070f, // near-black
  boardBg: 0x0c1626, // dark board panel
  slot: 0x16223a, // recessed cell
  text: "#eaf2ff",
  gold: "#34e6c2", // legacy alias → aurora accent
} as const;

/**
 * Shared UI design tokens for the deep-space / aurora identity. Centralised so
 * every scene pulls the same text colors, accent and glass surfaces.
 */
export const UI = {
  /** Primary heading / body text on the dark backdrop. */
  textPrimary: "#eaf2ff",
  /** Secondary / supporting text. */
  textSecondary: "#9fb2d4",
  /** Muted captions, disabled state, page hints. */
  textMuted: "#6b7ba3",
  /** Brand accent (aurora cyan-green) as hex int. */
  accent: 0x2fe6c4,
  accentDark: 0x14b89a,
  /** Accent as a css string for text. */
  accentText: "#3df0cc",
  /** Secondary aurora glow (violet) for accents/particles. */
  accent2: 0xb15cff,
  accent2Int: 0xb15cff,
  /** Text sitting on top of a bright accent fill (dark, for contrast). */
  textOnAccent: "#04231d",
  /** Dark "glass" panel base (use with mid alpha) + cool border + gloss. */
  glass: 0x182a45,
  glassFill: 0x1d3150,
  glassStroke: 0x3f5d8a,
  glassHi: 0xffffff,
  /** Shadow color for depth (black on the dark backdrop). */
  shadow: 0x000000,
  danger: "#ff5b7a",
  dangerInt: 0xff5b7a,
  success: "#3fe08a",
  successInt: 0x2fcf7a,
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
  best: "tessera.best",
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
