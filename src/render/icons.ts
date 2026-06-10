import Phaser from "phaser";

/**
 * Procedural vector icon set for the Block Blast UI.
 *
 * Every icon is drawn in solid white (0xffffff) on a transparent background,
 * centered inside a SIZE x SIZE box with ~10% padding, then baked into a
 * texture via `generateTexture`. Callers recolor with `image.setTint(...)`
 * and scale down with `setDisplaySize(...)`.
 *
 * All draws are idempotent: an existing texture with the same key is removed
 * before regeneration, so `ensureIcons` is safe to call repeatedly.
 */

const SIZE = 96;
/** Stroke weight used for outline / line-art icons (at SIZE 96). */
const STROKE = 7;
const WHITE = 0xffffff;
/** Center of the icon box. */
const C = SIZE / 2;

type DrawFn = (g: Phaser.GameObjects.Graphics) => void;

/** Create a graphics object, run `fn`, bake `key`, then clean up. */
function bake(scene: Phaser.Scene, key: string, fn: DrawFn): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.add.graphics();
  fn(g);
  g.generateTexture(key, SIZE, SIZE);
  g.destroy();
}

/** Standard bold stroke setup with rounded joins/caps. */
function pen(g: Phaser.GameObjects.Graphics, width: number = STROKE): void {
  g.lineStyle(width, WHITE, 1);
}

/* ------------------------------------------------------------------ */
/* Individual icon painters                                            */
/* ------------------------------------------------------------------ */

function drawBack(g: Phaser.GameObjects.Graphics): void {
  // Left chevron "<": two strokes meeting at the left vertex.
  pen(g, STROKE + 2);
  const left = 30;
  const right = 64;
  const top = 22;
  const bot = SIZE - 22;
  g.beginPath();
  g.moveTo(right, top);
  g.lineTo(left, C);
  g.lineTo(right, bot);
  g.strokePath();
  // Rounded caps at the ends.
  g.fillStyle(WHITE, 1);
  const r = (STROKE + 2) / 2;
  g.fillCircle(right, top, r);
  g.fillCircle(left, C, r);
  g.fillCircle(right, bot, r);
}

function drawGear(g: Phaser.GameObjects.Graphics): void {
  // Outer toothed gear filled, then a transparent center hole erased.
  const teeth = 8;
  const rOuter = 41;
  const rInner = 31;
  const half = (Math.PI / teeth) * 0.6;
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2 - Math.PI / 2;
    pts.push(new Phaser.Math.Vector2(C + Math.cos(a - half) * rOuter, C + Math.sin(a - half) * rOuter));
    pts.push(new Phaser.Math.Vector2(C + Math.cos(a + half) * rOuter, C + Math.sin(a + half) * rOuter));
    const an = ((i + 0.5) / teeth) * Math.PI * 2 - Math.PI / 2;
    pts.push(new Phaser.Math.Vector2(C + Math.cos(an - half) * rInner, C + Math.sin(an - half) * rInner));
    pts.push(new Phaser.Math.Vector2(C + Math.cos(an + half) * rInner, C + Math.sin(an + half) * rInner));
  }
  g.fillStyle(WHITE, 1);
  g.fillPoints(pts, true);
  // Punch the center hole using erase blend mode so it is truly transparent.
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillStyle(WHITE, 1);
  g.fillCircle(C, C, 13);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
}

function drawCoin(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  g.fillCircle(C, C, 42);
  // Milled edge groove
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillCircle(C, C, 33);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
  g.fillStyle(WHITE, 1);
  g.fillCircle(C, C, 26);
  // 4-pointed star cutout — makes it read as premium currency
  g.setBlendMode(Phaser.BlendModes.ERASE);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 14 : 5;
    const a = (Math.PI / 4) * i - Math.PI / 4;
    pts.push(new Phaser.Math.Vector2(C + Math.cos(a) * r, C + Math.sin(a) * r));
  }
  g.fillPoints(pts, true);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
}

function drawCrown(g: Phaser.GameObjects.Graphics): void {
  const baseTop = 58;
  const baseBot = 72;
  const left = 14;
  const right = SIZE - 14;
  const peakTop = 18;
  const midTop = 30;
  // Crown silhouette: wide base bar + 3 tall points.
  const pts = [
    new Phaser.Math.Vector2(left, baseBot),
    new Phaser.Math.Vector2(left, baseTop),
    new Phaser.Math.Vector2(left, peakTop),         // left peak
    new Phaser.Math.Vector2(left + 20, midTop + 8), // left valley
    new Phaser.Math.Vector2(C, peakTop - 6),        // centre peak (tallest)
    new Phaser.Math.Vector2(right - 20, midTop + 8),// right valley
    new Phaser.Math.Vector2(right, peakTop),        // right peak
    new Phaser.Math.Vector2(right, baseTop),
    new Phaser.Math.Vector2(right, baseBot),
  ];
  g.fillStyle(WHITE, 1);
  g.fillPoints(pts, true);
  // Jewel circles on each peak tip.
  g.fillCircle(left, peakTop, 6);
  g.fillCircle(C, peakTop - 6, 7);
  g.fillCircle(right, peakTop, 6);
  // Tiny dots on the base (decorative rivets — punched out).
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillCircle(left + 14, (baseTop + baseBot) / 2, 4);
  g.fillCircle(C, (baseTop + baseBot) / 2, 4);
  g.fillCircle(right - 14, (baseTop + baseBot) / 2, 4);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
}

/** Build the points of an n-pointed star centered at (cx, cy). */
function starPoints(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  points: number,
  rotation: number
): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rotation + i * step;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

function drawStar(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  g.fillPoints(starPoints(C, C + 2, 42, 18, 5, -Math.PI / 2), true);
}

function drawStarOutline(g: Phaser.GameObjects.Graphics): void {
  pen(g, STROKE);
  const pts = starPoints(C, C + 2, 40, 17, 5, -Math.PI / 2);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.strokePath();
}

function drawGem(g: Phaser.GameObjects.Graphics): void {
  const top = 26;
  const mid = 44;
  const bot = SIZE - 22;
  const left = 18;
  const right = SIZE - 18;
  const tl = 32;
  const tr = SIZE - 32;
  // Top trapezoid + bottom triangle forming a diamond.
  g.fillStyle(WHITE, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(tl, top),
      new Phaser.Math.Vector2(tr, top),
      new Phaser.Math.Vector2(right, mid),
      new Phaser.Math.Vector2(C, bot),
      new Phaser.Math.Vector2(left, mid),
    ],
    true
  );
  // Facet lines (darker = erased thin lines for depth).
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.lineStyle(3, WHITE, 1);
  g.beginPath();
  g.moveTo(left, mid);
  g.lineTo(right, mid);
  g.moveTo(tl, top);
  g.lineTo(C - 8, mid);
  g.lineTo(C, bot);
  g.moveTo(tr, top);
  g.lineTo(C + 8, mid);
  g.lineTo(C, bot);
  g.strokePath();
  g.setBlendMode(Phaser.BlendModes.NORMAL);
}

function drawHammer(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Work in a rotated frame around center, angled ~ -30deg.
  const a = Phaser.Math.DegToRad(-30);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const rot = (x: number, y: number): Phaser.Math.Vector2 => {
    const dx = x;
    const dy = y;
    return new Phaser.Math.Vector2(C + dx * cos - dy * sin, C + dx * sin + dy * cos);
  };
  // Head: rectangle near the top (local coords, origin at center).
  const head = [rot(-26, -34), rot(28, -34), rot(28, -14), rot(-26, -14)];
  g.fillPoints(head, true);
  // Handle: thin rectangle going down.
  const handle = [rot(-6, -14), rot(6, -14), rot(6, 38), rot(-6, 38)];
  g.fillPoints(handle, true);
  // Round the handle bottom.
  const tip = rot(0, 38);
  g.fillCircle(tip.x, tip.y, 6);
}

function drawSwap(g: Phaser.GameObjects.Graphics): void {
  pen(g, STROKE);
  const r = 30;
  // Top arc (going clockwise gap) + bottom arc, forming a refresh loop.
  g.beginPath();
  g.arc(C, C, r, Phaser.Math.DegToRad(-160), Phaser.Math.DegToRad(20), false);
  g.strokePath();
  g.beginPath();
  g.arc(C, C, r, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(200), false);
  g.strokePath();
  // Arrowheads at each arc terminus.
  g.fillStyle(WHITE, 1);
  // End of top arc at angle 20deg.
  const a1 = Phaser.Math.DegToRad(20);
  const p1 = new Phaser.Math.Vector2(C + Math.cos(a1) * r, C + Math.sin(a1) * r);
  g.fillTriangle(p1.x + 12, p1.y - 2, p1.x - 6, p1.y - 12, p1.x - 4, p1.y + 10);
  // End of bottom arc at angle 200deg.
  const a2 = Phaser.Math.DegToRad(200);
  const p2 = new Phaser.Math.Vector2(C + Math.cos(a2) * r, C + Math.sin(a2) * r);
  g.fillTriangle(p2.x - 12, p2.y + 2, p2.x + 6, p2.y + 12, p2.x + 4, p2.y - 10);
}

function drawHeart(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  const topY = 36;
  const lobeR = 16;
  const lx = C - 16;
  const rx = C + 16;
  // Two lobes.
  g.fillCircle(lx, topY, lobeR);
  g.fillCircle(rx, topY, lobeR);
  // Bottom point triangle.
  g.fillPoints(
    [
      new Phaser.Math.Vector2(lx - lobeR, topY + 2),
      new Phaser.Math.Vector2(rx + lobeR, topY + 2),
      new Phaser.Math.Vector2(C, SIZE - 22),
    ],
    true
  );
}

function drawPlay(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Rounded play triangle: main shape + rounded corners via circles on each vertex.
  const pts = [
    new Phaser.Math.Vector2(28, 20),
    new Phaser.Math.Vector2(28, SIZE - 20),
    new Phaser.Math.Vector2(SIZE - 22, C),
  ];
  g.fillPoints(pts, true);
  // Round the three vertices.
  const vr = 7;
  g.fillCircle(28, 20, vr);
  g.fillCircle(28, SIZE - 20, vr);
  g.fillCircle(SIZE - 22, C, vr);
}

function drawCalendar(g: Phaser.GameObjects.Graphics): void {
  const x = 18;
  const y = 24;
  const w = SIZE - 36;
  const h = SIZE - 44;
  g.fillStyle(WHITE, 1);
  g.fillRoundedRect(x, y, w, h, 10);
  // Top binder strip (erase a band so the body reads as a page below).
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillRect(x + 4, y + 18, w - 8, 4);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
  // Two binder tabs sticking up.
  g.fillRoundedRect(x + 14, y - 8, 8, 16, 4);
  g.fillRoundedRect(x + w - 22, y - 8, 8, 16, 4);
}

function drawFlag(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Vertical pole.
  g.fillRoundedRect(25, 18, 8, SIZE - 34, 4);
  // Rounded-corner pennant flag (more dynamic).
  g.fillPoints(
    [
      new Phaser.Math.Vector2(33, 20),
      new Phaser.Math.Vector2(74, 33),
      new Phaser.Math.Vector2(74, 34),
      new Phaser.Math.Vector2(33, 52),
    ],
    true
  );
  // Round the flag tip.
  g.fillCircle(74, 33, 5);
  // Ball finial on top of pole.
  g.fillCircle(29, 17, 6);
}

function drawCart(g: Phaser.GameObjects.Graphics): void {
  pen(g, STROKE);
  // Handle + top rail up to the basket.
  g.beginPath();
  g.moveTo(16, 22);
  g.lineTo(26, 22);
  g.lineTo(32, 36);
  g.strokePath();
  // Basket (trapezoid) filled.
  g.fillStyle(WHITE, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(30, 36),
      new Phaser.Math.Vector2(80, 36),
      new Phaser.Math.Vector2(72, 60),
      new Phaser.Math.Vector2(38, 60),
    ],
    true
  );
  // Two wheels.
  g.fillCircle(42, 72, 7);
  g.fillCircle(68, 72, 7);
}

function drawLock(g: Phaser.GameObjects.Graphics): void {
  // Shackle arc on top.
  pen(g, STROKE + 1);
  g.beginPath();
  g.arc(C, 40, 16, Math.PI, Math.PI * 2, false);
  g.strokePath();
  // Vertical legs of the shackle down to the body.
  g.beginPath();
  g.moveTo(C - 16, 40);
  g.lineTo(C - 16, 48);
  g.moveTo(C + 16, 40);
  g.lineTo(C + 16, 48);
  g.strokePath();
  // Rounded body.
  g.fillStyle(WHITE, 1);
  g.fillRoundedRect(26, 46, SIZE - 52, 34, 8);
  // Keyhole (erased).
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillCircle(C, 60, 5);
  g.fillRect(C - 2, 60, 4, 12);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
}

function drawFlame(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Teardrop flame: rounded bottom + pointed top via curve approximation.
  const pts: Phaser.Math.Vector2[] = [];
  const tipY = 20;
  const baseY = 72;
  const bw = 22;
  pts.push(new Phaser.Math.Vector2(C, tipY));
  // Right side curving down and out, then back in.
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const y = tipY + (baseY - tipY) * t;
    const x = C + Math.sin(t * Math.PI) * bw + t * 6;
    pts.push(new Phaser.Math.Vector2(x, y));
  }
  // Bottom curve back.
  for (let t = 1; t >= 0; t -= 0.1) {
    const y = tipY + (baseY - tipY) * t;
    const x = C - Math.sin(t * Math.PI) * bw - t * 2;
    pts.push(new Phaser.Math.Vector2(x, y));
  }
  g.fillPoints(pts, true);
  // Rounded base.
  g.fillCircle(C + 2, baseY - 6, bw - 4);
}

function drawTrophy(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Bowl (cup).
  g.fillPoints(
    [
      new Phaser.Math.Vector2(30, 22),
      new Phaser.Math.Vector2(66, 22),
      new Phaser.Math.Vector2(60, 50),
      new Phaser.Math.Vector2(36, 50),
    ],
    true
  );
  g.fillRoundedRect(30, 20, 36, 8, 4);
  // Side handles (stroked arcs).
  pen(g, STROKE);
  g.beginPath();
  g.arc(30, 32, 11, Phaser.Math.DegToRad(90), Phaser.Math.DegToRad(270), true);
  g.strokePath();
  g.beginPath();
  g.arc(66, 32, 11, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(90), true);
  g.strokePath();
  // Stem.
  g.fillStyle(WHITE, 1);
  g.fillRect(C - 5, 50, 10, 14);
  // Base.
  g.fillRoundedRect(C - 16, 64, 32, 8, 3);
  g.fillRoundedRect(C - 10, 60, 20, 6, 2);
}

function drawMusic(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Note head (ellipse approximated by circle, slightly squashed look).
  g.fillCircle(38, 66, 12);
  // Stem.
  g.fillRect(47, 24, 7, 42);
  // Flag.
  g.fillPoints(
    [
      new Phaser.Math.Vector2(54, 24),
      new Phaser.Math.Vector2(72, 32),
      new Phaser.Math.Vector2(72, 46),
      new Phaser.Math.Vector2(54, 38),
    ],
    true
  );
}

function drawSpeaker(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Box (the magnet body).
  g.fillRoundedRect(22, 40, 14, 16, 3);
  // Cone trapezoid.
  g.fillPoints(
    [
      new Phaser.Math.Vector2(36, 44),
      new Phaser.Math.Vector2(54, 28),
      new Phaser.Math.Vector2(54, 68),
      new Phaser.Math.Vector2(36, 52),
    ],
    true
  );
  // Sound waves (two arcs).
  pen(g, STROKE - 1);
  g.beginPath();
  g.arc(58, C, 12, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(50), false);
  g.strokePath();
  g.beginPath();
  g.arc(58, C, 22, Phaser.Math.DegToRad(-50), Phaser.Math.DegToRad(50), false);
  g.strokePath();
}

function drawVibrate(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Phone rectangle (centered).
  g.fillRoundedRect(C - 13, 26, 26, 44, 6);
  // Screen cutout for depth (erase).
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillRoundedRect(C - 9, 32, 18, 28, 3);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
  // Vibration lines on both sides.
  pen(g, 5);
  g.beginPath();
  g.moveTo(22, 40);
  g.lineTo(22, 56);
  g.moveTo(14, 36);
  g.lineTo(14, 60);
  g.moveTo(SIZE - 22, 40);
  g.lineTo(SIZE - 22, 56);
  g.moveTo(SIZE - 14, 36);
  g.lineTo(SIZE - 14, 60);
  g.strokePath();
}

function drawAd(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  // Screen (rounded rect).
  g.fillRoundedRect(18, 26, SIZE - 36, SIZE - 52, 10);
  // Play triangle inside (erased so it reads as a cut-out).
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillTriangle(C - 10, C - 14, C - 10, C + 14, C + 16, C);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
}

function drawCheck(g: Phaser.GameObjects.Graphics): void {
  // Bold tick: short down-stroke to the low vertex, long up-stroke to the right.
  pen(g, STROKE + 3);
  const w = STROKE + 3;
  const p1 = { x: 26, y: C + 2 };
  const p2 = { x: C - 6, y: SIZE - 28 };
  const p3 = { x: SIZE - 24, y: 28 };
  g.beginPath();
  g.moveTo(p1.x, p1.y);
  g.lineTo(p2.x, p2.y);
  g.lineTo(p3.x, p3.y);
  g.strokePath();
  // Rounded caps/joins.
  g.fillStyle(WHITE, 1);
  const r = w / 2;
  g.fillCircle(p1.x, p1.y, r);
  g.fillCircle(p2.x, p2.y, r);
  g.fillCircle(p3.x, p3.y, r);
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/**
 * Generate (or regenerate) every UI icon texture. Idempotent: each texture is
 * removed first if it already exists, so this can be called on every scene
 * create without leaking or duplicating textures.
 */
export function ensureIcons(scene: Phaser.Scene): void {
  bake(scene, "ic_back", drawBack);
  bake(scene, "ic_gear", drawGear);
  bake(scene, "ic_coin", drawCoin);
  bake(scene, "ic_crown", drawCrown);
  bake(scene, "ic_star", drawStar);
  bake(scene, "ic_star_outline", drawStarOutline);
  bake(scene, "ic_gem", drawGem);
  bake(scene, "ic_hammer", drawHammer);
  bake(scene, "ic_swap", drawSwap);
  bake(scene, "ic_heart", drawHeart);
  bake(scene, "ic_play", drawPlay);
  bake(scene, "ic_calendar", drawCalendar);
  bake(scene, "ic_flag", drawFlag);
  bake(scene, "ic_cart", drawCart);
  bake(scene, "ic_lock", drawLock);
  bake(scene, "ic_flame", drawFlame);
  bake(scene, "ic_trophy", drawTrophy);
  bake(scene, "ic_music", drawMusic);
  bake(scene, "ic_speaker", drawSpeaker);
  bake(scene, "ic_vibrate", drawVibrate);
  bake(scene, "ic_ad", drawAd);
  bake(scene, "ic_bulb", drawBulb);
  bake(scene, "ic_bomb", drawBomb);
  bake(scene, "ic_check", drawCheck);
  bake(scene, "ic_bolt", drawBolt);
  bake(scene, "ic_clock", drawClock);
}

/** A lightning bolt (Power Block / charge meter). */
function drawBolt(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WHITE, 1);
  const pts = [
    new Phaser.Math.Vector2(56, 10),
    new Phaser.Math.Vector2(26, 54),
    new Phaser.Math.Vector2(44, 54),
    new Phaser.Math.Vector2(38, 86),
    new Phaser.Math.Vector2(70, 40),
    new Phaser.Math.Vector2(50, 40),
  ];
  g.fillPoints(pts, true);
}

/** A clock face with hands (Rush mode). */
function drawClock(g: Phaser.GameObjects.Graphics): void {
  pen(g, STROKE);
  g.strokeCircle(C, C, 38);
  g.beginPath();
  g.moveTo(C, C);
  g.lineTo(C, C - 24); // minute hand up
  g.moveTo(C, C);
  g.lineTo(C + 17, C + 8); // hour hand
  g.strokePath();
  g.fillStyle(WHITE, 1);
  g.fillCircle(C, C, 5);
}

/** A classic round bomb: body + fuse cap + spark. */
function drawBomb(g: Phaser.GameObjects.Graphics): void {
  const r = SIZE * 0.27;
  const cy = SIZE * 0.56;
  g.fillStyle(WHITE, 1);
  g.fillCircle(C, cy, r); // body
  g.fillRect(C - 7, cy - r - 7, 14, 12); // fuse cap
  g.lineStyle(5, WHITE, 1); // fuse
  g.beginPath();
  g.moveTo(C + 4, cy - r - 6);
  g.lineTo(C + 15, cy - r - 19);
  g.strokePath();
  g.fillCircle(C + 18, cy - r - 23, 6); // spark
}

/** A light bulb (hint): round glass + a short base, with filament dots. */
function drawBulb(g: Phaser.GameObjects.Graphics): void {
  const r = SIZE * 0.26;
  const cy = SIZE * 0.42;
  g.fillStyle(WHITE, 1);
  g.fillCircle(C, cy, r); // glass
  // neck + base
  g.fillRect(C - r * 0.5, cy + r * 0.6, r, SIZE * 0.16);
  g.fillRect(C - r * 0.42, cy + r * 0.6 + SIZE * 0.16, r * 0.84, SIZE * 0.07);
  g.fillRect(C - r * 0.3, cy + r * 0.6 + SIZE * 0.24, r * 0.6, SIZE * 0.06);
  // carve a small filament hint by punching two darker dots via ERASE
  g.fillStyle(WHITE, 1);
}
