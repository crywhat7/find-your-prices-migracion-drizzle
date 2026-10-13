import type {
  AvailabilityStatus,
  NormalizedCategory,
  NormalizedProduct,
  ScrapeStrategy,
} from '../types';

/**
 * Eneba (https://www.eneba.com): aliado, NO tienda rastreada.
 *
 * Eneba nos manda su catalogo como un export CSV (formato de feed de Google
 * Shopping) y se carga a mano con `npm run eneba:import`. Aca no se descarga
 * nada: este modulo solo traduce el CSV a `NormalizedProduct` para que entre
 * por el mismo runner que el resto (dedupe por external_id, content_hash,
 * price_history, bajas, bitacora y refresco del catalogo).
 *
 * El CSV (export del 2026-10-12, 5000 filas):
 *   id, title, original_title, description, link, image_link, availability,
 *   price, google_product_category, brand, region, condition, identifier_exists
 *
 *   - `id` es el slug del producto en eneba.com y es unico: es el external_id.
 *   - `price` viene como "15.75 USD". La moneda se respeta tal cual (el
 *     catalogo es multimoneda desde 0054); 0.00 es "sin precio publicado" y
 *     coincide con los agotados, asi que se guarda null.
 *   - `google_product_category` es 1279 en todas las filas: no sirve para
 *     clasificar. La categoria se deduce de la plataforma (prefijo del id y
 *     titulo), ver `classifyEneba`.
 *   - `title` trae plataforma y region ("... Steam Key GLOBAL"): dos regiones
 *     del mismo juego son productos distintos, asi que es el nombre;
 *     `original_title` (el nombre limpio) va a name_alias.
 *   - Sin codigos de barras (`identifier_exists` = no).
 *
 * Al enlace de cada producto se le agregan los parametros de afiliado de
 * `stores.config.affiliateParams` (`af_id=findyourprices`, ver 0055).
 */

export const ENEBA_REQUIRED_COLUMNS = [
  'id',
  'title',
  'link',
  'availability',
  'price',
] as const;

/** Categorias propias de Eneba: el CSV no trae ninguna util, se deducen. */
export const ENEBA_CATEGORIES = {
  'pc-games': 'Juegos para PC',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  nintendo: 'Nintendo',
  software: 'Software',
  'gift-cards': 'Tarjetas de regalo',
  'prepaid-crypto': 'Vouchers prepago y cripto',
  'mobile-top-up': 'Recargas y monedas de juego',
} as const;

export type EnebaCategoryKey = keyof typeof ENEBA_CATEGORIES;

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------

/**
 * CSV segun RFC 4180: comillas dobles, "" escapado, saltos de linea dentro de
 * un campo entre comillas, CRLF o LF. Sin dependencias: el export trae
 * descripciones con comas, comillas y saltos de linea.
 */
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Lineas en blanco (la ultima, tipicamente).
  return rows.filter((r) => r.length > 1 || r[0].trim() !== '');
}

// -----------------------------------------------------------------------------
// Campos
// -----------------------------------------------------------------------------

/** "15.75 USD" -> { price: 15.75, currency: 'USD' }. 0 o ilegible -> price null. */
export function parseEnebaPrice(value: string): { price: number | null; currency: string | null } {
  const match = /^\s*([\d.,]+)\s*([A-Za-z]{3})\s*$/.exec(value ?? '');
  if (!match) return { price: null, currency: null };
  const amount = Number(match[1].replace(/,/g, ''));
  return {
    price: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null,
    currency: match[2].toUpperCase(),
  };
}

export function parseEnebaAvailability(value: string): AvailabilityStatus {
  switch ((value ?? '').trim().toLowerCase().replace(/_/g, ' ')) {
    case 'in stock':
      return 'in_stock';
    case 'out of stock':
      return 'out_of_stock';
    case 'preorder':
      return 'preorder';
    case 'backorder':
      return 'backorder';
    default:
      return 'unknown';
  }
}

/** "united_states" -> "United States" */
export function formatRegion(value: string): string | null {
  const clean = (value ?? '').trim();
  if (!clean) return null;
  return clean
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Enlace de afiliado: agrega (o pisa) los parametros, conserva el resto. */
export function withAffiliateParams(link: string, params: Record<string, string>): string {
  try {
    const url = new URL(link);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  } catch {
    return link;
  }
}

function canonicalUrl(link: string): string | null {
  try {
    const url = new URL(link);
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Clasificacion
// -----------------------------------------------------------------------------

const PC_STORES = new Set([
  'steam', 'gog', 'origin', 'ea', 'uplay', 'ubisoft', 'epic', 'blizzard', 'bethesda',
  'rockstar', 'battle', 'windows', 'other',
]);

const SOFTWARE_TITLE =
  /\b(antivirus|internet security|total security|vpn|microsoft (365|office|visual studio)|office 20\d\d|windows (10|11|server)( (home|pro|enterprise|datacenter|standard))?\b(?! store)|kaspersky|norton|avast|avg|eset|bitdefender|mcafee|malwarebytes|f-secure|nordvpn|surfshark|ashampoo|magix|wondershare|autodesk|adobe|corel|easeus|aomei|macrorit|parallels|acronis|nordpass|password manager|alpha academy)/i;

const PREPAID_TITLE =
  /\b(voucher|crypto|paysafecard|neosurf|flexepin|cashlib|rewarble|bitcoin|usdt)\b/i;

/**
 * Categoria propia de un producto de Eneba, por plataforma.
 *
 * El orden importa: las recargas ("Top Up EA FC Mobile") y el software
 * vendido como clave de PC ("Avast ... Avast Key") se resuelven antes que la
 * plataforma, y una gift card de Xbox o PSN se queda en su consola.
 */
export function classifyEneba(id: string, title: string): EnebaCategoryKey {
  const prefix = id.split('-')[0]?.toLowerCase() ?? '';
  const t = title ?? '';

  if (prefix === 'recharge' || /\btop[ -]?up\b/i.test(t) || /^top-up-/.test(id)) return 'mobile-top-up';
  if (prefix === 'xbox' || /\bxbox\b/i.test(t)) return 'xbox';
  if (prefix === 'psn' || /\b(psn|playstation|ps[45])\b/i.test(t)) return 'playstation';
  if (prefix === 'nintendo' || /\bnintendo\b/i.test(t)) return 'nintendo';
  if (prefix === 'microsoft' || SOFTWARE_TITLE.test(t)) return 'software';
  if (PREPAID_TITLE.test(t)) return 'prepaid-crypto';
  if (/\bgift ?card\b/i.test(t) || prefix === 'gift') return 'gift-cards';
  if (PC_STORES.has(prefix) || /\b(steam|gog|origin|ea app|uplay|ubisoft connect|epic games|battle\.net|rockstar|\(pc\))\b/i.test(t)) {
    return 'pc-games';
  }
  // Lo que queda son tarjetas de saldo de comercios y operadoras
  // ("T-Mobile 50 EUR Key GERMANY"): saldo prepago.
  return 'gift-cards';
}

// -----------------------------------------------------------------------------
// Feed -> productos
// -----------------------------------------------------------------------------

export interface EnebaFeedIssue {
  /** Linea del archivo (1 = encabezado). */
  line: number;
  id?: string;
  reason: string;
}

export interface EnebaFeed {
  products: NormalizedProduct[];
  categories: NormalizedCategory[];
  /** Filas descartadas, con motivo. */
  skipped: EnebaFeedIssue[];
  /** Ids repetidos en el archivo: gana la ultima fila. */
  duplicates: string[];
  rows: number;
}

export interface EnebaFeedOptions {
  affiliateParams?: Record<string, string>;
}

/**
 * Traduce el export CSV de Eneba. Lanza si el archivo no tiene las columnas
 * minimas: un CSV equivocado no debe llegar a la base (daria de baja todo).
 */
export function parseEnebaFeed(text: string, options: EnebaFeedOptions = {}): EnebaFeed {
  const table = parseCsv(text);
  if (table.length === 0) throw new Error('El archivo esta vacio');

  // El export trae "id, title, original_title, ...": con espacio tras la coma.
  const header = table[0].map((name) => name.trim().toLowerCase());
  const missing = ENEBA_REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new Error(
      `No parece un export de Eneba: faltan las columnas ${missing.join(', ')}. ` +
        `Encabezado leido: ${header.join(', ')}`,
    );
  }

  const affiliateParams = options.affiliateParams ?? {};
  const byId = new Map<string, NormalizedProduct>();
  const duplicates: string[] = [];
  const skipped: EnebaFeedIssue[] = [];
  const counts = new Map<EnebaCategoryKey, number>();

  for (let index = 1; index < table.length; index += 1) {
    const cells = table[index];
    const line = index + 1;
    const record: Record<string, string> = {};
    header.forEach((name, i) => {
      record[name] = (cells[i] ?? '').trim();
    });

    if (cells.length !== header.length) {
      skipped.push({ line, id: record.id, reason: `tiene ${cells.length} columnas, se esperaban ${header.length}` });
      continue;
    }
    if (!record.id) {
      skipped.push({ line, reason: 'sin id' });
      continue;
    }
    if (!record.title) {
      skipped.push({ line, id: record.id, reason: 'sin titulo' });
      continue;
    }
    if (!/^https?:\/\//i.test(record.link)) {
      skipped.push({ line, id: record.id, reason: 'sin enlace valido' });
      continue;
    }
    const { price, currency } = parseEnebaPrice(record.price);
    if (!currency) {
      skipped.push({ line, id: record.id, reason: `precio ilegible: "${record.price}"` });
      continue;
    }

    const category = classifyEneba(record.id, record.title);
    const availability = parseEnebaAvailability(record.availability);
    const image = /^https?:\/\//i.test(record.image_link ?? '') ? record.image_link : null;
    const alias = record.original_title && record.original_title !== record.title ? record.original_title : null;
    const region = formatRegion(record.region ?? '');

    const product: NormalizedProduct = {
      external_id: record.id,
      name: record.title,
      name_alias: alias,
      slug: record.id,
      url: withAffiliateParams(record.link, affiliateParams),
      canonical_url: canonicalUrl(record.link),
      description: record.description || null,
      brand_raw: record.brand || null,
      condition: record.condition === 'new' ? 'new' : 'unknown',
      store_category_external_id: category,
      category_raw: ENEBA_CATEGORIES[category],
      category_path: [ENEBA_CATEGORIES[category]],
      currency,
      price,
      availability,
      in_stock: availability === 'in_stock' ? true : availability === 'out_of_stock' ? false : null,
      primary_image_url: image,
      images: image ? [{ url: image, position: 0, is_primary: true, alt_text: record.title }] : [],
      tags: region ? [region] : [],
      attributes: {
        ...(region ? { region } : {}),
        ...(record.google_product_category ? { google_product_category: record.google_product_category } : {}),
      },
    };

    if (byId.has(record.id)) duplicates.push(record.id);
    byId.set(record.id, product);
  }

  for (const product of byId.values()) {
    const key = product.store_category_external_id as EnebaCategoryKey;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const categories: NormalizedCategory[] = (Object.keys(ENEBA_CATEGORIES) as EnebaCategoryKey[]).map(
    (key, position) => ({
      external_id: key,
      name: ENEBA_CATEGORIES[key],
      slug: key,
      level: 0,
      position,
      product_count: counts.get(key) ?? 0,
    }),
  );

  return { products: [...byId.values()], categories, skipped, duplicates, rows: table.length - 1 };
}

// -----------------------------------------------------------------------------
// Estrategia
// -----------------------------------------------------------------------------

/**
 * Existe para que la tienda tenga una `strategy_key` valida (el runner y el
 * panel la exigen), no para descargar: el target de Eneba esta inactivo y si
 * alguien lo corre desde el panel, el error dice que hacer.
 */
export const enebaStrategy: ScrapeStrategy = {
  key: 'eneba',
  label: 'Eneba (aliado, carga por CSV)',
  supports: ['full_catalog', 'feed'],
  configSchema: [
    {
      key: 'affiliateParams',
      label: 'Parametros de afiliado',
      example: '{"af_id":"findyourprices"}',
      description: 'Se agregan al enlace de cada producto al importar el CSV.',
    },
  ],
  async run() {
    throw new Error(
      'Eneba no se scrapea: el catalogo llega como CSV del aliado. Importarlo con ' +
        '`npm run eneba:import -- <ruta-del-csv>` (ver scripts/import-eneba.ts).',
    );
  },
};
