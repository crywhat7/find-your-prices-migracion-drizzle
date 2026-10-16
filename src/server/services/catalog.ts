import 'server-only';
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, like, lte, notInArray, notLike, or, sql, type SQL } from 'drizzle-orm';
import { getDb, hasDatabaseConfig } from '@/server/db/client';
import { rpc } from '@/server/db/rpc';
import { pgErrorMessage } from '@/server/db/pg';
import {
  categories,
  exchangeRates,
  mvCatalog as m,
  priceHistory,
  storeCategories,
  storeProducts,
  storeProductVariants,
  stores,
  vCatalogBrandFacets,
  vCatalogCanonicalCategoryFacets,
  vCatalogStoreFacets,
  vCatalogSummary,
} from '@/server/db/schema';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { wordsToTsQuery } from '@/server/services/searchSynonyms';
import type { AvailabilityStatus } from '@/server/scraping/types';
import type { Product } from '@/types';
import {
  buildCategoryTree,
  UNCATEGORIZED_VALUE,
  type CanonicalCategoryFacetRow,
  type FacetOption,
} from '@/features/products/categoryFacets';

/**
 * Lectura del catálogo público.
 *
 * Lee de `mv_catalog` (migración 0030), la copia materializada e indexada de
 * `v_store_products_current`: tienda, marca y categoría ya resueltas, solo
 * activos. Cada lectura es sobre una tabla plana; el costo de los joins se
 * paga una vez por refresco, que dispara el runner al terminar el scraping.
 *
 * Punto importante de diseño: el catálogo son miles de artículos y no se
 * mandan todos al navegador. La página sirve un primer lote curado y tanto la
 * búsqueda como los filtros se resuelven en Postgres.
 *
 * El esquema de Drizzle (`server/db/schema.ts`) supone la base al día, con
 * las migraciones hasta la 0057. Las capas de compatibilidad que tenía este
 * servicio para despliegues anteriores a una migración (leer de la vista si
 * faltaba la materializada, dejar de pedir una columna que la vista no
 * publicaba) se fueron con supabase-js: la base ya tiene todo eso, y la de
 * Hetzner llega por un dump completo.
 */

/** Fila cruda de la vista de listado. */
interface CatalogRow {
  id: string;
  public_slug: string | null;
  store_slug: string;
  store_name: string;
  name: string;
  url: string | null;
  primary_image_url: string | null;
  brand: string | null;
  category_raw: string | null;
  store_category_name: string | null;
  /** Nodo canónico de `categories`, si el mapeo ya existe (migración 0024). */
  category_slug?: string | null;
  category_name?: string | null;
  currency: string;
  price: number | null;
  list_price: number | null;
  discount_percent: number | null;
  availability: AvailabilityStatus;
  in_stock: boolean | null;
  rating_average: number | null;
  rating_count: number | null;
}

/**
 * Estados de disponibilidad que sacan un artículo del catálogo por defecto.
 *
 * `out_of_stock` y `discontinued` son las dos formas explícitas de "no lo podés
 * comprar". `unknown` NO está en la lista, y es deliberado: cuando el scraper
 * no logró determinar la existencia, esconder el artículo sería tratar un vacío
 * de información como una respuesta negativa. En Diunsa eso solo dejaría fuera
 * miles de artículos que sí están a la venta.
 */
const UNAVAILABLE_STATES: AvailabilityStatus[] = ['out_of_stock', 'discontinued'];

/**
 * El piso de "esto se puede comprar hoy" que se aplica salvo que alguien pida
 * lo contrario: precio real —mayor que cero— y disponibilidad que no sea una
 * negativa explícita.
 *
 * Vive en una función y no repetido en cada consulta porque lo usan el listado,
 * el conteo y las sugerencias. Si no filtran igual, el selector ofrece
 * "Televisores (120)" y la búsqueda devuelve 90.
 */
function availabilityFloor(): SQL {
  return and(gt(m.price, 0), notInArray(m.availability, UNAVAILABLE_STATES)) as SQL;
}

/** Las columnas de `mv_catalog` que pinta una tarjeta. */
const LIST_COLUMNS = {
  id: m.id,
  public_slug: m.public_slug,
  store_slug: m.store_slug,
  store_name: m.store_name,
  name: m.name,
  url: m.url,
  primary_image_url: m.primary_image_url,
  brand: m.brand,
  category_raw: m.category_raw,
  store_category_name: m.store_category_name,
  category_slug: m.category_slug,
  category_name: m.category_name,
  currency: m.currency,
  price: m.price,
  list_price: m.list_price,
  discount_percent: m.discount_percent,
  availability: m.availability,
  in_stock: m.in_stock,
  rating_average: m.rating_average,
  rating_count: m.rating_count,
};

/**
 * Precio de referencia en lempiras (migración 0054). El catálogo es
 * multimoneda —Eneba publica en dólares— y ordenar o filtrar por `price`
 * mezclaría L 300 con US$ 15. La tarjeta sigue mostrando `price` en su
 * moneda; esto solo decide el orden y el filtro de precio.
 */
const REFERENCE_PRICE = m.price_hnl;

/**
 * Órdenes que respetan el nivel de región (`region_rank`, 0056) y lo
 * destacado a mano (`featured_rank`, 0057) antes que su propia clave. Los de
 * precio y nombre no: quien pide "menor precio" ve lo más barato.
 *
 * `region_rank`: 0 sin región, GLOBAL, LATAM o UNITED STATES; 1 cualquier otra.
 * Eneba vende la misma clave por región y la de Brasil o Turquía, que casi
 * nunca se puede canjear acá, suele ser la más barata.
 *
 * `featured_rank`: el CSV de Eneba no trae descuento ni ventas, y sin esto el
 * desempate era el slug —orden alfabético—. La lista vive en
 * `catalog_featured_terms`, no acá.
 */
const REGION_FIRST_SORTS: ReadonlySet<CatalogSort> = new Set(['relevance', 'newest', 'discount', 'rating']);

/** Etiquetas de disponibilidad por idioma. El componente solo pinta el texto. */
const AVAILABILITY_LABELS: Record<'es' | 'en', Partial<Record<AvailabilityStatus, string>>> = {
  es: {
    in_stock: 'Disponible',
    limited: 'Últimas unidades',
    out_of_stock: 'Agotado',
    preorder: 'Preventa',
    backorder: 'Bajo pedido',
    discontinued: 'Descontinuado',
  },
  en: {
    in_stock: 'In stock',
    limited: 'Low stock',
    out_of_stock: 'Out of stock',
    preorder: 'Preorder',
    backorder: 'Backorder',
    discontinued: 'Discontinued',
  },
};

export type CatalogLocale = 'es' | 'en';

function toProduct(row: CatalogRow, locale: CatalogLocale): Product {
  return {
    id: row.id,
    slug: row.public_slug ?? undefined,
    name: row.name,
    price: row.price ?? 0,
    currency: row.currency,
    store: row.store_name,
    storeSlug: row.store_slug,
    // Primero la canónica (árbol propio de `categories`): es lo que el filtro
    // ofrece, así que la tarjeta tiene que decir lo mismo. Sin mapeo aún, la
    // de la tienda, que es más específica que la cruda.
    category:
      row.category_name ?? row.store_category_name ?? row.category_raw ?? 'Sin categoría',
    categorySlug: row.category_slug ?? undefined,
    storeCategory: row.store_category_name ?? row.category_raw ?? undefined,
    imageUrl: row.primary_image_url ?? undefined,
    availability: AVAILABILITY_LABELS[locale][row.availability],
    // La marca es el subtítulo natural: los nombres de Diunsa vienen truncados
    // a 40 caracteres y una descripción larga no aporta en una fila de lista.
    description: row.brand ?? undefined,
    url: row.url ?? undefined,
    brand: row.brand ?? undefined,
    listPrice: row.list_price ?? undefined,
    discountPercent: row.discount_percent ?? undefined,
    inStock: row.in_stock ?? undefined,
    ratingAverage: row.rating_average ?? undefined,
    ratingCount: row.rating_count ?? undefined,
  };
}

// -----------------------------------------------------------------------------
// Fallos transitorios
// -----------------------------------------------------------------------------

/**
 * Si hay base configurada. Sin las variables (pruebas, desarrollo, un clon
 * recién bajado) el catálogo trabaja con el fixture a propósito; con ellas, un
 * fallo es un fallo y se propaga.
 *
 * En producción la falta de base no es un modo: es un error, y lanza. Pasó el
 * 13-oct-2026: el build de Cloudflare corría sin las variables de Supabase,
 * armaba la portada con el fixture ("Wireless Mouse", Amazon) y `/tiendas` con
 * "0 artículos de 0 tiendas", y el deploy subía esas páginas a la caché de R2,
 * que las servía a todos hasta que vencían. Lanzando, el build falla y
 * producción se queda con la versión anterior; en tiempo de ejecución, la
 * página conserva su última copia buena.
 */
export function hasDatabase(): boolean {
  if (hasDatabaseConfig()) return true;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Falta DATABASE_URL en un build de producción: sin base, las páginas saldrían vacías y quedarían en caché. ' +
        'En Cloudflare va en Settings → Build → Variables; en el Worker ya en marcha la conexión sale de Hyperdrive.',
    );
  }
  return false;
}

/**
 * Reintenta una lectura que falló por algo pasajero: red caída un instante,
 * una conexión que el pooler cortó, el arranque en frío de Hyperdrive. Tres intentos con
 * espera creciente cubren casi todo eso sin sumar más de un segundo.
 *
 * POR QUÉ EXISTE. Estas lecturas alimentan páginas con `revalidate`. Si la
 * regeneración de fondo devolvía "vacío" en vez de fallar, Next cacheaba la
 * portada con el fixture de muestra y la servía cinco minutos a todo el
 * mundo, hasta la siguiente regeneración. Nadie veía el error: veían
 * artículos de mentira. Ahora se reintenta, y si aun así falla, se lanza:
 * Next conserva la última versión buena en vez de reemplazarla por una mala.
 */
export async function withRetry<T>(label: string, action: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  }
  // La causa de Postgres, no el "Failed query: <sql>" de Drizzle, que no dice qué falló.
  throw new Error(`${label}: ${pgErrorMessage(lastError)}`);
}

// -----------------------------------------------------------------------------
// Facetas
// -----------------------------------------------------------------------------

export type { FacetOption };

export interface CatalogFacets {
  /**
   * Árbol de categorías canónicas: raíces con sus hijas, y al final la opción
   * `UNCATEGORIZED_VALUE` si hay artículos sin mapeo. Ver `categoryFacets.ts`.
   */
  categories: FacetOption[];
  stores: FacetOption[];
  brands: FacetOption[];
  minPrice: number;
  maxPrice: number;
  totalProducts: number;
  totalStores: number;
  totalCategories: number;
  discountedProducts: number;
}

const EMPTY_FACETS: CatalogFacets = {
  categories: [],
  stores: [],
  brands: [],
  minPrice: 0,
  maxPrice: 0,
  totalProducts: 0,
  totalStores: 0,
  totalCategories: 0,
  discountedProducts: 0,
};

/**
 * Opciones de filtro que de verdad devuelven algo.
 *
 * Se derivan de los productos existentes, NO de la tabla de categorías
 * entera. La diferencia no es cosmética: un árbol tiene nodos que nunca
 * reciben productos, y armar el selector con todos ofrecía decenas de
 * categorías que devolvían cero resultados.
 *
 * Las categorías son las canónicas (`categories`, el árbol propio del sitio),
 * no las de cada tienda: "Juguetes", "Juguetería" y "Juguetes para jugar" son
 * una sola opción. Lo que aún no tiene mapeo cae en "Sin categorizar aún".
 */
export async function getCatalogFacets(): Promise<CatalogFacets> {
  if (!hasDatabase()) return EMPTY_FACETS;
  return withRetry('facetas del catálogo', async () => {
    const db = getDb();

    const [categoryRows, storeRows, brandRows, [totals]] = await Promise.all([
      db
        .select({
          slug: vCatalogCanonicalCategoryFacets.slug,
          name: vCatalogCanonicalCategoryFacets.name,
          parent_slug: vCatalogCanonicalCategoryFacets.parent_slug,
          parent_name: vCatalogCanonicalCategoryFacets.parent_name,
          product_count: vCatalogCanonicalCategoryFacets.product_count,
        })
        .from(vCatalogCanonicalCategoryFacets),
      db
        .select({ store_name: vCatalogStoreFacets.store_name, product_count: vCatalogStoreFacets.product_count })
        .from(vCatalogStoreFacets),
      db
        .select({ brand_name: vCatalogBrandFacets.brand_name, product_count: vCatalogBrandFacets.product_count })
        .from(vCatalogBrandFacets)
        .orderBy(desc(vCatalogBrandFacets.product_count))
        .limit(300)
        // Las marcas son un extra del filtro: sin ellas el catálogo sigue.
        .catch(() => []),
      db.select().from(vCatalogSummary),
    ]);

    const toOptions = (rows: unknown[], key: string): FacetOption[] =>
      (rows as Record<string, unknown>[])
        .map((row) => ({ value: String(row[key] ?? ''), count: Number(row.product_count ?? 0) }))
        .filter((option) => option.value !== '' && option.count > 0)
        .sort((a, b) => b.count - a.count);

    return {
      categories: buildCategoryTree(toCategoryRows(categoryRows)),
      stores: toOptions(storeRows, 'store_name'),
      brands: toOptions(brandRows, 'brand_name'),
      minPrice: Number(totals?.min_price ?? 0),
      maxPrice: Number(totals?.max_price ?? 0),
      totalProducts: Number(totals?.total_products ?? 0),
      totalStores: Number(totals?.total_stores ?? 0),
      totalCategories: Number(totals?.total_categories ?? 0),
      discountedProducts: Number(totals?.discounted_products ?? 0),
    };
  });
}

/** Filas de `v_catalog_canonical_category_facets` con tipos ya fijados. */
function toCategoryRows(rows: unknown[]): CanonicalCategoryFacetRow[] {
  return (rows as Record<string, unknown>[]).map((row) => ({
    slug: (row.slug as string | null) ?? null,
    name: (row.name as string | null) ?? null,
    parentSlug: (row.parent_slug as string | null) ?? null,
    parentName: (row.parent_name as string | null) ?? null,
    count: Number(row.product_count ?? 0),
  }));
}

// -----------------------------------------------------------------------------
// Listado y búsqueda
// -----------------------------------------------------------------------------

export type CatalogSort =
  | 'newest'
  | 'relevance'
  | 'price-asc'
  | 'price-desc'
  | 'discount'
  | 'name-asc'
  | 'rating';

export interface SearchCatalogParams {
  query?: string;
  /**
   * Un valor o varios. Varios se resuelven con `in (...)`, así que las
   * casillas del panel pueden prometer "marcá varias" sin mentir. Vacío o
   * `undefined` es "sin filtro".
   */
  store?: string | string[];
  /**
   * Slug de la tienda (`stores.slug`), uno o varios. Lo usan las landings de
   * tienda (`/tiendas/<tienda>`), donde el alcance es fijo y viaja por la URL
   * como slug, no como nombre comercial.
   */
  storeSlug?: string | string[];
  /**
   * Slugs de `categories`. Una raíz abarca a sus hijas. `UNCATEGORIZED_VALUE`
   * pide lo que aún no tiene mapeo canónico.
   */
  category?: string | string[];
  /** Nombre de la categoría de la tienda, tal cual. Lo usan los relacionados. */
  storeCategory?: string | string[];
  brand?: string | string[];
  minPrice?: number;
  maxPrice?: number;
  onlyDiscounted?: boolean;
  /**
   * Traer también lo que no se puede comprar hoy: agotados, descontinuados y
   * artículos con precio 0.
   *
   * El default es `false`, y esa es la decisión de producto: un comparador de
   * precios que abre mostrando cosas agotadas o a "L 0.00" está gastando la
   * primera pantalla —la única que casi todo el mundo mira— en resultados que
   * no responden la pregunta que trajo a la persona. Un precio 0 además no es
   * una ganga: es un dato que la tienda no publicó y que el scraper anotó como
   * cero.
   *
   * Se puede desactivar, y por eso existe la bandera en vez de un filtro
   * cableado: quien está siguiendo un artículo agotado para saber cuándo vuelve
   * tiene un motivo legítimo para verlo. Pero lo tiene que pedir.
   */
  includeUnavailable?: boolean;
  sort?: CatalogSort;
  limit?: number;
  offset?: number;
  locale?: CatalogLocale;
  /**
   * Pedir también el total de filas que cumplen los filtros.
   *
   * El total es un `count(*)` aparte sobre toda la vista filtrada: con miles
   * de artículos y búsqueda por texto, cuesta tanto o más que traer la página.
   * Solo hace falta en la primera página (el cliente lo conserva al paginar)
   * y no hace falta nunca para los relacionados. Default `true`.
   */
  /** Solo estos artículos. Lo usan los populares de una categoría (0031). */
  ids?: string[];
  withTotal?: boolean;
  /**
   * Buscar exactamente lo escrito, sin corregir. Por defecto una búsqueda sin
   * resultados se corrige sola ("televsor" → resultados de "televisor"), como
   * Google; esto es su "Buscar, en cambio, televsor".
   */
  exact?: boolean;
}

export interface SearchCatalogResult {
  products: Product[];
  /**
   * Total que cumple los filtros, no solo lo devuelto en esta página.
   * `null` cuando no se pidió (`withTotal: false`).
   */
  total: number | null;
  /**
   * La búsqueda no trajo nada y estos son los resultados de su corrección
   * ("televsor" → "televisor"), con los mismos filtros. Las páginas
   * siguientes se piden con esta búsqueda.
   */
  correctedQuery?: string;
  /**
   * "Quizá quisiste decir": la corrección, sin aplicar, de una búsqueda
   * `exact` sin resultados. Solo si la corregida sí trae algo.
   */
  suggestion?: string;
}

/**
 * Búsqueda y filtrado sobre el catálogo completo, resuelto en Postgres.
 *
 * Es lo que hace honesta a la caja de búsqueda: filtrar en el navegador solo
 * encontraría entre los artículos ya servidos, y el usuario creería que el
 * resto no existe.
 */
export async function searchCatalog(params: SearchCatalogParams): Promise<SearchCatalogResult> {
  if (!hasDatabase()) return { products: [], total: 0 };
  const result = await withRetry('búsqueda en el catálogo', () => searchCatalogOnce(params));
  if (result.total !== 0 || (params.offset ?? 0) > 0 || !params.query?.trim()) return result;

  // Sin resultados: casi siempre es un error de tipeo. Se busca la corrección
  // con los mismos filtros y, si trae algo, se muestra eso directamente (o se
  // ofrece, si se pidió la búsqueda exacta). Una corrección que también da
  // cero no se ofrece: sería peor que nada.
  const correction = await findSpellingCorrection(params.query);
  if (!correction) return result;
  try {
    if (params.exact) {
      const check = await searchCatalogOnce({ ...params, query: correction, limit: 1, withTotal: true });
      return check.total ? { ...result, suggestion: correction } : result;
    }
    const corrected = await searchCatalogOnce({ ...params, query: correction });
    return corrected.total ? { ...corrected, correctedQuery: correction } : result;
  } catch {
    return result;
  }
}

/**
 * La búsqueda con las palabras mal escritas corregidas (`suggest_search_query`,
 * migración 0057), o nada si no había qué corregir.
 *
 * Es un extra: si la función aún no existe o la base falla, no hay corrección
 * y la búsqueda sigue respondiendo su "sin resultados".
 */
async function findSpellingCorrection(query: string): Promise<string | undefined> {
  const needle = normalizeText(query);
  if (needle.length < 3) return undefined;
  try {
    const data = await rpc<string | null>('suggest_search_query', { p_query: needle });
    if (typeof data !== 'string' || !data.trim() || data === needle) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/** Etiqueta de caché de las búsquedas; `revalidateTag` la vacía de golpe. */
export const CATALOG_SEARCH_CACHE_TAG = 'catalog-search';

/** Cuánto vive una búsqueda en caché. Mismo ritmo que la portada (`/`). */
export const CATALOG_SEARCH_CACHE_SECONDS = 300;

/**
 * `searchCatalog` con caché entre peticiones.
 *
 * Es la puerta que usa `/api/products/search`. Cada combinación distinta de
 * filtros, orden, página e idioma es una entrada; mientras vive, las
 * búsquedas repetidas ("tv", "play 5", una tienda) no tocan Postgres. Los
 * precios cambian por corrida de scraping, no por segundo, así que cinco
 * minutos de retraso no le mienten a nadie y le ahorran a la base la parte
 * más cara del tráfico: un `count(*)` y un barrido de la vista por visitante.
 *
 * Los parámetros se normalizan antes de entrar (listas ordenadas, defaults
 * explícitos) para que dos peticiones equivalentes compartan entrada aunque
 * la query string venga en otro orden.
 */
export async function searchCatalogCached(params: SearchCatalogParams): Promise<SearchCatalogResult> {
  // Sin base no hay nada que guardar, y así los tests unitarios no dependen
  // del runtime de caché de Next.
  if (!hasDatabase()) return { products: [], total: 0 };
  return searchCatalogMemoized(normalizeSearchParams(params));
}

const searchCatalogMemoized = unstable_cache(
  (params: NormalizedSearchParams) => searchCatalog(params),
  ['catalog-search'],
  { revalidate: CATALOG_SEARCH_CACHE_SECONDS, tags: [CATALOG_SEARCH_CACHE_TAG] },
);

export type NormalizedSearchParams = Required<
  Pick<
    SearchCatalogParams,
    'sort' | 'limit' | 'offset' | 'locale' | 'withTotal' | 'onlyDiscounted' | 'includeUnavailable' | 'exact'
  >
> &
  Pick<SearchCatalogParams, 'query' | 'minPrice' | 'maxPrice'> & {
    store: string[];
    storeSlug: string[];
    category: string[];
    storeCategory: string[];
    brand: string[];
    ids: string[];
  };

function sortedList(value: string | string[] | undefined): string[] {
  const values = (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
  return [...new Set(values)].sort();
}

/**
 * Forma canónica de los parámetros: es la clave de caché, así que todo lo que
 * cambie el resultado tiene que estar acá, y nada que no lo cambie. Los
 * defaults repiten los de `runCatalogQuery` para que "sin parámetro" y "con
 * el default explícito" sean la misma entrada.
 */
export function normalizeSearchParams(params: SearchCatalogParams): NormalizedSearchParams {
  const query = params.query?.trim();
  return {
    query: query ? query : undefined,
    store: sortedList(params.store),
    storeSlug: sortedList(params.storeSlug),
    category: sortedList(params.category),
    storeCategory: sortedList(params.storeCategory),
    brand: sortedList(params.brand),
    ids: sortedList(params.ids),
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    onlyDiscounted: params.onlyDiscounted === true,
    includeUnavailable: params.includeUnavailable === true,
    sort: params.sort ?? 'discount',
    limit: Math.min(params.limit ?? 60, 200),
    offset: Math.max(params.offset ?? 0, 0),
    locale: params.locale ?? 'es',
    withTotal: params.withTotal !== false,
    exact: params.exact === true,
  };
}

async function searchCatalogOnce(params: SearchCatalogParams): Promise<SearchCatalogResult> {
  return runCatalogQuery(params);
}

function asList(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).filter(Boolean);
}

/**
 * Filtra una columna por uno o varios valores. Con uno usa `=`, con varios
 * `in`; sin ninguno no filtra.
 */
function facetFilter(
  column: typeof m.store_name | typeof m.store_slug | typeof m.store_category_name | typeof m.brand,
  value: string | string[] | undefined,
): SQL | undefined {
  const values = asList(value);
  if (values.length === 0) return undefined;
  if (values.length === 1) return eq(column, values[0]);
  return inArray(column, values);
}

/**
 * Filtro por categoría canónica.
 *
 * Un slug entra por dos columnas: `category_slug` (el nodo exacto) y
 * `category_root_slug` (todo lo que cuelga de una raíz). Así marcar
 * "Juguetería y Juegos" trae también "Muñecas, Figuras y Vehículos" sin que
 * el cliente tenga que conocer el árbol. `UNCATEGORIZED_VALUE` es
 * `category_slug is null`: lo que aún no se mapeó.
 */
function categoryFilter(value: string | string[] | undefined): SQL | undefined {
  const values = asList(value);
  if (values.length === 0) return undefined;

  const slugs = values.filter((item) => item !== UNCATEGORIZED_VALUE);
  const clauses: SQL[] = [];
  if (slugs.length > 0) clauses.push(inArray(m.category_slug, slugs), inArray(m.category_root_slug, slugs));
  if (slugs.length < values.length) clauses.push(isNull(m.category_slug));
  return or(...clauses);
}

/**
 * Full-text sobre `normalized_name` (ver 0026): cada palabra como prefijo y
 * todas obligatorias, en cualquier orden. "play 5" → 'play:* & 5:*'. La
 * expresión es la misma del índice `mv_catalog_name_fts_idx`, que es lo que
 * deja que Postgres lo use.
 */
function textSearch(tsquery: string): SQL {
  return sql`to_tsvector('simple', ${m.normalized_name}) @@ to_tsquery('simple', ${tsquery})`;
}

/** Orden descendente con los nulos al final, como `nullsFirst: false` de PostgREST. */
function descNullsLast(column: AnyPgColumn): SQL {
  return sql`${column} desc nulls last`;
}

function ascNullsLast(column: AnyPgColumn): SQL {
  return sql`${column} asc nulls last`;
}
/**
 * Convierte lo que escribió el visitante en un tsquery de prefijos con AND:
 * "Play 5" → "play:* & 5:*". Se normaliza igual que `normalize_text` en la
 * base (minúsculas, sin acentos, solo [a-z0-9]) para que las palabras
 * coincidan con lo que indexa `normalized_name`. Devuelve null si no queda
 * ninguna palabra útil. Los sinónimos ("vbucks" = "v bucks") los agrega
 * `wordsToTsQuery`.
 */
export function toPrefixTsQuery(raw: string | undefined): string | null {
  if (!raw) return null;
  const words = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return wordsToTsQuery(words);
}

/**
 * Con qué empieza el nombre, normalizado igual que `normalized_name` en la
 * base, para que "Llanta" y "llanta" sean el mismo prefijo.
 */
function toNamePrefix(raw: string | undefined): string | null {
  if (!raw) return null;
  const needle = normalizeText(raw);
  return needle.length > 0 ? needle : null;
}

/**
 * Órdenes en los que la búsqueda por texto pone primero lo que EMPIEZA por lo
 * escrito. Son los dos que no piden nada concreto ("recién agregados" y
 * "destacados"); si alguien eligió "menor precio", lo más barato va primero y
 * punto, empiece o no por la palabra.
 */
const PREFIX_FIRST_SORTS: ReadonlySet<CatalogSort> = new Set(['newest', 'relevance']);

/** Una porción de la lista: por dónde cae lo escrito y por región. Sin campos, es toda. */
interface QueryLayer {
  text?: 'prefix' | 'rest';
  region?: 'primary' | 'other';
}

/**
 * Una pasada de la consulta.
 *
 * Con texto y orden por defecto, la búsqueda va en dos capas: primero los
 * artículos cuyo nombre EMPIEZA por lo escrito, después los que lo tienen en
 * cualquier otra parte. Buscar "llanta" devolvía primero una carretilla —que
 * menciona la llanta al final del nombre— y las llantas de verdad quedaban
 * tres pantallas abajo, porque el índice de texto no distingue dónde cae la
 * palabra. Las dos capas se paginan como una sola lista: la primera página
 * agota la capa de prefijo y sigue con la otra donde haga falta, y la
 * página siguiente arranca donde terminó, así que ningún artículo se repite
 * ni se salta.
 */
async function runCatalogQuery(params: SearchCatalogParams): Promise<SearchCatalogResult> {
  const limit = Math.min(params.limit ?? 60, 200);
  const offset = Math.max(params.offset ?? 0, 0);
  const locale = params.locale ?? 'es';
  const withTotal = params.withTotal !== false;
  const sort = params.sort ?? 'discount';

  const tsquery = toPrefixTsQuery(params.query);
  const prefix = toNamePrefix(params.query);
  const layered =
    tsquery !== null &&
    prefix !== null &&
    PREFIX_FIRST_SORTS.has(sort) &&
    !(params.ids && params.ids.length > 0);

  // Con un orden que respeta la región, cada capa de texto se parte en dos
  // —región que sirve en Honduras y las demás— y las cuatro van en fila:
  // sin esto, una clave de Turquía que EMPIEZA por "xbox" saldría antes que
  // una GLOBAL que lo trae en medio del nombre.
  const regionFirst = REGION_FIRST_SORTS.has(sort);
  const layers: QueryLayer[] = regionFirst
    ? [
        { text: 'prefix', region: 'primary' },
        { text: 'rest', region: 'primary' },
        { text: 'prefix', region: 'other' },
        { text: 'rest', region: 'other' },
      ]
    : [{ text: 'prefix' }, { text: 'rest' }];

  /** Todos los filtros, acotados a una capa; sin `text` es la lista entera. */
  const where = (layer: QueryLayer): SQL | undefined => {
    const filters: Array<SQL | undefined> = [isNotNull(m.price)];
    if (tsquery) filters.push(textSearch(tsquery));
    // El prefijo sólo tiene [a-z0-9 ], así que no hay comodines que escapar.
    if (layer.text === 'prefix') filters.push(like(m.normalized_name, `${prefix}%`));
    if (layer.text === 'rest') filters.push(notLike(m.normalized_name, `${prefix}%`));
    if (layer.region === 'primary') filters.push(eq(m.region_rank, 0));
    if (layer.region === 'other') filters.push(gt(m.region_rank, 0));

    if (params.ids && params.ids.length > 0) filters.push(inArray(m.id, params.ids));
    filters.push(facetFilter(m.store_name, params.store));
    filters.push(facetFilter(m.store_slug, params.storeSlug));
    filters.push(categoryFilter(params.category));
    filters.push(facetFilter(m.store_category_name, params.storeCategory));
    filters.push(facetFilter(m.brand, params.brand));
    if (params.minPrice !== undefined) filters.push(gte(REFERENCE_PRICE, params.minPrice));
    if (params.maxPrice !== undefined) filters.push(lte(REFERENCE_PRICE, params.maxPrice));
    if (params.onlyDiscounted) filters.push(isNotNull(m.list_price));
    if (!params.includeUnavailable) filters.push(availabilityFloor());
    return and(...filters);
  };

  const orderBy = (): SQL[] => {
    const keys: SQL[] = [];
    if (regionFirst) keys.push(asc(m.region_rank), asc(m.featured_rank));

    switch (sort) {
      // Lo más nuevo primero, con lo que no tiene fecha al final: un artículo
      // sin registrar no es un artículo antiquísimo.
      case 'newest':
        keys.push(descNullsLast(m.first_seen_at));
        break;
      case 'price-asc':
        // Sin tasa para su moneda, price_hnl es null: al final, en los dos sentidos.
        keys.push(ascNullsLast(REFERENCE_PRICE));
        break;
      case 'price-desc':
        keys.push(descNullsLast(REFERENCE_PRICE));
        break;
      case 'name-asc':
        keys.push(asc(m.name));
        break;
      case 'rating':
        keys.push(descNullsLast(m.rating_average));
        break;
      case 'discount':
      default:
        keys.push(descNullsLast(m.discount_percent));
    }

    // Desempate estable: sin una segunda clave, dos páginas consecutivas pueden
    // repetir o saltarse artículos con el mismo descuento.
    keys.push(asc(m.id));
    return keys;
  };

  const db = getDb();
  const page = (layer: QueryLayer, from: number, size: number) =>
    db
      .select(LIST_COLUMNS)
      .from(m)
      .where(where(layer))
      .orderBy(...orderBy())
      .limit(size)
      .offset(from) as Promise<CatalogRow[]>;
  const countOf = async (layer: QueryLayer): Promise<number> => {
    const [row] = await db.select({ n: count() }).from(m).where(where(layer));
    return row?.n ?? 0;
  };

  if (!layered) {
    const [rows, total] = await Promise.all([page({}, offset, limit), withTotal ? countOf({}) : null]);
    return { products: rows.map((row) => toProduct(row, locale)), total };
  }

  // Las capas se recorren en fila como una sola lista. De cada una se pide a
  // la vez la página que le toca y su cuenta: la cuenta es lo que dice
  // cuántos artículos hay que saltar en la siguiente. Llena la página, las
  // que quedan sólo se cuentan (y sólo si hace falta el total).
  const rows: CatalogRow[] = [];
  let total = 0;
  let skip = offset;

  for (const layer of layers) {
    const missing = limit - rows.length;
    if (missing > 0) {
      const [layerRows, layerCount] = await Promise.all([page(layer, skip, missing), countOf(layer)]);
      rows.push(...layerRows);
      total += layerCount;
      skip = Math.max(skip - layerCount, 0);
    } else if (withTotal) {
      total += await countOf(layer);
    }
  }

  return {
    products: rows.map((row) => toProduct(row, locale)),
    total: withTotal ? total : null,
  };
}

export interface CatalogSnapshot {
  products: Product[];
  facets: CatalogFacets;
  total: number;
}

const EMPTY_SNAPSHOT: CatalogSnapshot = {
  products: [],
  facets: EMPTY_FACETS,
  total: 0,
};

/**
 * Primer lote que ve el visitante, más las facetas.
 *
 * Se ordena por lo recién agregado, que es el mismo criterio por defecto del
 * selector de orden: el primer lote y lo que devuelve la primera búsqueda
 * tienen que estar ordenados igual, o cambiar de opinión sobre el orden
 * parecería un fallo.
 */
export async function getCatalogSnapshot(options?: {
  limit?: number;
  locale?: CatalogLocale;
}): Promise<CatalogSnapshot> {
  // Sin base configurada la portada muestra el fixture: es el modo de las
  // pruebas y de un clon sin .env.local. Con base, un fallo se propaga —ver
  // `withRetry`— y la página conserva su última versión buena.
  if (!hasDatabase()) return EMPTY_SNAPSHOT;

  const [listing, facets] = await Promise.all([
    searchCatalog({
      sort: 'newest',
      limit: options?.limit ?? 90,
      locale: options?.locale ?? 'es',
    }),
    getCatalogFacets(),
  ]);

  return { products: listing.products, facets, total: listing.total ?? 0 };
}


// -----------------------------------------------------------------------------
// Sugerencias del buscador
// -----------------------------------------------------------------------------

export interface CatalogSuggestions {
  /** Tiendas cuyo nombre contiene lo escrito. */
  stores: { name: string }[];
  /** Categorías canónicas cuyo nombre contiene lo escrito. */
  categories: { slug: string; name: string }[];
  /** Nombres de artículos que empiezan por las palabras escritas. */
  items: { name: string }[];
}

const EMPTY_SUGGESTIONS: CatalogSuggestions = { stores: [], categories: [], items: [] };

/** Cuántas entradas por sección. Más de esto y el desplegable tapa la página. */
const SUGGESTION_LIMITS = { stores: 3, categories: 3, items: 6 } as const;

/**
 * Mismo saneado que `normalize_text` en la base: minúsculas, sin acentos y
 * sólo [a-z0-9] y espacios. Sirve para comparar en memoria nombres de tienda
 * y categoría con lo que se tecleó.
 */
function normalizeText(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Lo que el buscador ofrece mientras alguien escribe: tiendas, categorías y
 * artículos que coinciden con el texto. Tres listas cortas y no una sola
 * mezclada, porque son tres intenciones distintas —"ir a esta tienda", "ver
 * esta categoría", "buscar este artículo"— y el desplegable las rotula.
 *
 * Tiendas y categorías son listas pequeñas (decenas) y ya están en caché por
 * las facetas: se filtran en memoria. Los artículos salen del índice de texto
 * de `mv_catalog`, el mismo que usa la búsqueda, así que lo que se sugiere es
 * exactamente lo que después va a aparecer.
 */
export async function getCatalogSuggestions(rawQuery: string): Promise<CatalogSuggestions> {
  if (!hasDatabase()) return EMPTY_SUGGESTIONS;
  const needle = normalizeText(rawQuery);
  if (needle.length < 2) return EMPTY_SUGGESTIONS;
  return suggestionsMemoized(needle);
}

const suggestionsMemoized = unstable_cache(
  (needle: string) =>
    withRetry('sugerencias del catálogo', () => computeSuggestions(needle)),
  ['catalog-suggest'],
  { revalidate: CATALOG_SEARCH_CACHE_SECONDS, tags: [CATALOG_SEARCH_CACHE_TAG] },
);

async function computeSuggestions(needle: string): Promise<CatalogSuggestions> {
  const [facets, items] = await Promise.all([getCatalogFacets(), suggestItems(needle)]);

  const matches = (name: string) => normalizeText(name).includes(needle);

  const stores = facets.stores
    .filter((store) => matches(store.value))
    .slice(0, SUGGESTION_LIMITS.stores)
    .map((store) => ({ name: store.value }));

  // El árbol de categorías viene aplanado: raíces y, en cada raíz, sus hijas.
  // Se recorre entero porque una hija ("Celulares") suele ser lo que se busca.
  const categories: CatalogSuggestions['categories'] = [];
  const visit = (option: FacetOption) => {
    if (option.value !== UNCATEGORIZED_VALUE && matches(option.label ?? option.value)) {
      categories.push({ slug: option.value, name: option.label ?? option.value });
    }
    for (const child of option.children ?? []) visit(child);
  };
  for (const option of facets.categories) visit(option);

  return {
    stores,
    categories: categories.slice(0, SUGGESTION_LIMITS.categories),
    items,
  };
}

/**
 * Nombres de artículos que coinciden, sin repetidos y con los más útiles
 * primero.
 *
 * Se piden bastantes más filas de las que se muestran, por dos motivos: el
 * mismo producto está en varias tiendas con el mismo nombre, y el índice de
 * texto devuelve por igual "iPhone 17 Pro" y "Cobertor para iPhone 17". Se
 * ordena en memoria: primero lo que empieza por lo escrito, después lo que lo
 * tiene más cerca del principio, y a igualdad el nombre más corto —que es el
 * que nombra el producto, no el accesorio.
 */
async function suggestItems(needle: string): Promise<{ name: string }[]> {
  const tsquery = toPrefixTsQuery(needle);
  if (!tsquery) return [];

  const data = await getDb()
    .select({ name: m.name })
    .from(m)
    .where(and(isNotNull(m.price), textSearch(tsquery), availabilityFloor()))
    .limit(SUGGESTION_LIMITS.items * 15);

  const candidates = new Map<string, { name: string; position: number }>();
  for (const row of data) {
    const key = normalizeText(row.name);
    if (!key || candidates.has(key)) continue;
    const at = key.indexOf(needle);
    candidates.set(key, { name: row.name.trim(), position: at < 0 ? key.length : at });
  }

  return [...candidates.values()]
    .sort((a, b) => a.position - b.position || a.name.length - b.name.length)
    .slice(0, SUGGESTION_LIMITS.items)
    .map(({ name }) => ({ name }));
}

// -----------------------------------------------------------------------------
// Ficha de producto
// -----------------------------------------------------------------------------

export interface ProductImage {
  url: string;
  position: number;
  isPrimary: boolean;
  altText?: string;
}

export interface ProductVariant {
  externalId: string;
  name?: string;
  color?: string;
  size?: string;
  price?: number;
  listPrice?: number;
  inStock?: boolean;
}

export interface PricePointRow {
  scrapedAt: string;
  price: number | null;
  listPrice: number | null;
  previousPrice: number | null;
  priceDelta: number | null;
  inStock: boolean | null;
}

export interface ProductDetail extends Product {
  externalId: string;
  /** Siempre presente acá: la ficha se encontró por él o lo trae la fila. */
  slug: string;
  /**
   * Estado de disponibilidad sin traducir.
   *
   * `availability` (heredado de `Product`) ya viene como etiqueta legible en el
   * idioma de la página, que es lo que la vista pinta. El JSON-LD necesita el
   * valor crudo: "agotado" y "descontinuado" se traducen a URLs distintas de
   * schema.org —Google deja de mostrar el precio del segundo— y esa distinción
   * se pierde en la etiqueta.
   */
  availabilityStatus: AvailabilityStatus;
  sku?: string;
  gtin?: string;
  barcode?: string;
  model?: string;
  color?: string;
  size?: string;
  condition?: string;
  categoryPath: string[];
  /** Slug del nodo canónico, si el mapeo existe. Lo usan los relacionados. */
  categorySlug?: string;
  /** Categoría tal cual la nombra la tienda. */
  storeCategory?: string;
  unitMeasureName?: string;
  taxRate?: number;
  taxIncluded?: boolean;
  stockQuantity?: number;
  minOrderQuantity?: number;
  memberPrice?: number;
  discountAmount?: number;
  warrantyMonths?: number;
  weightGrams?: number;
  images: ProductImage[];
  variants: ProductVariant[];
  specs: Record<string, unknown>;
  attributes: Record<string, unknown>;
  badges: string[];
  priceHistory: PricePointRow[];
  /**
   * El precio en lempiras, solo cuando la tienda cobra en otra moneda (Eneba,
   * en dólares). Aproximado: usa la tasa de `exchange_rates` (0054).
   */
  priceInHnl?: { amount: number; rate: number };
  firstSeenAt: string;
  lastSeenAt: string;
  lastPriceChangeAt?: string;
  /** Cuántos días lleva el precio actual sin moverse. */
  daysAtCurrentPrice?: number;
  /** Mínimo histórico observado. Contexto real, no marketing. */
  lowestPrice?: number;
  highestPrice?: number;
}

/**
 * Forma de un uuid. Es lo que separa una URL vieja de una nueva sin tener que
 * pasar una bandera desde la ruta.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Las columnas de `store_products` que la ficha usa, y ninguna más.
 *
 * Con `*` venían también `raw`, `shipping_info`, `location_availability` y
 * otra treintena de campos que nadie pinta: datos de más que viajan desde la
 * base y que el Worker tiene que parsear. Una columna nueva en la ficha se
 * agrega acá.
 */
const sp = storeProducts;
const PRODUCT_DETAIL_COLUMNS = {
  id: sp.id,
  public_slug: sp.public_slug,
  external_id: sp.external_id,
  name: sp.name,
  description: sp.description,
  url: sp.url,
  price: sp.price,
  currency: sp.currency,
  list_price: sp.list_price,
  discount_percent: sp.discount_percent,
  discount_amount: sp.discount_amount,
  member_price: sp.member_price,
  availability: sp.availability,
  in_stock: sp.in_stock,
  stock_quantity: sp.stock_quantity,
  min_order_quantity: sp.min_order_quantity,
  category_raw: sp.category_raw,
  category_path: sp.category_path,
  brand_raw: sp.brand_raw,
  primary_image_url: sp.primary_image_url,
  images: sp.images,
  rating_average: sp.rating_average,
  rating_count: sp.rating_count,
  sku: sp.sku,
  gtin: sp.gtin,
  barcode_raw: sp.barcode_raw,
  model: sp.model,
  color: sp.color,
  size: sp.size,
  condition: sp.condition,
  unit_measure_name: sp.unit_measure_name,
  tax_rate: sp.tax_rate,
  tax_included: sp.tax_included,
  warranty_months: sp.warranty_months,
  weight_grams: sp.weight_grams,
  specs: sp.specs,
  attributes: sp.attributes,
  badges: sp.badges,
  first_seen_at: sp.first_seen_at,
  last_seen_at: sp.last_seen_at,
  last_price_change_at: sp.last_price_change_at,
  store_name: stores.name,
  store_slug: stores.slug,
  store_category_name: storeCategories.name,
  category_slug: categories.slug,
  category_name: categories.name,
};

/**
 * Ficha completa. Devuelve `null` si el artículo no existe o dejó de estar
 * activo, para que la ruta responda 404 en vez de una página vacía.
 *
 * Acepta el slug público o el uuid. Los dos porque hay dos llamadores con
 * necesidades distintas: la ficha nueva llega por `/p/<slug>` y la ruta vieja
 * —`/producto/<uuid>`, la que sigue en el índice de Google y en los enlaces ya
 * compartidos— necesita resolver el uuid para poder redirigir. Distinguirlos
 * por la forma del texto evita un parámetro que habría que acertar en cada
 * llamada.
 *
 * Envuelta en `cache` de React: `generateMetadata` y la página la piden con
 * los mismos argumentos, y sin esto cada ficha armada de cero hacía todas sus
 * consultas dos veces, con el Worker de Cloudflare contando cada milisegundo.
 */
export const getProductDetail = cache(async (
  key: string,
  locale: CatalogLocale = 'es',
): Promise<ProductDetail | null> => {
  // `null` significa "no existe" y la ruta responde 404, que con
  // `revalidate` queda cacheado diez minutos. Un fallo de red NO es un 404:
  // se propaga para que la ficha conserve su última versión buena.
  return withRetry('ficha de producto', async () => {
    const db = getDb();

    const [found] = await db
      .select(PRODUCT_DETAIL_COLUMNS)
      .from(sp)
      .innerJoin(stores, eq(stores.id, sp.store_id))
      .leftJoin(storeCategories, eq(storeCategories.id, sp.store_category_id))
      .leftJoin(categories, eq(categories.id, storeCategories.category_id))
      .where(and(eq(UUID_PATTERN.test(key) ? sp.id : sp.public_slug, key), eq(sp.is_active, true)))
      .limit(1);

    if (!found) return null;
    const row = found as Record<string, unknown>;
    const store = { name: found.store_name, slug: found.store_slug };

    // El histórico y las variantes se piden aparte: son series que pueden ser
    // largas y no tiene sentido multiplicarlas en el mismo join. Van en
    // paralelo con la tasa de cambio: ninguna depende de la otra.
    const currency = String(row.currency ?? 'HNL');
    const needsRate = currency !== 'HNL' && row.price !== null && row.price !== undefined;
    const [history, variantRows, rateRows] = await Promise.all([
      db
        .select({
          scraped_at: priceHistory.scraped_at,
          price: priceHistory.price,
          list_price: priceHistory.list_price,
          previous_price: priceHistory.previous_price,
          price_delta: priceHistory.price_delta,
          in_stock: priceHistory.in_stock,
        })
        .from(priceHistory)
        .where(eq(priceHistory.store_product_id, found.id))
        .orderBy(asc(priceHistory.scraped_at))
        .limit(200),
      db
        .select({
          external_id: storeProductVariants.external_id,
          name: storeProductVariants.name,
          color: storeProductVariants.color,
          size: storeProductVariants.size,
          price: storeProductVariants.price,
          list_price: storeProductVariants.list_price,
          in_stock: storeProductVariants.in_stock,
        })
        .from(storeProductVariants)
        .where(eq(storeProductVariants.store_product_id, found.id)),
      needsRate
        ? db
            .select({ rate_to_hnl: exchangeRates.rate_to_hnl })
            .from(exchangeRates)
            .where(eq(exchangeRates.currency, currency))
        : null,
    ]);

    const pricePoints: PricePointRow[] = (history as Record<string, unknown>[]).map(
      (point) => ({
        scrapedAt: String(point.scraped_at),
        price: point.price === null ? null : Number(point.price),
        listPrice: point.list_price === null ? null : Number(point.list_price),
        previousPrice: point.previous_price === null ? null : Number(point.previous_price),
        priceDelta: point.price_delta === null ? null : Number(point.price_delta),
        inStock: point.in_stock as boolean | null,
      }),
    );

    const observedPrices = pricePoints
      .map((point) => point.price)
      .filter((price): price is number => price !== null);

    // Equivalente en lempiras para precios en otra moneda. Si la tasa no está
    // (o 0054 no corrió), la ficha solo muestra el precio original.
    let priceInHnl: ProductDetail['priceInHnl'];
    if (rateRows) {
      const value = Number(rateRows[0]?.rate_to_hnl);
      if (Number.isFinite(value) && value > 0) {
        priceInHnl = { amount: Math.round(Number(row.price) * value * 100) / 100, rate: value };
      }
    }

    // La galería vive en la columna `images` (0026): ya viene ordenada y la
    // primera es la principal.
    const images = ((row.images ?? []) as { url: string; alt?: string }[]).map((image, index) => ({
      url: String(image.url),
      position: index,
      isPrimary: index === 0,
      altText: image.alt ?? undefined,
    }));

    const variants = (variantRows as Record<string, unknown>[]).map(
      (variant) => ({
        externalId: String(variant.external_id),
        name: (variant.name as string | null) ?? undefined,
        color: (variant.color as string | null) ?? undefined,
        size: (variant.size as string | null) ?? undefined,
        price: variant.price === null ? undefined : Number(variant.price),
        listPrice: variant.list_price === null ? undefined : Number(variant.list_price),
        inStock: (variant.in_stock as boolean | null) ?? undefined,
      }),
    );

    const lastPriceChangeAt = (row.last_price_change_at as string | null) ?? undefined;
    const daysAtCurrentPrice = lastPriceChangeAt
      ? Math.max(0, Math.floor((Date.now() - new Date(lastPriceChangeAt).getTime()) / 86_400_000))
      : undefined;

    const num = (value: unknown): number | undefined =>
      value === null || value === undefined ? undefined : Number(value);
    const str = (value: unknown): string | undefined =>
      value === null || value === undefined || value === '' ? undefined : String(value);

    const storeCategory = found.store_category_name ? { name: found.store_category_name } : null;
    const canonical =
      found.category_slug && found.category_name ? { slug: found.category_slug, name: found.category_name } : null;
    const availability = row.availability as AvailabilityStatus;

    return {
      id: String(row.id),
      /**
       * Respaldo por si la fila es anterior a la migración 0021 y todavía no
       * tiene slug: la ficha sigue abriendo por uuid en vez de romperse.
       */
      slug: str(row.public_slug) ?? String(row.id),
      externalId: String(row.external_id),
      name: String(row.name),
      price: Number(row.price ?? 0),
      currency: String(row.currency ?? 'HNL'),
      store: store.name,
      storeSlug: store.slug,
      category:
        canonical?.name ?? storeCategory?.name ?? str(row.category_raw) ?? 'Sin categoría',
      categoryPath: (row.category_path as string[] | null) ?? [],
      categorySlug: canonical?.slug,
      storeCategory: storeCategory?.name,
      imageUrl: str(row.primary_image_url),
      availability: AVAILABILITY_LABELS[locale][availability],
      availabilityStatus: availability,
      description: str(row.description),
      url: str(row.url),
      brand: str(row.brand_raw),
      listPrice: num(row.list_price),
      discountPercent: num(row.discount_percent),
      discountAmount: num(row.discount_amount),
      memberPrice: num(row.member_price),
      inStock: (row.in_stock as boolean | null) ?? undefined,
      stockQuantity: num(row.stock_quantity),
      minOrderQuantity: num(row.min_order_quantity),
      ratingAverage: num(row.rating_average),
      ratingCount: num(row.rating_count),
      sku: str(row.sku),
      gtin: str(row.gtin),
      barcode: str(row.barcode_raw),
      model: str(row.model),
      color: str(row.color),
      size: str(row.size),
      condition: str(row.condition),
      unitMeasureName: str(row.unit_measure_name),
      taxRate: num(row.tax_rate),
      taxIncluded: (row.tax_included as boolean | null) ?? undefined,
      warrantyMonths: num(row.warranty_months),
      weightGrams: num(row.weight_grams),
      images,
      variants,
      specs: (row.specs as Record<string, unknown>) ?? {},
      attributes: (row.attributes as Record<string, unknown>) ?? {},
      badges: (row.badges as string[] | null) ?? [],
      priceHistory: pricePoints,
      priceInHnl,
      firstSeenAt: String(row.first_seen_at),
      lastSeenAt: String(row.last_seen_at),
      lastPriceChangeAt,
      daysAtCurrentPrice,
      lowestPrice: observedPrices.length ? Math.min(...observedPrices) : undefined,
      highestPrice: observedPrices.length ? Math.max(...observedPrices) : undefined,
    };
  });
});

/**
 * El slug público de una ficha, a partir de su uuid.
 *
 * Existe aparte de `getProductDetail` porque la ruta vieja sólo necesita saber
 * a dónde redirigir: traerse la ficha entera —con imágenes, variantes y
 * doscientos puntos de histórico— para leer un campo y descartar el resto
 * convierte cada visita desde Google en una consulta de las caras.
 */
export async function getProductSlug(id: string): Promise<string | null> {
  if (!UUID_PATTERN.test(id)) return null;

  return withRetry('slug de producto', async () => {
    const [data] = await getDb()
      .select({ public_slug: sp.public_slug })
      .from(sp)
      .where(and(eq(sp.id, id), eq(sp.is_active, true)));

    if (!data) return null;
    const slug = data.public_slug;
    return slug && slug !== '' ? slug : null;
  });
}

/**
 * Artículos parecidos: misma categoría, distinto id, ordenados por descuento.
 *
 * Con mapeo canónico se busca por el nodo (que puede abarcar varias tiendas,
 * que es justamente lo interesante). Sin mapeo, por la categoría de la tienda
 * tal cual: es lo único que hay para agrupar.
 */
export async function getRelatedProducts(
  product: Pick<ProductDetail, 'id' | 'category' | 'categorySlug' | 'storeCategory'>,
  locale: CatalogLocale = 'es',
  limit = 8,
): Promise<Product[]> {
  const { products } = await searchCatalog({
    ...(product.categorySlug
      ? { category: product.categorySlug }
      : { storeCategory: product.storeCategory ?? product.category }),
    sort: 'discount',
    limit: limit + 1,
    locale,
    // Solo se pintan las tarjetas: el total sería un count(*) tirado a la basura.
    withTotal: false,
  });
  return products.filter((candidate) => candidate.id !== product.id).slice(0, limit);
}
