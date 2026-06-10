// Generates PWA / app icons from an inline SVG using sharp.
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");
mkdirSync(outDir, { recursive: true });

// Crystal gem palette (matches src/config.ts COLORS) — one gem per filled cell.
const GEMS = ["#ff3b6e", "#ff8a2b", "#ffc81f", "#22c46b", "#2aa6ff", "#9d5cf5", "#18c6c0"];
// Aurora accent (matches UI.accent).
const AURORA = "#2fe6c4";

/** Lighten a #rrggbb hex toward white by `t` (0..1) — for the gem top facet. */
function lighten(hex, t) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round((((n >> 16) & 255) * (1 - t)) + 255 * t);
  const g = Math.round((((n >> 8) & 255) * (1 - t)) + 255 * t);
  const b = Math.round(((n & 255) * (1 - t)) + 255 * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Build the icon SVG. `inset` is the fraction of padding for maskable safe-zone. */
function svg(size, inset = 0) {
  const pad = size * inset;
  const inner = size - pad * 2;
  // 3x3 mosaic motif (a "tessera" cluster) occupying ~64% of the inner area
  const grid = inner * 0.64;
  const cell = grid / 3;
  const gap = cell * 0.14;
  const gx = pad + (inner - grid) / 2;
  const gy = pad + (inner - grid) / 2;
  // An intentional 7-tile cluster so each crystal gem appears exactly once.
  const pattern = [
    [1, 1, 0],
    [1, 1, 1],
    [0, 1, 1],
  ];
  let blocks = "";
  let defs = "";
  let n = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!pattern[r][c]) continue;
      const x = gx + c * cell + gap / 2;
      const y = gy + r * cell + gap / 2;
      const s = cell - gap;
      const base = GEMS[n % GEMS.length];
      const id = `gem${n}`;
      // Vertical gem gradient: bright facet on top → saturated base below.
      defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${lighten(base, 0.4)}"/><stop offset="0.5" stop-color="${base}"/><stop offset="1" stop-color="${base}"/></linearGradient>`;
      const rx = (s * 0.22).toFixed(1);
      blocks += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${rx}" fill="url(#${id})"/>`;
      // Glossy top highlight.
      blocks += `<rect x="${(x + s * 0.14).toFixed(1)}" y="${(y + s * 0.12).toFixed(1)}" width="${(s * 0.72).toFixed(1)}" height="${(s * 0.26).toFixed(1)}" rx="${(s * 0.13).toFixed(1)}" fill="#ffffff" opacity="0.32"/>`;
      n++;
    }
  }
  const radius = inset > 0 ? 0 : size * 0.22; // full-bleed for maskable
  const glowR = (inner * 0.5).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#16263f"/><stop offset="1" stop-color="#070b16"/>
      </linearGradient>
      <radialGradient id="aurora" cx="0.5" cy="0.42" r="0.62">
        <stop offset="0" stop-color="${AURORA}" stop-opacity="0.42"/>
        <stop offset="1" stop-color="${AURORA}" stop-opacity="0"/>
      </radialGradient>
      ${defs}
    </defs>
    <rect width="${size}" height="${size}" rx="${radius}" fill="url(#bg)"/>
    <circle cx="${(size / 2).toFixed(1)}" cy="${(size * 0.46).toFixed(1)}" r="${glowR}" fill="url(#aurora)"/>
    ${blocks}
  </svg>`;
}

async function render(name, size, inset = 0) {
  await sharp(Buffer.from(svg(size, inset))).png().toFile(resolve(outDir, name));
  console.log("wrote", name);
}

await render("icon-192.png", 192);
await render("icon-512.png", 512);
await render("maskable-512.png", 512, 0.14);
await render("apple-touch-icon.png", 180);
// favicon (32) goes to public/ root
await sharp(Buffer.from(svg(32))).png().toFile(resolve(root, "public/favicon.png"));
console.log("wrote favicon.png");
