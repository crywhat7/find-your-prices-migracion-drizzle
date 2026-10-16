import { sql } from 'drizzle-orm';
import {
  bigint,
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
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Esquema `find_your_prices` tal como queda después de las migraciones de
 * `src/db/migrations` (hasta 0057). Esas migraciones siguen siendo la fuente de
 * verdad: funciones, triggers, índices, RLS y `pg_cron` viven allá. Este archivo
 * solo describe columnas para que Drizzle pueda consultar con tipos; no se usa
 * para generar migraciones.
 *
 * Convenciones, elegidas para que lo que devuelve Drizzle se parezca a lo que
 * devolvía PostgREST y los servicios no cambien de forma:
 *   - timestamptz → string (`mode: 'string'`).
 *   - numeric y bigint → number (`mode: 'number'`). Ningún monto ni contador
 *     se acerca a 2^53.
 *
 * Vistas y materializadas van con `.existing()`: Drizzle las lee, no las crea.
 */

export const fyp = pgSchema('find_your_prices');

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
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
  legalName: text('legal_name'),
  baseUrl: text('base_url').notNull(),
  logoUrl: text('logo_url'),
  imageAlt: text('image_alt'),
  countryCode: char('country_code', { length: 2 }).notNull().default('HN'),
  defaultCurrency: char('default_currency', { length: 3 }).notNull().default('HNL'),
  defaultLocale: text('default_locale').notNull().default('es-HN'),
  strategyKey: text('strategy_key').notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  requestDelayMs: integer('request_delay_ms').notNull().default(500),
  maxConcurrency: integer('max_concurrency').notNull().default(2),
  requestTimeoutMs: integer('request_timeout_ms').notNull().default(30000),
  maxRetries: integer('max_retries').notNull().default(3),
  userAgent: text('user_agent'),
  respectRobotsTxt: boolean('respect_robots_txt').notNull().default(true),
  isActive: boolean('is_active').notNull().default(true),
  notes: text('notes'),
  ezId: serial('ez_id').unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const scrapeTargets = fyp.table('scrape_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: scrapeTargetKind('kind').notNull().default('category'),
  url: text('url'),
  strategyKey: text('strategy_key'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  frequencyMinutes: integer('frequency_minutes'),
  cronExpression: text('cron_expression'),
  priority: smallint('priority').notNull().default(100),
  maxPages: integer('max_pages'),
  timezone: text('timezone').notNull().default('America/Tegucigalpa'),
  scheduleAnchorAt: ts('schedule_anchor_at'),
  nextRunAt: ts('next_run_at').notNull().defaultNow(),
  lastRunAt: ts('last_run_at'),
  lastSuccessAt: ts('last_success_at'),
  lastStatus: scrapeRunStatus('last_status'),
  consecutiveFailures: integer('consecutive_failures').notNull().default(0),
  failureThreshold: integer('failure_threshold').notNull().default(5),
  isActive: boolean('is_active').notNull().default(true),
  pausedReason: text('paused_reason'),
  notes: text('notes'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const scrapeRuns = fyp.table('scrape_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  targetId: uuid('target_id').references(() => scrapeTargets.id, { onDelete: 'set null' }),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  strategyKey: text('strategy_key').notNull(),
  status: scrapeRunStatus('status').notNull().default('running'),
  triggerSource: scrapeTrigger('trigger_source').notNull().default('cron'),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
  durationMs: integer('duration_ms'),
  pagesFetched: integer('pages_fetched').notNull().default(0),
  itemsFound: integer('items_found').notNull().default(0),
  itemsNew: integer('items_new').notNull().default(0),
  itemsUpdated: integer('items_updated').notNull().default(0),
  itemsUnchanged: integer('items_unchanged').notNull().default(0),
  itemsFailed: integer('items_failed').notNull().default(0),
  itemsDelisted: integer('items_delisted').notNull().default(0),
  priceChanges: integer('price_changes').notNull().default(0),
  httpRequests: integer('http_requests').notNull().default(0),
  httpErrors: integer('http_errors').notNull().default(0),
  bytesDownloaded: count('bytes_downloaded').notNull().default(0),
  errorMessage: text('error_message'),
  errorLog: jsonb('error_log').$type<unknown[]>().notNull().default([]),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: ts('created_at').notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Catálogo canónico (0004, 0031, 0034, 0035)
// -----------------------------------------------------------------------------
export const brands = fyp.table('brands', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').generatedAlwaysAs(
    sql`find_your_prices.normalize_text(name)`,
  ),
  logoUrl: text('logo_url'),
  websiteUrl: text('website_url'),
  aliases: text('aliases').array().notNull().default(sql`'{}'`),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const categories = fyp.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Autorreferencia: el tipo se cae a `any` si se declara con `.references()`.
  parentId: uuid('parent_id'),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon'),
  path: text('path'),
  level: smallint('level').notNull().default(0),
  position: integer('position').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  featuredPosition: integer('featured_position'),
  ezId: serial('ez_id').unique(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const categoryContent = fyp.table(
  'category_content',
  {
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    locale: text('locale').$type<'es' | 'en'>().notNull(),
    title: text('title'),
    metaDescription: text('meta_description'),
    intro: text('intro'),
    body: text('body'),
    keywords: text('keywords').array().notNull().default(sql`'{}'`),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.locale] })],
);

export const storeCategories = fyp.table(
  'store_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    externalParentId: text('external_parent_id'),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    slug: text('slug'),
    url: text('url'),
    level: smallint('level').notNull().default(0),
    position: integer('position'),
    productCount: integer('product_count'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    ezId: serial('ez_id').unique(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('store_categories_store_external_key').on(t.storeId, t.externalId)],
);

export const products = fyp.table('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').unique(),
  canonicalName: text('canonical_name').notNull(),
  normalizedName: text('normalized_name').generatedAlwaysAs(
    sql`find_your_prices.normalize_text(canonical_name)`,
  ),
  brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
  categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  model: text('model'),
  partNumber: text('part_number'),
  gtin: text('gtin'),
  description: text('description'),
  primaryImageUrl: text('primary_image_url'),
  attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
  specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

// -----------------------------------------------------------------------------
// Artículos por tienda (0005, 0021, 0026, 0028, 0031)
// -----------------------------------------------------------------------------
export const storeProducts = fyp.table(
  'store_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),

    externalId: text('external_id').notNull(),
    externalCode: text('external_code'),
    sku: text('sku'),
    mpn: text('mpn'),
    gtin: text('gtin'),
    barcodeRaw: text('barcode_raw'),
    ean: text('ean'),
    upc: text('upc'),
    isbn: text('isbn'),
    asin: text('asin'),
    sellerName: text('seller_name'),
    sellerId: text('seller_id'),

    name: text('name').notNull(),
    normalizedName: text('normalized_name').generatedAlwaysAs(
      sql`find_your_prices.normalize_text(name)`,
    ),
    nameAlias: text('name_alias'),
    slug: text('slug'),
    publicSlug: text('public_slug'),
    url: text('url').notNull(),
    canonicalUrl: text('canonical_url'),
    shortDescription: text('short_description'),
    description: text('description'),
    highlights: text('highlights').array(),

    brandRaw: text('brand_raw'),
    brandId: uuid('brand_id').references(() => brands.id, { onDelete: 'set null' }),
    manufacturer: text('manufacturer'),
    model: text('model'),
    color: text('color'),
    size: text('size'),
    material: text('material'),
    condition: productCondition('condition').notNull().default('new'),
    isAdult: boolean('is_adult').notNull().default(false),

    storeCategoryId: uuid('store_category_id').references(() => storeCategories.id, {
      onDelete: 'set null',
    }),
    categoryRaw: text('category_raw'),
    categoryPath: text('category_path').array(),
    tags: text('tags').array(),

    currency: char('currency', { length: 3 }).notNull().default('HNL'),
    price: money('price'),
    listPrice: money('list_price'),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2, mode: 'number' }),
    discountAmount: money('discount_amount'),
    memberPrice: money('member_price'),
    promoPrice: money('promo_price'),
    installmentPrice: money('installment_price'),
    installmentCount: smallint('installment_count'),
    minPrice: money('min_price'),
    maxPrice: money('max_price'),
    pricePerUnit: numeric('price_per_unit', { precision: 14, scale: 4, mode: 'number' }),
    unitMeasureCode: text('unit_measure_code'),
    unitMeasureName: text('unit_measure_name'),
    unitAmount: numeric('unit_amount', { precision: 12, scale: 3, mode: 'number' }),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2, mode: 'number' }),
    taxIncluded: boolean('tax_included').notNull().default(true),
    priceValidUntil: ts('price_valid_until'),

    availability: availabilityStatus('availability').notNull().default('unknown'),
    inStock: boolean('in_stock'),
    stockQuantity: integer('stock_quantity'),
    minOrderQuantity: integer('min_order_quantity'),
    maxOrderQuantity: integer('max_order_quantity'),
    locationAvailability: jsonb('location_availability').$type<unknown[]>().notNull().default([]),

    ratingAverage: numeric('rating_average', { precision: 3, scale: 2, mode: 'number' }),
    ratingCount: integer('rating_count'),
    reviewCount: integer('review_count'),

    primaryImageUrl: text('primary_image_url'),
    images: jsonb('images').$type<unknown[]>().notNull().default([]),
    imageCount: integer('image_count').notNull().default(0),
    videoUrls: text('video_urls').array(),

    hasFreeShipping: boolean('has_free_shipping'),
    shippingCost: money('shipping_cost'),
    shippingInfo: jsonb('shipping_info').$type<Record<string, unknown>>().notNull().default({}),
    warrantyMonths: smallint('warranty_months'),
    warrantyInfo: jsonb('warranty_info').$type<Record<string, unknown>>().notNull().default({}),
    weightGrams: numeric('weight_grams', { precision: 12, scale: 3, mode: 'number' }),
    lengthMm: numeric('length_mm', { precision: 12, scale: 2, mode: 'number' }),
    widthMm: numeric('width_mm', { precision: 12, scale: 2, mode: 'number' }),
    heightMm: numeric('height_mm', { precision: 12, scale: 2, mode: 'number' }),

    specs: jsonb('specs').$type<Record<string, unknown>>().notNull().default({}),
    attributes: jsonb('attributes').$type<Record<string, unknown>>().notNull().default({}),
    badges: text('badges').array(),
    metaTitle: text('meta_title'),
    metaDescription: text('meta_description'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),

    clickCount: integer('click_count').notNull().default(0),
    lastClickedAt: ts('last_clicked_at'),

    contentHash: text('content_hash'),
    firstSeenAt: ts('first_seen_at').notNull().defaultNow(),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    lastScrapedAt: ts('last_scraped_at').notNull().defaultNow(),
    lastPriceChangeAt: ts('last_price_change_at'),
    lastScrapeRunId: uuid('last_scrape_run_id').references(() => scrapeRuns.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    delistedAt: ts('delisted_at'),

    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('store_products_store_external_key').on(t.storeId, t.externalId)],
);

export const storeProductVariants = fyp.table(
  'store_product_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeProductId: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    sku: text('sku'),
    gtin: text('gtin'),
    barcodeRaw: text('barcode_raw'),
    name: text('name'),
    color: text('color'),
    size: text('size'),
    capacity: text('capacity'),
    options: jsonb('options').$type<Record<string, unknown>>().notNull().default({}),
    currency: char('currency', { length: 3 }),
    price: money('price'),
    listPrice: money('list_price'),
    availability: availabilityStatus('availability').notNull().default('unknown'),
    inStock: boolean('in_stock'),
    stockQuantity: integer('stock_quantity'),
    imageUrl: text('image_url'),
    raw: jsonb('raw').$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('store_product_variants_unique').on(t.storeProductId, t.externalId)],
);

export const priceHistory = fyp.table('price_history', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  storeProductId: uuid('store_product_id')
    .notNull()
    .references(() => storeProducts.id, { onDelete: 'cascade' }),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  scrapeRunId: uuid('scrape_run_id').references(() => scrapeRuns.id, { onDelete: 'set null' }),
  currency: char('currency', { length: 3 }).notNull(),
  price: money('price'),
  listPrice: money('list_price'),
  discountPercent: numeric('discount_percent', { precision: 5, scale: 2, mode: 'number' }),
  memberPrice: money('member_price'),
  promoPrice: money('promo_price'),
  availability: availabilityStatus('availability').notNull().default('unknown'),
  inStock: boolean('in_stock'),
  stockQuantity: integer('stock_quantity'),
  previousPrice: money('previous_price'),
  priceDelta: money('price_delta'),
  priceDeltaPct: numeric('price_delta_pct', { precision: 7, scale: 2, mode: 'number' }),
  scrapedAt: ts('scraped_at').notNull().defaultNow(),
});

export const productMatchCandidates = fyp.table(
  'product_match_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeProductId: uuid('store_product_id')
      .notNull()
      .references(() => storeProducts.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    confidence: numeric('confidence', { precision: 5, scale: 4, mode: 'number' }).notNull(),
    matchedBy: matchMethod('matched_by').notNull(),
    status: matchStatus('status').notNull().default('pending'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull().default({}),
    reviewedAt: ts('reviewed_at'),
    reviewedBy: text('reviewed_by'),
    reviewNotes: text('review_notes'),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('product_match_candidates_unique').on(t.storeProductId, t.productId)],
);

// -----------------------------------------------------------------------------
// Catálogo materializado y apoyo (0030, 0054, 0057)
// -----------------------------------------------------------------------------
export const catalogRefreshLog = fyp.table('catalog_refresh_log', {
  id: boolean('id').primaryKey().default(true),
  refreshedAt: ts('refreshed_at').notNull().defaultNow(),
  durationMs: integer('duration_ms'),
  triggeredBy: text('triggered_by'),
});

export const exchangeRates = fyp.table('exchange_rates', {
  currency: char('currency', { length: 3 }).primaryKey(),
  rateToHnl: numeric('rate_to_hnl', { precision: 14, scale: 6, mode: 'number' }).notNull(),
  source: text('source'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const catalogFeaturedTerms = fyp.table(
  'catalog_featured_terms',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    storeSlug: text('store_slug')
      .notNull()
      .references(() => stores.slug, { onUpdate: 'cascade', onDelete: 'cascade' }),
    pattern: text('pattern').notNull(),
    tier: smallint('tier').notNull(),
    note: text('note'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('catalog_featured_terms_unique').on(t.storeSlug, t.pattern)],
);

/** Copia plana del catálogo público. La refresca `refresh_catalog()`. */
export const mvCatalog = fyp
  .materializedView('mv_catalog', {
    id: uuid('id').notNull(),
    storeId: uuid('store_id').notNull(),
    storeSlug: text('store_slug').notNull(),
    storeName: text('store_name').notNull(),
    storeLogoUrl: text('store_logo_url'),
    productId: uuid('product_id'),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    primaryImageUrl: text('primary_image_url'),
    brand: text('brand'),
    categoryRaw: text('category_raw'),
    storeCategoryName: text('store_category_name'),
    categorySlug: text('category_slug'),
    currency: char('currency', { length: 3 }).notNull(),
    price: money('price'),
    listPrice: money('list_price'),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2, mode: 'number' }),
    memberPrice: money('member_price'),
    availability: availabilityStatus('availability').notNull(),
    inStock: boolean('in_stock'),
    stockQuantity: integer('stock_quantity'),
    ratingAverage: numeric('rating_average', { precision: 3, scale: 2, mode: 'number' }),
    ratingCount: integer('rating_count'),
    gtin: text('gtin'),
    lastSeenAt: ts('last_seen_at').notNull(),
    lastPriceChangeAt: ts('last_price_change_at'),
    firstSeenAt: ts('first_seen_at').notNull(),
    publicSlug: text('public_slug'),
    categoryName: text('category_name'),
    categoryRootSlug: text('category_root_slug'),
    categoryRootName: text('category_root_name'),
    normalizedName: text('normalized_name'),
    storeCategoryId: uuid('store_category_id'),
    categoryId: uuid('category_id'),
    priceHnl: numeric('price_hnl', { mode: 'number' }),
    region: text('region'),
    regionRank: smallint('region_rank').notNull(),
    featuredRank: integer('featured_rank').notNull(),
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
    targetId: uuid('target_id').notNull(),
    targetName: text('target_name').notNull(),
    kind: scrapeTargetKind('kind').notNull(),
    url: text('url'),
    isActive: boolean('is_active').notNull(),
    frequencyMinutes: integer('frequency_minutes'),
    nextRunAt: ts('next_run_at').notNull(),
    lastRunAt: ts('last_run_at'),
    lastSuccessAt: ts('last_success_at'),
    lastStatus: scrapeRunStatus('last_status'),
    consecutiveFailures: integer('consecutive_failures').notNull(),
    pausedReason: text('paused_reason'),
    storeId: uuid('store_id').notNull(),
    storeSlug: text('store_slug').notNull(),
    storeName: text('store_name').notNull(),
    strategyKey: text('strategy_key').notNull(),
    lastRunId: uuid('last_run_id'),
    lastDurationMs: integer('last_duration_ms'),
    lastItemsFound: integer('last_items_found'),
    lastItemsNew: integer('last_items_new'),
    lastItemsUpdated: integer('last_items_updated'),
    lastPriceChanges: integer('last_price_changes'),
    lastErrorMessage: text('last_error_message'),
    storeActiveProducts: count('store_active_products').notNull(),
    scheduleAnchorAt: ts('schedule_anchor_at'),
    priority: smallint('priority').notNull(),
    maxPages: integer('max_pages'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    notes: text('notes'),
  })
  .existing();

export const vCatalogCanonicalCategoryFacets = fyp
  .view('v_catalog_canonical_category_facets', {
    categoryId: uuid('category_id'),
    slug: text('slug'),
    name: text('name'),
    level: smallint('level'),
    position: integer('position'),
    parentId: uuid('parent_id'),
    parentSlug: text('parent_slug'),
    parentName: text('parent_name'),
    parentPosition: integer('parent_position'),
    productCount: count('product_count').notNull(),
    discountedCount: count('discounted_count').notNull(),
    minPrice: money('min_price'),
    maxPrice: money('max_price'),
  })
  .existing();

export const vCatalogStoreFacets = fyp
  .view('v_catalog_store_facets', {
    storeId: uuid('store_id').notNull(),
    storeSlug: text('store_slug').notNull(),
    storeName: text('store_name').notNull(),
    logoUrl: text('logo_url'),
    productCount: count('product_count').notNull(),
    discountedCount: count('discounted_count').notNull(),
    minPrice: numeric('min_price', { mode: 'number' }),
    maxPrice: numeric('max_price', { mode: 'number' }),
  })
  .existing();

export const vCatalogBrandFacets = fyp
  .view('v_catalog_brand_facets', {
    brandName: text('brand_name').notNull(),
    productCount: count('product_count').notNull(),
    minPrice: numeric('min_price', { mode: 'number' }),
    maxPrice: numeric('max_price', { mode: 'number' }),
  })
  .existing();

export const vCatalogSummary = fyp
  .view('v_catalog_summary', {
    totalProducts: count('total_products').notNull(),
    totalStores: count('total_stores').notNull(),
    totalCategories: count('total_categories').notNull(),
    discountedProducts: count('discounted_products').notNull(),
    inStockProducts: count('in_stock_products').notNull(),
    minPrice: numeric('min_price', { mode: 'number' }),
    maxPrice: numeric('max_price', { mode: 'number' }),
    lastSeenAt: ts('last_seen_at'),
  })
  .existing();

export const vCatalogStoreCategoryFacets = fyp
  .view('v_catalog_store_category_facets', {
    storeSlug: text('store_slug').notNull(),
    slug: text('slug').notNull(),
    productCount: count('product_count').notNull(),
    discountedCount: count('discounted_count').notNull(),
  })
  .existing();

// -----------------------------------------------------------------------------
// Aliados (0047, 0049, 0052, 0053)
// -----------------------------------------------------------------------------
export const affiliatePartners = fyp.table('affiliate_partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  websiteUrl: text('website_url').notNull(),
  affiliateUrl: text('affiliate_url'),
  promoCode: text('promo_code'),
  promoTextEs: text('promo_text_es'),
  promoTextEn: text('promo_text_en'),
  taglineEs: text('tagline_es'),
  taglineEn: text('tagline_en'),
  descriptionEs: text('description_es'),
  descriptionEn: text('description_en'),
  logoUrl: text('logo_url'),
  imageAlt: text('image_alt'),
  isActive: boolean('is_active').notNull().default(false),
  isFeatured: boolean('is_featured').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  startsAt: ts('starts_at'),
  endsAt: ts('ends_at'),
  clickCount: count('click_count').notNull().default(0),
  lastClickedAt: ts('last_clicked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const affiliateOffers = fyp.table('affiliate_offers', {
  id: uuid('id').primaryKey().defaultRandom(),
  partnerId: uuid('partner_id')
    .notNull()
    .references(() => affiliatePartners.id, { onDelete: 'cascade' }),
  titleEs: text('title_es').notNull(),
  titleEn: text('title_en'),
  noteEs: text('note_es'),
  noteEn: text('note_en'),
  url: text('url').notNull(),
  imageUrl: text('image_url'),
  price: numeric('price', { precision: 12, scale: 2, mode: 'number' }),
  listPrice: numeric('list_price', { precision: 12, scale: 2, mode: 'number' }),
  currency: text('currency').notNull().default('USD'),
  promoCode: text('promo_code'),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  clickCount: count('click_count').notNull().default(0),
  lastClickedAt: ts('last_clicked_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const affiliateApplications = fyp.table('affiliate_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  storeName: text('store_name').notNull(),
  website: text('website'),
  contactName: text('contact_name').notNull(),
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
  visitorHash: text('visitor_hash'),
});

// -----------------------------------------------------------------------------
// Analítica y bitácora de errores (0048, 0050, 0051)
// -----------------------------------------------------------------------------
export const pageViews = fyp.table('page_views', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdAt: ts('created_at').notNull().defaultNow(),
  path: text('path').notNull(),
  pageType: text('page_type').notNull(),
  locale: text('locale'),
  referrerHost: text('referrer_host'),
  utmSource: text('utm_source'),
  utmMedium: text('utm_medium'),
  utmCampaign: text('utm_campaign'),
  country: text('country'),
  region: text('region'),
  city: text('city'),
  device: text('device').notNull(),
  browser: text('browser'),
  os: text('os'),
  screenWidth: integer('screen_width'),
  visitorHash: text('visitor_hash').notNull(),
  sessionId: text('session_id'),
  isBot: boolean('is_bot').notNull().default(false),
  botName: text('bot_name'),
});

export const affiliateClickEvents = fyp.table('affiliate_click_events', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdAt: ts('created_at').notNull().defaultNow(),
  partnerId: uuid('partner_id')
    .notNull()
    .references(() => affiliatePartners.id, { onDelete: 'cascade' }),
  offerId: uuid('offer_id').references(() => affiliateOffers.id, { onDelete: 'set null' }),
  country: text('country'),
  device: text('device'),
  visitorHash: text('visitor_hash').notNull(),
  isBot: boolean('is_bot').notNull().default(false),
  botName: text('bot_name'),
});

export const errorLogs = fyp.table('error_logs', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  createdAt: ts('created_at').notNull().defaultNow(),
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
  userAgent: text('user_agent'),
  resolvedAt: ts('resolved_at'),
});
