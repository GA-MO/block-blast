/** Achievement definitions, pure evaluation, and a persisted tracker. */
const KEY = "tessera.achievements";

export interface Stats {
  bestScore: number;
  gamesPlayed: number;
  totalLinesCleared: number;
  maxCombo: number;
  perfectClears: number;
  dailyStreak: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  test: (s: Stats) => boolean;
  reward?: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "score_500",
    title: "Getting Started",
    description: "Reach a score of 500.",
    test: (s) => s.bestScore >= 500,
    reward: 50,
  },
  {
    id: "score_2000",
    title: "On a Roll",
    description: "Reach a score of 2,000.",
    test: (s) => s.bestScore >= 2000,
    reward: 100,
  },
  {
    id: "score_5000",
    title: "High Roller",
    description: "Reach a score of 5,000.",
    test: (s) => s.bestScore >= 5000,
    reward: 250,
  },
  {
    id: "games_10",
    title: "Regular",
    description: "Play 10 games.",
    test: (s) => s.gamesPlayed >= 10,
    reward: 50,
  },
  {
    id: "games_50",
    title: "Veteran",
    description: "Play 50 games.",
    test: (s) => s.gamesPlayed >= 50,
    reward: 150,
  },
  {
    id: "lines_100",
    title: "Line Breaker",
    description: "Clear 100 lines in total.",
    test: (s) => s.totalLinesCleared >= 100,
    reward: 100,
  },
  {
    id: "lines_1000",
    title: "Demolition Expert",
    description: "Clear 1,000 lines in total.",
    test: (s) => s.totalLinesCleared >= 1000,
    reward: 500,
  },
  {
    id: "combo_5",
    title: "Combo Master",
    description: "Reach a 5x combo.",
    test: (s) => s.maxCombo >= 5,
    reward: 150,
  },
  {
    id: "perfect_first",
    title: "Spotless",
    description: "Achieve your first perfect clear.",
    test: (s) => s.perfectClears >= 1,
    reward: 200,
  },
  {
    id: "streak_3",
    title: "Habit Forming",
    description: "Play 3 days in a row.",
    test: (s) => s.dailyStreak >= 3,
    reward: 100,
  },
  {
    id: "streak_7",
    title: "Dedicated",
    description: "Play 7 days in a row.",
    test: (s) => s.dailyStreak >= 7,
    reward: 300,
  },
];

/**
 * PURE: returns ids of achievements whose conditions are now satisfied and
 * that are not present in `alreadyUnlocked`. No side effects, no persistence.
 */
export function evaluateAchievements(
  stats: Stats,
  alreadyUnlocked: string[]
): string[] {
  const unlocked = new Set(alreadyUnlocked);
  const newly: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!unlocked.has(a.id) && a.test(stats)) {
      newly.push(a.id);
    }
  }
  return newly;
}

class AchievementsStore {
  private unlocked: string[];

  constructor() {
    let loaded: string[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (Array.isArray(parsed)) loaded = parsed.filter((x) => typeof x === "string");
    } catch {
      loaded = [];
    }
    this.unlocked = loaded;
  }

  getUnlocked(): string[] {
    return [...this.unlocked];
  }

  /** Evaluate stats, persist any newly unlocked ids, return their Achievement objects. */
  report(stats: Stats): Achievement[] {
    const newlyIds = evaluateAchievements(stats, this.unlocked);
    if (newlyIds.length > 0) {
      this.unlocked.push(...newlyIds);
      this.save();
    }
    const newlySet = new Set(newlyIds);
    return ACHIEVEMENTS.filter((a) => newlySet.has(a.id));
  }

  private save(): void {
    localStorage.setItem(KEY, JSON.stringify(this.unlocked));
  }
}

export const Achievements = new AchievementsStore();
