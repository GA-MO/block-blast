import { describe, it, expect } from "vitest";
import { GameModel } from "./gameModel";
import { SHAPES } from "./pieces";
import type { Piece, Shape, Collectible } from "./types";
import { suggestMove } from "./hint";

const SINGLE: Shape = SHAPES.find((s) => s.cells.length === 1)!;

function piece(shape: Shape, color = 1, collectibles?: Piece["collectibles"]): Piece {
  return { shape, color, used: false, collectibles };
}

/** A fresh, started model with an empty board and a controllable tray. */
function freshModel(tray: Piece[]): GameModel {
  const m = new GameModel();
  m.start();
  m.tray = tray;
  return m;
}

describe("suggestMove", () => {
  it("returns null when the board is full / nothing fits", () => {
    const m = freshModel([piece(SINGLE)]);
    for (let r = 0; r < m.grid.size; r++) {
      for (let c = 0; c < m.grid.size; c++) m.grid.cells[r][c] = 1;
    }
    expect(suggestMove(m)).toBeNull();
  });

  it("returns null when there are no un-used pieces", () => {
    const m = freshModel([{ ...piece(SINGLE), used: true }]);
    expect(suggestMove(m)).toBeNull();
  });

  it("completes a row that is filled except one cell", () => {
    const m = freshModel([piece(SINGLE)]);
    // Fill row 0 except column 3.
    for (let c = 0; c < m.grid.size; c++) {
      if (c !== 3) m.grid.cells[0][c] = 1;
    }
    const move = suggestMove(m);
    expect(move).toEqual({ trayIndex: 0, row: 0, col: 3 });
  });

  it("prefers the move that collects a needed collectible", () => {
    const m = freshModel([piece(SINGLE)]);
    // Two near-complete rows. Row 0 has a needed gem on the cell that the
    // completing piece will release; row 5 has no gem.
    for (let c = 0; c < m.grid.size; c++) {
      if (c !== 0) {
        m.grid.cells[0][c] = 1;
        m.grid.cells[5][c] = 1;
      }
    }
    // Place a gem on row 0's other filled cell so clearing row 0 collects it.
    const gem: Collectible = "gold";
    m.grid.attachments[0][1] = gem;
    m.remainingCollect[gem] = 1;

    const move = suggestMove(m);
    // Completing row 0 (col 0) clears the gem; both rows are otherwise equal.
    expect(move).toEqual({ trayIndex: 0, row: 0, col: 0 });
  });

  it("is deterministic for identical model state", () => {
    const build = () => {
      const m = freshModel([piece(SINGLE), piece(SINGLE)]);
      for (let c = 0; c < m.grid.size; c++) if (c !== 4) m.grid.cells[2][c] = 1;
      return m;
    };
    const a = suggestMove(build());
    const b = suggestMove(build());
    expect(a).toEqual(b);
  });

  it("does not mutate the input model", () => {
    const m = freshModel([piece(SINGLE)]);
    for (let c = 0; c < m.grid.size; c++) if (c !== 3) m.grid.cells[0][c] = 1;
    const before = m.grid.cells.map((row) => row.slice());
    const remainBefore = { ...m.remainingCollect };
    suggestMove(m);
    expect(m.grid.cells).toEqual(before);
    expect(m.remainingCollect).toEqual(remainBefore);
  });
});
