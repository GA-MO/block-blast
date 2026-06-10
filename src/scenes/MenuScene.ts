import Phaser from "phaser";
import { DESIGN } from "../config";
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
    const coins = makePill(this, DESIGN.width - 110, 50, "ic_coin", String(Economy.getCoins()));

    const gear = this.add
      .image(DESIGN.width - 34, 50, "ic_gear")
      .setDisplaySize(34, 34)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    gear.on("pointerup", () => {
      Sound.button();
      openSettings(this);
    });

    // ---- Title -------------------------------------------------------------
    const title = this.add
      .text(DESIGN.width / 2, 188, "BLOCK BLAST", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "68px",
        color: "#ffffff",
        fontStyle: "900",
      })
      .setOrigin(0.5)
      .setShadow(0, 8, "rgba(0,0,0,0.55)", 14, true, true);

    const tagline = this.add
      .text(DESIGN.width / 2, 244, "Drop. Clear. Combo.", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        color: "#ffc41a",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setShadow(0, 2, "rgba(0,0,0,0.4)", 4, false, true);

    // Thin gold divider under tagline
    const divider = this.add.graphics();
    divider.fillStyle(0xffc41a, 0.6);
    divider.fillRoundedRect(DESIGN.width / 2 - 60, 268, 120, 2.5, 2);

    // ---- Best score --------------------------------------------------------
    const bestText = this.add
      .text(0, 0, `Best  ${Storage.getBest()}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "26px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5)
      .setShadow(0, 2, "rgba(0,0,0,0.4)", 4, false, true);
    const bestIconSize = 28;
    const bestGap = 6;
    const bestTotal = bestIconSize + bestGap + bestText.width;
    const bestIcon = this.add
      .image(-bestTotal / 2 + bestIconSize / 2, 0, "ic_crown")
      .setDisplaySize(bestIconSize, bestIconSize)
      .setTint(0xffc41a);
    bestText.setX(bestIcon.x + bestIconSize / 2 + bestGap);
    const best = this.add.container(DESIGN.width / 2, 298, [bestIcon, bestText]);

    // ---- Main button column ------------------------------------------------
    const colX = DESIGN.width / 2;
    const startY = 380;
    const spacing = 70;

    // Hero CTA — larger gold button
    const classicBtn = makeButton(this, colX, startY, "Classic", {
      width: 330,
      height: 72,
      fontSize: 28,
      iconKey: "ic_play",
      onClick: () => this.scene.start("Game", { mode: "classic" }),
    });

    // Secondary buttons — dark glass style
    const secFill = 0x2a1e80;
    const secText = "#d0c8ff";

    const rushBtn = makeButton(this, colX, startY + spacing, "Rush · 2 min", {
      width: 300,
      fill: 0x8a1d4f,
      textColor: "#ffd0e2",
      iconKey: "ic_clock",
      iconTint: 0xff6b9d,
      onClick: () => this.scene.start("Game", { mode: "rush" }),
    });

    const dailyBtn = makeButton(this, colX, startY + spacing * 2, "Daily", {
      width: 300,
      fill: secFill,
      textColor: secText,
      iconKey: "ic_calendar",
      iconTint: 0xffc41a,
      onClick: () => this.scene.start("Game", { mode: "daily" }),
    });

    const adventureBtn = makeButton(this, colX, startY + spacing * 3, "Adventure", {
      width: 300,
      fill: secFill,
      textColor: secText,
      iconKey: "ic_flag",
      iconTint: 0xffc41a,
      onClick: () => this.scene.start("LevelSelect"),
    });

    const collectBtn = makeButton(this, colX, startY + spacing * 4, "Collect", {
      width: 300,
      fill: secFill,
      textColor: secText,
      iconKey: "ic_star",
      iconTint: 0xffc41a,
      onClick: () => this.scene.start("Game", { mode: "collect" }),
    });

    const shopBtn = makeButton(this, colX, startY + spacing * 5, "Shop", {
      width: 300,
      fill: secFill,
      textColor: secText,
      iconKey: "ic_cart",
      iconTint: 0xffc41a,
      onClick: () => this.scene.start("Shop"),
    });

    // ---- Daily streak label ------------------------------------------------
    const streak = Storage.getDailyStreak();
    const extras: Phaser.GameObjects.GameObject[] = [];
    if (streak > 0) {
      const streakText = this.add
        .text(0, 0, `${streak} day streak`, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "20px",
          color: "#ffc41a",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5)
        .setShadow(0, 2, "rgba(0,0,0,0.35)", 3, false, true);
      const streakIconSize = 22;
      const streakGap = 6;
      const streakTotal = streakIconSize + streakGap + streakText.width;
      const streakIcon = this.add
        .image(-streakTotal / 2 + streakIconSize / 2, 0, "ic_flame")
        .setDisplaySize(streakIconSize, streakIconSize)
        .setTint(0xff6a20);
      streakText.setX(streakIcon.x + streakIconSize / 2 + streakGap);
      const streakLabel = this.add.container(colX, startY + spacing * 6 + 28, [
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
      shopBtn,
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
