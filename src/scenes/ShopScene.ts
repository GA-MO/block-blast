import Phaser from "phaser";
import { DESIGN } from "../config";
import { makeButton, makePill, darken } from "../ui/widgets";
import { Economy, type BoosterKind } from "../systems/economy";
import { SKINS, THEMES, getTheme } from "../data/themes";
import { Sound } from "../systems/audio";
import { addAmbientBackground } from "../render/background";

type Tab = "skins" | "themes" | "boosters";

interface BoosterDef {
  kind: BoosterKind;
  name: string;
  icon: string;
  iconTint: number;
  price: number;
}

const BOOSTER_DEFS: BoosterDef[] = [
  { kind: "revive", name: "Revive", icon: "ic_heart", iconTint: 0xff5b7a, price: 250 },
  { kind: "hammer", name: "Hammer", icon: "ic_hammer", iconTint: 0xffffff, price: 120 },
  { kind: "bomb", name: "Bomb", icon: "ic_bomb", iconTint: 0xff9d3a, price: 180 },
  { kind: "swap", name: "Swap", icon: "ic_swap", iconTint: 0x9be8ff, price: 120 },
];

/** The shop: skins, themes and boosters. Scene key "Shop". */
export default class ShopScene extends Phaser.Scene {
  private currentTab: Tab = "skins";
  private coinsPill!: { container: Phaser.GameObjects.Container; setValue: (v: string) => void };
  private listLayer!: Phaser.GameObjects.Container;
  private tabLabels: Map<Tab, Phaser.GameObjects.Text> = new Map();
  private tabUnderline!: Phaser.GameObjects.Graphics;
  private toast?: Phaser.GameObjects.Text;

  constructor() {
    super("Shop");
  }

  create(): void {
    this.currentTab = "skins";
    this.tabLabels = new Map();

    const theme = getTheme(Economy.getEquippedTheme());

    // Ambient background (gradient + bokeh + vignette).
    const ambient = addAmbientBackground(this, { bgTop: theme.bgTop, bgBottom: theme.bgBottom });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ambient.destroy());

    // Lazily initialise audio on the first user gesture (autoplay policy).
    this.input.once("pointerdown", () => Sound.init());

    // ---- Top bar -----------------------------------------------------------
    const back = this.add
      .image(28, 50, "ic_back")
      .setDisplaySize(32, 32)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on("pointerup", () => {
      Sound.button();
      this.scene.start("Menu");
    });

    this.add
      .text(DESIGN.width / 2, 50, "Shop", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "36px",
        color: "#ffffff",
        fontStyle: "900",
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "rgba(0,0,0,0.55)", 7, false, true);

    this.coinsPill = makePill(
      this,
      DESIGN.width - 80,
      50,
      "ic_coin",
      String(Economy.getCoins())
    );

    // ---- Tab row -----------------------------------------------------------
    const tabs: { tab: Tab; label: string }[] = [
      { tab: "skins", label: "Skins" },
      { tab: "themes", label: "Themes" },
      { tab: "boosters", label: "Boosters" },
    ];
    const tabY = 130;
    const tabW = DESIGN.width / tabs.length;
    tabs.forEach((t, i) => {
      const tx = tabW * i + tabW / 2;
      const label = this.add
        .text(tx, tabY, t.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "24px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      label.on("pointerup", () => {
        if (this.currentTab === t.tab) return;
        Sound.button();
        this.currentTab = t.tab;
        this.refreshTabStyles();
        this.renderList();
      });
      this.tabLabels.set(t.tab, label);
    });

    // Divider under tabs
    this.add.graphics()
      .fillStyle(0xffffff, 0.12).fillRect(0, 160, DESIGN.width, 1)
      .fillStyle(0x000000, 0.2).fillRect(0, 161, DESIGN.width, 1);

    // Active tab underline (moves with tab selection)
    this.tabUnderline = this.add.graphics();

    // ---- List layer --------------------------------------------------------
    this.listLayer = this.add.container(0, 0);

    this.refreshTabStyles();
    this.renderList();
  }

  /** Highlight the active tab, dim the rest; slide the underline. */
  private refreshTabStyles(): void {
    const tabs: Tab[] = ["skins", "themes", "boosters"];
    const tabW = DESIGN.width / tabs.length;
    const activeIdx = tabs.indexOf(this.currentTab);

    this.tabLabels.forEach((label, tab) => {
      if (tab === this.currentTab) {
        label.setColor("#ffc41a").setAlpha(1).setScale(1.08);
      } else {
        label.setColor("#ffffff").setAlpha(0.55).setScale(1);
      }
    });

    // Reposition the gold underline bar
    const ux = tabW * activeIdx + tabW * 0.2;
    const uw = tabW * 0.6;
    this.tabUnderline.clear();
    this.tabUnderline.fillStyle(0xffc41a, 0.9).fillRoundedRect(ux, 156, uw, 4, 2);
    this.tabUnderline.fillStyle(0xffc41a, 0.25).fillRoundedRect(ux + 4, 160, uw - 8, 3, 1);
  }

  /** Destroy and rebuild the list area for the current tab. */
  private renderList(): void {
    this.listLayer.removeAll(true);
    switch (this.currentTab) {
      case "skins":
        this.renderSkins();
        break;
      case "themes":
        this.renderThemes();
        break;
      case "boosters":
        this.renderBoosters();
        break;
    }
  }

  private readonly rowStartY = 200;
  private readonly rowHeight = 90;
  private readonly rowMargin = 24;

  /** Draw a card background for a row, returns its container. */
  private makeRow(index: number): Phaser.GameObjects.Container {
    const y = this.rowStartY + index * this.rowHeight;
    const w = DESIGN.width - this.rowMargin * 2;
    const h = this.rowHeight - 12;
    const row = this.add.container(this.rowMargin, y);
    const g = this.add.graphics();
    // Card body — semi-transparent dark
    g.fillStyle(0x0a0830, 0.55).fillRoundedRect(0, 0, w, h, 16);
    // Top gloss strip
    g.fillStyle(0xffffff, 0.06).fillRoundedRect(0, 0, w, h * 0.38, 16);
    // Subtle inner border
    g.lineStyle(1, 0xffffff, 0.14).strokeRoundedRect(1, 1, w - 2, h - 2, 15);
    row.add(g);
    this.listLayer.add(row);
    return row;
  }

  private rowWidth(): number {
    return DESIGN.width - this.rowMargin * 2;
  }

  private renderSkins(): void {
    SKINS.forEach((skin, i) => {
      const row = this.makeRow(i);
      const h = this.rowHeight - 12;

      // Name.
      row.add(
        this.add
          .text(16, 18, skin.name, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0, 0.5)
      );

      // Palette preview swatches.
      const swatchSize = 22;
      const swatchGap = 5;
      const count = Math.min(7, skin.palette.length);
      const pg = this.add.graphics();
      for (let s = 0; s < count; s++) {
        const sx = 16 + s * (swatchSize + swatchGap);
        const sy = h - 14 - swatchSize;
        pg.fillStyle(darken(skin.palette[s], 0.7), 1).fillRoundedRect(
          sx,
          sy + 3,
          swatchSize,
          swatchSize,
          5
        );
        pg.fillStyle(skin.palette[s], 1).fillRoundedRect(
          sx,
          sy,
          swatchSize,
          swatchSize,
          5
        );
      }
      row.add(pg);

      // Right control.
      this.addCosmeticControl(row, "skin", skin.id, skin.price, () => {
        Economy.equipSkin(skin.id);
      }, () => Economy.getEquippedSkin() === skin.id);
    });
  }

  private renderThemes(): void {
    THEMES.forEach((theme, i) => {
      const row = this.makeRow(i);
      const h = this.rowHeight - 12;

      row.add(
        this.add
          .text(16, 18, theme.name, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0, 0.5)
      );

      // Theme swatches: bgTop, boardBg, slot.
      const colors = [theme.bgTop, theme.boardBg, theme.slot];
      const swatchSize = 30;
      const swatchGap = 8;
      const pg = this.add.graphics();
      colors.forEach((col, s) => {
        const sx = 16 + s * (swatchSize + swatchGap);
        const sy = h - 14 - swatchSize;
        pg.fillStyle(darken(col, 0.7), 1).fillRoundedRect(
          sx,
          sy + 3,
          swatchSize,
          swatchSize,
          6
        );
        pg.fillStyle(col, 1).fillRoundedRect(sx, sy, swatchSize, swatchSize, 6);
      });
      row.add(pg);

      this.addCosmeticControl(row, "theme", theme.id, theme.price, () => {
        Economy.equipTheme(theme.id);
      }, () => Economy.getEquippedTheme() === theme.id);
    });
  }

  /** Adds the right-side buy/equip control to a cosmetic row. */
  private addCosmeticControl(
    row: Phaser.GameObjects.Container,
    kind: "skin" | "theme",
    id: string,
    price: number,
    equip: () => void,
    isEquipped: () => boolean
  ): void {
    const h = this.rowHeight - 12;
    const ctrlX = this.rowWidth() - 14 - 60;
    const ctrlY = h / 2;
    const owned = Economy.isOwned(kind, id);

    if (owned) {
      if (isEquipped()) {
        // Static "Equipped" badge.
        const badge = this.add
          .text(ctrlX, ctrlY, "Equipped", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "18px",
            color: "#1fc952",
            fontStyle: "900",
          })
          .setOrigin(0.5);
        row.add(badge);
      } else {
        const btn = makeButton(this, ctrlX, ctrlY, "Equip", {
          width: 120,
          height: 44,
          fontSize: 20,
          fill: 0x0ea5f0,
          textColor: "#ffffff",
          onClick: () => {
            equip();
            this.renderList();
          },
        });
        row.add(btn);
      }
    } else {
      const btn = makeButton(this, ctrlX, ctrlY, `${price}`, {
        width: 120,
        height: 44,
        fontSize: 20,
        iconKey: "ic_coin",
        iconTint: 0xffc41a,
        onClick: () => {
          if (Economy.spendCoins(price)) {
            Economy.own(kind, id);
            equip();
            this.updateCoins();
            this.renderList();
          } else {
            this.showToast("Not enough coins");
          }
        },
      });
      row.add(btn);
    }
  }

  private renderBoosters(): void {
    BOOSTER_DEFS.forEach((def, i) => {
      const row = this.makeRow(i);
      const h = this.rowHeight - 12;

      // Icon + name.
      row.add(
        this.add
          .image(16 + 16, h / 2, def.icon)
          .setDisplaySize(32, 32)
          .setOrigin(0.5)
          .setTint(def.iconTint)
      );
      row.add(
        this.add
          .text(64, h / 2 - 12, def.name, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "22px",
            color: "#ffffff",
            fontStyle: "bold",
          })
          .setOrigin(0, 0.5)
      );

      const countText = this.add
        .text(64, h / 2 + 14, `Owned: ${Economy.getBoosters()[def.kind]}`, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "16px",
          color: "#ffc41a",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);
      row.add(countText);

      const ctrlX = this.rowWidth() - 14 - 60;
      const btn = makeButton(this, ctrlX, h / 2, `${def.price}`, {
        width: 120,
        height: 44,
        fontSize: 20,
        iconKey: "ic_coin",
        iconTint: 0xffc41a,
        onClick: () => {
          if (Economy.spendCoins(def.price)) {
            Economy.addBooster(def.kind, 1);
            this.updateCoins();
            countText.setText(`Owned: ${Economy.getBoosters()[def.kind]}`);
          } else {
            this.showToast("Not enough coins");
          }
        },
      });
      row.add(btn);
    });
  }

  private updateCoins(): void {
    this.coinsPill.setValue(String(Economy.getCoins()));
  }

  /** A brief auto-fading message near the bottom of the screen. */
  private showToast(message: string): void {
    this.toast?.destroy();
    const t = this.add
      .text(DESIGN.width / 2, DESIGN.height - 80, message, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        color: "#ffffff",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.55)",
        padding: { x: 18, y: 10 },
      })
      .setOrigin(0.5)
      .setAlpha(0);
    this.toast = t;
    this.tweens.add({
      targets: t,
      alpha: 1,
      duration: 150,
      yoyo: true,
      hold: 900,
      onComplete: () => {
        if (this.toast === t) this.toast = undefined;
        t.destroy();
      },
    });
  }
}
