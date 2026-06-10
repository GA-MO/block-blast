import Phaser from "phaser";
import { DESIGN, UI } from "../config";
import { makeButton, makePill } from "../ui/widgets";
import { openSettings } from "../ui/settingsOverlay";
import { Economy } from "../systems/economy";
import { Storage } from "../systems/storage";
import { Sound } from "../systems/audio";
import { getTheme } from "../data/themes";
import { addAmbientBackground } from "../render/background";

/** Main menu: title, score, and mode/shop navigation. Scene key "Menu". */
export default class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create(): void {
    const theme = getTheme(Economy.getEquippedTheme());

    // Animated ambient background from the equipped theme.
    const ambient = addAmbientBackground(this, { bgTop: theme.bgTop, bgBottom: theme.bgBottom });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ambient.destroy());

    // Lazily initialise audio on the first user gesture (autoplay policy).
    this.input.once("pointerdown", () => Sound.init());

    // ---- Top bar: coins pill + settings gear -------------------------------
    const coins = makePill(this, DESIGN.width - 110, 50, "ic_coin", String(Economy.getCoins()), 0xffc94d);

    const gear = this.add
      .image(DESIGN.width - 34, 50, "ic_gear")
      .setDisplaySize(34, 34)
      .setOrigin(0.5)
      .setTint(UI.accent)
      .setInteractive({ useHandCursor: true });
    gear.on("pointerup", () => {
      Sound.button();
      openSettings(this);
    });

    // ---- Title -------------------------------------------------------------
    const title = this.add
      .text(DESIGN.width / 2, 186, "TESSERA", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "76px",
        color: UI.textPrimary,
        fontStyle: "900",
      })
      .setOrigin(0.5);
    // Smooth GPU glow (WebGL) — far cleaner than canvas shadowBlur, which left
    // a patchy halo. Falls back to a plain title if preFX is unavailable.
    title.preFX?.addGlow(0x34e6c2, 1.6, 0, false, 0.1, 10);

    const tagline = this.add
      .text(DESIGN.width / 2, 242, "Place · Clear · Glow", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: UI.accentText,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Thin crystal divider under tagline
    const divider = this.add.graphics();
    divider.fillStyle(UI.accent, 0.7);
    divider.fillRoundedRect(DESIGN.width / 2 - 60, 266, 120, 2.5, 2);

    // ---- Best score --------------------------------------------------------
    const bestText = this.add
      .text(0, 0, `Best  ${Storage.getBest()}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "26px",
        color: UI.textPrimary,
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    const bestIconSize = 28;
    const bestGap = 6;
    const bestTotal = bestIconSize + bestGap + bestText.width;
    const bestIcon = this.add
      .image(-bestTotal / 2 + bestIconSize / 2, 0, "ic_crown")
      .setDisplaySize(bestIconSize, bestIconSize)
      .setTint(UI.accent);
    bestText.setX(bestIcon.x + bestIconSize / 2 + bestGap);
    const best = this.add.container(DESIGN.width / 2, 298, [bestIcon, bestText]);

    // ---- Main button column ------------------------------------------------
    const colX = DESIGN.width / 2;
    const startY = 388;
    // Equal VISUAL gaps: the hero is taller (72) than the rest (64), so spacing
    // is computed from each button's half-height + a constant gap rather than a
    // fixed centre-to-centre step (which would leave a tighter gap under the hero).
    const heroH = 72;
    const btnH = 64;
    const gap = 18;
    const step = btnH + gap; // centre spacing between two equal-height buttons
    const yClassic = startY;
    const yRush = yClassic + heroH / 2 + gap + btnH / 2; // accounts for the taller hero
    const yDaily = yRush + step;
    const yAdventure = yRush + step * 2;
    const yCollect = yRush + step * 3;

    // Hero CTA — crystal accent button
    const classicBtn = makeButton(this, colX, yClassic, "Classic", {
      width: 330,
      height: heroH,
      fontSize: 28,
      iconKey: "ic_play",
      onClick: () => this.scene.start("Game", { mode: "classic" }),
    });

    // Rush keeps a warm colored fill to stand out as the timed mode.
    const rushBtn = makeButton(this, colX, yRush, "Rush · 2 min", {
      width: 300,
      fill: 0xff5b8a,
      textColor: "#ffffff",
      iconKey: "ic_clock",
      iconTint: 0xffffff,
      onClick: () => this.scene.start("Game", { mode: "rush" }),
    });

    // Secondary buttons — frosted glass style
    const dailyBtn = makeButton(this, colX, yDaily, "Daily", {
      width: 300,
      glass: true,
      iconKey: "ic_calendar",
      iconTint: UI.accent,
      onClick: () => this.scene.start("Game", { mode: "daily" }),
    });

    const adventureBtn = makeButton(this, colX, yAdventure, "Adventure", {
      width: 300,
      glass: true,
      iconKey: "ic_flag",
      iconTint: UI.accent,
      onClick: () => this.scene.start("LevelSelect"),
    });

    const collectBtn = makeButton(this, colX, yCollect, "Collect", {
      width: 300,
      glass: true,
      iconKey: "ic_star",
      iconTint: UI.accent,
      onClick: () => this.scene.start("Game", { mode: "collect" }),
    });

    // ---- Daily streak label ------------------------------------------------
    const streak = Storage.getDailyStreak();
    const extras: Phaser.GameObjects.GameObject[] = [];
    if (streak > 0) {
      const streakText = this.add
        .text(0, 0, `${streak} day streak`, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          color: UI.accentText,
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      const streakIconSize = 22;
      const streakGap = 6;
      const streakTotal = streakIconSize + streakGap + streakText.width;
      const streakIcon = this.add
        .image(-streakTotal / 2 + streakIconSize / 2, 0, "ic_flame")
        .setDisplaySize(streakIconSize, streakIconSize)
        .setTint(0xff6a20);
      streakText.setX(streakIcon.x + streakIconSize / 2 + streakGap);
      const streakLabel = this.add.container(colX, yCollect + btnH / 2 + 30, [
        streakIcon,
        streakText,
      ]);
      extras.push(streakLabel);
    }

    // ---- Entrance animation ------------------------------------------------
    const pop: Phaser.GameObjects.GameObject[] = [
      title,
      tagline,
      divider,
      best,
      classicBtn,
      rushBtn,
      dailyBtn,
      adventureBtn,
      collectBtn,
      coins.container,
      ...extras,
    ];
    // gear is a raw image with a fixed display size; fade it in without scaling
    gear.setAlpha(0);
    this.tweens.add({ targets: gear, alpha: 1, duration: 420, delay: 200 });

    pop.forEach((obj) => {
      const o = obj as unknown as Phaser.GameObjects.Components.Alpha &
        Phaser.GameObjects.Components.Transform;
      o.setAlpha(0);
      o.setScale(0.85);
    });

    this.tweens.add({
      targets: pop,
      alpha: 1,
      scale: 1,
      ease: "Back.easeOut",
      duration: 420,
      delay: this.tweens.stagger(60, { start: 80 }),
    });
  }
}
