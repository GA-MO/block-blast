import Phaser from "phaser";
import { Sound } from "../systems/audio";

export interface ButtonOpts {
  width?: number;
  height?: number;
  fontSize?: number;
  fill?: number;
  textColor?: string;
  /** Optional leading icon texture key (from ensureIcons). */
  iconKey?: string;
  /** Tint for the icon (defaults to the text color). */
  iconTint?: number;
  onClick?: () => void;
}

/** A rounded, tactile button as a Container (bg + optional icon + label). */
export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  opts: ButtonOpts = {}
): Phaser.GameObjects.Container {
  const w = opts.width ?? 220;
  const h = opts.height ?? 64;
  const fill = opts.fill ?? 0xffc414;
  const textColor = opts.textColor ?? "#2c1800";
  const fontSize = opts.fontSize ?? 26;

  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (offset: number) => {
    g.clear();
    // Deep outer shadow (two layers for soft depth)
    g.fillStyle(darken(fill, 0.28), 1).fillRoundedRect(-w / 2, -h / 2 + 9, w, h, 18);
    g.fillStyle(darken(fill, 0.50), 1).fillRoundedRect(-w / 2, -h / 2 + 5, w, h, 18);
    // Main face
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2 + offset, w, h, 18);
    // Gloss strip — bright narrow highlight near top
    g.fillStyle(0xffffff, 0.22).fillRoundedRect(-w / 2 + 8, -h / 2 + offset + 5, w - 16, h * 0.3, 12);
  };
  draw(0);

  const txt = scene.add
    .text(0, 0, label, {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${fontSize}px`,
      color: textColor,
      fontStyle: "900",
    })
    .setOrigin(0.5);

  const movers: Phaser.GameObjects.GameObject[] = [txt];
  let icon: Phaser.GameObjects.Image | undefined;
  if (opts.iconKey && scene.textures.exists(opts.iconKey)) {
    const iconSize = fontSize * 1.15;
    const gap = 10;
    const total = iconSize + gap + txt.width;
    icon = scene.add
      .image(-total / 2 + iconSize / 2, 0, opts.iconKey)
      .setDisplaySize(iconSize, iconSize)
      .setTint(opts.iconTint ?? Phaser.Display.Color.HexStringToColor(textColor).color);
    txt.setX(icon.x + iconSize / 2 + gap + txt.width / 2);
    movers.push(icon);
  }

  c.add([g, txt]);
  if (icon) c.add(icon); // above the button fill
  c.setSize(w, h + 6);
  c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h + 6), Phaser.Geom.Rectangle.Contains);

  const baseY = new Map(movers.map((m) => [m, (m as unknown as { y: number }).y]));
  const shift = (offset: number) => movers.forEach((m) => ((m as unknown as { y: number }).y = (baseY.get(m) ?? 0) + offset));
  c.on("pointerdown", () => {
    draw(5);
    shift(5);
  });
  const release = () => {
    draw(0);
    shift(0);
  };
  c.on("pointerup", () => {
    release();
    Sound.button();
    opts.onClick?.();
  });
  c.on("pointerout", release);
  return c;
}

/** A small pill label (e.g. coin counter) with a vector icon. */
export function makePill(
  scene: Phaser.Scene,
  x: number,
  y: number,
  iconKey: string,
  value: string,
  iconTint = 0xffc41a
): { container: Phaser.GameObjects.Container; setValue: (v: string) => void } {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const ICON = 24;
  const icon = scene.add.image(0, 0, iconKey).setDisplaySize(ICON, ICON).setOrigin(0, 0.5);
  if (iconTint !== 0xffffff) icon.setTint(iconTint);
  const valTxt = scene.add
    .text(0, 0, value, {
      fontFamily: "system-ui, sans-serif",
      fontSize: "22px",
      color: "#ffffff",
      fontStyle: "bold",
    })
    .setOrigin(0, 0.5);
  const pillW = () => 18 + ICON + 8 + valTxt.width + 16;
  const layout = () => {
    icon.setX(-pillW() / 2 + 14);
    valTxt.setX(icon.x + ICON + 8);
    g.clear();
    g.fillStyle(0x000000, 0.22).fillRoundedRect(-pillW() / 2, -19, pillW(), 38, 19);
  };
  c.add([g, icon, valTxt]);
  layout();
  return {
    container: c,
    setValue: (v: string) => {
      valTxt.setText(v);
      layout();
    },
  };
}

export function darken(hex: number, f: number): number {
  const r = Math.round(((hex >> 16) & 0xff) * f);
  const g = Math.round(((hex >> 8) & 0xff) * f);
  const b = Math.round((hex & 0xff) * f);
  return (r << 16) | (g << 8) | b;
}

export function lighten(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) + (255 - ((hex >> 16) & 0xff)) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 0xff) + (255 - ((hex >> 8) & 0xff)) * f));
  const b = Math.min(255, Math.round((hex & 0xff) + (255 - (hex & 0xff)) * f));
  return (r << 16) | (g << 8) | b;
}
