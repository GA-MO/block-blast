// Block skins (color palettes) and board themes for the shop.
// Pure data + helpers; no Phaser/DOM/localStorage.

export interface Skin {
  id: string;
  name: string;
  price: number;
  /** Exactly 7 hex color ints, one per block color index. */
  palette: number[];
}

export interface BoardTheme {
  id: string;
  name: string;
  price: number;
  bgTop: number;
  bgBottom: number;
  boardBg: number;
  slot: number;
}

export const DEFAULT_SKIN_ID = "default";
export const DEFAULT_THEME_ID = "default";

export const SKINS: Skin[] = [
  {
    id: "default",
    name: "Crystal",
    price: 0,
    palette: [0xff3b6e, 0xff8a2b, 0xffc81f, 0x22c46b, 0x2aa6ff, 0x9d5cf5, 0x18c6c0],
  },
  {
    id: "seaglass",
    name: "Sea Glass",
    price: 200,
    palette: [0xff9bb0, 0xffc59a, 0xffe79a, 0x9fe7b6, 0x9fd4f5, 0xc9b4f2, 0x9fe6df],
  },
  {
    id: "aurora",
    name: "Aurora",
    price: 400,
    palette: [0xff4d8d, 0xff8a3d, 0xffe14d, 0x4dffa0, 0x4de1ff, 0xb46bff, 0x4dffe0],
  },
  {
    id: "sorbet",
    name: "Sorbet",
    price: 500,
    palette: [0xff7fa6, 0xffac7f, 0xffe07f, 0x8fe6a8, 0x7fc8f5, 0xc78ff2, 0x7fe9da],
  },
  {
    id: "moonstone",
    name: "Moonstone",
    price: 800,
    palette: [0xc7d0e8, 0xb6c2dd, 0xa6b4d2, 0x96a7c8, 0x8699bd, 0x768bb3, 0x6a80aa],
  },
];

// All board themes are deep, dark "space" variants so light UI text stays legible.
export const THEMES: BoardTheme[] = [
  {
    id: "default",
    name: "Aurora",
    price: 0,
    bgTop: 0x112138,
    bgBottom: 0x05070f,
    boardBg: 0x0c1626,
    slot: 0x16223a,
  },
  {
    id: "nebula",
    name: "Nebula",
    price: 300,
    bgTop: 0x241338,
    bgBottom: 0x0a0617,
    boardBg: 0x140a24,
    slot: 0x261746,
  },
  {
    id: "abyss",
    name: "Abyss",
    price: 450,
    bgTop: 0x07262e,
    bgBottom: 0x020a0e,
    boardBg: 0x06202a,
    slot: 0x0e3340,
  },
  {
    id: "ember",
    name: "Ember",
    price: 600,
    bgTop: 0x2a1418,
    bgBottom: 0x0c0608,
    boardBg: 0x1e0f14,
    slot: 0x331a20,
  },
];

export function getSkin(id: string): Skin {
  const found = SKINS.find((s) => s.id === id);
  if (found) {
    return found;
  }
  return SKINS.find((s) => s.id === DEFAULT_SKIN_ID) ?? SKINS[0];
}

export function getTheme(id: string): BoardTheme {
  const found = THEMES.find((t) => t.id === id);
  if (found) {
    return found;
  }
  return THEMES.find((t) => t.id === DEFAULT_THEME_ID) ?? THEMES[0];
}
