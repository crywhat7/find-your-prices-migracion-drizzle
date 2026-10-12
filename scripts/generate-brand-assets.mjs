// Genera todos los derivados de la marca a partir de los dos originales de
// public/icons/: el isotipo (FYP + etiqueta, fondo transparente) y el logo
// completo (con "Find Your Prices", sobre blanco).
//
//   node scripts/generate-brand-assets.mjs
//
// Usa `sharp`, que ya viene instalado con Next. Las salidas se commitean: en
// producción no se procesa ninguna imagen. Volvé a correrlo solo si cambia un
// original.
//
// Salidas:
//   public/brand/fyp-isotipo[-dark]-{96,192,288}.webp   barra de navegación (1x/2x/3x)
//   public/brand/fyp-logo[-dark]-{240,480,720}.webp     pie de página (1x/2x/3x)
//   public/brand/fyp-logo-512.png                       logo del JSON-LD (Google)
//   public/brand/icon-{192,512}.png, icon-maskable-512.png   manifest (PWA)
//   src/app/favicon.ico (16/32/48), icon.png (192), apple-icon.png (180)
//   src/lib/seo/brandMark.ts                            isotipo embebido para la tarjeta OG

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_ISOTIPO = join(ROOT, "public/icons/FYP_Isotipo.png");
const SRC_LOGO = join(ROOT, "public/icons/FYP_Logo.png");
const OUT = join(ROOT, "public/brand");
const APP = join(ROOT, "src/app");

/** La tinta oscura del logo y su reemplazo en el tema oscuro (`--text` de globals.css). */
const INK = [27, 29, 34];
const INK_ON_DARK = [245, 245, 247];
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

mkdirSync(OUT, { recursive: true });

// -----------------------------------------------------------------------------
// Píxeles
// -----------------------------------------------------------------------------

async function rawRgba(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function fromRaw({ data, width, height }) {
  return sharp(data, { raw: { width, height, channels: 4 } });
}

/** Gris oscuro y poco saturado: la tinta de "YP" y de "Find Your". */
function isInk(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max < 110 && max - min < 40;
}

/**
 * Quita el fondo blanco del logo completo ("color a alfa", como en GIMP):
 * cada píxel se interpreta como tinta compuesta sobre blanco y se recupera
 * su color y su opacidad. Los bordes antialiasados quedan limpios sobre
 * cualquier fondo, cosa que un recorte por umbral no logra.
 */
function whiteToAlpha(image) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let alpha = Math.max(255 - r, 255 - g, 255 - b) / 255;
    // El original trae ruido de compresión en el blanco: un velo casi
    // invisible que solo agrega bytes. Se descarta, y lo casi opaco se
    // vuelve opaco por la misma razón.
    if (alpha < 0.1) {
      data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      continue;
    }
    if (alpha > 0.97) alpha = 1;
    data[i] = Math.round(255 - (255 - r) / alpha);
    data[i + 1] = Math.round(255 - (255 - g) / alpha);
    data[i + 2] = Math.round(255 - (255 - b) / alpha);
    data[i + 3] = Math.round(alpha * 255);
  }
  return image;
}

/**
 * Pinta la tinta con `color`. Con `boost` además la vuelve opaca: tras
 * `whiteToAlpha` el casi-negro queda al ~89 % de opacidad, y sobre fondo
 * oscuro eso se lee lavado.
 */
function recolorInk(image, color, { boost = false } = {}) {
  const { data } = image;
  const inkAlpha = 1 - Math.min(...INK) / 255; // opacidad de la tinta pura tras whiteToAlpha
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0 || !isInk(data[i], data[i + 1], data[i + 2])) continue;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    if (boost) {
      const boosted = Math.round(data[i + 3] / inkAlpha);
      data[i + 3] = boosted > 235 ? 255 : Math.min(255, boosted);
    }
  }
  return image;
}

function clone(image) {
  return { ...image, data: Buffer.from(image.data) };
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

const written = [];

/**
 * `quality`/`alphaQuality`: el isotipo va arriba en la barra y se ve a cada
 * rato, así que conserva el alfa sin pérdida; el logo completo va en el pie
 * y a 80/60 es visualmente igual y pesa la mitad.
 */
async function webp(image, width, file, { quality = 88, alphaQuality = 100 } = {}) {
  const buffer = await fromRaw(image)
    .resize({ width, kernel: "lanczos3" })
    .webp({ quality, alphaQuality, effort: 6, smartSubsample: true })
    .toBuffer();
  writeFileSync(join(OUT, file), buffer);
  written.push([`public/brand/${file}`, buffer.length]);
}

async function png(pipeline, path, label) {
  const buffer = await pipeline.png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 }).toBuffer();
  writeFileSync(path, buffer);
  written.push([label, buffer.length]);
  return buffer;
}

/**
 * Isotipo centrado en una placa cuadrada.
 *
 * `inset` es la fracción del lado que ocupa el isotipo a lo ancho; `radius`
 * la del redondeo (0 = cuadrado entero, para iOS y maskable, que recortan
 * por su cuenta). La placa es blanca: el isotipo tiene tinta oscura y en una
 * barra de pestañas oscura sin placa desaparecería.
 */
async function squareIcon(isotipo, size, { inset, radius }) {
  const markWidth = Math.round(size * inset);
  const mark = await fromRaw(isotipo).resize({ width: markWidth, kernel: "lanczos3" }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  const r = Math.round(size * radius);
  const plate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(plate)
    .composite([
      {
        input: mark,
        left: Math.round((size - markWidth) / 2),
        top: Math.round((size - meta.height) / 2),
      },
    ])
    .png();
}

/** ICO con entradas PNG: lo entiende todo navegador desde hace más de una década. */
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dir = entries.map(({ size, buffer }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buffer.length;
    return e;
  });
  return Buffer.concat([header, ...dir, ...entries.map((entry) => entry.buffer)]);
}

// -----------------------------------------------------------------------------
// Isotipo
// -----------------------------------------------------------------------------

const isotipoTrimmed = await sharp(SRC_ISOTIPO).ensureAlpha().trim({ threshold: 1 }).png().toBuffer();
const isotipo = await rawRgba(isotipoTrimmed);
const isotipoDark = recolorInk(clone(isotipo), INK_ON_DARK);
console.log(`isotipo: ${isotipo.width}x${isotipo.height}`);

for (const width of [96, 192, 288]) {
  await webp(isotipo, width, `fyp-isotipo-${width}.webp`);
  await webp(isotipoDark, width, `fyp-isotipo-dark-${width}.webp`);
}

// -----------------------------------------------------------------------------
// Logo completo
// -----------------------------------------------------------------------------

const logoTrimmed = await sharp(SRC_LOGO)
  .flatten({ background: WHITE })
  .trim({ background: "#ffffff", threshold: 18 })
  .png()
  .toBuffer();
const logoOpaque = await rawRgba(logoTrimmed);
const logoCut = whiteToAlpha(clone(logoOpaque));
const logoLight = recolorInk(clone(logoCut), INK, { boost: true });
const logoDark = recolorInk(clone(logoCut), INK_ON_DARK, { boost: true });
console.log(`logo recortado: ${logoOpaque.width}x${logoOpaque.height}`);

const LOGO_WEBP = { quality: 80, alphaQuality: 60 };
for (const width of [240, 480, 720]) {
  await webp(logoLight, width, `fyp-logo-${width}.webp`, LOGO_WEBP);
  await webp(logoDark, width, `fyp-logo-dark-${width}.webp`, LOGO_WEBP);
}

// Logo del JSON-LD: cuadrado, sobre blanco, con aire. Google lo muestra en
// el panel de la entidad y pide al menos 112×112; PNG porque es lo que todo
// lector de datos estructurados acepta sin preguntar.
{
  const size = 512;
  const inner = Math.round(size * 0.84);
  const mark = await sharp(logoTrimmed).resize({ width: inner, height: inner, fit: "inside" }).png().toBuffer();
  const meta = await sharp(mark).metadata();
  await png(
    sharp({ create: { width: size, height: size, channels: 4, background: WHITE } }).composite([
      { input: mark, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) },
    ]),
    join(OUT, "fyp-logo-512.png"),
    "public/brand/fyp-logo-512.png",
  );
}

// -----------------------------------------------------------------------------
// Íconos
// -----------------------------------------------------------------------------

// Favicon: el isotipo casi a ras de la placa. A 16 px cada píxel de aire es
// un píxel menos de letra.
const icoEntries = [];
for (const size of [16, 32, 48]) {
  const buffer = await (await squareIcon(isotipo, size, { inset: 0.94, radius: 0.2 }))
    .png({ compressionLevel: 9 })
    .toBuffer();
  icoEntries.push({ size, buffer });
}
const icoBuffer = ico(icoEntries);
writeFileSync(join(APP, "favicon.ico"), icoBuffer);
written.push(["src/app/favicon.ico", icoBuffer.length]);

await png(await squareIcon(isotipo, 192, { inset: 0.86, radius: 0.2 }), join(APP, "icon.png"), "src/app/icon.png");
// iOS redondea solo y no admite transparencia: cuadrado blanco entero.
await png(await squareIcon(isotipo, 180, { inset: 0.8, radius: 0 }), join(APP, "apple-icon.png"), "src/app/apple-icon.png");

for (const size of [192, 512]) {
  await png(await squareIcon(isotipo, size, { inset: 0.86, radius: 0.2 }), join(OUT, `icon-${size}.png`), `public/brand/icon-${size}.png`);
}
// Maskable: Android recorta hasta un círculo del 80 % del lado. Al 68 % de
// ancho, las esquinas del isotipo caen dentro de ese círculo.
await png(
  await squareIcon(isotipo, 512, { inset: 0.68, radius: 0 }),
  join(OUT, "icon-maskable-512.png"),
  "public/brand/icon-maskable-512.png",
);

// -----------------------------------------------------------------------------
// Tarjeta OG: el isotipo claro (para fondo oscuro) como data URI. Satori no
// lee WebP ni archivos de /public en el servidor, así que va embebido en PNG.
// -----------------------------------------------------------------------------

{
  const buffer = await fromRaw(isotipoDark)
    .resize({ width: 420, kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: true, quality: 95, effort: 10 })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  const source = `// Generado por scripts/generate-brand-assets.mjs. No editar a mano.

/** Isotipo de Find Your Prices (variante para fondo oscuro), PNG en data URI. */
export const BRAND_MARK_DARK = "data:image/png;base64,${buffer.toString("base64")}";

/** Proporciones del isotipo, para fijar \`width\`/\`height\` sin deformarlo. */
export const BRAND_MARK_SIZE = { width: ${meta.width}, height: ${meta.height} } as const;
`;
  writeFileSync(join(ROOT, "src/lib/seo/brandMark.ts"), source);
  written.push(["src/lib/seo/brandMark.ts", source.length]);
}

for (const [file, bytes] of written) console.log(`${(bytes / 1024).toFixed(1).padStart(7)} KB  ${file}`);
