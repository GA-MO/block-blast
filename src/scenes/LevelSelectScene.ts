import Phaser from "phaser";
import { DESIGN } from "../config";
import { darken } from "../ui/widgets";
import { getLevel } from "../data/levels";
import { Storage } from "../systems/storage";
import { Economy } from "../systems/economy";
import { getTheme } from "../data/themes";
import { addAmbientBackground } from "../render/background";
import { Sound } from "../systems/audio";

/** Tile colour by state. */
const COLOR_COMPLETED = 0x4ec76b; // greenish (stars > 0)
const COLOR_UNLOCKED = 0x4db8ff; // blue (unlocked, unplayed)
const COLOR_LOCKED = 0x53597a; // grey

/** Pagination geometry. */
const COLS = 3;
const ROWS = 5;
const PAGE_SIZE = COLS * ROWS; // 15

/**
 * Adventure level select. Pages through an INFINITE list of levels (ids beyond
 * the hand-authored campaign are procedurally generated). Scene key "LevelSelect".
 */
export default class LevelSelectScene extends Phaser.Scene {
  private page = 0;
  private gridLayer!: Phaser.GameObjects.Container;
  private prevText!: Phaser.GameObjects.Text;
  private pageLabel!: Phaser.GameObjects.Text;

  constructor() {
    super("LevelSelect");
  }

  create(): void {
    const theme = getTheme(Economy.getEquippedTheme());

    // Animated ambient background from the equipped theme.
    const ambient = addAmbientBackground(this, { bgTop: theme.bgTop, bgBottom: theme.bgBottom });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => ambient.destroy());

    // Lazily initialise audio on the first user gesture (autoplay policy).
    this.input.once("pointerdown", () => Sound.init());

    // ---- Top bar -----------------------------------------------------------
    const back = this.add
      .image(28, 48, "ic_back")
      .setDisplaySize(40, 40)
      .setTint(0xffffff)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    back.on("pointerup", () => {
      Sound.button();
      this.scene.start("Menu");
    });

    this.add
      .text(DESIGN.width / 2, 64, "Adventure", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "44px",
        color: "#ffffff",
        fontStyle: "900",
      })
      .setOrigin(0.5)
      .setShadow(0, 4, "rgba(0,0,0,0.45)", 6, true, true);

    // ---- Page controls (built once; grid re-rendered on change) ------------
    const ctrlY = 892;
    this.prevText = this.add
      .text(70, ctrlY, "‹ Prev", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        color: "#ffffff",
        fontStyle: "800",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(0,0,0,0.4)", 4, true, true)
      .setInteractive({ useHandCursor: true });
    this.prevText.on("pointerup", () => {
      if (this.page <= 0) return;
      Sound.button();
      this.page--;
      this.renderPage();
    });

    const nextText = this.add
      .text(DESIGN.width - 70, ctrlY, "Next ›", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "30px",
        color: "#ffffff",
        fontStyle: "800",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(0,0,0,0.4)", 4, true, true)
      .setInteractive({ useHandCursor: true });
    nextText.on("pointerup", () => {
      Sound.button(); // Next is always available (infinite levels).
      this.page++;
      this.renderPage();
    });

    this.pageLabel = this.add
      .text(DESIGN.width / 2, ctrlY, "", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "24px",
        color: "#c8cce0",
        fontStyle: "700",
      })
      .setOrigin(0.5);

    // ---- Grid container (rebuilt per page) ---------------------------------
    this.gridLayer = this.add.container(0, 0);

    // Start on the page containing the player's highest unlocked level.
    this.page = Math.floor((Storage.highestUnlockedLevel() - 1) / PAGE_SIZE);
    this.renderPage();
  }

  /** Destroy and rebuild the grid for the current page; update controls. */
  private renderPage(): void {
    this.gridLayer.removeAll(true);

    const tile = 116;
    const gapX = 30;
    const gapY = 18;
    const gridW = COLS * tile + (COLS - 1) * gapX;
    const startX = (DESIGN.width - gridW) / 2 + tile / 2;
    const startY = 178 + tile / 2;
    const highest = Storage.highestUnlockedLevel();
    const pageStartId = this.page * PAGE_SIZE + 1;

    const tiles: Phaser.GameObjects.Container[] = [];

    for (let offset = 0; offset < PAGE_SIZE; offset++) {
      const id = pageStartId + offset;
      const level = getLevel(id);
      if (!level) continue;

      const col = offset % COLS;
      const row = Math.floor(offset / COLS);
      const x = startX + col * (tile + gapX);
      const y = startY + row * (tile + gapY);

      const done = Storage.getLevelStars(id);
      const locked = id > highest;

      const t = this.makeTile(x, y, tile, id, done, locked);
      this.gridLayer.add(t);
      tiles.push(t);
    }

    // Controls state.
    this.prevText.setVisible(this.page > 0);
    const lastId = pageStartId + PAGE_SIZE - 1;
    this.pageLabel.setText(`Page ${this.page + 1}  ·  ${pageStartId}–${lastId}`);

    // Entrance animation.
    tiles.forEach((t) => {
      t.setAlpha(0);
      t.setScale(0.8);
    });
    this.tweens.add({
      targets: tiles,
      alpha: 1,
      scale: 1,
      ease: "Back.easeOut",
      duration: 320,
      delay: this.tweens.stagger(28, { start: 40 }),
    });
  }

  /** Build a single level tile container (bg + id + complete-check + lock). */
  private makeTile(
    x: number,
    y: number,
    size: number,
    id: number,
    done: number,
    locked: boolean
  ): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const completed = done > 0;
    const fill = locked ? COLOR_LOCKED : completed ? COLOR_COMPLETED : COLOR_UNLOCKED;
    const shadow = darken(fill, 0.6);
    const radius = 22;

    const g = this.add.graphics();
    const draw = (offset: number) => {
      g.clear();
      g.fillStyle(shadow, 1).fillRoundedRect(-size / 2, -size / 2 + 6, size, size, radius);
      g.fillStyle(fill, locked ? 0.7 : 1).fillRoundedRect(
        -size / 2,
        -size / 2 + offset,
        size,
        size,
        radius
      );
    };
    draw(0);
    c.add(g);

    // Big level id in the center.
    const idTxt = this.add
      .text(0, -8, String(id), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "46px",
        color: locked ? "#c8cce0" : "#ffffff",
        fontStyle: "900",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(0,0,0,0.4)", 4, true, true);
    c.add(idTxt);

    if (locked) {
      const lock = this.add
        .image(0, 30, "ic_lock")
        .setDisplaySize(28, 28)
        .setTint(0xaab0d0)
        .setOrigin(0.5);
      c.add(lock);
      c.setAlpha(0.92);
    } else {
      // Completion mark: a single check badge when cleared (pass/fail, no grade).
      const markY = 36;
      const mark: Phaser.GameObjects.Image[] = [];
      if (completed) {
        const chk = this.add
          .image(0, markY, "ic_check")
          .setDisplaySize(20, 20)
          .setTint(0xffffff)
          .setOrigin(0.5);
        c.add(chk);
        mark.push(chk);
      }

      // Tappable container with press feedback.
      c.setSize(size, size + 6);
      c.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, size, size + 6),
        Phaser.Geom.Rectangle.Contains
      );

      c.on("pointerdown", () => {
        draw(6);
        idTxt.setY(-2);
        mark.forEach((s) => s.setY(markY + 6));
      });
      const release = () => {
        draw(0);
        idTxt.setY(-8);
        mark.forEach((s) => s.setY(markY));
      };
      c.on("pointerout", release);
      c.on("pointerup", () => {
        release();
        Sound.button();
        this.scene.start("Game", { mode: "adventure", levelId: id });
      });
    }

    return c;
  }
}
