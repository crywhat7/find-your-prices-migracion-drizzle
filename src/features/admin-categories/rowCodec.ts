import type { CanonicalCategory, CanonicalUsage, StoreCategoryRow, StoreOption } from './types';

/**
 * Formato compacto de los datos del panel de categorías.
 *
 * Por qué existe. Son ~5 000 categorías de tienda. Como objetos (13 claves
 * repetidas en cada fila, tres uuid, el nombre repetido dentro de la ruta)
 * pesaban 2 MB, y metidos en la página Next los serializa dos veces (HTML y
 * payload de React): el worker de Cloudflare se pasaba del límite y cortaba
 * la respuesta a la mitad ("Connection closed.", error #412 de React).
 *
 * Acá cada fila es una tupla, la tienda y la categoría canónica van como
 * índice a una lista, y el nombre no viaja: es el último tramo de la ruta.
 */

export const ROW_SEPARATOR = ' › ';

/**
 * [id, tienda, external_id, ruta, activa, conteo de la tienda, conteo vivo,
 *  categoría canónica, nombre?]. El nombre solo viaja si no es el último
 *  tramo de la ruta (un nombre con "›" adentro, por ejemplo).
 */
export type CompactRow =
  | [string, number, string, string, 0 | 1, number | null, number, number]
  | [string, number, string, string, 0 | 1, number | null, number, number, string];

export interface CompactCategoryData {
  v: 1;
  categories: CanonicalCategory[];
  stores: StoreOption[];
  rows: CompactRow[];
}

export function encodeCategoryData(
  categories: CanonicalCategory[],
  stores: StoreOption[],
  rows: StoreCategoryRow[],
): CompactCategoryData {
  const storeIndex = new Map(stores.map((store, index) => [store.id, index]));
  const categoryIndex = new Map(categories.map((category, index) => [category.id, index]));
  return {
    v: 1,
    categories,
    stores,
    rows: rows.map((row): CompactRow => {
      const base: [string, number, string, string, 0 | 1, number | null, number, number] = [
        row.id,
        storeIndex.get(row.store_id) ?? -1,
        row.external_id,
        row.store_path,
        row.is_active ? 1 : 0,
        row.reported_count,
        row.live_count,
        row.category_id ? (categoryIndex.get(row.category_id) ?? -2) : -1,
      ];
      const last = row.store_path.split(ROW_SEPARATOR).pop();
      return last === row.name ? base : [...base, row.name];
    }),
  };
}

/**
 * De vuelta a filas. Una categoría canónica que ya no existe (-2) se
 * conserva como id desconocido para que el panel la muestre como "(nodo
 * borrado)" en vez de esconder el mapeo roto.
 */
export function decodeCategoryData(data: CompactCategoryData): {
  categories: CanonicalCategory[];
  stores: StoreOption[];
  storeCategories: StoreCategoryRow[];
} {
  const storeCategories = data.rows.map(([id, storeIdx, externalId, path, active, reported, live, categoryIdx, name]) => {
    const store = data.stores[storeIdx];
    const segments = path.split(ROW_SEPARATOR);
    return {
      id,
      store_id: store?.id ?? '',
      store_name: store?.name ?? '',
      external_id: externalId,
      name: name ?? segments[segments.length - 1] ?? path,
      store_path: path,
      is_active: active === 1,
      reported_count: reported,
      live_count: live,
      category_id: categoryIdx >= 0 ? (data.categories[categoryIdx]?.id ?? null) : categoryIdx === -2 ? 'deleted' : null,
    };
  });
  return { categories: data.categories, stores: data.stores, storeCategories };
}

/** Cuántas categorías de tienda y artículos cuelgan de cada nodo canónico. */
export function computeUsage(rows: StoreCategoryRow[]): Record<string, CanonicalUsage> {
  const usage: Record<string, CanonicalUsage> = {};
  for (const row of rows) {
    if (!row.category_id) continue;
    const entry = (usage[row.category_id] ??= { storeCategories: 0, products: 0 });
    entry.storeCategories += 1;
    entry.products += row.live_count;
  }
  return usage;
}
