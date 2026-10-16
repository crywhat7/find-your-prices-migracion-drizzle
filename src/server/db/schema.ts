import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  boolean,
  char,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  serial,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { isoTimestamp } from './pg';

/**
 * Esquema `find_your_prices` tal como queda después de las migraciones de
 * `src/db/migrations` (hasta 0057). Esas migraciones siguen siendo la fuente de
 * verdad: funciones, triggers, índices, RLS y `pg_cron` viven allá. Este archivo
 * solo describe columnas para que Drizzle pueda consultar con tipos; no se usa
 * para generar migraciones.
 *
 * Convenciones, elegidas para que lo que devuelve Drizzle se parezca a lo que
 * devolvía PostgREST y los servicios no cambien de forma:
 *   - timestamptz → string ISO 8601 (`isoTimestamp`), igual que PostgREST.
 *   - Claves en snake_case, igual que las columnas: una fila de Drizzle es
 *     la misma fila que devolvía `select('*')`.
 *   - numeric y bigint → number (`mode: 'number'`). Ningún monto ni contador
 *     se acerca a 2^53.
 *
 * Vistas y materializadas van con `.existing()`: Drizzle las lee, no las crea.
 */

export const fyp = pgSchema('find_your_prices');

const timestamptz = customType<{ data: string; driverData: string }>({
  dataType: () => 'timestamp with time zone',
  fromDriver: (value) => isoTimestamp(value),
});
const ts = (name: string) => timestamptz(name);
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: 'number' });
const count = (name: string) => bigint(name, { mode: 'number' });

// -----------------------------------------------------------------------------
// Enums (0002)
// -----------------------------------------------------------------------------
export const scrapeTargetKind = fyp.enum('scrape_target_kind', [
  'full_catalog',
  'category',
  'search',
  'product_detail',
  'sitemap',
  'feed',
]);

export const scrapeRunStatus = fyp.enum('scrape_run_status', [
  'queued',
  'running',
  'success',
  'partial',
  'failed',
  'skipped',
  'cancelled',
]);

export const scrapeTrigger = fyp.enum('scrape_trigger', ['cron', 'manual', 'api', 'backfill']);

export const availabilityStatus = fyp.enum('availability_status', [
  'in_stock',
  'out_of_stock',
  'preorder',
  'backorder',
  'limited',
  'discontinued',
  'unknown',
]);

export const productCondition = fyp.enum('product_condition', [
  'new',
  'used',
  'refurbished',
  'open_box',
  'damaged',
  'unknown',
]);

export const matchMethod = fyp.enum('match_method', [
  'gtin',
  'mpn',
  'sku',
  'name_brand',
  'fuzzy_name',
  'embedding',
  'manual',
]);

export const matchStatus = fyp.enum('match_status', ['pending', 'approved', 'rejected', 'auto_approved']);

// -----------------------------------------------------------------------------
// Tiendas y scraping (0003, 0023, 0033, 0034)
// -----------------------------------------------------------------------------
export const stores = fyp.table('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  legal_name: text('legal_name'),
  base_url: text('base_url').notNull(),
  logo_url: text('logo_url'),
  image_alt: text('image_alt'),
  country_code: char('country_code', { length: 2 }).notNull().default('HN'),
  default_currency: char('default_currency', { length: 3 }).notNull().default('HNL'),
  default_locale: text('default_locale').notNull().default('es-HN'),
  strategy_key: text('strategy_key').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  request_delay_ms: integer('request_delay_ms').notNull().default(500),
  max_concurrency: integer('max_concurrency').notNull().default(2),
  request_timeout_ms: integer('request_timeout_ms').notNull().default(30000),
  max_retries: integer('max_retries').notNull().default(3),
  user_agent: text('user_agent'),
  respect_robots_txt: boolean('respect_robots_txt').notNull().default(true),
  is_active: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  ez_id: serial('ez_id').unique(),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const scrapeTargets = fyp.table('scrape_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  store_id: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: scrapeTargetKind('kind').notNull().default('category'),
  url: text('url'),
  strategy_key: text('strategy_key'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  frequency_minutes: integer('frequency_minutes'),
  cron_expression: text('cron_expression'),
  priority: smallint('priority').notNull().default(100),
  max_pages: integer('max_pages'),
  timezone: text('timezone').notNull().default('America/Tegucigalpa'),
  schedule_anchor_at: ts('schedule_anchor_at'),
  next_run_at: ts('next_run_at').notNull().default(sql`now()`),
  last_run_at: ts('last_run_at'),
  last_success_at: ts('last_success_at'),
  last_status: scrapeRunStatus('last_status'),
  consecutive_failures: integer('consecutive_failures').notNull().default(0),
  failure_threshold: integer('failure_threshold').notNull().default(5),
  is_active: boolean('is_active').notNull().default(true),
  paused_reason: text('paused_reason'),
  notes: text('notes'),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const scrapeRuns = fyp.table('scrape_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  target_id: uuid('target_id').references(() => scrapeTargets.id, { onDelete: 'set null' }),
  store_id: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  strategy_key: text('strategy_key').notNull(),
  status: scrapeRunStatus('status').notNull().default('running'),
  trigger_source: scrapeTrigger('trigger_source').notNull().default('cron'),
  started_at: ts('started_at').notNull().default(sql`now()`),
  finished_at: ts('finished_at'),
  duration_ms: integer('duration_ms'),
  pages_fetched: integer('pages_fetched').notNull().default(0),
  items_found: integer('items_found').notNull().default(0),
  items_new: integer('items_new').notNull().default(0),
  items_updated: integer('items_updated').notNull().default(0),
  items_unchanged: integer('items_unchanged').notNull().default(0),
  items_failed: integer('items_failed').notNull().default(0),
  items_delisted: integer('items_delisted').notNull().default(0),
  price_changes: integer('price_changes').notNull().default(0),
  http_requests: integer('http_requests').notNull().default(0),
  http_errors: integer('http_errors').notNull().default(0),
  bytes_downloaded: count('bytes_downloaded').notNull().default(0),
  error_message: text('error_message'),
  error_log: jsonb('error_log').$type<unknown[]>().notNull().default([]),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  created_at: ts('created_at').notNull().default(sql`now()`),
});

// -----------------------------------------------------------------------------
// Catálogo canónico (0004, 0031, 0034, 0035)
// -----------------------------------------------------------------------------
export const brands = fyp.table('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  normalized_name: text('normalized_name').generatedAlwaysAs(
    sql`find_your_prices.normalize_text(name)`,
  ),
  logo_url: text('logo_url'),
  website_url: text('website_url'),
  aliases: text('aliases').array().notNull().default(sql`'{}'`),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const categories = fyp.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Autorreferencia: el tipo se cae a `any` si se declara con `.references()`.
  parent_id: uuid('parent_id'),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  path: text('path'),
  level: smallint('level').notNull().default(0),
  position: integer('position').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  image_url: text('image_url'),
  image_alt: text('image_alt'),
  featured_position: integer('featured_position'),
  ez_id: serial('ez_id').unique(),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const categoryContent = fyp.table(
  'category_content',
  {
    category_id: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<'es' | 'en'>().notNull(),
    title: text('title'),
    meta_description: text('meta_description'),
    intro: text('intro'),
    body: text('body'),
    keywords: text('keywords').array().notNull().default(sql`'{}'`),
    updated_at: ts('updated_at').notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.category_id, t.locale] })],
);

export const storeCategories = fyp.table(
  'store_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    external_id: text('external_id').notNull(),
    external_parent_id: text('external_parent_id'),
    parent_id: uuid('parent_id'),
    name: text('name').notNull(),
    slug: text('slug'),
    url: text('url'),
    level: smallint('level').notNull().default(0),
    position: integer('position'),
    product_count: integer('product_count'),
    category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    is_active: boolean('is_active').notNull().default(true),
    ez_id: serial('ez_id').unique(),
    last_seen_at: ts('last_seen_at').notNull().default(sql`now()`),
    created_at: ts('created_at').notNull().default(sql`now()`),
    updated_at: ts('updated_at').notNull().default(sql`now()`),
  },
  (t) => [unique('store_categories_store_external_key').on(t.store_id, t.external_id)],
);

export const products = fyp.table('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').unique(),
  canonical_name: text('canonical_name').notNull(),
  normalized_name: text('normalized_name').generatedAlwaysAs(
    sql`find_your_prices.normalize_text(canonical_name)`,
  ),
  brand_id: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  model: text('model'),
  part_number: text('part_number'),
  gtin: text('gtin'),
  description: text('description'),
  primary_image_url: text('primary_image_url'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
  specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default({}),
  is_active: boolean('is_active').notNull().default(true),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

// -----------------------------------------------------------------------------
// Artículos por tienda (0005, 0021, 0026, 0028, 0031)
// -----------------------------------------------------------------------------
export const storeProducts = fyp.table(
  'store_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_id: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    product_id: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),

    external_id: text('external_id').notNull(),
    external_code: text('external_code'),
    sku: text('sku'),
    mpn: text('mpn'),
    gtin: text('gtin'),
    barcode_raw: text('barcode_raw'),
    ean: text('ean'),
    upc: text('upc'),
    isbn: text('isbn'),
    asin: text('asin'),
    seller_name: text('seller_name'),
    seller_id: text('seller_id'),

    name: text('name').notNull(),
    normalized_name: text('normalized_name').generatedAlwaysAs(
      sql`find_your_prices.normalize_text(name)`,
    ),
    name_alias: text('name_alias'),
    slug: text('slug'),
    public_slug: text('public_slug'),
    url: text('url').notNull(),
    canonical_url: text('canonical_url'),
    short_description: text('short_description'),
    description: text('description'),
    highlights: text('highlights').array(),

    brand_raw: text('brand_raw'),
    brand_id: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    manufacturer: text('manufacturer'),
    model: text('model'),
    color: text('color'),
    size: text('size'),
    material: text('material'),
    condition: productCondition('condition').notNull().default('new'),
    is_adult: boolean('is_adult').notNull().default(false),

    store_category_id: uuid('store_category_id').references(() => storeCategories.id, {
      onDelete: 'set null',
    }),
    category_raw: text('category_raw'),
    category_path: text('category_path').array(),
    tags: text('tags').array(),

    currency: char('currency', { length: 3 }).notNull().default('HNL'),
    price: money('price'),
    list_price: money('list_price'),
    discount_percent: numeric('discount_percent', { precision: 5, scale: 2, mode: 'number' }),
    discount_amount: money('discount_amount'),
    member_price: money('member_price'),
    promo_price: money('promo_price'),
    installment_price: money('installment_price'),
    installment_count: smallint('installment_count'),
    min_price: money('min_price'),
    max_price: money('max_price'),
    price_per_unit: numeric('price_per_unit', { precision: 14, scale: 4, mode: 'number' }),
    unit_measure_code: text('unit_measure_code'),
    unit_measure_name: text('unit_measure_name'),
    unit_amount: numeric('unit_amount', { precision: 12, scale: 3, mode: 'number' }),
    tax_rate: numeric('tax_rate', { precision: 5, scale: 2, mode: 'number' }),
    tax_included: boolean('tax_included').notNull().default(true),
    price_valid_until: ts('price_valid_until'),

    availability: availabilityStatus('availability').notNull().default('unknown'),
    in_stock: boolean('in_stock'),
    stock_quantity: integer('stock_quantity'),
    min_order_quantity: integer('min_order_quantity'),
    max_order_quantity: integer('max_order_quantity'),
    location_availability: jsonb('location_availability').$type<unknown[]>().notNull().default([]),

    rating_average: numeric('rating_average', { precision: 3, scale: 2, mode: 'number' }),
    rating_count: integer('rating_count'),
    review_count: integer('review_count'),

    primary_image_url: text('primary_image_url'),
    images: jsonb('images').$type<unknown[]>().notNull().default([]),
    image_count: integer('image_count').notNull().default(0),
    video_urls: text('video_urls').array(),

    has_free_shipping: boolean('has_free_shipping'),
    shipping_cost: money('shipping_cost'),
    shipping_info: jsonb('shipping_info').$type<Record<string, unknown>>().notNull().default({}),
    warranty_months: smallint('warranty_months'),
    warranty_info: jsonb('warranty_info').$type<Record<string, unknown>>().notNull().default({}),
    weight_grams: numeric('weight_grams', { precision: 12, scale: 3, mode: 'number' }),
    length_mm: numeric('length_mm', { precision: 12, scale: 2, mode: 'number' }),
    width_mm: numeric('width_mm', { precision: 12, scale: 2, mode: 'number' }),
    height_mm: numeric('height_mm', { precision: 12, scale: 2, mode: 'number' }),

    specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default({}),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    badges: text('badges').array(),
    meta_title: text('meta_title'),
    meta_description: text('meta_description'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),

    click_count: integer('click_count').notNull().default(0),
    last_clicked_at: ts('last_clicked_at'),

    content_hash: text('content_hash'),
    first_seen_at: ts('first_seen_at').notNull().default(sql`now()`),
    last_seen_at: ts('last_seen_at').notNull().default(sql`now()`),
    last_scraped_at: ts('last_scraped_at').notNull().default(sql`now()`),
    last_price_change_at: ts('last_price_change_at'),
    last_scrape_run_id: uuid('last_scrape_run_id').references(() => scrapeRuns.id, {
      onDelete: 'set null',
    }),
    is_active: boolean('is_active').notNull().default(true),
    delisted_at: ts('delisted_at'),

    created_at: ts('created_at').notNull().default(sql`now()`),
    updated_at: ts('updated_at').notNull().default(sql`now()`),
  },
  (t) => [unique('store_products_store_external_key').on(t.store_id, t.external_id)],
);

export const storeProductVariants = fyp.table(
  'store_product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_product_id: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    external_id: text('external_id').notNull(),
    sku: text('sku'),
    gtin: text('gtin'),
    barcode_raw: text('barcode_raw'),
    name: text('name'),
    color: text('color'),
    size: text('size'),
    capacity: text('capacity'),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
    currency: char('currency', { length: 3 }),
    price: money('price'),
    list_price: money('list_price'),
    availability: availabilityStatus('availability').notNull().default('unknown'),
    in_stock: boolean('in_stock'),
    stock_quantity: integer('stock_quantity'),
    image_url: text('image_url'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    is_active: boolean('is_active').notNull().default(true),
    last_seen_at: ts('last_seen_at').notNull().default(sql`now()`),
    created_at: ts('created_at').notNull().default(sql`now()`),
    updated_at: ts('updated_at').notNull().default(sql`now()`),
  },
  (t) => [unique('store_product_variants_unique').on(t.store_product_id, t.external_id)],
);

export const priceHistory = fyp.table('price_history', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  store_product_id: uuid('store_product_id')
    .notNull()
    .references(() => storeProducts.id, { onDelete: 'cascade' }),
  store_id: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  scrape_run_id: uuid('scrape_run_id').references(() => scrapeRuns.id, { onDelete: 'set null' }),
  currency: char('currency', { length: 3 }).notNull(),
  price: money('price'),
  list_price: money('list_price'),
  discount_percent: numeric('discount_percent', { precision: 5, scale: 2, mode: 'number' }),
  member_price: money('member_price'),
  promo_price: money('promo_price'),
  availability: availabilityStatus('availability').notNull().default('unknown'),
  in_stock: boolean('in_stock'),
  stock_quantity: integer('stock_quantity'),
  previous_price: money('previous_price'),
  price_delta: money('price_delta'),
  price_delta_pct: numeric('price_delta_pct', { precision: 7, scale: 2, mode: 'number' }),
  scraped_at: ts('scraped_at').notNull().default(sql`now()`),
});

export const productMatchCandidates = fyp.table(
  'product_match_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    store_product_id: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    confidence: numeric('confidence', { precision: 5, scale: 4, mode: 'number' }).notNull(),
    matched_by: matchMethod('matched_by').notNull(),
    status: matchStatus('status').notNull().default('pending'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    reviewed_at: ts('reviewed_at'),
    reviewed_by: text('reviewed_by'),
    review_notes: text('review_notes'),
    created_at: ts('created_at').notNull().default(sql`now()`),
    updated_at: ts('updated_at').notNull().default(sql`now()`),
  },
  (t) => [unique('product_match_candidates_unique').on(t.store_product_id, t.product_id)],
);

// -----------------------------------------------------------------------------
// Catálogo materializado y apoyo (0030, 0054, 0057)
// -----------------------------------------------------------------------------
export const catalogRefreshLog = fyp.table('catalog_refresh_log', {
  id: boolean('id').primaryKey().default(true),
  refreshed_at: ts('refreshed_at').notNull().default(sql`now()`),
  duration_ms: integer('duration_ms'),
  triggered_by: text('triggered_by'),
});

export const exchangeRates = fyp.table('exchange_rates', {
  currency: char('currency', { length: 3 }).primaryKey(),
  rate_to_hnl: numeric('rate_to_hnl', { precision: 14, scale: 6, mode: 'number' }).notNull(),
  source: text('source'),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const catalogFeaturedTerms = fyp.table(
  'catalog_featured_terms',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    store_slug: text('store_slug')
      .notNull()
      .references(() => stores.slug, { onUpdate: 'cascade', onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    tier: smallint('tier').notNull(),
    note: text('note'),
    updated_at: ts('updated_at').notNull().default(sql`now()`),
  },
  (t) => [unique('catalog_featured_terms_unique').on(t.store_slug, t.pattern)],
);

/**
 * Columnas comunes de `v_store_products_current` y `mv_catalog`: la
 * materializada nació como copia de la vista (0030) y le fue sumando columnas.
 * Es una función porque cada tabla necesita sus propias instancias.
 */
const catalogColumns = () => ({
  id: uuid('id').notNull(),
  store_id: uuid('store_id').notNull(),
  store_slug: text('store_slug').notNull(),
  store_name: text('store_name').notNull(),
  store_logo_url: text('store_logo_url'),
  product_id: uuid('product_id'),
  external_id: text('external_id').notNull(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  primary_image_url: text('primary_image_url'),
  brand: text('brand'),
  category_raw: text('category_raw'),
  store_category_name: text('store_category_name'),
  category_slug: text('category_slug'),
  currency: char('currency', { length: 3 }).notNull(),
  price: money('price'),
  list_price: money('list_price'),
  discount_percent: numeric('discount_percent', { precision: 5, scale: 2, mode: 'number' }),
  member_price: money('member_price'),
  availability: availabilityStatus('availability').notNull(),
  in_stock: boolean('in_stock'),
  stock_quantity: integer('stock_quantity'),
  rating_average: numeric('rating_average', { precision: 3, scale: 2, mode: 'number' }),
  rating_count: integer('rating_count'),
  gtin: text('gtin'),
  last_seen_at: ts('last_seen_at').notNull(),
  last_price_change_at: ts('last_price_change_at'),
  first_seen_at: ts('first_seen_at').notNull(),
  public_slug: text('public_slug'),
  category_name: text('category_name'),
  category_root_slug: text('category_root_slug'),
  category_root_name: text('category_root_name'),
  normalized_name: text('normalized_name'),
});

/** Artículos activos con tienda, marca y categoría resueltas (0026). Respaldo del catálogo y fuente del sitemap. */
export const vStoreProductsCurrent = fyp.view('v_store_products_current', catalogColumns()).existing();

/** Copia plana del catálogo público. La refresca `refresh_catalog()`. */
export const mvCatalog = fyp
  .materializedView('mv_catalog', {
    ...catalogColumns(),
    store_category_id: uuid('store_category_id'),
    category_id: uuid('category_id'),
    price_hnl: numeric('price_hnl', { mode: 'number' }),
    region: text('region'),
    region_rank: smallint('region_rank').notNull(),
    featured_rank: integer('featured_rank').notNull(),
  })
  .existing();

/** Vocabulario del catálogo para el "quizás quisiste decir" (0057). */
export const catalogWords = fyp
  .materializedView('catalog_words', {
    word: text('word').notNull(),
    freq: integer('freq').notNull(),
  })
  .existing();

// -----------------------------------------------------------------------------
// Vistas que lee la app
// -----------------------------------------------------------------------------
export const vScrapeTargetHealth = fyp
  .view('v_scrape_target_health', {
    target_id: uuid('target_id').notNull(),
    target_name: text('target_name').notNull(),
    kind: scrapeTargetKind('kind').notNull(),
    url: text('url'),
    is_active: boolean('is_active').notNull(),
    frequency_minutes: integer('frequency_minutes'),
    next_run_at: ts('next_run_at').notNull(),
    last_run_at: ts('last_run_at'),
    last_success_at: ts('last_success_at'),
    last_status: scrapeRunStatus('last_status'),
    consecutive_failures: integer('consecutive_failures').notNull(),
    paused_reason: text('paused_reason'),
    store_id: uuid('store_id').notNull(),
    store_slug: text('store_slug').notNull(),
    store_name: text('store_name').notNull(),
    strategy_key: text('strategy_key').notNull(),
    last_run_id: uuid('last_run_id'),
    last_duration_ms: integer('last_duration_ms'),
    last_items_found: integer('last_items_found'),
    last_items_new: integer('last_items_new'),
    last_items_updated: integer('last_items_updated'),
    last_price_changes: integer('last_price_changes'),
    last_error_message: text('last_error_message'),
    store_active_products: count('store_active_products').notNull(),
    schedule_anchor_at: ts('schedule_anchor_at'),
    priority: smallint('priority').notNull(),
    max_pages: integer('max_pages'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    notes: text('notes'),
  })
  .existing();

export const vCatalogCanonicalCategoryFacets = fyp
  .view('v_catalog_canonical_category_facets', {
    category_id: uuid('category_id'),
    slug: text('slug'),
    name: text('name'),
    level: smallint('level'),
    position: integer('position'),
    parent_id: uuid('parent_id'),
    parent_slug: text('parent_slug'),
    parent_name: text('parent_name'),
    parent_position: integer('parent_position'),
    product_count: count('product_count').notNull(),
    discounted_count: count('discounted_count').notNull(),
    min_price: money('min_price'),
    max_price: money('max_price'),
  })
  .existing();

export const vCatalogStoreFacets = fyp
  .view('v_catalog_store_facets', {
    store_id: uuid('store_id').notNull(),
    store_slug: text('store_slug').notNull(),
    store_name: text('store_name').notNull(),
    logo_url: text('logo_url'),
    product_count: count('product_count').notNull(),
    discounted_count: count('discounted_count').notNull(),
    min_price: numeric('min_price', { mode: 'number' }),
    max_price: numeric('max_price', { mode: 'number' }),
  })
  .existing();

export const vCatalogBrandFacets = fyp
  .view('v_catalog_brand_facets', {
    brand_name: text('brand_name').notNull(),
    product_count: count('product_count').notNull(),
    min_price: numeric('min_price', { mode: 'number' }),
    max_price: numeric('max_price', { mode: 'number' }),
  })
  .existing();

export const vCatalogSummary = fyp
  .view('v_catalog_summary', {
    total_products: count('total_products').notNull(),
    total_stores: count('total_stores').notNull(),
    total_categories: count('total_categories').notNull(),
    discounted_products: count('discounted_products').notNull(),
    in_stock_products: count('in_stock_products').notNull(),
    min_price: numeric('min_price', { mode: 'number' }),
    max_price: numeric('max_price', { mode: 'number' }),
    last_seen_at: ts('last_seen_at'),
  })
  .existing();

export const vCatalogStoreCategoryFacets = fyp
  .view('v_catalog_store_category_facets', {
    store_slug: text('store_slug').notNull(),
    slug: text('slug').notNull(),
    product_count: count('product_count').notNull(),
    discounted_count: count('discounted_count').notNull(),
  })
  .existing();

// -----------------------------------------------------------------------------
// Aliados (0047, 0049, 0052, 0053)
// -----------------------------------------------------------------------------
export const affiliatePartners = fyp.table('affiliate_partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  website_url: text('website_url').notNull(),
  affiliate_url: text('affiliate_url'),
  promo_code: text('promo_code'),
  promo_text_es: text('promo_text_es'),
  promo_text_en: text('promo_text_en'),
  tagline_es: text('tagline_es'),
  tagline_en: text('tagline_en'),
  description_es: text('description_es'),
  description_en: text('description_en'),
  logo_url: text('logo_url'),
  image_alt: text('image_alt'),
  is_active: boolean('is_active').notNull().default(false),
  is_featured: boolean('is_featured').notNull().default(false),
  sort_order: integer('sort_order').notNull().default(0),
  starts_at: ts('starts_at'),
  ends_at: ts('ends_at'),
  click_count: count('click_count').notNull().default(0),
  last_clicked_at: ts('last_clicked_at'),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const affiliateOffers = fyp.table('affiliate_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  partner_id: uuid('partner_id')
    .notNull()
    .references(() => affiliatePartners.id, { onDelete: 'cascade' }),
  title_es: text('title_es').notNull(),
  title_en: text('title_en'),
  note_es: text('note_es'),
  note_en: text('note_en'),
  url: text('url').notNull(),
  image_url: text('image_url'),
  price: numeric('price', { precision: 12, scale: 2, mode: 'number' }),
  list_price: numeric('list_price', { precision: 12, scale: 2, mode: 'number' }),
  currency: text('currency').notNull().default('USD'),
  promo_code: text('promo_code'),
  is_active: boolean('is_active').notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  click_count: count('click_count').notNull().default(0),
  last_clicked_at: ts('last_clicked_at'),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
});

export const affiliateApplications = fyp.table('affiliate_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  created_at: ts('created_at').notNull().default(sql`now()`),
  updated_at: ts('updated_at').notNull().default(sql`now()`),
  store_name: text('store_name').notNull(),
  website: text('website'),
  contact_name: text('contact_name').notNull(),
  email: text('email').notNull(),
  phone: text('phone'),
  category: text('category'),
  message: text('message'),
  locale: text('locale'),
  status: text('status')
    .$type<'new' | 'contacted' | 'accepted' | 'rejected'>()
    .notNull()
    .default('new'),
  notes: text('notes'),
  visitor_hash: text('visitor_hash'),
});

// -----------------------------------------------------------------------------
// Analítica y bitácora de errores (0048, 0050, 0051)
// -----------------------------------------------------------------------------
export const pageViews = fyp.table('page_views', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  created_at: ts('created_at').notNull().default(sql`now()`),
  path: text('path').notNull(),
  page_type: text('page_type').notNull(),
  locale: text('locale'),
  referrer_host: text('referrer_host'),
  utm_source: text('utm_source'),
  utm_medium: text('utm_medium'),
  utm_campaign: text('utm_campaign'),
  country: text('country'),
  region: text('region'),
  city: text('city'),
  device: text('device').notNull(),
  browser: text('browser'),
  os: text('os'),
  screen_width: integer('screen_width'),
  visitor_hash: text('visitor_hash').notNull(),
  session_id: text('session_id'),
  is_bot: boolean('is_bot').notNull().default(false),
  bot_name: text('bot_name'),
});

export const affiliateClickEvents = fyp.table('affiliate_click_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  created_at: ts('created_at').notNull().default(sql`now()`),
  partner_id: uuid('partner_id')
    .notNull()
    .references(() => affiliatePartners.id, { onDelete: 'cascade' }),
  offer_id: uuid('offer_id').references(() => affiliateOffers.id, { onDelete: 'set null' }),
  country: text('country'),
  device: text('device'),
  visitor_hash: text('visitor_hash').notNull(),
  is_bot: boolean('is_bot').notNull().default(false),
  bot_name: text('bot_name'),
});

export const errorLogs = fyp.table('error_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  created_at: ts('created_at').notNull().default(sql`now()`),
  source: text('source').notNull(),
  level: text('level').$type<'error' | 'warning'>().notNull().default('error'),
  message: text('message').notNull(),
  digest: text('digest'),
  fingerprint: text('fingerprint').notNull(),
  path: text('path'),
  route: text('route'),
  method: text('method'),
  stack: text('stack'),
  context: jsonb('context').$type<Record<string, unknown>>(),
  user_agent: text('user_agent'),
  resolved_at: ts('resolved_at'),
});
