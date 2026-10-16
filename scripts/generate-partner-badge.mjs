// Genera la insignia de tienda aliada a partir del original de
// public/icons/partner_icon.png (apretón de manos en un sello, fondo
// transparente).
//
//   node scripts/generate-partner-badge.mjs
//
// Mismo criterio que generate-brand-assets.mjs: usa `sharp`, las salidas se
// commitean y solo hace falta volver a correrlo si cambia el original. Va
// aparte para no regenerar toda la marca por un ícono.
//
// Salidas:
//   public/brand/partner-badge-{16,32,48}.webp   insignia de 16px (1x/2x/3x)

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public/icons/partner_icon.png");
const OUT = join(ROOT, "public/brand");
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

// El original trae aire alrededor y no es cuadrado: se recorta al sello y se
// centra en un cuadrado para que la caja de 16px sea toda insignia.
const trimmed = await sharp(SRC).ensureAlpha().trim({ threshold: 1 }).png().toBuffer();
const { width, height } = await sharp(trimmed).metadata();
const side = Math.max(width, height);
const square = await sharp(trimmed)
  .extend({
    top: Math.floor((side - height) / 2),
    bottom: Math.ceil((side - height) / 2),
    left: Math.floor((side - width) / 2),
    right: Math.ceil((side - width) / 2),
    background: CLEAR,
  })
  .png()
  .toBuffer();

for (const size of [16, 32, 48]) {
  const buffer = await sharp(square)
    .resize({ width: size, height: size, kernel: "lanczos3" })
    .webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer();
  const file = `partner-badge-${size}.webp`;
  writeFileSync(join(OUT, file), buffer);
  console.log(`${(buffer.length / 1024).toFixed(1).padStart(7)} KB  public/brand/${file}`);
}
