import { describe, it, expect } from "vitest";
import { Grid } from "./grid";
import { SHAPES, generateTray, randomPiece } from "./pieces";
import { clearScore, placementScore } from "./scoring";
import { GameModel } from "./gameModel";
import { Rng } from "./rng";

describe("shapes", () => {
  it("generates a deduped set including rotations", () => {
    expect(SHAPES.length).toBeGreaterThan(13); // rotations add more than base count
    const ids = new Set(SHAPES.map((s) => s.id));
    expect(ids.size).toBe(SHAPES.length); // all unique
  });

  it("shapes are normalized to origin", () => {
    for (const s of SHAPES) {
      const minR = Math.min(...s.cells.map((c) => c[0]));
      const minC = Math.min(...s.cells.map((c) => c[1]));
      expect(minR).toBe(0);
      expect(minC).toBe(0);
    }
  });
});

describe("Grid placement", () => {
  it("rejects out-of-bounds and overlaps", () => {
    const g = new Grid();
    const line3 = SHAPES.find((s) => s.cells.length === 3 && s.rows === 1)!;
    expect(g.canPlace(line3, 0, 6)).toBe(false); // would exceed col 7
    expect(g.canPlace(line3, 0, 5)).toBe(true);
    g.place(line3, 0, 0, 5);
    expect(g.canPlace(line3, 0, 5)).toBe(false); // now occupied
  });

  it("detects and clears a full row", () => {
    const g = new Grid();
    for (let c = 0; c < g.size; c++) g.cells[0][c] = 1;
    const { rows, cols } = g.findFullLines();
    expect(rows).toEqual([0]);
    expect(cols).toEqual([]);
    const { cleared } = g.clearLines(rows, cols);
    expect(cleared.length).toBe(g.size);
    expect(g.cells[0].every((v) => v === null)).toBe(true);
  });

  it("a bomb detonates a 3x3 area when its line clears", () => {
    const g = new Grid();
    for (let c = 0; c < g.size; c++) g.cells[0][c] = 1;
    g.bombs[0][3] = true;
    g.cells[1][2] = 1;
    g.cells[1][3] = 1;
    g.cells[1][4] = 1;
    const res = g.clearLines([0], []);
    expect(res.cleared.length).toBe(g.size); // the full row
    const ex = new Set(res.exploded.map((c) => c.join(",")));
    expect(ex.has("1,2")).toBe(true);
    expect(ex.has("1,3")).toBe(true);
    expect(ex.has("1,4")).toBe(true);
    expect(g.cells[1][3]).toBeNull(); // neighbor destroyed
  });

  it("explosions chain through other bombs", () => {
    const g = new Grid();
    for (let c = 0; c < g.size; c++) g.cells[0][c] = 1;
    g.bombs[0][3] = true; // bomb in the cleared row
    g.cells[1][4] = 1;
    g.bombs[1][4] = true; // second bomb, caught in the first blast
    g.cells[2][5] = 1; // only reachable via the SECOND bomb's blast (chain)
    const res = g.clearLines([0], []);
    const ex = new Set(res.exploded.map((c) => c.join(",")));
    expect(ex.has("1,4")).toBe(true); // chained bomb destroyed
    expect(ex.has("2,5")).toBe(true); // chain reached a cell the first bomb couldn't
    expect(g.cells[2][5]).toBeNull();
  });

  it("explodeAt() detonates a chosen 3x3 (bomb booster)", () => {
    const g = new Grid();
    g.cells[3][4] = 1;
    g.cells[4][4] = 1;
    g.cells[4][5] = 1;
    g.cells[5][6] = 1; // corner of the 3x3 centred at (4,5)
    g.cells[1][1] = 1; // far away — untouched
    const res = g.explodeAt(4, 5);
    expect(res.exploded.length).toBe(4);
    expect(g.cells[3][4]).toBeNull();
    expect(g.cells[5][6]).toBeNull();
    expect(g.cells[1][1]).toBe(1); // outside the blast
  });

  it("cracks an ice cell instead of clearing it (needs 2 hits)", () => {
    const g = new Grid();
    for (let c = 0; c < g.size; c++) g.cells[0][c] = 1;
    g.health[0][3] = 2; // one ice cell in the row
    let res = g.clearLines([0], []);
    expect(res.cracked).toEqual([[0, 3]]);
    expect(res.cleared.length).toBe(g.size - 1);
    expect(g.cells[0][3]).toBe(1); // ice survived, still filled
    expect(g.health[0][3]).toBe(1);
    // refill the row and clear again -> ice now clears
    for (let c = 0; c < g.size; c++) g.cells[0][c] = 1;
    res = g.clearLines([0], []);
    expect(res.cracked).toEqual([]);
    expect(g.cells[0][3]).toBeNull();
  });

  it("blastLine blasts a full row+column, cracks ice, and chains bombs", () => {
    const g = new Grid();
    g.cells[1][1] = 1;
    g.health[1][1] = 2; // ice on the blast row
    g.cells[1][5] = 1;
    g.bombs[1][5] = true; // bomb on the blast row
    g.cells[2][5] = 1; // neighbour of the bomb (off the blast cross)
    g.cells[3][0] = 1; // on the blast column
    const res = g.blastLine(1, 0);
    expect(res.cracked).toContainEqual([1, 1]);
    expect(g.cells[1][1]).toBe(1); // ice cracked but survives
    expect(g.cells[1][5]).toBeNull(); // bomb destroyed...
    expect(g.cells[2][5]).toBeNull(); // ...and its chain took the neighbour
    expect(g.cells[3][0]).toBeNull();
  });

  it("clears intersecting row+col without double counting", () => {
    const g = new Grid();
    for (let c = 0; c < g.size; c++) g.cells[3][c] = 1;
    for (let r = 0; r < g.size; r++) g.cells[r][3] = 1;
    const { rows, cols } = g.findFullLines();
    const { cleared } = g.clearLines(rows, cols);
    // 8 + 8 - 1 shared cell = 15
    expect(cleared.length).toBe(2 * g.size - 1);
  });
});

describe("scoring", () => {
  it("placement is per-cell", () => {
    expect(placementScore(4)).toBe(4 * 2);
  });
  it("single line", () => {
    expect(clearScore(1, 1, false)).toBe(30);
  });
  it("double line gets multi bonus", () => {
    expect(clearScore(2, 1, false)).toBe(2 * 30 + 2 * 20);
  });
  it("combo streak adds bonus", () => {
    expect(clearScore(1, 3, false)).toBe(30 + (3 - 1) * 15);
  });
  it("perfect clear bonus", () => {
    expect(clearScore(1, 1, true)).toBe(30 + 400);
  });
});

describe("Rng determinism", () => {
  it("same seed yields same sequence", () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });
  it("seeded tray is reproducible", () => {
    const t1 = generateTray(new Rng(7));
    const t2 = generateTray(new Rng(7));
    expect(t1.map((p) => p.shape.id)).toEqual(t2.map((p) => p.shape.id));
    expect(t1.map((p) => p.color)).toEqual(t2.map((p) => p.color));
  });
});

describe("GameModel", () => {
  it("scores a placement that completes a row", () => {
    const m = new GameModel({ rng: new Rng(1) });
    m.start();
    // Hand-build a near-complete row, then place a single-cell piece.
    for (let c = 0; c < m.grid.size - 1; c++) m.grid.cells[0][c] = 2;
    // Stray block so clearing the row is NOT a perfect (full-board) clear.
    m.grid.cells[4][4] = 3;
    const single = randomPiece(new Rng(1));
    // force a single-cell shape & known slot
    m.tray[0] = { shape: SHAPES.find((s) => s.cells.length === 1)!, color: single.color, used: false };
    const res = m.place(0, 0, m.grid.size - 1);
    expect(res.ok).toBe(true);
    expect(res.clearedRows).toEqual([0]);
    expect(res.gainedPlacement).toBe(2);
    expect(res.gainedClear).toBe(30);
    expect(res.perfectClear).toBe(false);
    expect(m.score).toBe(32);
  });

  it("FEVER: the 3rd consecutive clear (and beyond) scores double", () => {
    const m = new GameModel({ rng: new Rng(1) });
    m.start();
    // Three near-complete rows; each single-cell placement clears one.
    for (const r of [0, 1, 2]) for (let c = 0; c < m.grid.size - 1; c++) m.grid.cells[r][c] = 2;
    m.grid.cells[7][0] = 3; // stray block: no perfect clear
    const single = SHAPES.find((s) => s.cells.length === 1)!;
    m.tray = [0, 1, 2].map(() => ({ shape: single, color: 0, used: false }));

    const r1 = m.place(0, 0, m.grid.size - 1);
    expect(r1.fever).toBe(false);
    expect(r1.gainedClear).toBe(30); // combo 1: base line score
    const r2 = m.place(1, 1, m.grid.size - 1);
    expect(r2.fever).toBe(false);
    expect(r2.gainedClear).toBe(30 + 15); // combo 2: +1 streak step
    const r3 = m.place(2, 2, m.grid.size - 1);
    expect(r3.fever).toBe(true);
    expect(r3.gainedClear).toBe((30 + 2 * 15) * 2); // combo 3: FEVER ×2
  });

  it("charges a Power Block from line clears and deals it on the next refill", () => {
    const m = new GameModel({ rng: new Rng(1), chargeLines: 2 });
    m.start();
    for (const r of [0, 1]) for (let c = 0; c < m.grid.size - 1; c++) m.grid.cells[r][c] = 2;
    const single = SHAPES.find((s) => s.cells.length === 1)!;
    m.tray = [0, 1, 2].map(() => ({ shape: single, color: 0, used: false }));
    m.place(0, 0, m.grid.size - 1); // 1st line → charge 1/2
    expect(m.pendingSpecial).toBeNull();
    m.place(1, 1, m.grid.size - 1); // 2nd line → fully charged
    expect(m.pendingSpecial).not.toBeNull();
    expect(m.chargeProgress()).toBe(1);
    const res = m.place(2, 5, 5); // last piece → refill deals the Power Block
    expect(res.refilled).toBe(true);
    expect(m.tray.some((p) => p.special)).toBe(true);
    expect(m.pendingSpecial).toBeNull();
  });

  it("a boom Power Block detonates a 3×3 and never breaks the combo", () => {
    const m = new GameModel({ rng: new Rng(1) });
    m.start();
    m.combo = 2; // ongoing streak
    for (let r = 3; r <= 5; r++) for (let c = 3; c <= 5; c++) m.grid.cells[r][c] = 1;
    const single = SHAPES.find((s) => s.cells.length === 1)!;
    m.tray[0] = { shape: single, color: 0, used: false, special: "boom" };
    const res = m.place(0, 4, 6); // 3×3 blast covers the cluster's right column
    expect(res.special).toBe("boom");
    expect(res.exploded).toHaveLength(4); // (3,5),(4,5),(5,5) + the block itself
    expect(res.combo).toBe(2); // spending a Power Block preserves the streak
    expect(m.grid.cells[4][5]).toBeNull();
  });

  it("a bolt Power Block blasts its entire row and column", () => {
    const m = new GameModel({ rng: new Rng(1) });
    m.start();
    m.grid.cells[2][0] = 1;
    m.grid.cells[2][3] = 1;
    m.grid.cells[5][6] = 1;
    m.grid.cells[7][6] = 1;
    const single = SHAPES.find((s) => s.cells.length === 1)!;
    m.tray[0] = { shape: single, color: 0, used: false, special: "bolt" };
    const res = m.place(0, 2, 6);
    expect(res.special).toBe("bolt");
    expect(res.exploded).toHaveLength(5); // 4 scattered blocks + the bolt cell
    expect(m.grid.cells[2][0]).toBeNull();
    expect(m.grid.cells[5][6]).toBeNull();
  });

  it("awards perfect-clear bonus when the board empties", () => {
    const m = new GameModel({ rng: new Rng(1) });
    m.start();
    for (let c = 0; c < m.grid.size - 1; c++) m.grid.cells[0][c] = 2;
    m.tray[0] = { shape: SHAPES.find((s) => s.cells.length === 1)!, color: 0, used: false };
    const res = m.place(0, 0, m.grid.size - 1);
    expect(res.perfectClear).toBe(true);
    expect(res.gainedClear).toBe(30 + 400);
  });

  it("collects a star and wins when clearing its line (Collect mode)", () => {
    const m = new GameModel({
      mode: "adventure",
      rng: new Rng(5),
      goal: { type: "collect", target: 1 },
      preset: {
        // column 0 filled rows 2..7, star at (0,0); (1,0) left empty
        cells: [
          [2, 0, 5], [3, 0, 5], [4, 0, 5], [5, 0, 5], [6, 0, 5], [7, 0, 5],
        ],
        collectibles: [[0, 0, "gold"]],
      },
    });
    m.start();
    expect(m.totalCollect.gold).toBe(1);
    expect(m.remainingCollect.gold).toBe(1);
    // place a single-cell piece at (1,0) to complete column 0
    m.tray[0] = { shape: SHAPES.find((s) => s.cells.length === 1)!, color: 0, used: false };
    const res = m.place(0, 1, 0);
    expect(res.ok).toBe(true);
    expect(res.collected).toEqual([{ type: "gold", row: 0, col: 0 }]);
    expect(m.remainingCollect.gold).toBe(0);
    expect(res.won).toBe(true);
    expect(m.over).toBe(true);
  });

  it("bomb booster detonates a 3x3, scores it, and banks collectibles", () => {
    const m = new GameModel({
      mode: "adventure",
      rng: new Rng(7),
      goal: { type: "collect", target: 1 },
      preset: { collectibles: [[4, 4, "gold"]] }, // gem on a filled cell
    });
    m.start();
    m.grid.cells[3][3] = 1; // a stray block inside the blast
    expect(m.remainingCollect.gold).toBe(1);
    const before = m.score;
    const res = m.detonate(4, 4); // 3x3 centred on the gem
    expect(res.exploded.length).toBeGreaterThan(0);
    expect(res.collected).toEqual([{ type: "gold", row: 4, col: 4 }]);
    expect(m.remainingCollect.gold).toBe(0);
    expect(m.grid.cells[3][3]).toBeNull(); // neighbour cleared
    expect(m.score).toBeGreaterThan(before); // blast scored
    expect(m.won).toBe(true); // quota complete
  });

  it("does not end the game while a tray piece still fits", () => {
    const m = new GameModel({ rng: new Rng(2) });
    m.start();
    const single = SHAPES.find((s) => s.cells.length === 1)!;
    // Fill the whole board except one cell.
    for (let r = 0; r < m.grid.size; r++) for (let c = 0; c < m.grid.size; c++) m.grid.cells[r][c] = 1;
    m.grid.cells[0][0] = null;
    // A 1x1 piece obviously fits the empty cell → not game over.
    m.tray = [{ shape: single, color: 0, used: false }, { shape: single, color: 0, used: true }, { shape: single, color: 0, used: true }];
    expect(m.hasValidMove()).toBe(true);
    // Now fill the last cell with a non-tray block: nothing fits → over.
    m.grid.cells[0][0] = 1;
    expect(m.hasValidMove()).toBe(false);
  });

  it("refills tray when all pieces used", () => {
    const m = new GameModel({ rng: new Rng(3) });
    m.start();
    const single = SHAPES.find((s) => s.cells.length === 1)!;
    m.tray = [
      { shape: single, color: 0, used: false },
      { shape: single, color: 0, used: false },
      { shape: single, color: 0, used: false },
    ];
    m.place(0, 0, 0);
    m.place(1, 0, 2);
    const res = m.place(2, 0, 4);
    expect(res.refilled).toBe(true);
    expect(m.remainingPieces().length).toBe(3);
  });
});
