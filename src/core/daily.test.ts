import { describe, it, expect } from "vitest";
import { todayKey, dailySeedFor, dailyChallenge, dailyModifier, dailyPreset } from "./daily";

describe("todayKey", () => {
  it("formats as YYYY-MM-DD with zero padding", () => {
    // Local-date construction: year, monthIndex, day.
    const d = new Date(2026, 0, 5); // 2026-01-05
    expect(todayKey(d)).toBe("2026-01-05");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayKey(new Date(2026, 8, 9))).toBe("2026-09-09");
    expect(todayKey(new Date(2026, 11, 25))).toBe("2026-12-25");
  });
});

describe("dailySeedFor", () => {
  it("is deterministic: same date -> same seed", () => {
    const a = dailySeedFor(new Date(2026, 4, 31));
    const b = dailySeedFor(new Date(2026, 4, 31));
    expect(a).toBe(b);
  });

  it("produces different seeds for different dates", () => {
    const s1 = dailySeedFor(new Date(2026, 4, 31));
    const s2 = dailySeedFor(new Date(2026, 5, 1));
    const s3 = dailySeedFor(new Date(2025, 4, 31));
    expect(s1).not.toBe(s2);
    expect(s1).not.toBe(s3);
    expect(s2).not.toBe(s3);
  });

  it("yields an unsigned 32-bit integer", () => {
    const seed = dailySeedFor(new Date(2026, 0, 1));
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("dailyChallenge", () => {
  it("combines the key and seed for a date", () => {
    const d = new Date(2026, 0, 5);
    const challenge = dailyChallenge(d);
    expect(challenge.dateKey).toBe(todayKey(d));
    expect(challenge.seed).toBe(dailySeedFor(d));
  });

  it("is stable across calls for the same date", () => {
    const d = new Date(2026, 6, 14);
    expect(dailyChallenge(d)).toEqual(dailyChallenge(new Date(2026, 6, 14)));
  });
});

describe("dailyPreset / dailyModifier", () => {
  it("is deterministic for a seed (cross-device fairness)", () => {
    for (const seed of [1, 42, 0xdeadbeef]) {
      expect(dailyPreset(seed)).toEqual(dailyPreset(seed));
      expect(dailyModifier(seed)).toBe(dailyModifier(seed));
    }
  });

  it("preset contents match the announced modifier", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const mod = dailyModifier(seed);
      const preset = dailyPreset(seed);
      if (mod === "pure") expect(preset).toEqual({});
      else if (mod === "ice") {
        expect(preset.ice!.length).toBeGreaterThanOrEqual(3);
        expect(preset.bombs).toBeUndefined();
      } else {
        expect(preset.bombs!.length).toBeGreaterThanOrEqual(2);
        expect(preset.ice).toBeUndefined();
      }
    }
  });

  it("all three modifiers occur across a span of days", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) kinds.add(dailyModifier(seed));
    expect(kinds.size).toBe(3);
  });

  it("obstacles sit in middle rows on unique cells (always solvable layouts)", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const preset = dailyPreset(seed);
      const spots = [...(preset.ice ?? []), ...(preset.bombs ?? [])];
      const keys = new Set(spots.map(([r, c]) => `${r},${c}`));
      expect(keys.size).toBe(spots.length);
      for (const [r, c] of spots) {
        expect(r).toBeGreaterThanOrEqual(2);
        expect(r).toBeLessThanOrEqual(6);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(7);
      }
    }
  });
});
