import Phaser from "phaser";
import { DESIGN } from "../config";
import { Settings, type SettingsData } from "../systems/settings";
import { Sound } from "../systems/audio";
import { makeButton } from "./widgets";

/** Opens a modal settings panel over the current scene. */
export function openSettings(scene: Phaser.Scene): void {
  const layer = scene.add.container(0, 0).setDepth(300);

  const dim = scene.add
    .rectangle(0, 0, DESIGN.width, DESIGN.height, 0x050310, 0.65)
    .setOrigin(0)
    .setInteractive();
  layer.add(dim);

  const pw = 380;
  const ph = 360;
  const px = (DESIGN.width - pw) / 2;
  const py = (DESIGN.height - ph) / 2;
  const panel = scene.add.graphics();
  // Drop shadow
  panel.fillStyle(0x000000, 0.5).fillRoundedRect(px - 2, py + 12, pw + 4, ph, 28);
  panel.fillStyle(0x000000, 0.3).fillRoundedRect(px, py + 6, pw, ph, 26);
  // Panel body (dark indigo)
  panel.fillStyle(0x1e1870, 1).fillRoundedRect(px, py, pw, ph, 24);
  // Subtle top-half gloss
  panel.fillStyle(0xffffff, 0.05).fillRoundedRect(px, py, pw, ph * 0.45, 24);
  // Inner highlight border
  panel.lineStyle(1.5, 0xffffff, 0.18).strokeRoundedRect(px + 1, py + 1, pw - 2, ph - 2, 23);
  layer.add(panel);

  layer.add(
    scene.add
      .text(DESIGN.width / 2, py + 44, "Settings", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "32px",
        color: "#fff",
        fontStyle: "900",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(0,0,0,0.5)", 5, false, true)
  );

  const rows: { key: keyof SettingsData; label: string; icon: string }[] = [
    { key: "music", label: "Music", icon: "ic_music" },
    { key: "sfx", label: "Sound", icon: "ic_speaker" },
    { key: "haptics", label: "Vibration", icon: "ic_vibrate" },
  ];

  rows.forEach((row, i) => {
    const ry = py + 100 + i * 60;
    layer.add(scene.add.image(px + 44, ry, row.icon).setDisplaySize(26, 26).setTint(0xffffff));
    layer.add(
      scene.add
        .text(px + 68, ry, row.label, {
          fontFamily: "system-ui, sans-serif",
          fontSize: "24px",
          color: "#fff",
        })
        .setOrigin(0, 0.5)
    );
    const toggle = makeToggle(scene, px + pw - 80, ry, Settings[row.key], (on) => {
      Settings.set(row.key, on);
      if (row.key === "music") Sound.setMusicEnabled(on);
      if (row.key === "sfx") Sound.setSfxEnabled(on);
    });
    layer.add(toggle);
  });

  const closeBtn = makeButton(scene, DESIGN.width / 2, py + ph - 44, "Close", {
    width: 220,
    height: 56,
    onClick: () => layer.destroy(),
  });
  layer.add(closeBtn);

  layer.setAlpha(0);
  scene.tweens.add({ targets: layer, alpha: 1, duration: 180 });
}

/** A pill toggle switch. */
function makeToggle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  initial: boolean,
  onChange: (on: boolean) => void
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  let on = initial;
  const w = 64;
  const h = 32;
  const g = scene.add.graphics();
  const knob = scene.add.circle(0, 0, 13, 0xffffff);
  const draw = () => {
    g.clear();
    g.fillStyle(on ? 0x1fc952 : 0x3a3470, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    // Gloss top strip
    g.fillStyle(0xffffff, on ? 0.2 : 0.1).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.38, h / 2);
    knob.setX(on ? w / 2 - 16 : -w / 2 + 16);
  };
  draw();
  c.add([g, knob]);
  c.setSize(w, h);
  c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
  c.on("pointerup", () => {
    on = !on;
    draw();
    Sound.button();
    onChange(on);
  });
  return c;
}
