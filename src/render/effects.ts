import Phaser from "phaser";
import { DESIGN } from "../config";

/**
 * Reusable visual-effects module for Block Blast.
 *
 * Every effect is self-contained: it creates its own display objects /
 * emitters and destroys them when the animation completes. No game-logic
 * imports, no persistent state, never throws.
 */

const PARTICLE_KEY = "spark";
const FALLBACK_KEY = "fx_dot";

/** Returns a usable round-particle texture key, generating a fallback once. */
function particleKey(scene: Phaser.Scene): string {
  if (scene.textures.exists(PARTICLE_KEY)) return PARTICLE_KEY;
  if (!scene.textures.exists(FALLBACK_KEY)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(8, 8, 8);
    g.generateTexture(FALLBACK_KEY, 16, 16);
    g.destroy();
  }
  return FALLBACK_KEY;
}

/**
 * Premium texture keys produced by a sibling generator at runtime. Each use is
 * guarded by `scene.textures.exists(key)`; fall back to a particle texture.
 */
const FX_GLOW = "fx_glow";
const FX_RING = "fx_ring";
const FX_STAR = "fx_star";
const FX_RAY = "fx_ray";

/** Returns the key if its texture exists, otherwise a safe particle fallback. */
function fxKey(scene: Phaser.Scene, key: string): string {
  return scene.textures.exists(key) ? key : particleKey(scene);
}

/** Half the source width of a texture, used to derive scale from a radius. */
function halfWidth(scene: Phaser.Scene, key: string, fallback = 8): number {
  const tex = scene.textures.get(key);
  const src = tex ? tex.getSourceImage() : null;
  const w = src ? (src as { width?: number }).width : undefined;
  return w && w > 0 ? w / 2 : fallback;
}

/** Jewel-toned celebratory burst colors (matches default skin palette). */
const CONFETTI_COLORS = [
  0xff2d56, 0xff8020, 0xffc41a, 0x1fc952, 0x0ea5f0, 0xa055f5, 0x05cac0, 0xffffff,
];

/**
 * Signature "collect" beam: a vivid vertical light column that flashes bright
 * then fades, with a soft glow and a few rising sparks. ~450ms.
 */
export function collectBeam(
  scene: Phaser.Scene,
  columnX: number,
  topY: number,
  bottomY: number,
  color: number
): void {
  const height = Math.max(1, bottomY - topY);
  const centerY = (topY + bottomY) / 2;

  // Core bright beam.
  const core = scene.add.rectangle(columnX, centerY, 18, height, color, 0.95);
  core.setBlendMode(Phaser.BlendModes.ADD);
  core.setDepth(40);
  core.setScale(0.4, 1);

  // Soft wide glow behind the core.
  const glow = scene.add.rectangle(columnX, centerY, 54, height, color, 0.35);
  glow.setBlendMode(Phaser.BlendModes.ADD);
  glow.setDepth(40);
  glow.setScale(0.6, 1);

  const cleanup = () => {
    core.destroy();
    glow.destroy();
  };

  scene.tweens.add({
    targets: core,
    scaleX: { from: 0.4, to: 1.6 },
    alpha: { from: 1, to: 0 },
    duration: 450,
    ease: "Cubic.easeOut",
  });
  scene.tweens.add({
    targets: glow,
    scaleX: { from: 0.6, to: 2.4 },
    alpha: { from: 0.45, to: 0 },
    duration: 450,
    ease: "Cubic.easeOut",
    onComplete: cleanup,
  });

  // Rising sparks within the column.
  const key = particleKey(scene);
  const emitter = scene.add.particles(0, 0, key, {
    x: { min: columnX - 8, max: columnX + 8 },
    y: { min: topY, max: bottomY },
    lifespan: 420,
    speedY: { min: -160, max: -60 },
    speedX: { min: -20, max: 20 },
    scale: { start: 0.5, end: 0 },
    alpha: { start: 0.9, end: 0 },
    tint: color,
    blendMode: Phaser.BlendModes.ADD,
    quantity: 8,
    emitting: false,
  });
  emitter.setDepth(41);
  emitter.explode(8);
  scene.time.delayedCall(460, () => emitter.destroy());
}

/**
 * Expanding stroked ring that grows to `maxRadius` while fading. ~400ms.
 */
export function shockwave(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  maxRadius = 120
): void {
  const ring = scene.add.circle(x, y, 8);
  ring.setStrokeStyle(4, color, 1);
  ring.setFillStyle();
  ring.isFilled = false;
  ring.setBlendMode(Phaser.BlendModes.ADD);
  ring.setDepth(40);

  const targetScale = Math.max(1, maxRadius / 8);

  scene.tweens.add({
    targets: ring,
    scale: { from: 1, to: targetScale },
    alpha: { from: 1, to: 0 },
    duration: 400,
    ease: "Cubic.easeOut",
    onComplete: () => ring.destroy(),
  });
}

/**
 * Celebratory burst of small colorful rectangles that fly out and fall with
 * gravity, fading. ~1200ms. For win screens.
 */
export function confetti(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count = 24
): void {
  const n = Math.min(30, Math.max(1, Math.floor(count)));
  const pieces: Phaser.GameObjects.Rectangle[] = [];
  let remaining = 0;

  for (let i = 0; i < n; i++) {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    const w = 6 + Math.random() * 6;
    const h = 4 + Math.random() * 5;
    const rect = scene.add.rectangle(x, y, w, h, color, 1);
    rect.setDepth(60);
    rect.setAngle(Math.random() * 360);
    pieces.push(rect);

    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const speed = 160 + Math.random() * 220;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    const duration = 900 + Math.random() * 300;

    // Horizontal drift (constant velocity).
    scene.tweens.add({
      targets: rect,
      x: x + (vx * duration) / 1000,
      duration,
      ease: "Linear",
    });
    // Vertical: launch up then gravity pulls down (quadratic-ish via easeIn).
    const apexY = y + (vy * 0.45);
    scene.tweens.add({
      targets: rect,
      y: apexY,
      duration: duration * 0.4,
      ease: "Cubic.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: rect,
          y: y + 420,
          duration: duration * 0.6,
          ease: "Cubic.easeIn",
        });
      },
    });
    // Spin + fade; last fade controls cleanup.
    remaining++;
    scene.tweens.add({
      targets: rect,
      angle: rect.angle + (Math.random() < 0.5 ? -360 : 360),
      alpha: { from: 1, to: 0 },
      duration,
      ease: "Quad.easeIn",
      onComplete: () => {
        rect.destroy();
        remaining--;
        if (remaining <= 0) {
          for (const p of pieces) {
            if (p.active) p.destroy();
          }
        }
      },
    });
  }
}

/**
 * Brief full-screen vignette/edge glow pulse that fades quickly. ~250ms.
 * Does NOT capture input.
 */
export function edgeFlash(
  scene: Phaser.Scene,
  color: number,
  alpha = 0.6
): void {
  const cx = DESIGN.width / 2;
  const cy = DESIGN.height / 2;
  const a = Phaser.Math.Clamp(alpha, 0, 1);

  const rect = scene.add.rectangle(cx, cy, DESIGN.width, DESIGN.height);
  rect.setStrokeStyle(40, color, a);
  rect.isFilled = false;
  rect.setBlendMode(Phaser.BlendModes.ADD);
  rect.setDepth(80);

  scene.tweens.add({
    targets: rect,
    alpha: { from: 1, to: 0 },
    duration: 250,
    ease: "Quad.easeOut",
    onComplete: () => rect.destroy(),
  });
}

/**
 * Subtle dust puff when a piece locks. ~6 small fading particles.
 */
export function placeDust(scene: Phaser.Scene, x: number, y: number): void {
  const key = particleKey(scene);
  const emitter = scene.add.particles(x, y, key, {
    lifespan: 320,
    speed: { min: 30, max: 90 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 0.5, end: 0 },
    tint: 0xffffff,
    blendMode: Phaser.BlendModes.ADD,
    quantity: 6,
    emitting: false,
  });
  emitter.setDepth(38);
  emitter.explode(6, x, y);
  scene.time.delayedCall(360, () => emitter.destroy());
}

/**
 * Bold text that rises ~50px while scaling up then fading. ~900ms.
 * For "+score" / "COMBO".
 */
export function floatingText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = "#ffe44d"
): void {
  const label = scene.add.text(x, y, text, {
    fontFamily: "Arial, sans-serif",
    fontSize: "30px",
    fontStyle: "bold",
    color,
    stroke: "#000000",
    strokeThickness: 4,
    align: "center",
  });
  label.setOrigin(0.5);
  label.setDepth(70);
  label.setScale(0.6);

  scene.tweens.add({
    targets: label,
    scale: { from: 0.6, to: 1.15 },
    duration: 220,
    ease: "Back.easeOut",
  });
  scene.tweens.add({
    targets: label,
    y: y - 50,
    alpha: { from: 1, to: 0 },
    duration: 900,
    ease: "Quad.easeIn",
    onComplete: () => label.destroy(),
  });
}

// ---------------------------------------------------------------------------
// Impact feedback + grand clear / combo / perfect-clear celebrations.
// ---------------------------------------------------------------------------

/** Tracks the active hit-stop so overlapping calls don't strand a slow scene. */
interface HitStopState {
  active: boolean;
  timer: number;
}
const HIT_STOP = new WeakMap<Phaser.Scene, HitStopState>();

/**
 * Brief impact freeze. Slows tween + scene time to a crawl, then restores to 1
 * after `ms` of REAL time (scene.time is slowed, so we use window.setTimeout).
 * Re-entrant calls just extend the freeze rather than stacking restores.
 */
export function hitStop(scene: Phaser.Scene, ms = 70): void {
  const duration = Math.max(0, ms);
  let state = HIT_STOP.get(scene);
  if (!state) {
    state = { active: false, timer: 0 };
    HIT_STOP.set(scene, state);
  }
  if (state.active) {
    // Already frozen: extend by clearing the pending restore and rescheduling.
    window.clearTimeout(state.timer);
  } else {
    state.active = true;
    scene.tweens.timeScale = 0.05;
    scene.time.timeScale = 0.05;
  }
  const restore = () => {
    const s = HIT_STOP.get(scene);
    if (!s) return;
    s.active = false;
    // Scene may have been torn down; guard property access.
    if (scene.tweens) scene.tweens.timeScale = 1;
    if (scene.time) scene.time.timeScale = 1;
  };
  state.timer = window.setTimeout(restore, duration);
}

/**
 * Quick camera zoom-in punch that eases back to 1. Never leaves zoom != 1.
 * intensity default 0.02, ms default 160.
 */
export function cameraPunch(
  scene: Phaser.Scene,
  intensity = 0.02,
  ms = 160
): void {
  const cam = scene.cameras ? scene.cameras.main : null;
  if (!cam) return;
  const amount = Math.max(0, intensity);
  const base = 1;
  // A yoyo tween on a proxy reliably zooms in then fully back to base — unlike
  // nested camera.zoomTo callbacks, which can strand the zoom at the peak.
  const proxy = { z: base };
  scene.tweens.add({
    targets: proxy,
    z: base + amount,
    duration: Math.max(1, ms / 2),
    ease: "Quad.easeOut",
    yoyo: true,
    onUpdate: () => cam.setZoom(proxy.z),
    onComplete: () => cam.setZoom(base),
    onStop: () => cam.setZoom(base),
  });
}

/**
 * Crisp bright ring — sharper/faster than shockwave. Uses fx_ring tinted,
 * scaling from 0 to `radius` while fading. ~300ms, additive.
 */
export function impactRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  radius = 90
): void {
  const key = fxKey(scene, FX_RING);
  const r = Math.max(1, radius);
  const targetScale = r / halfWidth(scene, key);

  const ring = scene.add.image(x, y, key);
  ring.setTint(color);
  ring.setBlendMode(Phaser.BlendModes.ADD);
  ring.setDepth(42);
  ring.setScale(0.001);
  ring.setAlpha(1);

  scene.tweens.add({
    targets: ring,
    scale: { from: 0.001, to: targetScale },
    alpha: { from: 1, to: 0 },
    duration: 300,
    ease: "Quart.easeOut",
    onComplete: () => ring.destroy(),
  });
}

/**
 * Big line-clear celebration at a centroid: a glow flash, an impact ring, and a
 * star/spark burst scaled by `power` (1..4 ≈ lines cleared). Punchy but clean.
 */
export function lineClearBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  power = 1
): void {
  const p = Phaser.Math.Clamp(power, 1, 4);

  // Bright soft glow flash.
  const glowKey = fxKey(scene, FX_GLOW);
  const glow = scene.add.image(x, y, glowKey);
  glow.setTint(color);
  glow.setBlendMode(Phaser.BlendModes.ADD);
  glow.setDepth(41);
  const glowScale = (60 + p * 24) / halfWidth(scene, glowKey);
  glow.setScale(glowScale * 0.5);
  glow.setAlpha(0.95);
  scene.tweens.add({
    targets: glow,
    scale: { from: glowScale * 0.5, to: glowScale },
    alpha: { from: 0.95, to: 0 },
    duration: 360,
    ease: "Cubic.easeOut",
    onComplete: () => glow.destroy(),
  });

  // Crisp ring sized by power.
  impactRing(scene, x, y, color, 70 + p * 28);

  // Star/spark burst — capped at 16 particles.
  const starKey = fxKey(scene, FX_STAR);
  const count = Math.min(16, 6 + p * 3);
  const emitter = scene.add.particles(x, y, starKey, {
    lifespan: { min: 360, max: 560 },
    speed: { min: 90, max: 90 + p * 70 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.5 + p * 0.06, end: 0 },
    alpha: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    tint: [color, 0xffffff],
    blendMode: Phaser.BlendModes.ADD,
    quantity: count,
    emitting: false,
  });
  emitter.setDepth(43);
  emitter.explode(count, x, y);
  scene.time.delayedCall(600, () => emitter.destroy());
}

/** Combo-tint ramp: white → gold → orange → hot-orange as combos rise. */
function comboTint(combo: number): { color: number; alpha: number } {
  if (combo <= 1) return { color: 0xffffff, alpha: 0.22 };
  if (combo === 2) return { color: 0xfff0b0, alpha: 0.28 };
  if (combo === 3) return { color: 0xffd84d, alpha: 0.34 };
  if (combo === 4) return { color: 0xff9d3a, alpha: 0.4 };
  return { color: 0xff6a2a, alpha: 0.46 };
}

/**
 * Full-screen additive flash whose intensity/tint escalate with `combo`.
 * Quick ~200ms fade. Does NOT capture input.
 */
export function comboFlash(scene: Phaser.Scene, combo: number): void {
  const { color, alpha } = comboTint(Math.max(1, Math.floor(combo)));
  const cx = DESIGN.width / 2;
  const cy = DESIGN.height / 2;

  const rect = scene.add.rectangle(cx, cy, DESIGN.width, DESIGN.height, color, 1);
  rect.setBlendMode(Phaser.BlendModes.ADD);
  rect.setDepth(82);
  rect.disableInteractive();

  scene.tweens.add({
    targets: rect,
    alpha: { from: alpha, to: 0 },
    duration: 200,
    ease: "Quad.easeOut",
    onComplete: () => rect.destroy(),
  });
}

/**
 * Showstopper for a perfect clear: radiating light rays spinning + scaling out
 * from center, a big glow, confetti, and a bright edge flash. ~900ms, then
 * cleans up.
 */
export function perfectCelebration(
  scene: Phaser.Scene,
  x: number,
  y: number
): void {
  // Big central glow bloom.
  const glowKey = fxKey(scene, FX_GLOW);
  const glow = scene.add.image(x, y, glowKey);
  glow.setTint(0xffe9a8);
  glow.setBlendMode(Phaser.BlendModes.ADD);
  glow.setDepth(44);
  const glowScale = 220 / halfWidth(scene, glowKey);
  glow.setScale(glowScale * 0.3);
  glow.setAlpha(1);
  scene.tweens.add({
    targets: glow,
    scale: { from: glowScale * 0.3, to: glowScale },
    alpha: { from: 1, to: 0 },
    duration: 800,
    ease: "Cubic.easeOut",
    onComplete: () => glow.destroy(),
  });

  // Radiating light rays.
  const rayKey = fxKey(scene, FX_RAY);
  const rayCount = 8;
  const baseHalf = halfWidth(scene, rayKey);
  const rayTargetScaleY = 260 / Math.max(1, baseHalf * 2);
  for (let i = 0; i < rayCount; i++) {
    const baseAngle = (360 / rayCount) * i;
    const ray = scene.add.image(x, y, rayKey);
    ray.setTint(0xfff2c0);
    ray.setBlendMode(Phaser.BlendModes.ADD);
    ray.setDepth(43);
    ray.setOrigin(0.5, 1); // anchor at center, ray points outward
    ray.setAngle(baseAngle);
    ray.setScale(0.3, 0.05);
    ray.setAlpha(0.95);
    scene.tweens.add({
      targets: ray,
      scaleY: { from: 0.05, to: rayTargetScaleY },
      scaleX: { from: 0.3, to: 0.18 },
      angle: baseAngle + 24,
      alpha: { from: 0.95, to: 0 },
      duration: 760,
      ease: "Cubic.easeOut",
      onComplete: () => ray.destroy(),
    });
  }

  // Crisp expanding ring for definition.
  impactRing(scene, x, y, 0xffffff, 180);

  // Celebration extras (each self-cleans).
  confetti(scene, x, y, 30);
  edgeFlash(scene, 0xffe9a8, 0.7);
}

/**
 * Punchy score popup: bold text scaling 0 → 1.2 → 1 (Back.out) while rising
 * ~40px, then fading. A juicier floatingText. color default "#ffe44d".
 */
export function scorePop(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color = "#ffe44d"
): void {
  const label = scene.add.text(x, y, text, {
    fontFamily: "Arial, sans-serif",
    fontSize: "34px",
    fontStyle: "bold",
    color,
    stroke: "#000000",
    strokeThickness: 5,
    align: "center",
  });
  label.setOrigin(0.5);
  label.setDepth(72);
  label.setScale(0);

  // Pop in with overshoot.
  scene.tweens.add({
    targets: label,
    scale: { from: 0, to: 1.2 },
    duration: 220,
    ease: "Back.easeOut",
    onComplete: () => {
      scene.tweens.add({
        targets: label,
        scale: 1,
        duration: 120,
        ease: "Quad.easeOut",
      });
    },
  });
  // Rise + fade controls cleanup.
  scene.tweens.add({
    targets: label,
    y: y - 40,
    alpha: { from: 1, to: 0 },
    delay: 260,
    duration: 520,
    ease: "Quad.easeIn",
    onComplete: () => label.destroy(),
  });
}

/**
 * A few small sparkles drifting up and fading. ~500ms. Uses fx_star.
 */
export function sparkleTrail(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number
): void {
  const key = fxKey(scene, FX_STAR);
  const n = 4;
  for (let i = 0; i < n; i++) {
    const ox = x + (Math.random() - 0.5) * 28;
    const oy = y + (Math.random() - 0.5) * 16;
    const star = scene.add.image(ox, oy, key);
    star.setTint(color);
    star.setBlendMode(Phaser.BlendModes.ADD);
    star.setDepth(45);
    star.setScale(0.2 + Math.random() * 0.2);
    star.setAlpha(0);

    scene.tweens.add({
      targets: star,
      alpha: { from: 0, to: 1 },
      duration: 120,
      ease: "Quad.easeOut",
      yoyo: true,
      hold: 80,
    });
    scene.tweens.add({
      targets: star,
      y: oy - (24 + Math.random() * 24),
      angle: (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 90),
      scale: 0,
      delay: i * 30,
      duration: 500,
      ease: "Cubic.easeOut",
      onComplete: () => star.destroy(),
    });
  }
}
