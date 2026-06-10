import Phaser from "phaser";
import { DESIGN } from "../config";

/** Handle returned by {@link addAmbientBackground}. */
export interface AmbientBackground {
  destroy(): void;
}

/** Unique texture key for the procedurally-generated soft glow dot. */
const SOFT_DOT_KEY = "ambient-soft-dot";

/** Number of floating bokeh dots. */
const DOT_COUNT = 34;

/** Diameter (px) of the source soft-dot texture before scaling. */
const DOT_TEX_SIZE = 96;

/** Move a packed color toward black by `amount` (0..1). */
function darken(color: number, amount: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(
    Math.round(c.red * (1 - amount)),
    Math.round(c.green * (1 - amount)),
    Math.round(c.blue * (1 - amount))
  );
}

/** Perceived luminance (0..255) — used to pick a light vs dark backdrop mode. */
function luminance(color: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return 0.299 * c.red + 0.587 * c.green + 0.114 * c.blue;
}

/** Build the soft radial-gradient circle texture once per scene's texture cache. */
function ensureSoftDotTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(SOFT_DOT_KEY)) return;

  const size = DOT_TEX_SIZE;
  const radius = size / 2;
  const gfx = scene.make.graphics({ x: 0, y: 0 }, false);

  // Concentric rings fading out from a bright center to a transparent edge.
  const steps = 28;
  for (let i = steps; i >= 0; i--) {
    const t = i / steps;
    const r = radius * t;
    const a = (1 - t) * (1 - t);
    gfx.fillStyle(0xffffff, a);
    gfx.fillCircle(radius, radius, r);
  }

  gfx.generateTexture(SOFT_DOT_KEY, size, size);
  gfx.destroy();
}

/**
 * Build a full-screen vignette overlay: edge strips fade from dark to transparent,
 * so the center of the screen stays fully visible while corners darken.
 */
function addVignette(
  scene: Phaser.Scene,
  width: number,
  height: number,
  light: boolean
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setDepth(-7).setScrollFactor(0);

  const vW = width * 0.32;
  const vH = height * 0.22;

  if (light) {
    // On the bright crystal backdrop a dark vignette would muddy it. Instead
    // lay a soft white sheen across the top and a faint cool wash at the
    // bottom so the screen reads as clean frosted glass.
    g.fillGradientStyle(0xffffff, 0xffffff, 0xffffff, 0xffffff, 0.5, 0.5, 0, 0);
    g.fillRect(0, 0, width, vH * 1.4);
    g.fillGradientStyle(0x9fb6dd, 0x9fb6dd, 0x9fb6dd, 0x9fb6dd, 0, 0, 0.22, 0.22);
    g.fillRect(0, height - vH, width, vH);
    return g;
  }

  // Dark themes: classic darkened corners to frame the play area.
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.52, 0, 0.52, 0);
  g.fillRect(0, 0, vW, height);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.52, 0, 0.52);
  g.fillRect(width - vW, 0, vW, height);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
  g.fillRect(0, 0, width, vH);
  g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.48, 0.48);
  g.fillRect(0, height - vH, width, vH);

  return g;
}

/**
 * Adds a subtle, premium ambient backdrop: a vertical theme gradient with a
 * layer of slowly drifting, softly glowing translucent bokeh dots that float
 * upward and wrap around. Self-animating (tween-driven), input-transparent,
 * and parked at a low depth so it sits behind all gameplay.
 */
export function addAmbientBackground(
  scene: Phaser.Scene,
  theme: { bgTop: number; bgBottom: number }
): AmbientBackground {
  ensureSoftDotTexture(scene);

  const { width, height } = DESIGN;

  // --- Gradient fill ------------------------------------------------------
  const gradient = scene.add.graphics();
  gradient.fillGradientStyle(
    theme.bgTop,
    theme.bgTop,
    theme.bgBottom,
    theme.bgBottom,
    1
  );
  gradient.fillRect(0, 0, width, height);
  gradient.setDepth(-10);
  gradient.setScrollFactor(0);

  // --- Floating bokeh layer ----------------------------------------------
  // Light "crystal" themes get cool translucent shards drawn over the bright
  // glass; dark themes keep the additive glowing bokeh.
  const light = luminance(theme.bgBottom) > 150;
  // Dark themes glow with aurora colors (mint-cyan + violet) via additive bokeh.
  const tintBase = light ? darken(theme.bgBottom, 0.18) : 0x2bd9b0;
  const tintWarm = light ? 0xffffff : 0x8a5cff;
  const dots: Phaser.GameObjects.Image[] = [];
  const tweens: Phaser.Tweens.Tween[] = [];

  for (let i = 0; i < DOT_COUNT; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    const dot = scene.add.image(x, y, SOFT_DOT_KEY);

    dot.setDepth(-9);
    dot.setScrollFactor(0);
    dot.setBlendMode(light ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD);
    // Alternate tint for variety
    dot.setTint(i % 5 === 0 ? tintWarm : tintBase);

    // Wider size range: tiny sparkles to large soft blobs
    const isLarge = i < 4;
    const scale = isLarge
      ? Phaser.Math.FloatBetween(1.4, 2.2)
      : Phaser.Math.FloatBetween(0.22, 1.1);
    dot.setScale(scale);
    const dimFloor = light ? 0.04 : 0.03;
    const dimCeil = light ? 0.18 : 0.16;
    dot.setAlpha(isLarge ? Phaser.Math.FloatBetween(dimFloor, dimFloor + 0.03) : Phaser.Math.FloatBetween(dimFloor + 0.01, dimCeil));

    dots.push(dot);

    // Slow upward drift, wrapping from top back to the bottom.
    const driftDuration = isLarge
      ? Phaser.Math.Between(28000, 50000)
      : Phaser.Math.Between(12000, 28000);
    const driftTween = scene.tweens.add({
      targets: dot,
      y: dot.y - Phaser.Math.Between(isLarge ? 80 : 140, isLarge ? 180 : 360),
      duration: driftDuration,
      repeat: -1,
      ease: "Linear",
      onRepeat: () => {
        dot.y = height + dot.displayHeight * 0.5;
        dot.x = Phaser.Math.Between(0, width);
      },
    });
    tweens.push(driftTween);

    // Gentle horizontal sway.
    const swayTween = scene.tweens.add({
      targets: dot,
      x: dot.x + Phaser.Math.Between(-50, 50),
      duration: Phaser.Math.Between(5000, 14000),
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
    });
    tweens.push(swayTween);

    // Slow breathing glow.
    const baseAlpha = dot.alpha;
    const pulseTween = scene.tweens.add({
      targets: dot,
      alpha: Math.min(0.18, baseAlpha + 0.06),
      scale: scale * Phaser.Math.FloatBetween(1.06, 1.28),
      duration: Phaser.Math.Between(3500, 9000),
      yoyo: true,
      repeat: -1,
      ease: "Sine.InOut",
      delay: Phaser.Math.Between(0, 4000),
    });
    tweens.push(pulseTween);
  }

  // --- Vignette ---------------------------------------------------------
  const vignette = addVignette(scene, width, height, light);

  let destroyed = false;
  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      for (const tween of tweens) tween.stop();
      tweens.length = 0;
      for (const dot of dots) dot.destroy();
      dots.length = 0;
      gradient.destroy();
      vignette.destroy();
    },
  };
}
