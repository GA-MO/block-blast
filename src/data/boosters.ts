// Booster metadata — shared by the in-game booster buttons and the in-run
// purchase prompt. (The standalone shop was removed; boosters are now bought
// directly during play with coins earned from games.)
import type { BoosterKind } from "../systems/economy";

export interface BoosterMeta {
  kind: BoosterKind;
  name: string;
  /** One-line description shown in the buy prompt. */
  desc: string;
  /** Icon texture key (from ensureIcons). */
  icon: string;
  /** Icon tint. */
  tint: number;
  /** Coin price for one. */
  price: number;
}

export const BOOSTER_META: Record<BoosterKind, BoosterMeta> = {
  hammer: { kind: "hammer", name: "Hammer", desc: "Break any one block", icon: "ic_hammer", tint: 0xff8c1a, price: 120 },
  bomb:   { kind: "bomb",   name: "Bomb",   desc: "Blast a 3×3 area",     icon: "ic_bomb",   tint: 0xff4060, price: 180 },
  swap:   { kind: "swap",   name: "Swap",   desc: "Deal three new pieces", icon: "ic_swap",   tint: 0x30c8ff, price: 120 },
  revive: { kind: "revive", name: "Revive", desc: "Clear space & play on", icon: "ic_heart", tint: 0xff5b7a, price: 250 },
};
