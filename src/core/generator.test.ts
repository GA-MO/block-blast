import { describe, it, expect } from "vitest";
import { Grid } from "./grid";
import { Rng } from "./rng";
import { fillRatio, generateSmartTray } from "./generator";
import { HARD_SHAPES } from "./pieces";

describe("fillRatio", () => {
  it("is 0 for an empty board", () => {
    const grid = new Grid();
    expect(fillRatio(grid)).toBe(0);
  });

  it("is 1 for a fully filled board", () => {
    const grid = new Grid();
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        grid.cells[r][c] = 0;
      }
    }
    expect(fillRatio(grid)).toBe(1);
  });

  it("matches the fraction of filled cells on a known grid", () => {
    const grid = new Grid(); // 8x8 = 64 cells
    // Fill exactly 16 cells.
    let filled = 0;
    for (let r = 0; r < grid.size && filled < 16; r++) {
      for (let c = 0; c < grid.size && filled < 16; c++) {
        grid.cells[r][c] = 3;
        filled++;
      }
    }
    expect(fillRatio(grid)).toBeCloseTo(16 / 64, 10);
    expect(fillRatio(grid)).toBe(0.25);
  });
});

describe("generateSmartTray", () => {
  it("returns 3 pieces", () => {
    const grid = new Grid();
    const tray = generateSmartTray(grid, new Rng(12345));
    expect(tray).toHaveLength(3);
    for (const piece of tray) {
      expect(piece.used).toBe(false);
      expect(piece.color).toBeGreaterThanOrEqual(0);
      expect(piece.color).toBeLessThan(7);
    }
  });

  it("is deterministic for the same seed and grid", () => {
    const gridA = new Grid();
    const gridB = new Grid();
    const a = generateSmartTray(gridA, new Rng(999));
    const b = generateSmartTray(gridB, new Rng(999));

    const ids = (tray: ReturnType<typeof generateSmartTray>) =>
      tray.map((p) => p.shape.id);
    const colors = (tray: ReturnType<typeof generateSmartTray>) =>
      tray.map((p) => p.color);

    expect(ids(a)).toEqual(ids(b));
    expect(colors(a)).toEqual(colors(b));
  });

  it("guarantees a placeable piece when only a single cell is empty", () => {
    const grid = new Grid();
    // Fill the entire board, then clear exactly one cell.
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        grid.cells[r][c] = 1;
      }
    }
    grid.cells[0][0] = null;

    // The single-cell shape can be placed at (0,0), so SHAPES has a
    // placeable shape -> the guarantee must hold across any seed.
    for (let seed = 0; seed < 50; seed++) {
      const tray = generateSmartTray(grid, new Rng(seed));
      const placeable = tray.some((p) => grid.canPlaceAnywhere(p.shape));
      expect(placeable).toBe(true);
    }
  });

  it("does not force-fit when the board is completely full (no shape fits)", () => {
    const grid = new Grid();
    for (let r = 0; r < grid.size; r++) {
      for (let c = 0; c < grid.size; c++) {
        grid.cells[r][c] = 1;
      }
    }
    // No shape can be placed; should still return 3 pieces without throwing.
    const tray = generateSmartTray(grid, new Rng(7));
    expect(tray).toHaveLength(3);
    const placeable = tray.some((p) => grid.canPlaceAnywhere(p.shape));
    expect(placeable).toBe(false);
  });
});

describe("generateSmartTray difficulty ramp", () => {
  const hardIds = new Set(HARD_SHAPES.map((s) => s.id));

  /** Board with rows 0..4 filled (crowded), rows 5..7 open. */
  function crowdedGrid(): Grid {
    const grid = new Grid();
    for (let r = 0; r < 5; r++) for (let c = 0; c < grid.size; c++) grid.cells[r][c] = 1;
    return grid;
  }

  it("difficulty 0 never deals hard pentominoes (default behavior unchanged)", () => {
    const grid = new Grid();
    for (let seed = 0; seed < 100; seed++) {
      for (const p of generateSmartTray(grid, new Rng(seed))) {
        expect(hardIds.has(p.shape.id)).toBe(false);
      }
    }
  });

  it("full difficulty mixes hard pentominoes into the pool", () => {
    const grid = new Grid();
    let hard = 0;
    for (let seed = 0; seed < 100; seed++) {
      for (const p of generateSmartTray(grid, new Rng(seed), 1)) {
        if (hardIds.has(p.shape.id)) hard++;
      }
    }
    // ~25% of 300 picks; allow wide slack but require a real presence.
    expect(hard).toBeGreaterThan(30);
  });

  it("the crowding assist fades: bigger pieces on a crowded board at full difficulty", () => {
    const meanSize = (difficulty: number): number => {
      let cells = 0;
      let n = 0;
      for (let seed = 0; seed < 200; seed++) {
        for (const p of generateSmartTray(crowdedGrid(), new Rng(seed), difficulty)) {
          cells += p.shape.cells.length;
          n++;
        }
      }
      return cells / n;
    };
    expect(meanSize(1)).toBeGreaterThan(meanSize(0) + 0.5);
  });

  it("still guarantees a placeable piece at full difficulty", () => {
    const grid = new Grid();
    for (let r = 0; r < grid.size; r++) for (let c = 0; c < grid.size; c++) grid.cells[r][c] = 1;
    grid.cells[0][0] = null;
    for (let seed = 0; seed < 50; seed++) {
      const tray = generateSmartTray(grid, new Rng(seed), 1);
      expect(tray.some((p) => grid.canPlaceAnywhere(p.shape))).toBe(true);
    }
  });
});
