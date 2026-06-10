/** Persisted player economy: coins, owned/equipped cosmetics, boosters. */
const KEY = "tessera.economy";

export type BoosterKind = "revive" | "hammer" | "swap" | "bomb";
export type CosmeticKind = "skin" | "theme";

export type Boosters = Record<"revive" | "hammer" | "swap" | "bomb", number>;

export interface EconomyData {
  coins: number;
  ownedSkins: string[];
  ownedThemes: string[];
  equippedSkin: string;
  equippedTheme: string;
  boosters: Boosters;
}

const DEFAULTS: EconomyData = {
  coins: 0,
  ownedSkins: ["default"],
  ownedThemes: ["default"],
  equippedSkin: "default",
  equippedTheme: "default",
  // One free of each active booster so new players can try them all (the
  // standalone shop was removed — boosters are now bought in-run). Revive is
  // ad-based, so it starts at 0.
  boosters: { revive: 0, hammer: 1, swap: 1, bomb: 1 },
};

class EconomyStore {
  private data: EconomyData;

  constructor() {
    let loaded: Partial<EconomyData> = {};
    try {
      loaded = JSON.parse(localStorage.getItem(KEY) || "{}");
    } catch {
      loaded = {};
    }
    this.data = {
      ...DEFAULTS,
      ...loaded,
      ownedSkins: loaded.ownedSkins ?? [...DEFAULTS.ownedSkins],
      ownedThemes: loaded.ownedThemes ?? [...DEFAULTS.ownedThemes],
      boosters: { ...DEFAULTS.boosters, ...loaded.boosters },
    };
  }

  getCoins(): number {
    return this.data.coins;
  }

  addCoins(n: number): void {
    this.data.coins += n;
    this.save();
  }

  /** Spend coins; returns false (no-op) if insufficient. */
  spendCoins(n: number): boolean {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.save();
    return true;
  }

  private list(kind: CosmeticKind): string[] {
    return kind === "skin" ? this.data.ownedSkins : this.data.ownedThemes;
  }

  isOwned(kind: CosmeticKind, id: string): boolean {
    return this.list(kind).includes(id);
  }

  own(kind: CosmeticKind, id: string): void {
    if (this.isOwned(kind, id)) return;
    this.list(kind).push(id);
    this.save();
  }

  equipSkin(id: string): void {
    this.data.equippedSkin = id;
    this.save();
  }

  equipTheme(id: string): void {
    this.data.equippedTheme = id;
    this.save();
  }

  getEquippedSkin(): string {
    return this.data.equippedSkin;
  }

  getEquippedTheme(): string {
    return this.data.equippedTheme;
  }

  getBoosters(): Boosters {
    return { ...this.data.boosters };
  }

  addBooster(kind: BoosterKind, n = 1): void {
    this.data.boosters[kind] += n;
    this.save();
  }

  /** Consume one booster; returns false (no-op) if none available. */
  useBooster(kind: BoosterKind): boolean {
    if (this.data.boosters[kind] <= 0) return false;
    this.data.boosters[kind] -= 1;
    this.save();
    return true;
  }

  private save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }
}

export const Economy = new EconomyStore();
