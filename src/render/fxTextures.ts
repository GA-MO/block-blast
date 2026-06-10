import Phaser from "phaser";

/**
 * Procedural premium-FX textures. All textures are WHITE on a transparent
 * background so callers can tint + blend (additively) them freely.
 *
 * Textures are supersampled (~2x) here and scaled down by callers for crisp
 * edges. Phaser's Graphics API has no radial/linear gradients, so soft falloffs
 * are approximated by stacking shapes with stepped alpha.
 */

const FX_GLOW = "fx_glow";
const FX_RING = "fx_ring";
const FX_STAR = "fx_star";
const FX_RAY = "fx_ray";

/** Supersample factor — textures are drawn this much larger, then scaled down. */
const SS = 2;

/**
 * Generate `fx_glow`: a soft radial glow. White circle whose alpha fades from
 * ~0.9 at the center to 0 at the edge, approximated by stacked fillCircle calls.
 */
function drawGlow(scene: Phaser.Scene): void {
  const size = 128 * SS;
  const r = size / 2;
  const g = scene.add.graphics();
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    // i=0 is the outermost (largest radius, lowest alpha).
    const t = i / (steps - 1); // 0 -> 1 (outer -> inner)
    const radius = r * (1 - t * 0.92);
    const alpha = 0.9 * Math.pow(t, 1.4);
    g.fillStyle(0xffffff, alpha);
    g.fillCircle(r, r, radius);
  }
  g.generateTexture(FX_GLOW, size, size);
  g.destroy();
}

/**
 * Generate `fx_ring`: a thin bright stroked white ring, nothing filled inside.
 * Line width ~6 at 128px (scaled by SS).
 */
function drawRing(scene: Phaser.Scene): void {
  const size = 128 * SS;
  const r = size / 2;
  const lineWidth = 6 * SS;
  const g = scene.add.graphics();
  g.lineStyle(lineWidth, 0xffffff, 1);
  g.strokeCircle(r, r, r - lineWidth);
  g.generateTexture(FX_RING, size, size);
  g.destroy();
}

/**
 * Generate `fx_star`: a 4-point sparkle/twinkle. Built as a concave 4-point
 * star via fillPoints (point objects, not a flat number array).
 */
function drawStar(scene: Phaser.Scene): void {
  const size = 48 * SS;
  const c = size / 2;
  const outer = c * 0.96; // tip reach
  const inner = c * 0.16; // waist of the star
  const g = scene.add.graphics();
  const pts: Phaser.Math.Vector2[] = [];
  // 8 vertices alternating outer tip / inner waist, starting pointing up.
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI / 2) * i - Math.PI / 2; // up, right, down, left tips
    const rad = i % 2 === 0 ? outer : inner;
    pts.push(new Phaser.Math.Vector2(c + Math.cos(ang) * rad, c + Math.sin(ang) * rad));
  }
  g.fillStyle(0xffffff, 1);
  g.fillPoints(pts, true);
  // Bright dense core for a twinkle pop.
  g.fillStyle(0xffffff, 0.9);
  g.fillCircle(c, c, inner * 1.2);
  g.generateTexture(FX_STAR, size, size);
  g.destroy();
}

/**
 * Generate `fx_ray`: a vertical light ray (32 x 256, scaled by SS). Brightest
 * (~0.9) along the vertical center line, fading to 0 at the left/right edges.
 * Approximated by stacked vertical rects of decreasing width / increasing alpha.
 * Intended for additive blending.
 */
function drawRay(scene: Phaser.Scene): void {
  const w = 32 * SS;
  const h = 256 * SS;
  const cx = w / 2;
  const g = scene.add.graphics();
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1); // 0 -> 1 (outer -> center)
    const halfWidth = (cx) * (1 - t * 0.96);
    const alpha = 0.9 * Math.pow(t, 1.6);
    g.fillStyle(0xffffff, alpha);
    g.fillRect(cx - halfWidth, 0, halfWidth * 2, h);
  }
  g.generateTexture(FX_RAY, w, h);
  g.destroy();
}

/**
 * Ensure all procedural FX textures exist in the scene's texture manager.
 * Idempotent: removes any pre-existing texture of the same key before
 * regenerating, so it is safe to call once at boot (or repeatedly).
 */
export function ensureFxTextures(scene: Phaser.Scene): void {
  const builders: Array<[string, (s: Phaser.Scene) => void]> = [
    [FX_GLOW, drawGlow],
    [FX_RING, drawRing],
    [FX_STAR, drawStar],
    [FX_RAY, drawRay],
  ];
  for (const [key, build] of builders) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
    build(scene);
  }
}
