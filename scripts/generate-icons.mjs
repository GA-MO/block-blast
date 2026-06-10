// Generates PWA / app icons from an inline SVG using sharp.
// Run: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "public/icons");
mkdirSync(outDir, { recursive: true });

const COLORS = ["#ff5b5b", "#ff9d3a", "#ffd84d", "#5bd66b", "#4db8ff", "#9b6bff", "#43e0d0"];

/** Build the icon SVG. `inset` is the fraction of padding for maskable safe-zone. */
function svg(size, inset = 0) {
  const pad = size * inset;
  const inner = size - pad * 2;
  // 3x3 block motif occupying ~64% of the inner area, centered
  const grid = inner * 0.64;
  const cell = grid / 3;
  const gap = cell * 0.12;
  const gx = pad + (inner - grid) / 2;
  const gy = pad + (inner - grid) / 2;
  // a pleasing fixed pattern of filled cells (block-puzzle look)
  const pattern = [
    [1, 1, 0],
    [0, 1, 1],
    [1, 0, 1],
  ];
  let blocks = "";
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (!pattern[r][c]) continue;
      const x = gx + c * cell + gap / 2;
      const y = gy + r * cell + gap / 2;
      const s = cell - gap;
      const color = COLORS[(r * 3 + c) % COLORS.length];
      blocks += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.18).toFixed(1)}" fill="${color}"/>`;
    }
  }
  const radius = inset > 0 ? 0 : size * 0.22; // full-bleed for maskable
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a5fe0"/><stop offset="1" stop-color="#2a3170"/>
    </linearGradient></defs>
    <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)"/>
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
