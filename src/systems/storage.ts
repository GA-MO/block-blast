import { STORAGE_KEYS } from "../config";

const KEYS = {
  best: STORAGE_KEYS.best,
  bestRush: "blockblast.best.rush",
  daily: "blockblast.daily", // { [dateKey]: bestScore }
  dailyStreak: "blockblast.dailyStreak", // { lastKey, count }
  levelStars: "blockblast.levelStars", // { [levelId]: stars }
  lifetime: "blockblast.lifetime", // aggregate stats for achievements
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export interface LifetimeStats {
  bestScore: number;
  gamesPlayed: number;
  totalLinesCleared: number;
  maxCombo: number;
  perfectClears: number;
}

/** localStorage-backed persistence (swap for cloud save later). */
export const Storage = {
  getBest(): number {
    return parseInt(localStorage.getItem(KEYS.best) || "0", 10) || 0;
  },
  setBest(score: number): void {
    localStorage.setItem(KEYS.best, String(score));
  },
  getRushBest(): number {
    return parseInt(localStorage.getItem(KEYS.bestRush) || "0", 10) || 0;
  },
  setRushBest(score: number): void {
    localStorage.setItem(KEYS.bestRush, String(score));
  },

  // ----- Daily -----
  getDailyBest(dateKey: string): number {
    return readJSON<Record<string, number>>(KEYS.daily, {})[dateKey] ?? 0;
  },
  setDailyBest(dateKey: string, score: number): void {
    const all = readJSON<Record<string, number>>(KEYS.daily, {});
    all[dateKey] = Math.max(all[dateKey] ?? 0, score);
    writeJSON(KEYS.daily, all);
  },
  /** Record a daily play and return the updated streak count. */
  recordDailyStreak(todayKey: string, yesterdayKey: string): number {
    const s = readJSON<{ lastKey: string; count: number }>(KEYS.dailyStreak, { lastKey: "", count: 0 });
    if (s.lastKey === todayKey) return s.count;
    s.count = s.lastKey === yesterdayKey ? s.count + 1 : 1;
    s.lastKey = todayKey;
    writeJSON(KEYS.dailyStreak, s);
    return s.count;
  },
  getDailyStreak(): number {
    return readJSON<{ lastKey: string; count: number }>(KEYS.dailyStreak, { lastKey: "", count: 0 }).count;
  },

  // ----- Adventure -----
  getLevelStars(id: number): number {
    return readJSON<Record<number, number>>(KEYS.levelStars, {})[id] ?? 0;
  },
  setLevelStars(id: number, stars: number): void {
    const all = readJSON<Record<number, number>>(KEYS.levelStars, {});
    all[id] = Math.max(all[id] ?? 0, stars);
    writeJSON(KEYS.levelStars, all);
  },
  highestUnlockedLevel(): number {
    const all = readJSON<Record<number, number>>(KEYS.levelStars, {});
    let max = 1;
    for (const k of Object.keys(all)) {
      if (all[+k] > 0) max = Math.max(max, +k + 1);
    }
    return max;
  },

  // ----- Lifetime aggregate (achievements) -----
  getLifetime(): LifetimeStats {
    return readJSON<LifetimeStats>(KEYS.lifetime, {
      bestScore: 0,
      gamesPlayed: 0,
      totalLinesCleared: 0,
      maxCombo: 0,
      perfectClears: 0,
    });
  },
  updateLifetime(patch: Partial<LifetimeStats> & { addGames?: number; addLines?: number; addPerfect?: number }): LifetimeStats {
    const cur = Storage.getLifetime();
    const next: LifetimeStats = {
      bestScore: Math.max(cur.bestScore, patch.bestScore ?? 0),
      gamesPlayed: cur.gamesPlayed + (patch.addGames ?? 0),
      totalLinesCleared: cur.totalLinesCleared + (patch.addLines ?? 0),
      maxCombo: Math.max(cur.maxCombo, patch.maxCombo ?? 0),
      perfectClears: cur.perfectClears + (patch.addPerfect ?? 0),
    };
    writeJSON(KEYS.lifetime, next);
    return next;
  },
};
