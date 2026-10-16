import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { stores } from '@/server/db/schema';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { storeIndexPaths, storePaths } from '@/lib/seo/storeSeo';
import { CATALOG_SEARCH_CACHE_TAG } from './catalog';

/**
 * Mantenimiento de la imagen de cada tienda (migración 0033): subida a
 * Storage, texto alternativo y baja de la imagen.
 *
 * Es la contraparte de escritura de `storePages.ts`, y la hermana de
 * `categoryContent.ts`: mismas reglas de nombre de objeto, misma limpieza
 * de la foto anterior y misma revalidación de las landings afectadas.
 *
 * Las filas van por Drizzle; los archivos siguen en Supabase Storage hasta la
 * fase 3 de docs/migracion-drizzle.md (R2).
 */

export const STORE_IMAGES_BUCKET = 'store-images';

export interface StoreContentRow {
  id: string;
  slug: string;
  name: string;
  baseUrl: string;
  isActive: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
}

export async function listStoresForContent(): Promise<StoreContentRow[]> {
  const rows = await getDb()
    .select({
      id: stores.id,
      slug: stores.slug,
      name: stores.name,
      base_url: stores.base_url,
      is_active: stores.is_active,
      logo_url: stores.logo_url,
      image_alt: stores.image_alt,
    })
    .from(stores)
    .orderBy(asc(stores.name));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    baseUrl: row.base_url ?? '',
    isActive: row.is_active,
    imageUrl: row.logo_url ?? null,
    imageAlt: row.image_alt ?? null,
  }));
}

export async function getStoreForContent(id: string): Promise<StoreContentRow | null> {
  const rows = await listStoresForContent();
  return rows.find((row) => row.id === id) ?? null;
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

async function readStore(id: string): Promise<{ slug: string; logo_url: string | null }> {
  const [store] = await getDb()
    .select({ slug: stores.slug, logo_url: stores.logo_url })
    .from(stores)
    .where(eq(stores.id, id));
  if (!store) throw new Error('Tienda no encontrada.');
  return store;
}

export async function saveStoreContent(id: string, input: { imageAlt: string }): Promise<void> {
  const [store] = await getDb()
    .update(stores)
    .set({ image_alt: nullable(input.imageAlt) })
    .where(eq(stores.id, id))
    .returning({ slug: stores.slug });
  if (!store) throw new Error('Tienda no encontrada.');
  revalidateStore(store.slug);
}

/**
 * Sube la imagen al bucket y guarda su URL pública en `logo_url`.
 *
 * El nombre del objeto es `<slug>-<hash corto>.<ext>` para que reemplazar la
 * foto cambie la URL: la anterior queda en cachés y con la misma ruta
 * seguiría viéndose la vieja durante horas.
 */
export async function uploadStoreImage(id: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo tiene que ser una imagen.');
  if (file.size > 5 * 1024 * 1024) throw new Error('La imagen no puede pasar de 5 MB.');

  const store = await readStore(id);

  const extension = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectPath = `${store.slug}-${Date.now().toString(36)}.${extension}`;

  // Los bytes y no el `File`: ver `uploadCategoryImage`.
  const bytes = await file.arrayBuffer();
  const storage = getSupabaseAdmin().storage;
  const upload = await storage
    .from(STORE_IMAGES_BUCKET)
    .upload(objectPath, bytes, { contentType: file.type, cacheControl: '31536000', upsert: false });
  if (upload.error) throw new Error(`No se pudo subir la imagen: ${upload.error.message}`);

  const { data } = storage.from(STORE_IMAGES_BUCKET).getPublicUrl(objectPath);
  const publicUrl = data.publicUrl;

  await getDb().update(stores).set({ logo_url: publicUrl }).where(eq(stores.id, id));

  await removeStoredObject(store.logo_url);
  revalidateStore(store.slug);
  return publicUrl;
}

export async function removeStoreImage(id: string): Promise<void> {
  const store = await readStore(id);

  await getDb().update(stores).set({ logo_url: null }).where(eq(stores.id, id));

  await removeStoredObject(store.logo_url);
  revalidateStore(store.slug);
}

/** Borra el objeto del bucket si la URL es de este bucket. Nunca lanza. */
async function removeStoredObject(url: string | null): Promise<void> {
  if (!url) return;
  const marker = `/object/public/${STORE_IMAGES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const objectPath = decodeURIComponent(url.slice(index + marker.length));
  await getSupabaseAdmin().storage.from(STORE_IMAGES_BUCKET).remove([objectPath]);
}

/**
 * Tira las copias ISR del índice y de la landing de la tienda. Las de
 * tienda × categoría son muchas y caducan solas en una hora: la imagen
 * cambia una vez, no vale la pena enumerarlas.
 */
function revalidateStore(slug: string): void {
  for (const path of [...Object.values(storePaths(slug)), ...Object.values(storeIndexPaths())]) {
    revalidatePath(path);
  }
  revalidateTag(CATALOG_SEARCH_CACHE_TAG, 'max');
}
