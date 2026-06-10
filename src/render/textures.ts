import Phaser from "phaser";
import { BOARD, COLLECTIBLE_META, TEX_RES } from "../config";

/** Adjust a hex color's brightness. f>1 lightens, f<1 darkens. */
export function shade(hex: number, f: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 0xff) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 0xff) * f));
  const b = Math.min(255, Math.round((hex & 0xff) * f));
  return (r << 16) | (g << 8) | b;
}

function drawBlock(scene: Phaser.Scene, key: string, color: number, S: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const R = 10 * TEX_RES;
  const e = 3 * TEX_RES;
  const g = scene.add.graphics();

  // 1) Deep shadow border — creates the "clamped edge" depth illusion
  g.fillStyle(shade(color, 0.28), 1);
  g.fillRoundedRect(0, 0, S, S, R);

  // 2) Penumbra layer — slightly lighter shadow ring
  g.fillStyle(shade(color, 0.52), 1);
  g.fillRoundedRect(e * 0.6, e * 0.6, S - e * 1.2, S - e * 1.2, R * 0.9);

  // 3) Main face — saturated gem body
  g.fillStyle(shade(color, 0.88), 1);
  g.fillRoundedRect(e, e, S - e * 2, S - e * 2, R * 0.78);

  // 4) Wide convex highlight — top 44%, simulates light from above
  g.fillStyle(shade(color, 1.7), 0.48);
  g.fillRoundedRect(e, e, S - e * 2, S * 0.44, R * 0.72);

  // 5) Narrow specular streak — bright glassy sheen near top-left
  g.fillStyle(0xffffff, 0.32);
  g.fillRoundedRect(e * 2.5, e * 1.8, S * 0.5, S * 0.16, R * 0.42);

  // 6) Tiny specular hotspot — gem-facet sparkle
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(e * 4, e * 3.5, S * 0.055);

  g.generateTexture(key, S, S);
  g.destroy();
}

/** Skin/theme key the global textures were last generated for. */
let generatedKey = "";

/**
 * (Re)generate all block + slot + spark textures for a given skin palette and
 * board theme. Textures live in the GLOBAL texture manager, so this is a no-op
 * when `key` (skin:theme) is unchanged — only regenerates after a shop change.
 * Calling it every scene without the guard leaks canvases and eventually crashes.
 */
export function ensureTextures(
  scene: Phaser.Scene,
  palette: number[],
  slotColor: number,
  key: string
): void {
  if (key === generatedKey && scene.textures.exists("block0")) return;
  generatedKey = key;

  const S = BOARD.cellSize * TEX_RES;
  const R = 9 * TEX_RES;

  palette.forEach((color, i) => drawBlock(scene, `block${i}`, color, S));

  if (scene.textures.exists("slot")) scene.textures.remove("slot");
  {
    const g = scene.add.graphics();
    // Outer dark rim (recessed cavity border)
    g.fillStyle(shade(slotColor, 0.45), 1);
    g.fillRoundedRect(0, 0, S, S, R);
    // Inner cavity fill (slightly lighter = main slot)
    g.fillStyle(slotColor, 1);
    g.fillRoundedRect(2 * TEX_RES, 2 * TEX_RES, S - 4 * TEX_RES, S - 4 * TEX_RES, R * 0.8);
    // Inner shadow border (top/all sides, dark inset line)
    g.lineStyle(2.5 * TEX_RES, shade(slotColor, 0.38), 0.65);
    g.strokeRoundedRect(3 * TEX_RES, 3 * TEX_RES, S - 6 * TEX_RES, S - 6 * TEX_RES, R * 0.7);
    // Tiny bright edge at top (light rim of the cavity opening)
    g.lineStyle(1.5 * TEX_RES, shade(slotColor, 1.8), 0.18);
    g.strokeRoundedRect(4 * TEX_RES, 4 * TEX_RES, S - 8 * TEX_RES, S - 8 * TEX_RES, R * 0.62);
    g.generateTexture("slot", S, S);
    g.destroy();
  }

  // Locked (adventure) tile: a darker slab with a small lock notch look.
  if (scene.textures.exists("locked")) scene.textures.remove("locked");
  {
    const g = scene.add.graphics();
    g.fillStyle(shade(slotColor, 0.7), 1);
    g.fillRoundedRect(0, 0, S, S, R);
    g.lineStyle(3 * TEX_RES, shade(slotColor, 1.4), 0.8);
    g.strokeRoundedRect(edge2(), edge2(), S - edge2() * 2, S - edge2() * 2, R * 0.7);
    g.generateTexture("locked", S, S);
    g.destroy();
  }

  if (!scene.textures.exists("spark")) {
    const P = 24 * TEX_RES;
    const g = scene.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(P / 2, P / 2, P / 2);
    g.generateTexture("spark", P, P);
    g.destroy();
  }

  // Collectible overlays: a gold-framed badge with a per-type icon, sized to a cell.
  for (const type of Object.keys(COLLECTIBLE_META)) {
    drawCollectible(scene, `collect_${type}`, COLLECTIBLE_META[type], S, R);
  }

  // Ice overlays (2-hit locked tiles): frozen and cracked.
  drawIce(scene, "ice_full", false, S, R);
  drawIce(scene, "ice_cracked", true, S, R);

  // Bomb overlay.
  drawBomb(scene, "bomb", S);
}

/** A bomb badge: dark sphere with a highlight + a little fuse spark. */
function drawBomb(scene: Phaser.Scene, key: string, S: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.add.graphics();
  const cx = S / 2;
  const cy = S * 0.56;
  const rad = S * 0.3;
  g.fillStyle(0x111522, 1).fillCircle(cx, cy, rad);
  g.fillStyle(0x2a3148, 1).fillCircle(cx, cy, rad - 3 * TEX_RES);
  // glossy highlight
  g.fillStyle(0x9fb0d8, 0.8).fillCircle(cx - rad * 0.35, cy - rad * 0.35, rad * 0.22);
  // fuse
  g.lineStyle(3 * TEX_RES, 0xffcf3a, 1);
  g.beginPath();
  g.moveTo(cx + rad * 0.4, cy - rad * 0.8);
  g.lineTo(cx + rad * 0.7, cy - rad * 1.3);
  g.strokePath();
  // spark
  g.fillStyle(0xff7a3a, 1).fillCircle(cx + rad * 0.7, cy - rad * 1.35, S * 0.05);
  g.fillStyle(0xffe44d, 1).fillCircle(cx + rad * 0.7, cy - rad * 1.35, S * 0.03);
  g.generateTexture(key, S, S);
  g.destroy();
}

/** Translucent icy overlay; `cracked` adds fracture lines (1 hit left). */
function drawIce(scene: Phaser.Scene, key: string, cracked: boolean, S: number, R: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.add.graphics();
  // frosty fill
  g.fillStyle(0xbfe9ff, cracked ? 0.45 : 0.6);
  g.fillRoundedRect(2 * TEX_RES, 2 * TEX_RES, S - 4 * TEX_RES, S - 4 * TEX_RES, R * 0.7);
  // frost border
  g.lineStyle(3 * TEX_RES, 0xffffff, 0.85);
  g.strokeRoundedRect(3 * TEX_RES, 3 * TEX_RES, S - 6 * TEX_RES, S - 6 * TEX_RES, R * 0.6);
  // highlight glints
  g.lineStyle(2 * TEX_RES, 0xffffff, 0.6);
  g.beginPath();
  g.moveTo(S * 0.25, S * 0.2);
  g.lineTo(S * 0.4, S * 0.35);
  g.strokePath();
  if (cracked) {
    g.lineStyle(2.5 * TEX_RES, 0x6fb7e0, 0.95);
    g.beginPath();
    g.moveTo(S * 0.5, 4 * TEX_RES);
    g.lineTo(S * 0.42, S * 0.5);
    g.lineTo(S * 0.62, S * 0.62);
    g.lineTo(S * 0.5, S - 4 * TEX_RES);
    g.moveTo(S * 0.42, S * 0.5);
    g.lineTo(S * 0.2, S * 0.6);
    g.strokePath();
  }
  g.generateTexture(key, S, S);
  g.destroy();
}

/** Vertices for an n-pointed star centered at (cx,cy). Returns {x,y} points
 *  (Phaser's fillPoints/strokePoints require point objects, not flat numbers). */
function starPoints(cx: number, cy: number, n: number, outer: number, inner: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < n * 2; i++) {
    const rad = i % 2 === 0 ? outer : inner;
    const ang = (Math.PI / n) * i - Math.PI / 2;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad));
  }
  return pts;
}

function drawCollectible(
  scene: Phaser.Scene,
  key: string,
  meta: { color: number; outline: number; points: number },
  S: number,
  R: number
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.add.graphics();
  // gold frame around the cell
  const gold = 0xffcf3a;
  g.lineStyle(4 * TEX_RES, gold, 1);
  g.strokeRoundedRect(2 * TEX_RES, 2 * TEX_RES, S - 4 * TEX_RES, S - 4 * TEX_RES, R * 0.7);
  g.lineStyle(2 * TEX_RES, shade(gold, 1.25), 0.8);
  g.strokeRoundedRect(5 * TEX_RES, 5 * TEX_RES, S - 10 * TEX_RES, S - 10 * TEX_RES, R * 0.6);

  const cx = S / 2;
  const cy = S / 2;
  // 4 points = diamond, 5 = star, 6 = burst. Inner radius tighter for fewer points.
  const inner = meta.points === 4 ? S * 0.13 : meta.points === 5 ? S * 0.16 : S * 0.18;
  const pts = starPoints(cx, cy, meta.points, S * 0.36, inner);
  g.lineStyle(5 * TEX_RES, meta.outline, 1).strokePoints(pts, true, true);
  g.fillStyle(meta.color, 1).fillPoints(pts, true);
  // bright top facet
  g.fillStyle(shade(meta.color, 1.4), 0.85).fillPoints(starPoints(cx, cy - S * 0.04, meta.points, S * 0.2, inner * 0.6), true);
  g.generateTexture(key, S, S);
  g.destroy();
}

function edge2(): number {
  return 5 * TEX_RES;
}
