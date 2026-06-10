# Block Blast

A satisfying, juicy block-placement puzzle for mobile web (Phaser 3 + TypeScript + Vite).
Drop pieces on an 8×8 board, clear full rows/columns, chase combos.

## Modes
- **Classic** — endless high-score run.
- **Daily** — a date-seeded puzzle that's identical for everyone each day, with a play streak.
- **Adventure** — hand-tuned levels with goals (score / lines / perfect clears), move limits, and 1–3 star ratings.
- **Shop** — buy & equip block skins and board themes, and stock up on boosters with coins earned from play.

## Boosters
- 🔨 **Hammer** — break a single block.
- 🔄 **Swap** — reroll the current tray.
- 💖 **Revive** — clear the bottom rows and continue after a game over (also available via rewarded ad on native).

## Develop
```bash
npm install
npm run dev        # http://localhost:5173  (open on a phone via the printed Network URL)
npm test           # unit tests (vitest) for the pure game logic
npm run typecheck  # strict TS check
npm run build      # production build to dist/ (PWA-enabled, installable, offline)
npm run icons      # regenerate app/PWA icons from scripts/generate-icons.mjs
```

## Architecture
Pure game logic is fully decoupled from rendering so it can be unit-tested and ported.
```
src/
  core/      pure logic — NO Phaser/DOM (grid, pieces, scoring, rng, generator, daily, gameModel)
  scenes/    Phaser scenes (Boot, Menu, Game, Shop, LevelSelect)
  render/    procedural block/slot textures (per equipped skin & theme)
  ui/        reusable widgets + settings overlay
  systems/   audio (WebAudio synth), haptics, settings, storage, economy,
             achievements, analytics, ads, iap
  data/      themes (skins/board themes) + adventure levels
  config.ts  design resolution, layout, palette
```
**Rule:** `core/` never imports Phaser or touches the DOM.

## Docs
- [`docs/GDD.md`](docs/GDD.md) — game design document
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased plan & status
- [`docs/SHIP.md`](docs/SHIP.md) — release runbook (web deploy, Capacitor → App Store / Play Store, ads & IAP setup)

## Tech notes
- No external art/audio assets — block textures are generated procedurally and all sound is synthesized with the WebAudio API.
- PWA via `vite-plugin-pwa` (installable, full offline precache).
- Native store builds via Capacitor (see `capacitor.config.ts` and SHIP.md).
