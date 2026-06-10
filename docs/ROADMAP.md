# Block Blast — Roadmap

Phased delivery. Each phase is independently shippable/demoable.

---

## Phase 0 — Foundation ✅ *done*
**Goal:** Classic mode playable on the new Phaser+TS+Vite architecture.
- [x] Decisions locked (stack, scope, goals) — see GDD.
- [x] Scaffold Vite + TS + Phaser; folder structure; archive prototype (`prototype/`).
- [x] Pure `core/` game logic (grid, pieces, scoring, rng, gameModel) + 15 unit tests.
- [x] Boot + Game scenes; procedural block textures; board+tray render; drag with ghost preview.
- [x] Classic Endless playable; line clears + combo + screen shake; high score in localStorage; game over.
- [x] Verified in mobile-sized browser (drag→place→clear→score), no console errors; `npm run build` passes.

> Note: Menu scene deferred — game boots straight into Classic for now. Add in Phase 2 with mode select.

## Phase 1 — Core Juice ✅
- [x] Pickup/place squash-stretch, snapping ghost, staggered pop, idle tray bob.
- [x] Line-clear particles + white flash + scale-out; screen shake scaled by lines.
- [x] Score count-up; combo banner (DOUBLE/AMAZING/COMBO/PERFECT); haptics (Vibration API).

## Phase 2 — Audio & Polish ✅
- [x] Procedural WebAudio: music loop bed + SFX (place/clear/combo/perfect/gameover/button), combo pitch ladder.
- [x] Settings overlay (music/sfx/haptics toggles, persisted); Menu scene; scene transitions; animated game-over panel.
- [ ] Deferred: colorblind palette toggle, slow-mo/confetti (nice-to-have).

## Phase 3 — Retention ✅
- [x] Seeded RNG wired; **Daily Puzzle** (date-seeded, deterministic) + day-streak tracking.
- [x] Anti-frustration smart generator (guarantees a placeable piece, size weighting).
- [x] Achievements (11, with coin rewards) + analytics event seam.

## Phase 4 — Meta & Shop ✅
- [x] Coins economy (earned per run); Shop with tabs: skins / themes / boosters; buy + equip.
- [x] Boosters: revive, hammer, swap — UI, inventory, in-game use.

## Phase 5 — Adventure ✅
- [x] Level data (15 levels), goal types (score/lines/perfect/**collect**), move limits, seeds, presets.
- [x] Level select map (lock/unlock + star display), goal HUD, 1–3 star ratings + persistence.
- [x] **Collect mode** (special tiles): star/gem collectibles attached to cells, released by clearing
      their row/column. Gold-framed badges, top counters, fly-to-counter animation, win on full collection.
      Levels 13–15 are Collect levels. (Pure-logic, unit-tested.)
- [x] **Ice / locked tiles** (need 2 line-clears): cell `health`, crack-vs-clear, frosted + cracked art,
      shatter feedback. Mixed into the rebalanced curriculum. (Unit-tested.)
- [x] **Rebalanced curriculum** (18 levels, 4 worlds): mixed objectives (score/lines/perfect/collect),
      Collect escalates ⭐1→⭐2→⭐3💎3, ice obstacles from mid-game, boss levels at 5/10/15/18.
- [x] **Premium effects**: signature collect light-beam (column), shockwaves on multi-line clears,
      win confetti + edge flash, place dust, floating text, and an animated ambient bokeh background.

## Phase 6 — Ship ✅
- [x] PWA: manifest, service worker (autoUpdate), procedurally-generated icons, full offline precache.
- [x] Performance/input polish (antialias, roundPixels, single pointer, no context menu).
- [x] Monetization seams: rewarded ad revive + frequency-capped interstitial (`Ads`), IAP catalog (`IAP`) — web-safe, native plugin lazy-loaded.
- [x] Capacitor config + release runbook (`docs/SHIP.md`).
- [ ] Requires accounts/native tooling: real AdMob/IAP IDs, Xcode/Android Studio builds, store submission (see SHIP.md).

---

### Definition of Done (per phase)
Runs at 60fps on mobile-sized viewport · no console errors · core logic unit-tested · `npm run build` passes.

### Status: all phases code-complete. 56 unit tests pass, typecheck clean, PWA build green, verified in browser end-to-end.

---

## Post-launch content & balance

- **Infinite Adventure** — levels 1–18 are hand-authored; ids beyond are **procedurally generated** (`proceduralLevel` in `data/levels.ts`) on a difficulty curve (collectible count, ice, move budget ramp; bosses every 10th). `getLevel(id)` is defined for any id. LevelSelect is **paginated** (15/page, Prev/Next, lands on the player's progress).
- **Automated playtesting** — `scripts/playtest.test.ts` is a beam-search bot that plays every level through the real `GameModel` and reports solvability / difficulty / star reachability. Run `npx vitest run scripts/playtest.test.ts` after any level/scoring change. Used to fix: unreachable star tiers, score-goal early-termination, trivial collect levels, and to validate procedural levels (sampled to L150).
- **Balance fixes applied** — boosted scoring economy; objective levels rated by move-efficiency, score levels by score tiers (sticky-win, play to the move limit); collect levels rebuilt as column-build puzzles; perfect-clear dropped as a goal (still a scoring bonus); all 18 hand levels verified solvable with every star tier reachable.

### Special tiles
- **Ice** (2-hit): cracks once, clears on the second line through it.
- **Bomb** 💣: when its line clears, detonates a 3×3 area (chains through other bombs), big shockwave/particles + score bonus. Used as bonus spice in procedural score/lines levels. (Note: the playtest bot doesn't model explosions, so bomb levels are verified in-engine + browser rather than via the bot.)

### Difficulty & feel (post-launch tuning pass)
- **Adaptive difficulty (Classic/Daily)** — `GameModel.assistDifficulty()` ramps 0→1 from score 300→2500.
  The generator's crowding assist fades with difficulty, and **hard pentominoes** (`HARD_SHAPES` in
  `pieces.ts`: plus/U/W/Z5/V) blend in up to 25% of picks. Adventure/Collect always play at 0 (balance untouched);
  the placeable-piece guarantee always holds.
- **FEVER** — 3+ consecutive clearing moves multiply the whole clear score ×2 (`SCORING.feverThreshold/feverMultiplier`),
  with a pulsing golden board frame + "FEVER ×2!" banner. Mirrored in the playtest bot sim.
- **Daily modifiers** — `dailyPreset(seed)` deterministically rolls each day as clean / ice (3–5 two-hit tiles) /
  bombs (2–3), announced via toast. Same layout on every device.
- **Readability** — unplaceable tray pieces dim to 35%, a red edge vignette pulses when the board is near-dead
  (fill ≥ 70% or ≤1 placeable piece), and the moves counter turns red at ≤3.

### Power Blocks & Rush (signature mechanics)
- **Power Blocks** — clearing lines fills a charge meter (`SCORING.chargeLines` = 6; Rush = 4). A full meter
  deals a glowing 1×1 special into the next tray: **boom** (3×3 blast) or **bolt** (full row+column blast,
  `Grid.blastLine`). Blasts crack ice, chain bombs, bank collectibles, and **never break a FEVER streak**.
  Dispensing uses a separate Rng stream so seeded Daily/Adventure tray sequences stay stable. Meter UI sits
  between board and tray; bolt gets a cross-beam flash.
- **Rush mode** — 2-minute blitz (menu: "Rush · 2 min"): countdown in the top bar (red at ≤10s), faster
  charge, separate best score (`Storage.getRushBest`), revive grants +30s.

### Content scale (the layers)
1. **Classic** — endless high-score (infinite). 2. **Daily** — date-seeded, one/day (infinite). 3. **Adventure** — hand-authored campaign + infinite procedural levels. 4. **Collect** — standalone endless mode: collect quotas of 3 gem types (green/gold/red) that arrive attached to tray pieces; clear their line to collect; win when all quotas met.

### Collectibles (3 types)
`Collectible` = `green | gold | red` (was star/gem). Each cell or tray piece can carry one (`grid.attachments`, `Piece.collectibles`). Collect Mode dispenses gems on pieces via `GameModel.buildCollectTray` until quotas are handed out. Counters + fly-to-counter beam are per-type (`COLLECTIBLE_META` in config). Back button: adventure → LevelSelect, others → Menu.
