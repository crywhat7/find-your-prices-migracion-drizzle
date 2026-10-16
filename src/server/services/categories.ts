import 'server-only';
import { asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, type Db } from '@/server/db/client';
import { pgErrorCode, pgErrorMessage, toNumber } from '@/server/db/pg';
import { rpc } from '@/server/db/rpc';
import { categories as categoriesTable, storeCategories as storeCategoriesTable, stores as storesTable } from '@/server/db/schema';
import { toErrorResponse } from '@/server/scraping/api-guard';
import { logError } from '@/server/errors/logError';
import type {
  CanonicalCategory,
  CanonicalUsage,
  StoreCategoryRow,
  StoreOption,
} from '@/features/admin-categories/types';

/**
 * Mantenimiento del árbol canónico (`categories`) y del mapeo desde las
 * categorías de cada tienda (`store_categories.category_id`).
 *
 * Es lo único que toca estas tablas desde la app: el scraper escribe
 * `store_categories` pero nunca `category_id`, que es una decisión humana.
 * Por eso vive acá y no en `scraping/`.
 *
 * Reglas del árbol que este módulo mantiene:
 *   - `path` es `padre.path/slug` para una hija, `slug` para una raíz.
 *   - `level` es `padre.level + 1`; una raíz es 0.
 *   - Renombrar el slug o mover un nodo reescribe el path de sus hijas.
 *   - Hoy hay dos niveles. Un tercero se admite, pero el filtro del catálogo
 *     (`category_root_slug` en la migración 0024) solo resuelve la raíz de
 *     una hija directa; por eso `createCategory` y `updateCategory` lo
 *     rechazan hasta que el filtro lo soporte.
 */

const MAX_LEVEL = 1;

/** Columnas de `CanonicalCategory`, en el orden de la tabla. */
const CATEGORY_COLUMNS = {
  id: categoriesTable.id,
  parent_id: categoriesTable.parent_id,
  slug: categoriesTable.slug,
  name: categoriesTable.name,
  description: categoriesTable.description,
  icon: categoriesTable.icon,
  path: categoriesTable.path,
  level: categoriesTable.level,
  position: categoriesTable.position,
  is_active: categoriesTable.is_active,
};

export class CategoryError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = 'CategoryError';
  }
}

/** Respuesta json para los route handlers: 4xx si es un error de uso, 500 si no. */
export function categoryErrorResponse(error: unknown): Response {
  if (error instanceof CategoryError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status });
  }
  return toErrorResponse(error);
}

/**
 * Slug a partir del nombre: minúsculas, sin acentos, guiones. Es el mismo
 * criterio que `find_your_prices.slugify` en la base, para que un slug hecho
 * acá y uno hecho allá coincidan.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

export interface CategoryAdminData {
  categories: CanonicalCategory[];
  storeCategories: StoreCategoryRow[];
  stores: StoreOption[];
  usage: Record<string, CanonicalUsage>;
}

/** Todo lo que el panel necesita, en un viaje por tabla. */
/**
 * Conteo vivo por categoría de tienda: es lo que decide si vale la pena
 * mapearla. Sale de `mv_catalog` (migración 0051), con el mismo piso que el
 * catálogo.
 *
 * Antes salía de `v_catalog_category_facets`, que agrupa en vivo todo
 * `store_products`: con ~130 000 artículos pasó el límite de 8 s de
 * Supabase y el panel entero moría. Si la función todavía no existe, el
 * panel carga sin conteos en vez de caerse, y el motivo queda en la
 * bitácora de errores.
 */
async function loadStoreCategoryCounts(
  db: Db,
): Promise<Array<{ store_category_id: string; product_count: number }>> {
  try {
    const rows = await db.execute<{ store_category_id: string; product_count: string | number }>(
      sql`select store_category_id, product_count from find_your_prices.admin_store_category_counts()`,
    );
    return rows.map((row) => ({
      store_category_id: row.store_category_id,
      product_count: toNumber(row.product_count) ?? 0,
    }));
  } catch (error) {
    await logError({
      source: 'handled',
      level: 'warning',
      error: new Error(`Conteos por categoría de tienda no disponibles: ${pgErrorMessage(error)}`),
      route: '/admin/categorias',
      context: { code: pgErrorCode(error), hint: 'Correr la migración 0051_error_log_and_category_counts.sql' },
    });
    return [];
  }
}

export async function loadCategoryAdminData(): Promise<CategoryAdminData> {
  const db = getDb();
  const sc = storeCategoriesTable;

  const [categories, storeCategories, stores, facets] = await Promise.all([
    db
      .select(CATEGORY_COLUMNS)
      .from(categoriesTable)
      .orderBy(asc(categoriesTable.level), asc(categoriesTable.position), asc(categoriesTable.name)),
    db
      .select({
        id: sc.id,
        store_id: sc.store_id,
        external_id: sc.external_id,
        parent_id: sc.parent_id,
        name: sc.name,
        level: sc.level,
        url: sc.url,
        product_count: sc.product_count,
        category_id: sc.category_id,
        is_active: sc.is_active,
      })
      .from(sc)
      .orderBy(asc(sc.store_id), asc(sc.name)),
    db
      .select({ id: storesTable.id, name: storesTable.name, slug: storesTable.slug })
      .from(storesTable)
      .orderBy(asc(storesTable.name)),
    loadStoreCategoryCounts(db),
  ]);

  const liveCounts = new Map<string, number>();
  for (const row of facets) {
    liveCounts.set(row.store_category_id, Number(row.product_count ?? 0));
  }

  const storeNames = new Map(stores.map((store) => [store.id, store.name]));

  type RawStoreCategory = {
    id: string;
    store_id: string;
    external_id: string;
    parent_id: string | null;
    name: string;
    level: number;
    url: string | null;
    product_count: number | null;
    category_id: string | null;
    is_active: boolean;
  };
  const raw = storeCategories as RawStoreCategory[];
  const byId = new Map(raw.map((row) => [row.id, row]));

  /** "Hogar › Cocina › Ollas", subiendo por `parent_id` con tope por si hay ciclo. */
  const storePath = (row: RawStoreCategory): string => {
    const names: string[] = [];
    let current: RawStoreCategory | undefined = row;
    for (let depth = 0; current && depth < 8; depth += 1) {
      names.unshift(current.name);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return names.join(' › ');
  };

  const rows: StoreCategoryRow[] = raw.map((row) => ({
    id: row.id,
    store_id: row.store_id,
    store_name: storeNames.get(row.store_id) ?? row.store_id,
    external_id: row.external_id,
    name: row.name,
    store_path: storePath(row),
    is_active: row.is_active,
    reported_count: row.product_count,
    live_count: liveCounts.get(row.id) ?? 0,
    category_id: row.category_id,
  }));

  const usage: Record<string, CanonicalUsage> = {};
  for (const row of rows) {
    if (!row.category_id) continue;
    const entry = (usage[row.category_id] ??= { storeCategories: 0, products: 0 });
    entry.storeCategories += 1;
    entry.products += row.live_count;
  }

  return {
    categories: categories as CanonicalCategory[],
    storeCategories: rows,
    stores: stores as StoreOption[],
    usage,
  };
}

// -----------------------------------------------------------------------------
// Mapeo
// -----------------------------------------------------------------------------

/**
 * Apunta varias categorías de tienda a un nodo canónico, o a ninguno.
 * Devuelve cuántas filas cambiaron.
 */
export async function assignStoreCategories(
  storeCategoryIds: string[],
  categoryId: string | null,
): Promise<number> {
  const ids = [...new Set(storeCategoryIds.filter(Boolean))];
  if (ids.length === 0) throw new CategoryError('No se indicó ninguna categoría de tienda');

  const db = getDb();

  if (categoryId) {
    const [found] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, categoryId));
    if (!found) throw new CategoryError('La categoría canónica no existe', 404);
  }

  const updated = await db
    .update(storeCategoriesTable)
    .set({ category_id: categoryId })
    .where(inArray(storeCategoriesTable.id, ids))
    .returning({ id: storeCategoriesTable.id });
  return updated.length;
}

// -----------------------------------------------------------------------------
// Árbol canónico
// -----------------------------------------------------------------------------

export interface CategoryInput {
  name?: string;
  slug?: string;
  parent_id?: string | null;
  description?: string | null;
  icon?: string | null;
  position?: number;
  is_active?: boolean;
}

async function getCategory(id: string): Promise<CanonicalCategory> {
  const [data] = await getDb().select(CATEGORY_COLUMNS).from(categoriesTable).where(eq(categoriesTable.id, id));
  if (!data) throw new CategoryError('La categoría no existe', 404);
  return data as CanonicalCategory;
}

/** Path y nivel que le tocan a un nodo dado su padre (o ninguno). */
function placement(parent: CanonicalCategory | null, slug: string) {
  if (!parent) return { path: slug, level: 0 };
  if (parent.level >= MAX_LEVEL) {
    throw new CategoryError(
      `"${parent.name}" ya es una subcategoría; el árbol admite dos niveles (raíz e hija).`,
    );
  }
  return { path: `${parent.path ?? parent.slug}/${slug}`, level: parent.level + 1 };
}

export async function createCategory(input: CategoryInput): Promise<CanonicalCategory> {
  const name = input.name?.trim() ?? '';
  if (!name) throw new CategoryError('El nombre es obligatorio');
  const slug = slugify(input.slug?.trim() || name);
  if (!slug) throw new CategoryError('El slug queda vacío; usá letras o números');

  const parent = input.parent_id ? await getCategory(input.parent_id) : null;
  const { path, level } = placement(parent, slug);

  const position = input.position ?? (await nextPosition(parent?.id ?? null));
  try {
    const [data] = await getDb()
      .insert(categoriesTable)
      .values({
        name,
        slug,
        parent_id: parent?.id ?? null,
        path,
        level,
        position,
        description: input.description?.trim() || null,
        icon: input.icon?.trim() || null,
        is_active: input.is_active ?? true,
      })
      .returning(CATEGORY_COLUMNS);
    return data as CanonicalCategory;
  } catch (error) {
    if (pgErrorCode(error) === '23505') throw new CategoryError(`Ya existe una categoría con el slug "${slug}"`, 409);
    throw error;
  }
}

/** Última posición entre los hermanos más uno, para que lo nuevo entre al final. */
async function nextPosition(parentId: string | null): Promise<number> {
  const [data] = await getDb()
    .select({ position: categoriesTable.position })
    .from(categoriesTable)
    .where(parentId ? eq(categoriesTable.parent_id, parentId) : isNull(categoriesTable.parent_id))
    .orderBy(desc(categoriesTable.position))
    .limit(1);
  return Number(data?.position ?? -1) + 1;
}

/**
 * Edita un nodo. Si cambia el slug o el padre, reescribe path y nivel del
 * nodo y de sus hijas: el path no se calcula al leer, se guarda, así que hay
 * que mantenerlo a mano.
 */
export async function updateCategory(id: string, input: CategoryInput): Promise<CanonicalCategory> {
  const current = await getCategory(id);
  const db = getDb();

  const name = input.name === undefined ? current.name : input.name.trim();
  if (!name) throw new CategoryError('El nombre es obligatorio');
  const slug = input.slug === undefined ? current.slug : slugify(input.slug.trim() || name);
  if (!slug) throw new CategoryError('El slug queda vacío; usá letras o números');

  const parentId = input.parent_id === undefined ? current.parent_id : input.parent_id;
  if (parentId === id) throw new CategoryError('Una categoría no puede ser su propia madre');

  const children = await listChildren(id);
  const parent = parentId ? await getCategory(parentId) : null;
  if (parent && children.length > 0) {
    throw new CategoryError(
      `"${current.name}" tiene ${children.length} subcategorías; no puede pasar a ser hija de otra.`,
    );
  }
  if (parent?.parent_id === id) throw new CategoryError('No se puede colgar una categoría de su propia hija');

  const { path, level } = placement(parent, slug);

  const patch: Partial<typeof categoriesTable.$inferInsert> = { name, slug, parent_id: parentId, path, level };
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.icon !== undefined) patch.icon = input.icon?.trim() || null;
  if (input.position !== undefined) patch.position = input.position;
  if (input.is_active !== undefined) patch.is_active = input.is_active;

  let data: CanonicalCategory | undefined;
  try {
    [data] = (await db
      .update(categoriesTable)
      .set(patch)
      .where(eq(categoriesTable.id, id))
      .returning(CATEGORY_COLUMNS)) as CanonicalCategory[];
  } catch (error) {
    if (pgErrorCode(error) === '23505') throw new CategoryError(`Ya existe una categoría con el slug "${slug}"`, 409);
    throw error;
  }
  if (!data) throw new CategoryError('La categoría no existe', 404);

  // Las hijas heredan el path nuevo. Son pocas por nodo; un update por hija
  // es más claro que una sentencia con `case`.
  if (path !== current.path || level !== current.level) {
    for (const child of children) {
      await db
        .update(categoriesTable)
        .set({ path: `${path}/${child.slug}`, level: level + 1 })
        .where(eq(categoriesTable.id, child.id));
    }
  }

  return data;
}

async function listChildren(id: string): Promise<CanonicalCategory[]> {
  const rows = await getDb().select(CATEGORY_COLUMNS).from(categoriesTable).where(eq(categoriesTable.parent_id, id));
  return rows as CanonicalCategory[];
}

/**
 * Borra un nodo. Solo si nada cuelga de él: ni hijas ni categorías de tienda.
 * Las llaves foráneas harían `set null` en silencio, y eso mandaría artículos
 * a "sin categorizar" sin que nadie lo pidiera.
 */
export async function deleteCategory(id: string): Promise<void> {
  const category = await getCategory(id);
  const db = getDb();

  const [[childrenRow], [mappedRow]] = await Promise.all([
    db.select({ n: count() }).from(categoriesTable).where(eq(categoriesTable.parent_id, id)),
    db.select({ n: count() }).from(storeCategoriesTable).where(eq(storeCategoriesTable.category_id, id)),
  ]);
  const children = { count: childrenRow?.n ?? 0 };
  const mapped = { count: mappedRow?.n ?? 0 };

  if ((children.count ?? 0) > 0) {
    throw new CategoryError(
      `"${category.name}" tiene ${children.count} subcategorías. Movelas o borralas primero.`,
    );
  }
  if ((mapped.count ?? 0) > 0) {
    throw new CategoryError(
      `"${category.name}" tiene ${mapped.count} categorías de tienda relacionadas. Reasignalas primero.`,
    );
  }

  // Un delete directo lo bloquea el candado de 0039; la función abre el
  // candado solo dentro de su propia transacción.
  await rpc('delete_category', { p_id: id });
}
