# Block Blast — Game Design Document

> Status: living document. Updated as design evolves.
> Genre: casual block-placement puzzle (1010!/Block Blast lineage).
> Platform: mobile web first → PWA → Capacitor (App Store / Play Store).

---

## 1. Vision & Pillars

A satisfying, "juicy" block puzzle that is **easy to pick up, hard to put down**. Success in this genre is driven by *feel* and *retention*, not rule complexity.

**Design pillars**
1. **Satisfaction first** — every placement and clear must feel great (animation, sound, haptics).
2. **Always one more run** — fast restart, escalating combos, near-miss tension.
3. **Daily reasons to return** — daily puzzle, streaks, rewards.
4. **Fair difficulty** — anti-frustration piece generation; the player rarely feels cheated.

---

## 2. Core Mechanics

- **Board:** 8×8 grid. Each cell empty or filled with a colored block.
- **Tray:** 3 pieces offered at a time. When all 3 are placed, 3 new pieces spawn.
- **Pieces:** polyominoes (1–5 cells) with rotations. Base set: single, domino, lines (3/4/5), 2×2, 3×3, L/J/T/S/Z, corner-tri.
- **Placement:** drag a piece onto the board. Valid only if every target cell is empty and in-bounds. No partial placement.
- **Clearing:** any fully filled row OR column clears simultaneously after a placement.
- **Game over:** when none of the remaining tray pieces fit anywhere on the board.

### Piece generation (anti-frustration) — *Phase 3 refinement*
Not pure random. Target behaviour:
- Guarantee that at least one of the 3 offered pieces is placeable on the current board where reasonable.
- Weighted bag: smaller/flexible pieces appear more often when the board is crowded.
- Difficulty scales with score/level (more awkward shapes as score climbs).
- Daily/Adventure use a **seeded RNG** so the sequence is deterministic and shareable.

---

## 3. Scoring & Combos

| Event | Points |
|-------|--------|
| Place a piece | +1 per cell |
| Clear 1 line | +10 |
| Clear N lines at once | +10·N **+ multi-bonus** (N>1 → +10·N) |
| Combo streak (consecutive placements that clear) | +5 · (streak−1) |
| Perfect clear (board fully empty after a clear) | big bonus (e.g. +300) |

- **Combo** increments each placement that clears ≥1 line; resets when a placement clears nothing.
- Tune all numbers in a single `scoring.ts` config so balancing is one file.

---

## 4. Game Modes

### 4.1 Classic Endless (MVP)
Play until game over. Track high score (local + cloud later). Default mode.

### 4.2 Daily Puzzle
- Seeded by calendar date → identical board/piece sequence for everyone that day.
- Goal: best score within a fixed piece budget *or* survive a target. Shareable result card.
- Streak counter for consecutive days played.

### 4.3 Adventure / Levels
- Hand-tuned or generated levels with goals: reach score X, clear special tiles, clear in ≤N moves.
- Special tiles: locked/ice blocks (need 2 clears), star collectibles (must be cleared to win), etc.
- Star rating (1–3) per level; world map progression.

---

## 5. Meta Systems (Phase 4)

- **Coins** — earned from play, daily, levels; spent in shop.
- **Shop** — block skins, board themes, backgrounds.
- **Boosters** — Revive (continue after game over), Hammer (delete 1 block), Swap (reroll tray), Rotate (if rotation not default).
- **Achievements** — milestones (X combos, Y perfect clears, daily streaks).

---

## 6. Juice Checklist (Phase 1–2)

- [ ] Piece pickup: scale-up + lift above finger; subtle shadow.
- [ ] Ghost preview snapping (valid = colored ghost, invalid = red).
- [ ] Placement: squash-and-stretch pop per cell, staggered.
- [ ] Line clear: per-cell particle burst (color-matched) + white flash + scale-out.
- [ ] Screen shake scaled to lines cleared / combo size.
- [ ] Score count-up tween; combo banner with rising scale.
- [ ] Haptics (navigator.vibrate): light on place, stronger on clear/combo.
- [ ] Audio: layered SFX, combo pitch rises with streak; bg music loop.
- [ ] Game over: brief slow-mo + zoom, NEW BEST ribbon, confetti on record.
- [ ] Idle: tray pieces gently bob; menu background drifts.
- [ ] 60fps on mid-range mobile; no input lag.

---

## 7. Monetization (post-MVP)

- **Rewarded video ads** — free revive, double daily reward, free booster.
- **Interstitial ads** — between runs, frequency-capped (don't break flow).
- **IAP** — remove ads, coin packs, cosmetic bundles.
- Integrate via Capacitor plugins (AdMob, in-app purchase) once wrapped.

---

## 8. UX / Onboarding

- First session: lightweight interactive tutorial (place a piece, clear a line).
- One-tap restart. Settings: sound/music/haptics toggle, restart, (later) account.
- Accessibility: colorblind-safe palette option; high-contrast ghost.

---

## 9. Tech Architecture

```
Phaser 3 (render/input/audio/tween) + TypeScript + Vite
└── core/         pure TS game logic — NO Phaser imports (unit-tested)
    ├── grid.ts        board state, placement validity, line clearing
    ├── pieces.ts      shape definitions, rotations, generation
    ├── scoring.ts     scoring + combo config & calculation
    ├── rng.ts         seeded PRNG (for Daily/Adventure)
    └── gameModel.ts   orchestrates a session (state machine)
└── scenes/       Phaser scenes (Boot, Preload, Menu, Game, GameOver, ...)
└── render/       board renderer, piece renderer, effects/particles
└── ui/           HUD, buttons, overlays
└── systems/      audio, haptics, storage, analytics
└── data/         themes, levels, config
```

**Rule:** `core/` never imports Phaser or touches the DOM. This keeps logic testable and portable.

Persistence: `localStorage` now → cloud save later. PWA service worker for offline. Capacitor wrapper for native stores.
