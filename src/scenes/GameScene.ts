import Phaser from "phaser";
import {
  BOARD,
  BOARD_PX,
  BOARD_X,
  BOARD_Y,
  COLLECTIBLE_META,
  DESIGN,
  HUD,
  TRAY,
  UI,
  cellCenter,
  cellTopLeft,
} from "../config";
import { GameModel, type GameMode } from "../core/gameModel";
import { suggestMove } from "../core/hint";
import { Rng } from "../core/rng";
import { fillRatio } from "../core/generator";
import { SCORING } from "../core/scoring";
import { dailyChallenge, dailyModifier, dailyPreset, todayKey } from "../core/daily";
import { COLLECTIBLES, type Collectible, type Piece, type PlaceResult } from "../core/types";
import { Storage } from "../systems/storage";
import { Sound } from "../systems/audio";
import { Haptics } from "../systems/haptics";
import { Economy } from "../systems/economy";
import { Achievements } from "../systems/achievements";
import { Analytics } from "../systems/analytics";
import { Ads } from "../systems/ads";
import { Settings } from "../systems/settings";
import { getSkin, getTheme } from "../data/themes";
import { BOOSTER_META } from "../data/boosters";
import { getLevel, type Level } from "../data/levels";
import { ensureTextures } from "../render/textures";
import { addAmbientBackground } from "../render/background";
import {
  collectBeam,
  shockwave,
  confetti,
  edgeFlash,
  placeDust,
  hitStop,
  cameraPunch,
  impactRing,
  lineClearBurst,
  comboFlash,
  perfectCelebration,
  scorePop,
  sparkleTrail,
} from "../render/effects";
import { openSettings } from "../ui/settingsOverlay";
import { makePill, makeButton } from "../ui/widgets";

const STEP = BOARD.cellSize + BOARD.gap;

interface PieceContainer extends Phaser.GameObjects.Container {
  trayIndex: number;
  piece: Piece;
  homeX: number;
  homeY: number;
  homeScale: number;
  bob?: Phaser.Tweens.Tween;
}

interface GameSceneData {
  mode?: GameMode;
  levelId?: number;
}

export class GameScene extends Phaser.Scene {
  private mode: GameMode = "classic";
  private level?: Level;
  private model!: GameModel;
  private best = 0;
  private displayedScore = 0;
  private themeColors = getTheme("default");

  private boardCells: Phaser.GameObjects.Image[][] = [];
  private collectOverlays: (Phaser.GameObjects.Image | null)[][] = [];
  private iceOverlays: (Phaser.GameObjects.Image | null)[][] = [];
  private bombOverlays: (Phaser.GameObjects.Image | null)[][] = [];
  /** "×N layers remaining" badge on armored (layered) collectibles. */
  private layerBadges: (Phaser.GameObjects.Container | null)[][] = [];
  private collectText: Partial<Record<Collectible, Phaser.GameObjects.Text>> = {};
  private ambient?: { destroy(): void };
  private trayContainers: (PieceContainer | null)[] = [null, null, null];
  private previewGfx!: Phaser.GameObjects.Graphics;
  private flashRect!: Phaser.GameObjects.Rectangle;

  private scoreText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private goalText?: Phaser.GameObjects.Text;
  private movesText?: Phaser.GameObjects.Text;
  private coinPill!: { setValue: (v: string) => void };
  private hammerBtn!: Phaser.GameObjects.Container;
  private swapBtn!: Phaser.GameObjects.Container;
  private bombBtn!: Phaser.GameObjects.Container;

  private hammerArmed = false;
  private bombArmed = false;
  private ended = false;
  private hintBtn?: Phaser.GameObjects.Container;
  private hintGfx?: Phaser.GameObjects.Graphics;
  private hintReady = true;
  private idleEvent?: Phaser.Time.TimerEvent;
  /** Pulsing frame around the board while a FEVER streak is hot. */
  private feverGfx?: Phaser.GameObjects.Graphics;
  /** Pulsing red screen-edge vignette when the board is close to dead. */
  private dangerGfx?: Phaser.GameObjects.Graphics;
  /** Power Block charge meter (between board and tray). */
  private chargeFill?: Phaser.GameObjects.Graphics;
  private chargeIcon?: Phaser.GameObjects.Image;
  private chargeWasReady = false;
  /** Rush mode: countdown clock. */
  private rushEndsAt?: number;
  private rushText?: Phaser.GameObjects.Text;

  constructor() {
    super("Game");
  }

  create(data: GameSceneData): void {
    this.mode = data.mode ?? "classic";
    this.level = data.levelId ? getLevel(data.levelId) : undefined;
    this.ended = false;
    this.hammerArmed = false;
    this.bombArmed = false;
    this.displayedScore = 0;

    // Phaser REUSES the scene instance across restarts, so per-run fields keep
    // stale (destroyed) references unless we reset them here. Notably a stale
    // `goalText` from a prior score/lines level would be used on a collect level
    // (which has no goalText), crashing on setText. Reset all per-run state.
    this.goalText = undefined;
    this.movesText = undefined;
    this.hintGfx = undefined;
    this.feverGfx = undefined;
    this.dangerGfx = undefined;
    this.chargeFill = undefined;
    this.chargeIcon = undefined;
    this.chargeWasReady = false;
    this.rushEndsAt = undefined;
    this.rushText = undefined;
    this.hintReady = true;
    this.idleEvent?.remove();
    this.idleEvent = undefined;
    this.collectText = {};
    this.boardCells = [];
    this.collectOverlays = [];
    this.iceOverlays = [];
    this.bombOverlays = [];
    this.layerBadges = [];
    this.trayContainers = [null, null, null];

    // Apply equipped skin/theme.
    const skinId = Economy.getEquippedSkin();
    const themeId = Economy.getEquippedTheme();
    const skin = getSkin(skinId);
    this.themeColors = getTheme(themeId);
    ensureTextures(this, skin.palette, this.themeColors.slot, `${skinId}:${themeId}`);

    this.best = this.mode === "rush" ? Storage.getRushBest() : Storage.getBest();
    this.model = this.buildModel();
    this.model.start();

    Analytics.track("game_start", { mode: this.mode, level: this.level?.id });

    this.drawBackground();
    this.drawBoard();
    this.syncBoard();
    this.renderAttachments();
    this.buildHud();
    this.previewGfx = this.add.graphics().setDepth(5);
    this.flashRect = this.add
      .rectangle(BOARD_X, BOARD_Y, BOARD_PX, BOARD_PX, 0xffffff, 0)
      .setOrigin(0)
      .setDepth(6);
    this.setupBoardTap();
    this.buildTray();
    this.setupDrag();
    this.refreshScore(true);
    this.refreshGoal();
    this.updateDanger();
    this.armIdleHint();

    // Daily: announce the day's modifier so the changed board reads as intent.
    if (this.mode === "daily") {
      const mod = dailyModifier(dailyChallenge(new Date()).seed);
      if (mod === "ice") this.toast("Frost Day — ice tiles take 2 clears");
      else if (mod === "bombs") this.toast("Demolition Day — clear lines through the bombs!");
    }

    // Rush: start the 2-minute clock.
    if (this.mode === "rush") {
      this.rushEndsAt = this.time.now + 120_000;
      this.time.addEvent({ delay: 200, loop: true, callback: () => this.tickRush() });
      this.toast("RUSH — score as much as you can in 2 minutes!");
    }

    // Audio: unlock on first gesture, start music bed.
    this.input.once("pointerdown", () => Sound.init());
    if (Settings.music) this.time.delayedCall(200, () => Sound.startMusic());
  }

  private buildModel(): GameModel {
    if (this.mode === "daily") {
      // Each day plays under a deterministic modifier (clean / ice / bombs) so
      // dailies feel distinct. Default generator = adaptive difficulty ramp.
      const dc = dailyChallenge(new Date());
      return new GameModel({ mode: "daily", rng: new Rng(dc.seed), preset: dailyPreset(dc.seed) });
    }
    if (this.mode === "adventure" && this.level) {
      return new GameModel({
        mode: "adventure",
        rng: new Rng(this.level.seed),
        goal: this.level.goal,
        movesLimit: this.level.movesLimit,
        preset: this.level.preset,
        collectQuota: this.level.collectQuota,
        armoredGems: this.level.armoredGems,
      });
    }
    if (this.mode === "collect") {
      // Endless "collect the quotas" mode — gems arrive on tray pieces.
      // Tighter quota = a reliably-winnable, less board-flooding session.
      return new GameModel({ mode: "collect", collectQuota: { green: 4, gold: 4, red: 5 } });
    }
    if (this.mode === "rush") {
      // 2-minute blitz: Power Blocks charge faster to keep the pace frantic.
      return new GameModel({ mode: "rush", chargeLines: 4 });
    }
    return new GameModel({ mode: "classic" });
  }

  // ---------- Layout ----------
  private drawBackground(): void {
    this.ambient = addAmbientBackground(this, {
      bgTop: this.themeColors.bgTop,
      bgBottom: this.themeColors.bgBottom,
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.ambient?.destroy());
  }

  private drawBoard(): void {
    const bg = this.add.graphics();
    // Outer drop shadow (soft, offset down)
    bg.fillStyle(UI.shadow, 0.16);
    bg.fillRoundedRect(BOARD_X - 2, BOARD_Y + 10, BOARD_PX + 4, BOARD_PX + 4, 20);
    // Secondary shadow layer (closer)
    bg.fillStyle(UI.shadow, 0.1);
    bg.fillRoundedRect(BOARD_X, BOARD_Y + 5, BOARD_PX, BOARD_PX + 2, 18);
    // Board panel
    bg.fillStyle(this.themeColors.boardBg, 1);
    bg.fillRoundedRect(BOARD_X, BOARD_Y, BOARD_PX, BOARD_PX, 16);
    // Cool frosted border to define the glass panel
    bg.lineStyle(1.5, UI.glassStroke, 0.85);
    bg.strokeRoundedRect(BOARD_X + 1, BOARD_Y + 1, BOARD_PX - 2, BOARD_PX - 2, 15);
    for (let r = 0; r < BOARD.cells; r++) {
      this.boardCells[r] = [];
      for (let c = 0; c < BOARD.cells; c++) {
        const { x, y } = cellCenter(r, c);
        this.add.image(x, y, "slot").setDisplaySize(BOARD.cellSize, BOARD.cellSize);
        const cell = this.add
          .image(x, y, "block0")
          .setDisplaySize(BOARD.cellSize, BOARD.cellSize)
          .setVisible(false)
          .setDepth(2);
        this.boardCells[r][c] = cell;
      }
    }
  }

  /** Paint board cells from the model (used for preset initial fills). */
  private syncBoard(): void {
    const grid = this.model.grid.cells;
    for (let r = 0; r < BOARD.cells; r++) {
      for (let c = 0; c < BOARD.cells; c++) {
        const v = grid[r][c];
        const cell = this.boardCells[r][c];
        if (v === null) cell.setVisible(false);
        else cell.setTexture(`block${v}`).setVisible(true).setDisplaySize(BOARD.cellSize, BOARD.cellSize);
      }
    }
  }

  /** Overlay star/gem badges and ice tiles on the board. */
  private renderAttachments(): void {
    const att = this.model.grid.attachments;
    const health = this.model.grid.health;
    const bombs = this.model.grid.bombs;
    for (let r = 0; r < BOARD.cells; r++) {
      this.collectOverlays[r] = this.collectOverlays[r] ?? [];
      this.iceOverlays[r] = this.iceOverlays[r] ?? [];
      this.bombOverlays[r] = this.bombOverlays[r] ?? [];
      this.layerBadges[r] = this.layerBadges[r] ?? [];
      for (let c = 0; c < BOARD.cells; c++) {
        const { x, y } = cellCenter(r, c);

        // Ice overlay (2-hit cell)
        this.iceOverlays[r][c]?.destroy();
        this.iceOverlays[r][c] = null;
        if (health[r][c] > 1) {
          this.iceOverlays[r][c] = this.add
            .image(x, y, "ice_full")
            .setDisplaySize(BOARD.cellSize, BOARD.cellSize)
            .setDepth(3);
        }

        // Bomb overlay
        this.bombOverlays[r][c]?.destroy();
        this.bombOverlays[r][c] = null;
        if (bombs[r][c]) {
          this.bombOverlays[r][c] = this.add
            .image(x, y, "bomb")
            .setDisplaySize(BOARD.cellSize, BOARD.cellSize)
            .setDepth(3);
        }

        // Collectible badge
        this.collectOverlays[r][c]?.destroy();
        this.collectOverlays[r][c] = null;
        const a = att[r][c];
        if (!a) continue;
        const ov = this.add
          .image(x, y, `collect_${a}`)
          .setDisplaySize(BOARD.cellSize, BOARD.cellSize)
          .setDepth(4);
        this.collectOverlays[r][c] = ov;
        // (Idle pulse on the placed star removed — it sits static once on the board.)

        // Armored (layered) star: show how many layers remain.
        this.layerBadges[r][c]?.destroy();
        this.layerBadges[r][c] = health[r][c] > 1 ? this.makeLayerBadge(x, y, health[r][c]) : null;
      }
    }
  }

  /** A small "×N" badge pinned to a cell's top-right, marking layers remaining. */
  private makeLayerBadge(x: number, y: number, count: number): Phaser.GameObjects.Container {
    const off = BOARD.cellSize * 0.3;
    const dot = this.add.circle(0, 0, 9, 0x10243a).setStrokeStyle(2, 0x7fd4ff);
    const label = this.add
      .text(0, 0, `×${count}`, { fontFamily: "Arial", fontStyle: "bold", fontSize: "13px", color: "#dff3ff" })
      .setOrigin(0.5);
    return this.add.container(x + off, y - off, [dot, label]).setDepth(6);
  }

  private buildHud(): void {
    const y = HUD.topBarY;

    // ---- Top bar: back · level/best badge · moves · coins · gear ----
    const back = this.add
      .image(32, y, "ic_back")
      .setDisplaySize(28, 28)
      .setTint(UI.accent)
      .setInteractive({ useHandCursor: true });
    back.on("pointerup", () => {
      Sound.button();
      Sound.stopMusic();
      // Adventure returns to the level map; classic/daily return to the menu.
      this.scene.start(this.mode === "adventure" ? "LevelSelect" : "Menu");
    });

    // Badge: crown+best (classic) / calendar+date (daily) / level (adventure) / clock+best (rush)
    let badgeIcon: string | null = "ic_crown";
    let badgeText = String(this.best);
    if (this.mode === "daily") {
      badgeIcon = "ic_calendar";
      badgeText = todayKey(new Date());
    } else if (this.mode === "adventure" && this.level) {
      badgeIcon = null;
      badgeText = `Lv.${this.level.id}`;
    } else if (this.mode === "rush") {
      badgeIcon = "ic_clock";
    }
    let textX = 56;
    if (badgeIcon) {
      this.add.image(66, y, badgeIcon).setDisplaySize(22, 22).setTint(UI.accent);
      textX = 84;
    }
    this.bestText = this.add
      .text(textX, y, badgeText, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "21px",
        color: UI.accentText,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);

    // Coins (top-right) + settings gear (corner)
    this.coinPill = makePill(this, DESIGN.width - 132, y, "ic_coin", String(Economy.getCoins()), 0xffc94d);
    const gear = this.add
      .image(DESIGN.width - 34, y, "ic_gear")
      .setDisplaySize(30, 30)
      .setTint(UI.accent)
      .setInteractive({ useHandCursor: true });
    gear.on("pointerup", () => openSettings(this));

    // Moves indicator lives in the top bar (centre), so the objective row below
    // stays a single uncluttered line.
    if (this.mode === "adventure" && this.model.movesLimit !== undefined) {
      this.movesText = this.add
        .text(DESIGN.width / 2, y, "", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "18px",
          color: UI.textPrimary,
          fontStyle: "bold",
          backgroundColor: "rgba(0,0,0,0.32)",
          padding: { x: 12, y: 4 },
        })
        .setOrigin(0.5);
    }

    // Rush countdown takes the same centre slot.
    if (this.mode === "rush") {
      this.rushText = this.add
        .text(DESIGN.width / 2, y, "2:00", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "22px",
          color: UI.textPrimary,
          fontStyle: "900",
          backgroundColor: "rgba(0,0,0,0.32)",
          padding: { x: 14, y: 4 },
        })
        .setOrigin(0.5);
    }

    // ---- Score ----
    this.scoreText = this.add
      .text(DESIGN.width / 2, HUD.scoreY, "0", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${HUD.scoreFont}px`,
        color: UI.textPrimary,
        fontStyle: "900",
      })
      .setOrigin(0.5);
    // Smooth GPU glow instead of the patchy canvas shadow blur.
    this.scoreText.preFX?.addGlow(0x34e6c2, 1.2, 0, false, 0.1, 8);

    // ---- Combo banner — flashes over the board centre (never crowds the top) ----
    this.comboText = this.add
      .text(DESIGN.width / 2, BOARD_Y + BOARD_PX / 2, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "36px",
        color: "#3df0cc",
        fontStyle: "900",
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setStroke("#ffffff", 6)
      .setShadow(0, 4, "rgba(44,60,102,0.35)", 8, false, true)
      .setAlpha(0);

    // ---- Objective row (single line at HUD.objectiveY) ----
    if (this.mode === "collect" || (this.mode === "adventure" && this.model.goal?.type === "collect")) {
      this.buildCollectCounters(); // collectible counters ARE the objective row
    } else if (this.mode === "adventure" && this.level) {
      this.goalText = this.add
        .text(DESIGN.width / 2, HUD.objectiveY, "", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          color: UI.textPrimary,
          fontStyle: "bold",
        })
        .setOrigin(0.5);
    }

    // Booster + hint buttons — pushed to the bottom so there's a clear gap
    // below the tray (otherwise a low grab on a piece taps a booster instead).
    const by = DESIGN.height - 60;
    const cx = DESIGN.width / 2;
    this.hammerBtn = this.makeBooster(cx - 126, by, "ic_hammer", "hammer");
    this.bombBtn   = this.makeBooster(cx - 42,  by, "ic_bomb",   "bomb");
    this.swapBtn   = this.makeBooster(cx + 42,  by, "ic_swap",   "swap");
    this.hintBtn   = this.makeHintButton(cx + 126, by);

    this.buildChargeMeter();
  }

  /** Charge-meter geometry (between the board and the tray). */
  private chargeGeom(): { x: number; y: number; w: number; h: number } {
    const w = 250;
    const h = 10;
    return { x: DESIGN.width / 2 - w / 2, y: BOARD_Y + BOARD_PX + 16, w, h };
  }

  private buildChargeMeter(): void {
    const { x, y, w, h } = this.chargeGeom();
    const bg = this.add.graphics().setDepth(7);
    bg.fillStyle(UI.shadow, 0.35).fillRoundedRect(x - 2, y - 2, w + 4, h + 4, 7);
    bg.fillStyle(UI.glass, 1).fillRoundedRect(x, y, w, h, 5);
    bg.lineStyle(1, UI.glassStroke, 0.6).strokeRoundedRect(x, y, w, h, 5);
    this.chargeFill = this.add.graphics().setDepth(8);
    this.chargeIcon = this.add
      .image(x - 18, y + h / 2, "ic_bolt")
      .setDisplaySize(22, 22)
      .setTint(0x6b7ba3)
      .setDepth(8);
    this.updateChargeMeter();
  }

  /** Repaint the Power Block charge bar; celebrate the moment it fills. */
  private updateChargeMeter(): void {
    if (!this.chargeFill || !this.chargeIcon) return;
    const { x, y, w, h } = this.chargeGeom();
    const p = this.model.chargeProgress();
    const ready = this.model.pendingSpecial !== null;
    this.chargeFill.clear();
    if (p > 0) {
      const fw = Math.max(10, w * p);
      this.chargeFill.fillStyle(ready ? UI.accent : 0x2aa6ff, 1).fillRoundedRect(x, y, fw, h, 5);
      this.chargeFill.fillStyle(0xffffff, 0.4).fillRoundedRect(x + 2, y + 1, fw - 4, h * 0.45, 3);
    }
    this.chargeIcon.setTint(ready ? UI.accent : 0x6b7ba3);
    if (ready && !this.chargeWasReady) {
      this.toast("Power Block charged!");
      Sound.combo(5);
      impactRing(this, x + w / 2, y + h / 2, UI.accent, 70);
      this.tweens.add({
        targets: this.chargeIcon,
        displayWidth: 30,
        displayHeight: 30,
        yoyo: true,
        duration: 150,
        repeat: 2,
      });
    }
    this.chargeWasReady = ready;
  }

  /** Rush: update the countdown; end the run when time is up. */
  private tickRush(): void {
    if (!this.rushText || this.ended || this.rushEndsAt === undefined) return;
    const left = Math.max(0, this.rushEndsAt - this.time.now);
    const s = Math.ceil(left / 1000);
    this.rushText.setText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
    this.rushText.setColor(s <= 10 ? UI.danger : UI.textPrimary);
    if (left <= 0) {
      this.model.over = true;
      this.endGame();
    }
  }

  /** Draw the action-button face into `g`. `pressed` shifts content down. */
  private drawWoodBtn(g: Phaser.GameObjects.Graphics, S: number, R: number, pressed: boolean): void {
    g.clear();
    const lift = pressed ? 0 : 5;
    const faceY = pressed ? 5 : 0;
    // Outer drop-shadow
    g.fillStyle(UI.shadow, pressed ? 0.2 : 0.4);
    g.fillRoundedRect(-S / 2 + 2, -S / 2 + lift + 6, S - 2, S, R + 2);
    // Recessed base — darker floor for a raised 3-D look
    g.fillStyle(0x0a1322, 1);
    g.fillRoundedRect(-S / 2, -S / 2 + lift, S, S, R);
    // Main face (dark glass)
    g.fillStyle(UI.glass, 1);
    g.fillRoundedRect(-S / 2, -S / 2 + faceY, S, S, R);
    // Top gloss strip
    g.fillStyle(0xffffff, 0.12);
    g.fillRoundedRect(-S / 2 + 5, -S / 2 + faceY + 5, S - 10, S * 0.38, R * 0.65);
    // Thin cool border
    g.lineStyle(1.5, UI.glassStroke, 0.9);
    g.strokeRoundedRect(-S / 2 + 1, -S / 2 + faceY + 1, S - 2, S - 2, R - 1);
  }

  /** Draw a count badge circle at `(0, bY)` inside graphics `g`. */
  private drawBadge(g: Phaser.GameObjects.Graphics, bY: number, count: number): void {
    g.clear();
    const bR = 13;
    // Owned → green count badge; empty → amber "+" badge inviting a purchase.
    // (Amber, not the cyan brand accent: accent 0x2fe6c4 and successInt 0x2fcf7a
    // are both cyan-greens that read as nearly the same badge. Amber clearly
    // signals a different "tap to buy" state.)
    const col = count > 0 ? UI.successInt : 0xffa62e;
    g.fillStyle(UI.shadow, 0.22).fillCircle(0, bY + 2, bR);
    g.fillStyle(col, 1).fillCircle(0, bY, bR);
    g.fillStyle(0xffffff, 0.3).fillEllipse(0, bY - 4, bR * 1.3, bR * 0.62);
  }

  /** Wooden-square hint button (no count badge, icon fades during cooldown). */
  private makeHintButton(x: number, y: number): Phaser.GameObjects.Container {
    const S = 64;
    const R = 14;
    const c = this.add.container(x, y).setDepth(8);
    const bgG = this.add.graphics();
    this.drawWoodBtn(bgG, S, R, false);
    const ic = this.add.image(0, -2, "ic_bulb").setDisplaySize(32, 32).setTint(0xef9f00);
    c.add([bgG, ic]);
    c.setData("icon", ic);   // useHint reads this for cooldown fade
    c.setSize(S, S);
    c.setInteractive(new Phaser.Geom.Rectangle(-S / 2, -S / 2, S, S), Phaser.Geom.Rectangle.Contains);
    c.on("pointerdown", () => { this.drawWoodBtn(bgG, S, R, true);  ic.setY(2); });
    const rel = () =>        { this.drawWoodBtn(bgG, S, R, false); ic.setY(-2); };
    c.on("pointerup",  () => { rel(); this.useHint(false); });
    c.on("pointerout", rel);
    return c;
  }

  /** Wooden-square booster button with a live count badge. */
  private makeBooster(x: number, y: number, iconKey: string, kind: "hammer" | "swap" | "bomb"): Phaser.GameObjects.Container {
    const S = 64;
    const R = 14;
    const badgeY = S / 2 + 4;   // badge circle center relative to button center
    const tints: Record<string, number> = { hammer: 0xff8c1a, bomb: 0xff4060, swap: 0x30c8ff };

    const c = this.add.container(x, y).setDepth(8);

    const bgG = this.add.graphics();
    this.drawWoodBtn(bgG, S, R, false);

    const ic = this.add.image(0, -2, iconKey).setDisplaySize(34, 34).setTint(tints[kind]);

    const badgeG = this.add.graphics();
    const count = Economy.getBoosters()[kind];
    this.drawBadge(badgeG, badgeY, count);

    const badgeTxt = this.add.text(0, badgeY, count > 0 ? String(count) : "+", {
      fontFamily: "system-ui, sans-serif",
      fontSize: "15px",
      color: "#ffffff",
      fontStyle: "900",
    }).setOrigin(0.5);

    c.add([bgG, ic, badgeG, badgeTxt]);
    c.setData("badgeG", badgeG);
    c.setData("badgeTxt", badgeTxt);
    c.setData("badgeY", badgeY);

    const hitH = badgeY + 13;
    c.setSize(S, S + hitH);
    c.setInteractive(new Phaser.Geom.Rectangle(-S / 2, -S / 2, S, S + hitH), Phaser.Geom.Rectangle.Contains);

    c.on("pointerdown", () => { this.drawWoodBtn(bgG, S, R, true);  ic.setY(2); });
    const rel = () =>          { this.drawWoodBtn(bgG, S, R, false); ic.setY(-2); };
    c.on("pointerup",  () => { rel(); this.useBooster(kind); });
    c.on("pointerout", rel);
    return c;
  }

  private refreshBoosterBadge(btn: Phaser.GameObjects.Container, kind: "hammer" | "swap" | "bomb"): void {
    const count  = Economy.getBoosters()[kind];
    const badgeG = btn.getData("badgeG")   as Phaser.GameObjects.Graphics;
    const badgeTxt = btn.getData("badgeTxt") as Phaser.GameObjects.Text;
    const badgeY = btn.getData("badgeY")   as number;
    this.drawBadge(badgeG, badgeY, count);
    badgeTxt.setText(count > 0 ? String(count) : "+");
  }

  /** Map a booster kind to its on-screen button. */
  private boosterButton(kind: "hammer" | "swap" | "bomb"): Phaser.GameObjects.Container {
    return kind === "hammer" ? this.hammerBtn : kind === "bomb" ? this.bombBtn : this.swapBtn;
  }

  private useBooster(kind: "hammer" | "swap" | "bomb"): void {
    if (this.ended) return;
    // Out of stock → offer to buy one right here, then use it immediately.
    if (Economy.getBoosters()[kind] <= 0) {
      this.promptBuyBooster(kind, () => this.activateBooster(kind));
      return;
    }
    this.activateBooster(kind);
  }

  /** Open a compact "buy one booster" prompt; `onBought` fires after a success. */
  private promptBuyBooster(kind: "hammer" | "swap" | "bomb" | "revive", onBought: () => void): void {
    const meta = BOOSTER_META[kind];
    const layer = this.add.container(0, 0).setDepth(220);
    const dim = this.add
      .rectangle(0, 0, DESIGN.width, DESIGN.height, 0x000000, 0.55)
      .setOrigin(0)
      .setInteractive();
    layer.add(dim);

    const pw = 320;
    const ph = 250;
    const px = (DESIGN.width - pw) / 2;
    const py = (DESIGN.height - ph) / 2;
    const panel = this.add.graphics();
    panel.fillStyle(UI.shadow, 0.4).fillRoundedRect(px - 2, py + 10, pw + 4, ph, 24);
    panel.fillStyle(UI.glass, 0.98).fillRoundedRect(px, py, pw, ph, 22);
    panel.fillStyle(0xffffff, 0.07).fillRoundedRect(px + 3, py + 3, pw - 6, ph * 0.4, 20);
    panel.lineStyle(1.5, UI.glassStroke, 0.9).strokeRoundedRect(px + 1, py + 1, pw - 2, ph - 2, 21);
    layer.add(panel);

    layer.add(this.add.image(DESIGN.width / 2, py + 56, meta.icon).setDisplaySize(46, 46).setTint(meta.tint));
    layer.add(
      this.add
        .text(DESIGN.width / 2, py + 100, meta.name, {
          fontFamily: "system-ui, sans-serif", fontSize: "26px", color: UI.textPrimary, fontStyle: "900",
        })
        .setOrigin(0.5)
    );
    layer.add(
      this.add
        .text(DESIGN.width / 2, py + 130, meta.desc, {
          fontFamily: "system-ui, sans-serif", fontSize: "16px", color: UI.textSecondary,
        })
        .setOrigin(0.5)
    );

    const close = () => layer.destroy();
    const buy = makeButton(this, DESIGN.width / 2, py + 190, `${meta.price}`, {
      width: 200,
      height: 52,
      iconKey: "ic_coin",
      iconTint: 0xffc94d,
      onClick: () => {
        if (Economy.spendCoins(meta.price)) {
          Economy.addBooster(meta.kind, 1);
          this.coinPill.setValue(String(Economy.getCoins()));
          close();
          onBought();
        } else {
          this.toast("Not enough coins");
        }
      },
    });
    layer.add(buy);
    dim.on("pointerup", close);

    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 160 });
  }

  /** Arm/apply a booster the player already owns (consumes on actual use). */
  private activateBooster(kind: "hammer" | "swap" | "bomb"): void {
    if (this.ended) return;
    if (Economy.getBoosters()[kind] <= 0) return;
    this.refreshBoosterBadge(this.boosterButton(kind), kind);
    if (kind === "swap") {
      Economy.useBooster("swap");
      Analytics.track("booster_used", { kind });
      Sound.button();
      this.model.swapTray();
      this.buildTray();
      this.refreshBoosterBadge(this.swapBtn, "swap");
      this.updateDanger();
      if (this.model.over) this.endGame();
    } else if (kind === "bomb") {
      // arm bomb; next board tap detonates a 3×3 (mutually exclusive with hammer)
      this.bombArmed = !this.bombArmed;
      this.hammerArmed = false;
      this.hammerBtn.setScale(1);
      this.bombBtn.setScale(this.bombArmed ? 1.2 : 1);
      this.toast(this.bombArmed ? "Tap the board to blast a 3×3" : "");
    } else {
      // arm hammer; next board tap removes a block (mutually exclusive with bomb)
      this.hammerArmed = !this.hammerArmed;
      this.bombArmed = false;
      this.bombBtn.setScale(1);
      this.hammerBtn.setScale(this.hammerArmed ? 1.2 : 1);
      this.toast(this.hammerArmed ? "Tap a block to break it" : "");
    }
  }

  // ---------- Tray ----------
  private traySlotX(i: number): number {
    return BOARD_X + (i + 0.5) * (BOARD_PX / 3);
  }
  private traySlotY(): number {
    return TRAY.y + TRAY.height / 2;
  }

  private buildTray(): void {
    for (let i = 0; i < 3; i++) this.refreshTraySlot(i);
    this.updateTrayPlayability();
  }

  private refreshTraySlot(i: number): void {
    this.trayContainers[i]?.bob?.remove();
    this.trayContainers[i]?.destroy();
    this.trayContainers[i] = null;
    const piece = this.model.tray[i];
    if (!piece || piece.used) return;
    const container = this.makePieceContainer(piece, i);
    container.setScale(container.homeScale);
    this.startBob(container, i);
    this.trayContainers[i] = container;
  }

  private startBob(c: PieceContainer, _i: number): void {
    // Floating "bob" animation removed by design — tray pieces sit still at their
    // home slot. (Kept as a no-op so the drag/hint/return-home call sites that
    // re-arm it after their own tweens don't need to change.) Each piece used to
    // own an infinite y-oscillation tween, so this also drops 3 always-running
    // tweens from the render loop.
    c.bob = undefined;
    c.y = this.traySlotY();
  }

  private makePieceContainer(piece: Piece, trayIndex: number): PieceContainer {
    const { rows, cols } = piece.shape;
    const container = this.add.container(this.traySlotX(trayIndex), this.traySlotY()) as PieceContainer;
    // Above the booster row (depth 8) so a grab on a piece wins the pointer over
    // an overlapping booster hit area.
    container.setDepth(10);
    for (const [dr, dc] of piece.shape.cells) {
      const lx = (dc - (cols - 1) / 2) * STEP;
      const ly = (dr - (rows - 1) / 2) * STEP;
      container.add(this.add.image(lx, ly, `block${piece.color}`).setDisplaySize(BOARD.cellSize, BOARD.cellSize));
    }
    // Gems carried by the piece (Collect mode).
    for (const g of piece.collectibles ?? []) {
      const lx = (g.dc - (cols - 1) / 2) * STEP;
      const ly = (g.dr - (rows - 1) / 2) * STEP;
      container.add(this.add.image(lx, ly, `collect_${g.type}`).setDisplaySize(BOARD.cellSize, BOARD.cellSize));
    }
    // Power Block: glowing icon overlay so it reads as a charged piece.
    if (piece.special) {
      const glow = this.add
        .image(0, 0, `block${piece.color}`)
        .setDisplaySize(BOARD.cellSize * 1.25, BOARD.cellSize * 1.25)
        .setTint(piece.special === "boom" ? 0xff9d3a : 0x57c8ff)
        .setAlpha(0.45)
        .setBlendMode(Phaser.BlendModes.ADD);
      const ic = this.add
        .image(0, 0, piece.special === "boom" ? "ic_bomb" : "ic_bolt")
        .setDisplaySize(36, 36)
        .setTint(0xffffff);
      container.addAt(glow, 0);
      container.add(ic);
      // (Pulsing scale tween on the icon removed — the additive glow already
      // reads as "charged" without an always-running animation.)
    }
    const w = cols * BOARD.cellSize + (cols - 1) * BOARD.gap;
    const h = rows * BOARD.cellSize + (rows - 1) * BOARD.gap;
    container.setSize(w, h);
    // Wide pieces (e.g. 1×5 lines) at TRAY.scale overflow their slot and cover
    // the neighbour piece — shrink them so they always fit inside one slot.
    const slotW = BOARD_PX / 3;
    const homeScale = Math.min(TRAY.scale, (slotW - 12) / w);
    // Generous hit area: thin/small pieces are near-impossible to grab with a
    // finger at exact bounds, so pad each side up to a minimum on-screen size
    // (in design px, divided by scale because the hit area is in local space).
    const MIN_HIT = 110;
    const hitW = Math.max(w, MIN_HIT / homeScale);
    const hitH = Math.max(h, MIN_HIT / homeScale);
    // Phaser localizes container hit-test points to the top-left origin.
    container.setInteractive(
      new Phaser.Geom.Rectangle((w - hitW) / 2, (h - hitH) / 2, hitW, hitH),
      Phaser.Geom.Rectangle.Contains,
    );
    this.input.setDraggable(container);
    container.trayIndex = trayIndex;
    container.piece = piece;
    container.homeX = this.traySlotX(trayIndex);
    container.homeY = this.traySlotY();
    container.homeScale = homeScale;
    return container;
  }

  // ---------- Board tap (hammer) ----------
  private setupBoardTap(): void {
    const zone = this.add
      .zone(BOARD_X, BOARD_Y, BOARD_PX, BOARD_PX)
      .setOrigin(0)
      .setInteractive();
    zone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.ended) return;
      const col = Math.floor((p.x - BOARD_X - BOARD.pad) / STEP);
      const row = Math.floor((p.y - BOARD_Y - BOARD.pad) / STEP);
      if (this.bombArmed) {
        this.detonateAt(row, col);
        return;
      }
      if (!this.hammerArmed) return;
      if (this.model.removeCell(row, col)) {
        Economy.useBooster("hammer");
        Analytics.track("booster_used", { kind: "hammer" });
        const cell = this.boardCells[row][col];
        this.burst(cell.x, cell.y, cell.texture.key);
        cell.setVisible(false);
        Sound.clear(1);
        Haptics.place();
        this.hammerArmed = false;
        this.hammerBtn.setScale(1);
        this.refreshBoosterBadge(this.hammerBtn, "hammer");
        this.updateTrayPlayability();
        this.updateDanger();
        this.toast("");
      }
    });
  }

  /** Bomb booster: detonate a chosen 3×3 (chains through bombs), then resolve FX. */
  private detonateAt(row: number, col: number): void {
    if (!this.model.grid.inBounds(row, col)) return;
    const res = this.model.detonate(row, col);
    if (res.exploded.length === 0 && res.cracked.length === 0) {
      this.toast("Nothing to blast there"); // don't waste the booster on empty space
      return;
    }
    Economy.useBooster("bomb");
    Analytics.track("booster_used", { kind: "bomb" });
    this.bombArmed = false;
    this.bombBtn.setScale(1);
    this.refreshBoosterBadge(this.bombBtn, "bomb");
    this.toast("");

    // Drop overlays on exploded cells (collected gems keep theirs — they fly away).
    const collectedKeys = new Set(res.collected.map(({ row: r, col: c }) => `${r},${c}`));
    for (const [r, c] of res.exploded) {
      this.iceOverlays[r]?.[c]?.destroy();
      if (this.iceOverlays[r]) this.iceOverlays[r][c] = null;
      this.layerBadges[r]?.[c]?.destroy();
      if (this.layerBadges[r]) this.layerBadges[r][c] = null;
      if (!collectedKeys.has(`${r},${c}`)) {
        this.collectOverlays[r]?.[c]?.destroy();
        if (this.collectOverlays[r]) this.collectOverlays[r][c] = null;
      }
    }
    this.animateExplosions(res.exploded);

    // Cells that only cracked (ice / armored star lost a layer).
    for (const [r, c] of res.cracked) {
      this.iceOverlays[r]?.[c]?.setTexture("ice_cracked");
      const badge = this.layerBadges[r]?.[c];
      if (badge) {
        const left = this.model.grid.health[r][c];
        if (left > 1) (badge.list[1] as Phaser.GameObjects.Text).setText(`×${left}`);
        else {
          badge.destroy();
          this.layerBadges[r][c] = null;
        }
      }
    }

    if (res.collected.length > 0) this.animateCollected(res.collected);
    this.refreshScore(false);
    this.refreshGoal();
    this.updateTrayPlayability();
    this.updateDanger();
    this.armIdleHint();
    if (this.model.over) this.time.delayedCall(420, () => this.endGame());
  }

  // ---------- Drag & drop ----------
  private setupDrag(): void {
    this.input.on("dragstart", (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const c = obj as PieceContainer;
      this.armIdleHint(); // player is active — reset the idle hint timer
      if (this.hintGfx) {
        this.tweens.killTweensOf(this.hintGfx);
        this.hintGfx.destroy();
        this.hintGfx = undefined;
      }
      // Kill ALL tweens on the piece (idle bob AND any hint pulse) so a leftover
      // bob tween can't yank it back to the tray mid-drag (=> "can't place").
      this.tweens.killTweensOf(c);
      c.bob = undefined;
      this.children.bringToTop(c);
      this.tweens.add({ targets: c, scale: 1, duration: 120, ease: "Back.out" });
    });

    this.input.on("drag", (pointer: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const c = obj as PieceContainer;
      const lift = (c.piece.shape.rows * STEP) / 2 + BOARD.cellSize * 0.9;
      c.x = pointer.x;
      c.y = pointer.y - lift;
      this.updatePreview(c);
    });

    this.input.on("dragend", (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject) => {
      const c = obj as PieceContainer;
      this.previewGfx.clear();
      const { row, col } = this.containerToBase(c);
      if (this.model.canPlace(c.trayIndex, row, col)) {
        const res = this.model.place(c.trayIndex, row, col);
        this.trayContainers[c.trayIndex] = null;
        c.destroy();
        this.applyResult(res);
      } else {
        this.tweens.add({
          targets: c,
          x: c.homeX,
          y: c.homeY,
          scale: c.homeScale,
          duration: 160,
          ease: "Quad.out",
          onComplete: () => this.startBob(c, c.trayIndex),
        });
      }
    });
  }

  private containerToBase(c: PieceContainer): { row: number; col: number } {
    const { rows, cols } = c.piece.shape;
    const col = Math.round((c.x - ((cols - 1) / 2) * STEP - (BOARD_X + BOARD.pad) - BOARD.cellSize / 2) / STEP);
    const row = Math.round((c.y - ((rows - 1) / 2) * STEP - (BOARD_Y + BOARD.pad) - BOARD.cellSize / 2) / STEP);
    return { row, col };
  }

  private updatePreview(c: PieceContainer): void {
    this.previewGfx.clear();
    const { row, col } = this.containerToBase(c);
    const ok = this.model.canPlace(c.trayIndex, row, col);
    this.previewGfx.fillStyle(ok ? 0xffffff : 0xff4d4d, ok ? 0.35 : 0.4);
    for (const [dr, dc] of c.piece.shape.cells) {
      const r = row + dr;
      const cc = col + dc;
      if (r < 0 || r >= BOARD.cells || cc < 0 || cc >= BOARD.cells) continue;
      const tl = cellTopLeft(r, cc);
      this.previewGfx.fillRoundedRect(tl.x, tl.y, BOARD.cellSize, BOARD.cellSize, 8);
    }
  }

  // ---------- Apply a placement ----------
  private applyResult(res: PlaceResult): void {
    if (!res.ok) return;
    Sound.place();
    Haptics.place();
    if (res.placedCells.length) {
      const px = res.placedCells.reduce((s, [, c]) => s + c, 0) / res.placedCells.length;
      const py = res.placedCells.reduce((s, [r]) => s + r, 0) / res.placedCells.length;
      const ctr = cellCenter(py, px);
      placeDust(this, ctr.x, ctr.y);
      impactRing(this, ctr.x, ctr.y, 0xffffff, 46); // small "thock" hit
    }

    // Ice that cracked (survived) this turn: swap to cracked art + react.
    for (const [r, c] of res.cracked) {
      const ov = this.iceOverlays[r]?.[c];
      if (ov) {
        ov.setTexture("ice_cracked");
        ov.setScale(ov.scale * 1.2);
        this.tweens.add({ targets: ov, scale: ov.scale / 1.2, duration: 160, ease: "Back.out" });
      }
      // Armored star lost a layer: update its "×N" badge (or drop it on the last).
      const badge = this.layerBadges[r]?.[c];
      if (badge) {
        const left = this.model.grid.health[r][c];
        if (left > 1) {
          const label = badge.list[1] as Phaser.GameObjects.Text;
          label.setText(`×${left}`);
          badge.setScale(1.4);
          this.tweens.add({ targets: badge, scale: 1, duration: 180, ease: "Back.out" });
        } else {
          this.tweens.add({ targets: badge, alpha: 0, scale: 1.6, duration: 200, onComplete: () => badge.destroy() });
          this.layerBadges[r][c] = null;
        }
      }
      const ic = cellCenter(r, c);
      this.burst(ic.x, ic.y, "spark");
    }
    if (res.cracked.length) {
      Sound.clear(1);
      Haptics.place();
    }

    const clearedKeys = new Set(res.clearedCells.map(([r, c]) => `${r},${c}`));
    const grid = this.model.grid.cells;

    for (const [r, c] of res.placedCells) {
      const cell = this.boardCells[r][c];
      cell.setTexture(`block${grid[r][c] ?? res.placedColor}`).setVisible(true);
      if (clearedKeys.has(`${r},${c}`)) {
        cell.setDisplaySize(BOARD.cellSize, BOARD.cellSize);
        continue;
      }
      cell.setDisplaySize(BOARD.cellSize * 0.55, BOARD.cellSize * 0.55);
      this.tweens.add({
        targets: cell,
        displayWidth: BOARD.cellSize,
        displayHeight: BOARD.cellSize,
        duration: 160,
        ease: "Back.out",
      });
      // A gem carried by the placed piece now sits on the board: show its badge.
      const att = this.model.grid.attachments[r][c];
      if (att && !this.collectOverlays[r]?.[c]) {
        const ov = this.add.image(cell.x, cell.y, `collect_${att}`).setDisplaySize(BOARD.cellSize, BOARD.cellSize).setDepth(4);
        this.collectOverlays[r] = this.collectOverlays[r] ?? [];
        this.collectOverlays[r][c] = ov;
        // (Idle pulse on the placed star removed — it sits static once on the board.)
        // Armored gem (carried with hits>1): add the frost overlay + "×N" badge.
        const hp = this.model.grid.health[r][c];
        if (hp > 1) {
          this.iceOverlays[r] = this.iceOverlays[r] ?? [];
          this.iceOverlays[r][c] = this.add.image(cell.x, cell.y, "ice_full").setDisplaySize(BOARD.cellSize, BOARD.cellSize).setDepth(3);
          this.layerBadges[r] = this.layerBadges[r] ?? [];
          this.layerBadges[r][c] = this.makeLayerBadge(cell.x, cell.y, hp);
        }
      }
    }

    if (res.clearedCells.length > 0) {
      const lines = res.clearedRows.length + res.clearedCols.length;
      let sx = 0;
      let sy = 0;
      for (const [r, c] of res.clearedCells) {
        const cell = this.boardCells[r][c];
        this.burst(cell.x, cell.y, cell.texture.key);
        sx += cell.x;
        sy += cell.y;
        // a special tile that finally cleared: drop its overlay
        this.iceOverlays[r]?.[c]?.destroy();
        if (this.iceOverlays[r]) this.iceOverlays[r][c] = null;
        this.bombOverlays[r]?.[c]?.destroy();
        if (this.bombOverlays[r]) this.bombOverlays[r][c] = null;
        this.layerBadges[r]?.[c]?.destroy();
        if (this.layerBadges[r]) this.layerBadges[r][c] = null;
        this.tweens.add({
          targets: cell,
          displayWidth: BOARD.cellSize * 1.25,
          displayHeight: BOARD.cellSize * 1.25,
          alpha: 0,
          duration: 220,
          ease: "Quad.in",
          onComplete: () => cell.setVisible(false).setAlpha(1).setDisplaySize(BOARD.cellSize, BOARD.cellSize),
        });
      }
      const n = res.clearedCells.length;
      const cx = sx / n;
      const cy = sy / n;
      this.flashBoard(0.5 + lines * 0.1);
      // Grand impact feedback, scaled to how big the clear is.
      lineClearBurst(this, cx, cy, 0xffffff, Math.min(4, lines));
      this.cameras.main.shake(160 + lines * 30, 0.003 * lines);
      cameraPunch(this, 0.012 + lines * 0.006, 160);
      hitStop(this, res.perfectClear ? 140 : 50 + lines * 20);
      if (res.combo > 1 || lines >= 2) comboFlash(this, res.combo);
      if (res.gainedClear > 0) scorePop(this, cx, cy - 10, `+${res.gainedClear}`);
      this.showCombo(res);
      Analytics.track("line_clear", { lines, combo: res.combo });
      if (res.perfectClear) {
        perfectCelebration(this, BOARD_X + BOARD_PX / 2, BOARD_Y + BOARD_PX / 2);
        Sound.perfect();
        Haptics.big();
      } else {
        Sound.clear(lines);
        Haptics.clear(lines);
        if (res.combo > 1) Sound.combo(res.combo);
      }
    }

    // Power Block payoff: bolt gets a cross-beam flash along its row+column.
    if (res.special === "bolt" && res.placedCells.length) {
      const [br, bc] = res.placedCells[0];
      this.boltCrossFx(br, bc);
    }
    if (res.special) Analytics.track("special_used", { kind: res.special });

    if (res.exploded.length > 0) this.animateExplosions(res.exploded);
    if (res.collected.length > 0) this.animateCollected(res.collected);

    if (res.refilled) this.time.delayedCall(120, () => this.buildTray());
    this.refreshScore(false);
    this.refreshGoal();
    this.updateFeverGlow();
    this.updateChargeMeter();
    this.updateTrayPlayability();
    this.updateDanger();
    this.armIdleHint();

    if (res.gameOver) this.time.delayedCall(420, () => this.endGame());
  }

  /** Bolt Power Block: bright cross-beams flashing along the blast row+column. */
  private boltCrossFx(row: number, col: number): void {
    const ctr = cellCenter(row, col);
    const hor = this.add
      .rectangle(BOARD_X + BOARD_PX / 2, ctr.y, BOARD_PX, BOARD.cellSize, 0x9be8ff, 0.8)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    const ver = this.add
      .rectangle(ctr.x, BOARD_Y + BOARD_PX / 2, BOARD.cellSize, BOARD_PX, 0x9be8ff, 0.8)
      .setDepth(6)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: hor, alpha: 0, scaleY: 0.15, duration: 380, ease: "Quad.out", onComplete: () => hor.destroy() });
    this.tweens.add({ targets: ver, alpha: 0, scaleX: 0.15, duration: 380, ease: "Quad.out", onComplete: () => ver.destroy() });
    edgeFlash(this, 0x57c8ff, 0.4);
  }

  private burst(x: number, y: number, textureKey: string): void {
    const emitter = this.add.particles(x, y, textureKey, {
      lifespan: 420,
      speed: { min: 60, max: 190 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 6,
      emitting: false,
    });
    emitter.setDepth(4);
    emitter.explode(7);
    this.time.delayedCall(500, () => emitter.destroy());
  }

  private flashBoard(strength: number): void {
    this.flashRect.setAlpha(Math.min(0.6, strength * 0.3));
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 240 });
  }

  private showCombo(res: PlaceResult): void {
    const lines = res.clearedRows.length + res.clearedCols.length;
    let msg = "";
    let color = "#3df0cc";
    if (res.perfectClear) msg = "PERFECT!";
    else if (res.fever) {
      msg = `FEVER ×${SCORING.feverMultiplier}!`;
      color = "#ff7a3a";
    } else if (lines >= 3) msg = `AMAZING! x${lines}`;
    else if (lines === 2) msg = "DOUBLE!";
    else if (res.combo > 1) msg = `COMBO x${res.combo}`;
    if (!msg) return;
    this.comboText.setText(msg).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: this.comboText, scale: 1, duration: 180, ease: "Back.out" });
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 800, duration: 350 });
  }

  /** Show/hide the pulsing FEVER frame to match the current combo streak. */
  private updateFeverGlow(): void {
    const active = !this.ended && this.model.combo >= SCORING.feverThreshold;
    if (!active) {
      if (this.feverGfx) {
        this.tweens.killTweensOf(this.feverGfx);
        this.feverGfx.destroy();
        this.feverGfx = undefined;
      }
      return;
    }
    if (this.feverGfx) return; // already glowing
    const g = this.add.graphics().setDepth(5);
    g.lineStyle(10, 0xffc41a, 0.22);
    g.strokeRoundedRect(BOARD_X - 7, BOARD_Y - 7, BOARD_PX + 14, BOARD_PX + 14, 20);
    g.lineStyle(5, 0xff9d3a, 0.9);
    g.strokeRoundedRect(BOARD_X - 4, BOARD_Y - 4, BOARD_PX + 8, BOARD_PX + 8, 18);
    this.feverGfx = g;
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.4 }, duration: 420, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  /** Dim tray pieces that have no legal placement anywhere on the board. */
  private updateTrayPlayability(): void {
    for (const c of this.trayContainers) {
      if (!c || c.piece.used) continue;
      c.setAlpha(this.model.grid.canPlaceAnywhere(c.piece.shape) ? 1 : 0.35);
    }
  }

  /** Show/hide the red edge vignette when the board is one bad tray from dead. */
  private updateDanger(): void {
    const remaining = this.model.remainingPieces();
    const placeable = remaining.filter((p) => this.model.grid.canPlaceAnywhere(p.shape)).length;
    const ratio = fillRatio(this.model.grid);
    const danger =
      !this.ended &&
      !this.model.over &&
      (ratio >= 0.7 || (remaining.length >= 2 && placeable <= 1 && ratio >= 0.5));
    if (!danger) {
      if (this.dangerGfx) {
        this.tweens.killTweensOf(this.dangerGfx);
        this.dangerGfx.destroy();
        this.dangerGfx = undefined;
      }
      return;
    }
    if (this.dangerGfx) return;
    const g = this.add.graphics().setDepth(30);
    const T = 26; // vignette thickness, fading inward
    for (let i = 0; i < T; i++) {
      const a = 0.32 * (1 - i / T) * (1 - i / T);
      g.fillStyle(0xff2038, a);
      g.fillRect(0, i, DESIGN.width, 1);
      g.fillRect(0, DESIGN.height - 1 - i, DESIGN.width, 1);
      g.fillRect(i, 0, 1, DESIGN.height);
      g.fillRect(DESIGN.width - 1 - i, 0, 1, DESIGN.height);
    }
    this.dangerGfx = g;
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.3 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.inOut" });
  }

  // ---------- Score / goal ----------
  private refreshScore(instant: boolean): void {
    const target = this.model.score;
    if ((this.mode === "classic" || this.mode === "rush") && target > this.best) {
      this.best = target;
      if (this.mode === "rush") Storage.setRushBest(this.best);
      else Storage.setBest(this.best);
      this.bestText.setText(String(this.best));
    }
    if (instant) {
      this.displayedScore = target;
      this.scoreText.setText(String(target));
      return;
    }
    this.tweens.addCounter({
      from: this.displayedScore,
      to: target,
      duration: 280,
      ease: "Cubic.out",
      onUpdate: (tw) => this.scoreText.setText(String(Math.round(tw.getValue() ?? 0))),
      onComplete: () => (this.displayedScore = target),
    });
    this.scoreText.setScale(1.18);
    this.tweens.add({ targets: this.scoreText, scale: 1, duration: 180, ease: "Quad.out" });
  }

  private buildCollectCounters(): void {
    const kinds: Collectible[] = COLLECTIBLES.filter((k) => this.model.totalCollect[k] > 0);
    const spacing = kinds.length >= 3 ? 116 : 130;
    const startX = DESIGN.width / 2 - ((kinds.length - 1) * spacing) / 2;
    kinds.forEach((kind, i) => {
      const x = startX + i * spacing;
      const yy = HUD.objectiveY;
      this.add
        .image(x - 18, yy, `collect_${kind}`)
        .setDisplaySize(30, 30)
        .setDepth(9);
      this.collectText[kind] = this.add
        .text(x + 4, yy, String(this.model.remainingCollect[kind]), {
          fontFamily: "system-ui, sans-serif",
          fontSize: "24px",
          color: UI.textPrimary,
          fontStyle: "900",
        })
        .setOrigin(0, 0.5)
        .setDepth(9);
    });
  }

  /** Blast cells destroyed by a bomb: big burst + shockwave + shake. */
  private animateExplosions(cells: ReadonlyArray<readonly [number, number]>): void {
    let sx = 0;
    let sy = 0;
    for (const [r, c] of cells) {
      const cell = this.boardCells[r][c];
      this.bombOverlays[r]?.[c]?.destroy();
      if (this.bombOverlays[r]) this.bombOverlays[r][c] = null;
      this.burst(cell.x, cell.y, cell.texture.key);
      sx += cell.x;
      sy += cell.y;
      cell.setVisible(true);
      this.tweens.add({
        targets: cell,
        displayWidth: BOARD.cellSize * 1.4,
        displayHeight: BOARD.cellSize * 1.4,
        alpha: 0,
        duration: 240,
        ease: "Quad.in",
        onComplete: () => cell.setVisible(false).setAlpha(1).setDisplaySize(BOARD.cellSize, BOARD.cellSize),
      });
    }
    const n = cells.length;
    const ex = sx / n;
    const ey = sy / n;
    lineClearBurst(this, ex, ey, 0xff9d3a, 4);
    shockwave(this, ex, ey, 0xff9d3a, 130);
    impactRing(this, ex, ey, 0xffd84d, 110);
    edgeFlash(this, 0xff7a3a, 0.45);
    this.cameras.main.shake(220, 0.007);
    cameraPunch(this, 0.03, 200);
    hitStop(this, 110);
    Sound.perfect();
    Haptics.big();
  }

  /** Fly collected badges to their counters (with a column light beam) and decrement. */
  private animateCollected(collected: PlaceResult["collected"]): void {
    for (const { type, row, col } of collected) {
      const overlay = this.collectOverlays[row]?.[col];
      const target = this.collectText[type];
      const from = overlay ? { x: overlay.x, y: overlay.y } : cellCenter(row, col);
      // Signature beam shooting up the collectible's column + a sparkle pop.
      collectBeam(this, cellCenter(row, col).x, BOARD_Y, BOARD_Y + BOARD_PX, COLLECTIBLE_META[type].color);
      sparkleTrail(this, from.x, from.y, COLLECTIBLE_META[type].color);
      if (overlay) {
        this.collectOverlays[row][col] = null;
        overlay.setDepth(60);
        this.tweens.add({
          targets: overlay,
          x: target ? target.x - 22 : from.x,
          y: target ? target.y : from.y - 60,
          scale: overlay.scale * 0.6,
          duration: 480,
          ease: "Cubic.in",
          onComplete: () => {
            overlay.destroy();
            this.bumpCounter(type);
          },
        });
      } else {
        this.bumpCounter(type);
      }
      Sound.combo(2);
    }
  }

  private bumpCounter(type: Collectible): void {
    const t = this.collectText[type];
    if (!t) return;
    t.setText(String(this.model.remainingCollect[type]));
    t.setScale(1.4);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: "Back.out" });
  }

  private refreshGoal(): void {
    // Moves indicator (top bar) — for any move-limited adventure level.
    if (this.movesText) {
      const moves = this.model.movesLeft();
      this.movesText.setText(moves !== undefined ? `Moves ${moves}` : "");
      // Urgency cue: the counter turns red when the budget is nearly spent.
      this.movesText.setColor(moves !== undefined && moves <= 3 ? UI.danger : UI.textPrimary);
    }
    // Objective row text (score/lines/perfect). Collect uses the counters.
    if (this.goalText && this.model.goal) {
      const g = this.model.goal;
      if (g.type === "score") this.goalText.setText(`Score ${this.model.score} / ${g.target}`);
      else if (g.type === "lines") this.goalText.setText(`Lines ${this.model.stats.linesClearedTotal} / ${g.target}`);
      else if (g.type === "perfect") this.goalText.setText(`Perfect ${this.model.stats.perfectClears} / ${g.target}`);
    }
  }

  // ---------- End of game ----------
  private endGame(): void {
    if (this.ended) return;
    this.ended = true;
    this.idleEvent?.remove();
    this.hintGfx?.destroy();
    this.updateFeverGlow();
    this.updateDanger();
    const won = this.model.won;
    const score = this.model.score;
    Sound.stopMusic();
    if (won) {
      Sound.perfect();
    } else {
      Sound.gameOver();
      Haptics.gameOver();
    }

    // Rewards + persistence + achievements.
    const coinsEarned = Math.floor(score / 50) + this.model.stats.linesClearedTotal * 2;
    Economy.addCoins(coinsEarned);
    this.coinPill.setValue(String(Economy.getCoins()));

    const lifetime = Storage.updateLifetime({
      bestScore: score,
      addGames: 1,
      addLines: this.model.stats.linesClearedTotal,
      maxCombo: this.model.stats.maxCombo,
      addPerfect: this.model.stats.perfectClears,
    });

    let dailyStreak = Storage.getDailyStreak();
    if (this.mode === "daily") {
      const today = todayKey(new Date());
      const yesterday = todayKey(new Date(Date.now() - 86400000));
      Storage.setDailyBest(today, score);
      dailyStreak = Storage.recordDailyStreak(today, yesterday);
      Analytics.track("daily_play", { score, streak: dailyStreak });
    }

    const unlocked = Achievements.report({
      bestScore: lifetime.bestScore,
      gamesPlayed: lifetime.gamesPlayed,
      totalLinesCleared: lifetime.totalLinesCleared,
      maxCombo: lifetime.maxCombo,
      perfectClears: lifetime.perfectClears,
      dailyStreak,
    });
    unlocked.forEach((a) => {
      if (a.reward) Economy.addCoins(a.reward);
    });

    // Levels are pass/fail: clearing the objective marks the level complete (1),
    // not a 1–3★ grade. Stored as 1 so existing "completed" / unlock checks work.
    let completed = 0;
    if (this.mode === "adventure" && this.level && won) {
      completed = 1;
      Storage.setLevelStars(this.level.id, completed);
      Analytics.track("level_complete", { level: this.level.id, score });
    }

    Analytics.track("game_over", { mode: this.mode, score, won });
    this.showEnd(won, score, coinsEarned, completed, unlocked.map((a) => a.title));
  }

  private showEnd(won: boolean, score: number, coins: number, completed: number, achievements: string[]): void {
    const overlay = this.add.container(0, 0).setDepth(50);
    const dim = this.add.rectangle(0, 0, DESIGN.width, DESIGN.height, 0x000000, 0.6).setOrigin(0).setInteractive();
    overlay.add(dim);

    const pw = 380;
    const ph = 420;
    const px = (DESIGN.width - pw) / 2;
    const py = (DESIGN.height - ph) / 2;
    const panel = this.add.graphics();
    // Drop shadow
    panel.fillStyle(UI.shadow, 0.3).fillRoundedRect(px - 2, py + 14, pw + 4, ph, 28);
    // Dark glass panel body
    panel.fillStyle(UI.glass, 0.98).fillRoundedRect(px, py, pw, ph, 24);
    // Top gloss
    panel.fillStyle(0xffffff, 0.07).fillRoundedRect(px + 3, py + 3, pw - 6, ph * 0.36, 22);
    // Inner highlight border
    panel.lineStyle(1.5, UI.glassStroke, 0.9).strokeRoundedRect(px + 1, py + 1, pw - 2, ph - 2, 23);
    overlay.add(panel);

    const isBest = (this.mode === "classic" || this.mode === "rush") && score >= this.best && score > 0;
    if (won || isBest) {
      edgeFlash(this, UI.accent, 0.5);
      confetti(this, DESIGN.width / 2, py + 40, 28);
    }
    const rushTimeUp = this.mode === "rush" && (this.rushEndsAt ?? 0) - this.time.now <= 0;
    const titleStr = won
      ? this.mode === "adventure"
        ? "Level Clear!"
        : "Complete!"
      : rushTimeUp
        ? "Time's Up!"
        : this.model.movesLeft() === 0
          ? "Out of Moves!"
          : "Game Over";
    overlay.add(this.add.text(DESIGN.width / 2, py + 50, titleStr, {
      fontFamily: "system-ui, sans-serif", fontSize: "34px", color: UI.textPrimary, fontStyle: "900",
    }).setOrigin(0.5));

    if (this.mode === "adventure" && won && completed > 0) {
      // Single completion badge: green disc + check (pass/fail, not a star grade).
      const badge = this.add.container(DESIGN.width / 2, py + 102);
      const disc = this.add.graphics();
      disc.fillStyle(UI.successInt, 1).fillCircle(0, 0, 30);
      disc.fillStyle(0xffffff, 0.18).fillCircle(0, -8, 24);
      const check = this.add.image(0, 0, "ic_check").setDisplaySize(38, 38).setTint(0xffffff);
      badge.add([disc, check]);
      overlay.add(badge);
      badge.setScale(0);
      this.tweens.add({ targets: badge, scale: { from: 0, to: 1 }, delay: 200, duration: 340, ease: "Back.out" });
    } else if (isBest) {
      // "NEW BEST" gold pill badge
      const badgeG = this.add.graphics();
      const bw = 130;
      const bh = 30;
      badgeG.fillStyle(UI.shadow, 0.18).fillRoundedRect(DESIGN.width / 2 - bw / 2, py + 82, bw, bh, 15);
      badgeG.fillStyle(UI.accent, 1).fillRoundedRect(DESIGN.width / 2 - bw / 2, py + 80, bw, bh, 15);
      badgeG.fillStyle(0xffffff, 0.28).fillRoundedRect(DESIGN.width / 2 - bw / 2 + 4, py + 82, bw - 8, bh * 0.4, 12);
      overlay.add(badgeG);
      overlay.add(this.add.text(DESIGN.width / 2, py + 95, "NEW BEST", {
        fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#ffffff", fontStyle: "900",
      }).setOrigin(0.5));
    }

    overlay.add(this.add.text(DESIGN.width / 2, py + 152, String(score), {
      fontFamily: "system-ui, sans-serif", fontSize: "66px", color: UI.textPrimary, fontStyle: "900",
    }).setOrigin(0.5));

    const coinTxt = this.add
      .text(DESIGN.width / 2 + 14, py + 200, `+${coins}`, {
        fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#d99500", fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    overlay.add(this.add.image(DESIGN.width / 2 - 4, py + 200, "ic_coin").setDisplaySize(24, 24).setTint(0xf2b400).setOrigin(1, 0.5));
    overlay.add(coinTxt);

    if (achievements.length > 0) {
      overlay.add(this.add.image(DESIGN.width / 2 - pw / 2 + 30, py + 234, "ic_trophy").setDisplaySize(20, 20).setTint(UI.successInt));
      overlay.add(this.add.text(DESIGN.width / 2 + 4, py + 234, achievements.join(", "), {
        fontFamily: "system-ui, sans-serif", fontSize: "15px", color: UI.success,
        align: "center", wordWrap: { width: pw - 80 },
      }).setOrigin(0.5));
    }

    // Revive: use a booster if owned, otherwise offer a rewarded ad.
    let btnY = py + 288;
    if (!won) {
      const hasBooster = Economy.getBoosters().revive > 0;
      const label = hasBooster ? `Revive  (${Economy.getBoosters().revive})` : "Revive  (Ad)";
      const revive = makeButton(this, DESIGN.width / 2, btnY, label, {
        width: 290,
        height: 58,
        fill: UI.successInt,
        textColor: "#ffffff",
        iconKey: hasBooster ? "ic_heart" : undefined,
        iconTint: 0xffffff,
      });
      revive.on("pointerup", async () => {
        revive.disableInteractive();
        if (hasBooster) {
          Economy.useBooster("revive");
          Analytics.track("booster_used", { kind: "revive" });
          this.doRevive(overlay);
        } else {
          const { granted } = await Ads.showRewarded();
          if (granted) this.doRevive(overlay);
          else revive.setInteractive();
        }
      });
      overlay.add(revive);
      btnY += 66;
    }

    // Bottom row: Retry · (Next, if a level was cleared) · Menu.
    const showNext = won && this.mode === "adventure" && !!this.level;
    const xs = showNext ? [-112, 0, 112] : [-84, 84];
    const bw = showNext ? 108 : 152;
    let pi = 0;

    const again = makeButton(this, DESIGN.width / 2 + xs[pi++], btnY, "↻", {
      width: bw, height: 56, fontSize: 28,
      onClick: () => { void Ads.maybeShowInterstitial(); this.scene.restart({ mode: this.mode, levelId: this.level?.id }); },
    });
    overlay.add(again);

    if (showNext) {
      const nextId = (this.level as { id: number }).id + 1;
      const next = makeButton(this, DESIGN.width / 2 + xs[pi++], btnY, "Next", {
        width: bw, height: 56, fill: UI.successInt, textColor: "#ffffff",
        onClick: () => { void Ads.maybeShowInterstitial(); this.scene.start("Game", { mode: "adventure", levelId: nextId }); },
      });
      overlay.add(next);
    }

    const menu = makeButton(this, DESIGN.width / 2 + xs[pi++], btnY, "Menu", {
      width: bw, height: 56, glass: true,
      onClick: () => this.scene.start("Menu"),
    });
    overlay.add(menu);

    overlay.setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: overlay, scale: 1, alpha: 1, duration: 260, ease: "Back.out" });
  }

  private doRevive(overlay: Phaser.GameObjects.Container): void {
    const cleared = this.model.revive();
    cleared.forEach(([r, c]) => {
      const cell = this.boardCells[r][c];
      this.burst(cell.x, cell.y, cell.texture.key);
      cell.setVisible(false);
    });
    this.ended = false;
    // Rush: a revive also buys 30 more seconds on the clock.
    if (this.mode === "rush") {
      this.rushEndsAt = this.time.now + 30_000;
      this.tickRush();
    }
    overlay.destroy();
    this.buildTray();
    this.updateFeverGlow();
    this.updateDanger();
    if (Settings.music) Sound.startMusic();
  }

  // ---------- Hint ----------
  /** Suggest a strong move: pulse the piece + ghost-highlight where it goes.
   *  `auto` = fired by the idle timer (no cooldown spend, silent if none). */
  private useHint(auto: boolean): void {
    if (this.ended) return;
    if (!auto && !this.hintReady) return;
    const mv = suggestMove(this.model);
    if (!mv) {
      if (!auto) this.toast("No moves left");
      return;
    }
    this.showHint(mv);
    if (!auto) {
      Sound.button();
      this.hintReady = false;
      const ic = this.hintBtn?.getData("icon") as Phaser.GameObjects.Image | undefined;
      ic?.setAlpha(0.3);
      this.time.delayedCall(10000, () => {
        this.hintReady = true;
        ic?.setAlpha(1);
      });
    }
  }

  private showHint(mv: { trayIndex: number; row: number; col: number }): void {
    const piece = this.model.tray[mv.trayIndex];
    if (!piece) return;
    const c = this.trayContainers[mv.trayIndex];
    if (c) {
      c.bob?.remove();
      this.tweens.add({
        targets: c,
        scale: c.homeScale * 1.18,
        duration: 200,
        yoyo: true,
        repeat: 2,
        onComplete: () => this.startBob(c, mv.trayIndex),
      });
    }
    this.hintGfx?.destroy();
    const gfx = this.add.graphics().setDepth(7);
    this.hintGfx = gfx;
    gfx.fillStyle(0x5bd66b, 0.55);
    for (const [dr, dc] of piece.shape.cells) {
      const r = mv.row + dr;
      const cc = mv.col + dc;
      if (r < 0 || r >= BOARD.cells || cc < 0 || cc >= BOARD.cells) continue;
      const tl = cellTopLeft(r, cc);
      gfx.fillRoundedRect(tl.x, tl.y, BOARD.cellSize, BOARD.cellSize, 8);
    }
    this.tweens.add({
      targets: gfx,
      alpha: { from: 0.2, to: 1 },
      duration: 260,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        gfx.destroy();
        if (this.hintGfx === gfx) this.hintGfx = undefined;
      },
    });
  }

  /** (Re)start the idle timer; if the player sits still, auto-show a hint. */
  private armIdleHint(): void {
    this.idleEvent?.remove();
    if (this.ended) return;
    this.idleEvent = this.time.delayedCall(9000, () => {
      if (this.ended) return;
      this.useHint(true);
      this.armIdleHint();
    });
  }

  // ---------- Misc ----------
  private toast(msg: string): void {
    const existing = this.children.getByName("toast") as Phaser.GameObjects.Text | null;
    existing?.destroy();
    if (!msg) return;
    const t = this.add
      .text(DESIGN.width / 2, BOARD_Y + BOARD_PX - 30, msg, {
        fontFamily: "system-ui, sans-serif", fontSize: "18px", color: "#fff",
        backgroundColor: "#00000088", padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setName("toast")
      .setDepth(20);
    this.tweens.add({ targets: t, alpha: 0, delay: 1400, duration: 400, onComplete: () => t.destroy() });
  }
}
