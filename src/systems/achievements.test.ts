import { describe, it, expect } from "vitest";
import { evaluateAchievements, ACHIEVEMENTS, type Stats } from "./achievements";

const ZERO: Stats = {
  bestScore: 0,
  gamesPlayed: 0,
  totalLinesCleared: 0,
  maxCombo: 0,
  perfectClears: 0,
  dailyStreak: 0,
};

const stats = (over: Partial<Stats>): Stats => ({ ...ZERO, ...over });

describe("evaluateAchievements", () => {
  it("returns nothing for zeroed stats", () => {
    expect(evaluateAchievements(ZERO, [])).toEqual([]);
  });

  it("unlocks a score threshold exactly at the boundary", () => {
    expect(evaluateAchievements(stats({ bestScore: 500 }), [])).toContain(
      "score_500"
    );
  });

  it("does not unlock a threshold just below the boundary", () => {
    expect(evaluateAchievements(stats({ bestScore: 499 }), [])).not.toContain(
      "score_500"
    );
  });

  it("unlocks all lower score tiers when a high score is reached", () => {
    const result = evaluateAchievements(stats({ bestScore: 5000 }), []);
    expect(result).toContain("score_500");
    expect(result).toContain("score_2000");
    expect(result).toContain("score_5000");
  });

  it("excludes already-unlocked achievements", () => {
    const result = evaluateAchievements(stats({ bestScore: 5000 }), [
      "score_500",
      "score_2000",
    ]);
    expect(result).not.toContain("score_500");
    expect(result).not.toContain("score_2000");
    expect(result).toContain("score_5000");
  });

  it("unlocks multiple distinct achievements at once", () => {
    const result = evaluateAchievements(
      stats({
        bestScore: 2000,
        gamesPlayed: 10,
        totalLinesCleared: 100,
        maxCombo: 5,
        perfectClears: 1,
        dailyStreak: 3,
      }),
      []
    );
    expect(result).toEqual(
      expect.arrayContaining([
        "score_500",
        "score_2000",
        "games_10",
        "lines_100",
        "combo_5",
        "perfect_first",
        "streak_3",
      ])
    );
  });

  it("unlocks the first perfect clear", () => {
    expect(evaluateAchievements(stats({ perfectClears: 1 }), [])).toContain(
      "perfect_first"
    );
  });

  it("respects the combo threshold", () => {
    expect(evaluateAchievements(stats({ maxCombo: 4 }), [])).not.toContain(
      "combo_5"
    );
    expect(evaluateAchievements(stats({ maxCombo: 5 }), [])).toContain(
      "combo_5"
    );
  });

  it("returns an empty array when everything is already unlocked", () => {
    const allIds = ACHIEVEMENTS.map((a) => a.id);
    const maxed = stats({
      bestScore: 99999,
      gamesPlayed: 999,
      totalLinesCleared: 99999,
      maxCombo: 99,
      perfectClears: 99,
      dailyStreak: 99,
    });
    expect(evaluateAchievements(maxed, allIds)).toEqual([]);
  });

  it("is pure: does not mutate the alreadyUnlocked array", () => {
    const already = ["score_500"];
    evaluateAchievements(stats({ bestScore: 5000 }), already);
    expect(already).toEqual(["score_500"]);
  });
});
