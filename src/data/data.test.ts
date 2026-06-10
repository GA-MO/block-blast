import { describe, it, expect } from "vitest";
import {
  SKINS,
  THEMES,
  DEFAULT_SKIN_ID,
  DEFAULT_THEME_ID,
  getSkin,
  getTheme,
} from "./themes";
import { LEVELS, getLevel } from "./levels";

describe("themes - skins", () => {
  it("every skin palette has exactly 7 entries", () => {
    for (const skin of SKINS) {
      expect(skin.palette).toHaveLength(7);
    }
  });

  it("palette entries are valid hex ints in range", () => {
    for (const skin of SKINS) {
      for (const c of skin.palette) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it("contains a default skin with price 0", () => {
    const def = SKINS.find((s) => s.id === DEFAULT_SKIN_ID);
    expect(def).toBeDefined();
    expect(def?.price).toBe(0);
  });

  it("has unique skin ids", () => {
    const ids = SKINS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getSkin returns the matching skin and falls back to default", () => {
    expect(getSkin("aurora").id).toBe("aurora");
    expect(getSkin("does-not-exist").id).toBe(DEFAULT_SKIN_ID);
  });
});

describe("themes - board themes", () => {
  it("contains a default theme with price 0", () => {
    const def = THEMES.find((t) => t.id === DEFAULT_THEME_ID);
    expect(def).toBeDefined();
    expect(def?.price).toBe(0);
  });

  it("has unique theme ids", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getTheme returns the matching theme and falls back to default", () => {
    expect(getTheme("nebula").id).toBe("nebula");
    expect(getTheme("nope").id).toBe(DEFAULT_THEME_ID);
  });
});

describe("levels", () => {
  it("has unique level ids", () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ids are contiguous 1..N", () => {
    const sorted = [...LEVELS].map((l) => l.id).sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      expect(sorted[i]).toBe(i + 1);
    }
  });

  it("every level has a positive goal target and seed", () => {
    for (const level of LEVELS) {
      expect(level.goal.target).toBeGreaterThan(0);
      expect(Number.isInteger(level.seed)).toBe(true);
    }
  });

  it("getLevel returns hand-authored levels, procedural beyond, undefined below 1", () => {
    expect(getLevel(1)?.id).toBe(1);
    expect(getLevel(12)?.id).toBe(12);
    expect(getLevel(0)).toBeUndefined();
    // Beyond the hand-authored campaign, levels are generated infinitely.
    const proc = getLevel(999);
    expect(proc?.id).toBe(999);
    expect(proc?.goal.target).toBeGreaterThan(0);
    // Deterministic: same id → same generated level.
    expect(getLevel(999)?.name).toBe(proc?.name);
  });
});
