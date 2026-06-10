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
    name: "Classic",
    price: 0,
    palette: [0xff2d56, 0xff8020, 0xffcc14, 0x1fc952, 0x0ea5f0, 0xa055f5, 0x05cac0],
  },
  {
    id: "pastel",
    name: "Pastel",
    price: 200,
    palette: [0xffb3b3, 0xffd1a3, 0xfff0a3, 0xbdf0c4, 0xbfe3ff, 0xd6c2ff, 0xb8f0ea],
  },
  {
    id: "neon",
    name: "Neon",
    price: 400,
    palette: [0xff2d6f, 0xff7a00, 0xfff700, 0x39ff14, 0x00e5ff, 0xb026ff, 0x00ffc8],
  },
  {
    id: "candy",
    name: "Candy",
    price: 500,
    palette: [0xff6b9d, 0xffa06b, 0xffe66b, 0x7be8a3, 0x6bc8ff, 0xc06bff, 0x6bffe0],
  },
  {
    id: "mono",
    name: "Mono",
    price: 800,
    palette: [0xe8e8e8, 0xcfcfcf, 0xb6b6b6, 0x9d9d9d, 0x848484, 0x6b6b6b, 0x525252],
  },
];

export const THEMES: BoardTheme[] = [
  {
    id: "default",
    name: "Royal",
    price: 0,
    bgTop: 0x1a1060,
    bgBottom: 0x08052a,
    boardBg: 0x100840,
    slot: 0x1e1650,
  },
  {
    id: "midnight",
    name: "Midnight",
    price: 300,
    bgTop: 0x0e1428,
    bgBottom: 0x040810,
    boardBg: 0x080c20,
    slot: 0x121830,
  },
  {
    id: "sunset",
    name: "Sunset",
    price: 450,
    bgTop: 0xc84030,
    bgBottom: 0x5a1030,
    boardBg: 0x3e1025,
    slot: 0x5e1e3a,
  },
  {
    id: "forest",
    name: "Forest",
    price: 600,
    bgTop: 0x0e5e30,
    bgBottom: 0x061a0e,
    boardBg: 0x081a10,
    slot: 0x102a1c,
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
