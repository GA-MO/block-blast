(() => {
  "use strict";

  const SIZE = 8;
  const STORE_KEY = "blockblast.best";

  // ---------- Block colors ----------
  const COLORS = [
    { base: "#ff5b5b", name: "red" },
    { base: "#ff9d3a", name: "orange" },
    { base: "#ffd84d", name: "yellow" },
    { base: "#5bd66b", name: "green" },
    { base: "#4db8ff", name: "blue" },
    { base: "#9b6bff", name: "purple" },
    { base: "#43e0d0", name: "cyan" },
  ];

  // ---------- Piece shapes (relative [row, col] cells) ----------
  // Generated from base shapes + their rotations.
  const BASE_SHAPES = [
    [[0, 0]],                                            // single
    [[0, 0], [0, 1]],                                    // domino
    [[0, 0], [0, 1], [0, 2]],                            // line 3
    [[0, 0], [0, 1], [0, 2], [0, 3]],                    // line 4
    [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],            // line 5
    [[0, 0], [0, 1], [1, 0], [1, 1]],                    // square 2x2
    [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], // square 3x3
    [[0, 0], [1, 0], [1, 1]],                            // small corner (L tri)
    [[0, 0], [1, 0], [2, 0], [2, 1]],                    // L
    [[0, 1], [1, 1], [2, 1], [2, 0]],                    // J
    [[0, 0], [0, 1], [0, 2], [1, 1]],                    // T
    [[0, 1], [0, 2], [1, 0], [1, 1]],                    // S
    [[0, 0], [0, 1], [1, 1], [1, 2]],                    // Z
  ];

  function normalize(cells) {
    const minR = Math.min(...cells.map((c) => c[0]));
    const minC = Math.min(...cells.map((c) => c[1]));
    return cells
      .map((c) => [c[0] - minR, c[1] - minC])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  function rotate(cells) {
    return cells.map(([r, c]) => [c, -r]);
  }
  function key(cells) {
    return cells.map((c) => c.join(",")).join("|");
  }

  // Build full shape set with rotations, deduped.
  const SHAPES = (() => {
    const set = new Map();
    for (const base of BASE_SHAPES) {
      let cur = base;
      for (let i = 0; i < 4; i++) {
        const n = normalize(cur);
        set.set(key(n), n);
        cur = rotate(cur);
      }
    }
    return [...set.values()];
  })();

  function shapeDims(cells) {
    const rows = Math.max(...cells.map((c) => c[0])) + 1;
    const cols = Math.max(...cells.map((c) => c[1])) + 1;
    return { rows, cols };
  }

  // ---------- State ----------
  let grid = [];            // SIZE x SIZE of null | colorIndex
  let pieces = [];          // tray pieces: {cells, color, used}
  let score = 0;
  let best = parseInt(localStorage.getItem(STORE_KEY) || "0", 10) || 0;
  let combo = 0;

  // ---------- DOM ----------
  const boardEl = document.getElementById("board");
  const trayEl = document.getElementById("tray");
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("bestScore");
  const comboEl = document.getElementById("combo");
  const dragLayer = document.getElementById("dragLayer");
  const floatScoresEl = document.getElementById("floatScores");
  const gameOverEl = document.getElementById("gameOver");
  const cellEls = [];

  // ---------- Init board DOM ----------
  function buildBoardDom() {
    boardEl.innerHTML = "";
    for (let r = 0; r < SIZE; r++) {
      cellEls[r] = [];
      for (let c = 0; c < SIZE; c++) {
        const d = document.createElement("div");
        d.className = "cell";
        boardEl.appendChild(d);
        cellEls[r][c] = d;
      }
    }
  }

  function emptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function newGame() {
    grid = emptyGrid();
    score = 0;
    combo = 0;
    renderBoard();
    spawnPieces();
    updateScore(false);
    bestEl.textContent = best;
    gameOverEl.classList.add("hidden");
  }

  // ---------- Rendering ----------
  function renderBoard() {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const el = cellEls[r][c];
        const v = grid[r][c];
        el.classList.remove("preview", "preview-bad");
        if (v == null) {
          el.classList.remove("filled");
          el.style.background = "";
        } else {
          el.classList.add("filled");
          el.style.background = COLORS[v].base;
        }
      }
    }
  }

  function clearPreview() {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        cellEls[r][c].classList.remove("preview", "preview-bad");
  }

  // ---------- Piece generation ----------
  function randPiece() {
    const cells = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const color = Math.floor(Math.random() * COLORS.length);
    return { cells, color, used: false };
  }

  function spawnPieces() {
    pieces = [randPiece(), randPiece(), randPiece()];
    renderTray();
  }

  function makePieceEl(piece, cellPx, gap) {
    const { rows, cols } = shapeDims(piece.cells);
    const el = document.createElement("div");
    el.className = "piece";
    el.style.gridTemplateColumns = `repeat(${cols}, ${cellPx}px)`;
    el.style.gridTemplateRows = `repeat(${rows}, ${cellPx}px)`;
    el.style.gap = `${gap}px`;
    const filled = new Set(piece.cells.map((c) => c[0] + "," + c[1]));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const d = document.createElement("div");
        if (filled.has(r + "," + c)) {
          d.className = "pcell";
          d.style.background = COLORS[piece.color].base;
          d.style.width = cellPx + "px";
          d.style.height = cellPx + "px";
        } else {
          d.className = "pcell empty";
        }
        el.appendChild(d);
      }
    }
    return el;
  }

  function trayCellPx() {
    // smaller blocks in tray than on the board
    const boardCell = boardEl.getBoundingClientRect().width / SIZE;
    return Math.max(14, Math.floor(boardCell * 0.62));
  }

  function renderTray() {
    trayEl.innerHTML = "";
    const cellPx = trayCellPx();
    pieces.forEach((piece, i) => {
      const slot = document.createElement("div");
      slot.className = "tray-slot";
      if (!piece.used) {
        const pEl = makePieceEl(piece, cellPx, 3);
        pEl.dataset.index = i;
        attachDrag(pEl, i);
        slot.appendChild(pEl);
      }
      trayEl.appendChild(slot);
    });
  }

  // ---------- Placement logic ----------
  function canPlaceAt(cells, baseR, baseC) {
    for (const [r, c] of cells) {
      const rr = baseR + r;
      const cc = baseC + c;
      if (rr < 0 || rr >= SIZE || cc < 0 || cc >= SIZE) return false;
      if (grid[rr][cc] != null) return false;
    }
    return true;
  }

  function canPlaceAnywhere(piece) {
    for (let r = 0; r < SIZE; r++)
      for (let c = 0; c < SIZE; c++)
        if (canPlaceAt(piece.cells, r, c)) return true;
    return false;
  }

  function placePiece(piece, baseR, baseC) {
    const placed = [];
    for (const [r, c] of piece.cells) {
      grid[baseR + r][baseC + c] = piece.color;
      placed.push([baseR + r, baseC + c]);
    }
    // pop animation on placed cells
    renderBoard();
    placed.forEach(([r, c]) => {
      const el = cellEls[r][c];
      el.classList.remove("placed-pop");
      void el.offsetWidth;
      el.classList.add("placed-pop");
    });

    score += piece.cells.length;

    const cleared = clearFullLines();
    if (cleared.cells.length > 0) {
      combo++;
      const lines = cleared.rows.length + cleared.cols.length;
      const gained = lineScore(lines, combo);
      score += gained;
      animateClear(cleared, gained);
      showCombo(lines, combo);
    } else {
      combo = 0;
    }

    updateScore(true);
    checkGameOverOrRespawn();
  }

  function clearFullLines() {
    const fullRows = [];
    const fullCols = [];
    for (let r = 0; r < SIZE; r++)
      if (grid[r].every((v) => v != null)) fullRows.push(r);
    for (let c = 0; c < SIZE; c++) {
      let full = true;
      for (let r = 0; r < SIZE; r++) if (grid[r][c] == null) { full = false; break; }
      if (full) fullCols.push(c);
    }
    const cells = [];
    const seen = new Set();
    const add = (r, c) => {
      const k = r + "," + c;
      if (!seen.has(k)) { seen.add(k); cells.push([r, c]); }
    };
    fullRows.forEach((r) => { for (let c = 0; c < SIZE; c++) add(r, c); });
    fullCols.forEach((c) => { for (let r = 0; r < SIZE; r++) add(r, c); });
    // clear in grid model
    cells.forEach(([r, c]) => { grid[r][c] = null; });
    return { rows: fullRows, cols: fullCols, cells };
  }

  function lineScore(lines, comboCount) {
    // base 10 per line, bonus for multi-line clears, plus combo streak
    const base = lines * 10;
    const multiBonus = lines > 1 ? lines * 10 : 0;
    const comboBonus = comboCount > 1 ? (comboCount - 1) * 5 : 0;
    return base + multiBonus + comboBonus;
  }

  function animateClear(cleared, gained) {
    // re-show the cells briefly with animation, then leave them cleared
    let sumR = 0, sumC = 0;
    cleared.cells.forEach(([r, c]) => {
      const el = cellEls[r][c];
      el.classList.add("clearing");
      sumR += r; sumC += c;
      setTimeout(() => {
        el.classList.remove("clearing", "filled");
        el.style.background = "";
      }, 320);
    });
    const n = cleared.cells.length;
    const avgR = sumR / n, avgC = sumC / n;
    spawnFloatScore("+" + gained, avgR, avgC);
  }

  function spawnFloatScore(text, avgR, avgC) {
    const rect = boardEl.getBoundingClientRect();
    const cell = rect.width / SIZE;
    const x = (avgC + 0.5) * cell;
    const y = (avgR + 0.5) * cell;
    const el = document.createElement("div");
    el.className = "float-score";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    floatScoresEl.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function showCombo(lines, comboCount) {
    let msg = "";
    if (lines >= 3) msg = "AMAZING! x" + lines;
    else if (lines === 2) msg = "DOUBLE!";
    else if (comboCount > 1) msg = "COMBO x" + comboCount;
    if (!msg) return;
    comboEl.textContent = msg;
    comboEl.classList.add("show");
    clearTimeout(showCombo._t);
    showCombo._t = setTimeout(() => comboEl.classList.remove("show"), 1100);
  }

  function updateScore(pump) {
    scoreEl.textContent = score;
    if (pump) {
      scoreEl.classList.remove("pump");
      void scoreEl.offsetWidth;
      scoreEl.classList.add("pump");
    }
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      localStorage.setItem(STORE_KEY, String(best));
    }
  }

  function checkGameOverOrRespawn() {
    const remaining = pieces.filter((p) => !p.used);
    if (remaining.length === 0) {
      spawnPieces();
      // after spawning, re-check below using new pieces
      if (!anyPlaceable()) gameOver();
      return;
    }
    if (!anyPlaceable()) gameOver();
  }

  function anyPlaceable() {
    return pieces.some((p) => !p.used && canPlaceAnywhere(p));
  }

  function gameOver() {
    const isBest = score >= best && score > 0;
    document.getElementById("finalScore").textContent = score;
    document.getElementById("panelBest").textContent = best;
    document.getElementById("newBest").classList.toggle("hidden", !isBest);
    setTimeout(() => gameOverEl.classList.remove("hidden"), 350);
  }

  // ---------- Drag & drop (pointer events) ----------
  let drag = null;

  function attachDrag(pieceEl, index) {
    pieceEl.addEventListener("pointerdown", (e) => startDrag(e, index, pieceEl));
  }

  function startDrag(e, index, pieceEl) {
    const piece = pieces[index];
    if (!piece || piece.used) return;
    e.preventDefault();

    const boardRect = boardEl.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(boardEl).gap) || 4;
    const cellSize = (boardRect.width - (SIZE + 1) * gap) / SIZE;

    pieceEl.classList.add("dragging-source");

    // floating piece sized to board cells
    const ghost = makePieceEl(piece, cellSize, gap);
    ghost.classList.add("drag-piece");
    const { rows, cols } = shapeDims(piece.cells);
    dragLayer.appendChild(ghost);

    drag = {
      index, piece, ghost, cellSize, gap, boardRect,
      rows, cols, sourceEl: pieceEl,
      // anchor: lift the piece above the finger so it's visible
      liftY: cellSize * 1.4,
    };

    moveDrag(e);
    window.addEventListener("pointermove", moveDrag, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }

  function pointerToCell(clientX, clientY) {
    const { boardRect, cellSize, gap, rows, cols } = drag;
    // position of the piece's top-left in screen space
    const px = clientX;
    const py = clientY - drag.liftY;
    // top-left of ghost (centered) :
    const ghostW = cols * cellSize + (cols - 1) * gap;
    const ghostH = rows * cellSize + (rows - 1) * gap;
    const left = px - ghostW / 2;
    const top = py - ghostH / 2;
    // map to board cell coords
    const col = Math.round((left - boardRect.left - gap) / (cellSize + gap));
    const row = Math.round((top - boardRect.top - gap) / (cellSize + gap));
    return { row, col };
  }

  function moveDrag(e) {
    if (!drag) return;
    e.preventDefault();
    const cx = e.clientX, cy = e.clientY;
    drag.ghost.style.left = cx + "px";
    drag.ghost.style.top = (cy - drag.liftY) + "px";

    const { row, col } = pointerToCell(cx, cy);
    drag.curRow = row;
    drag.curCol = col;

    clearPreview();
    const ok = canPlaceAt(drag.piece.cells, row, col);
    drag.canPlace = ok;
    for (const [r, c] of drag.piece.cells) {
      const rr = row + r, cc = col + c;
      if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) {
        cellEls[rr][cc].classList.add(ok ? "preview" : "preview-bad");
      }
    }
  }

  function endDrag(e) {
    if (!drag) return;
    window.removeEventListener("pointermove", moveDrag);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);

    const d = drag;
    drag = null;
    d.ghost.remove();
    clearPreview();

    if (d.canPlace) {
      d.piece.used = true;
      d.sourceEl.classList.add("used");
      placePiece(d.piece, d.curRow, d.curCol);
      renderTray();
    } else {
      d.sourceEl.classList.remove("dragging-source");
    }
  }

  // ---------- Settings / restart ----------
  document.getElementById("restartBtn").addEventListener("click", newGame);
  document.getElementById("settingsBtn").addEventListener("click", () => {
    if (confirm("เริ่มเกมใหม่?")) newGame();
  });

  // re-render tray sizing on resize/orientation change
  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (!drag) renderTray(); }, 150);
  });

  // ---------- Boot ----------
  buildBoardDom();
  newGame();
})();
