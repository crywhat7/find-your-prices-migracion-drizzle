import 'server-only';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { pgErrorCode, pgErrorMessage } from '@/server/db/pg';
import { rpc } from '@/server/db/rpc';
import { scrapeRuns, scrapeTargets, storeCategories, stores } from '@/server/db/schema';
import { nextRunFromAnchor } from '@/lib/schedule';
import { logError } from '@/server/errors/logError';
import type {
  NormalizedCategory,
  NormalizedProduct,
  ScrapeRunStatus,
  ScrapeTargetRow,
  ScrapeTrigger,
  StoreRow,
} from './types';

/**
 * Acceso a datos del scraping. Aisla al runner de la base: si mañana se
 * cambia de proveedor, solo cambia este archivo.
 */

/**
 * Cuantos productos van por llamada a `ingest_store_products`.
 * Un catalogo completo de Diunsa son ~8000 articulos con su payload original;
 * mandarlos juntos serian decenas de MB en un solo request. En lotes de 250 el
 * json ronda 1 MB y la corrida sigue siendo de pocos segundos.
 */
const INGEST_CHUNK_SIZE = 250;

export interface IngestCounters {
  items_found: number;
  items_new: number;
  items_updated: number;
  items_unchanged: number;
  price_changes: number;
}

// -----------------------------------------------------------------------------
// Tiendas y targets
// -----------------------------------------------------------------------------

/** Corre una consulta y, si falla, lanza con un mensaje que dice qué se intentaba. */
async function attempt<T>(what: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(`${what}: ${pgErrorMessage(error)}`);
  }
}

export async function getStoreById(storeId: string): Promise<StoreRow> {
  const [row] = await attempt(`No se pudo leer la tienda ${storeId}`, () =>
    getDb().select().from(stores).where(eq(stores.id, storeId)),
  );
  if (!row) throw new Error(`No se pudo leer la tienda ${storeId}: no existe`);
  return row as StoreRow;
}

export async function getTargetById(targetId: string): Promise<ScrapeTargetRow> {
  const [row] = await attempt(`No se pudo leer el target ${targetId}`, () =>
    getDb().select().from(scrapeTargets).where(eq(scrapeTargets.id, targetId)),
  );
  if (!row) throw new Error(`No se pudo leer el target ${targetId}: no existe`);
  return row as ScrapeTargetRow;
}

/**
 * Targets que ya tocaba correr, mas urgente primero. Es lo que consulta el
 * endpoint de cron en cada disparo.
 */
export async function getDueTargets(limit: number): Promise<ScrapeTargetRow[]> {
  const rows = await attempt('No se pudieron listar los targets pendientes', () =>
    getDb()
      .select()
      .from(scrapeTargets)
      .where(and(eq(scrapeTargets.is_active, true), lte(scrapeTargets.next_run_at, new Date().toISOString())))
      .orderBy(asc(scrapeTargets.priority), asc(scrapeTargets.next_run_at))
      .limit(limit),
  );
  return rows as ScrapeTargetRow[];
}

// -----------------------------------------------------------------------------
// Ciclo de vida de una corrida
// -----------------------------------------------------------------------------

export async function createRun(params: {
  targetId: string;
  storeId: string;
  strategyKey: string;
  trigger: ScrapeTrigger;
}): Promise<{ runId: string } | { skipped: true; reason: string }> {
  try {
    const [row] = await getDb()
      .insert(scrapeRuns)
      .values({
        target_id: params.targetId,
        store_id: params.storeId,
        strategy_key: params.strategyKey,
        trigger_source: params.trigger,
        status: 'running',
      })
      .returning({ id: scrapeRuns.id });
    return { runId: row.id };
  } catch (error) {
    // El indice unico parcial scrape_runs_one_active_per_target impide dos
    // corridas simultaneas del mismo target: no es un fallo, es el lock haciendo
    // su trabajo (por ejemplo si el cron se solapa con una corrida lenta).
    if (pgErrorCode(error) === '23505') {
      return { skipped: true, reason: 'Ya hay una corrida en curso para este target' };
    }
    throw new Error(`No se pudo abrir la corrida: ${pgErrorMessage(error)}`);
  }
}

/**
 * Latido de una corrida en curso: donde va y cuando dio senal por ultima vez.
 * Vive en `stats.progress` para no necesitar columnas nuevas.
 */
export interface RunProgress {
  /** Ultima senal de vida (ISO). */
  at: string;
  stage: string;
  httpRequests: number;
  httpErrors: number;
  bytes: number;
  lastMessage?: string;
}

/**
 * Escribe el latido. Nunca lanza: perder un latido no debe tumbar la corrida,
 * el siguiente lo repone.
 */
export async function recordHeartbeat(
  runId: string,
  progress: RunProgress,
  log: Array<Record<string, unknown>>,
): Promise<void> {
  try {
    await getDb()
      .update(scrapeRuns)
      .set({
        stats: { progress },
        http_requests: progress.httpRequests,
        http_errors: progress.httpErrors,
        bytes_downloaded: progress.bytes,
        // Las ultimas entradas: si la funcion muere, esto es lo que queda.
        error_log: log.slice(-40),
      })
      .where(and(eq(scrapeRuns.id, runId), eq(scrapeRuns.status, 'running')));
  } catch (error) {
    console.error(`[scraping] No se pudo registrar el latido de ${runId}: ${pgErrorMessage(error)}`);
  }
}

/**
 * Cierra como 'failed' las corridas en 'running' que dejaron de dar senal.
 *
 * Una corrida solo queda asi cuando el proceso murio (o el host lo congelo)
 * antes de llegar a `finishRun`. Ademas de mentir en la bitacora, el huerfano
 * deja tomado el lock de `scrape_runs_one_active_per_target` y su target nunca
 * se reprograma: queda vencido para siempre, encabeza la cola de
 * `getDueTargets` y cada disparo del cron choca con el lock sin dejar rastro.
 *
 * Una corrida viva late cada pocos segundos (`recordHeartbeat`); se da por
 * muerta cuando su ultima senal (o su arranque, si nunca latio) tiene mas de
 * `silenceMs`. El motivo que queda escrito dice donde iba cuando se apago.
 *
 * Devuelve los targets afectados para que el runner los reprograme como fallo.
 */
export async function reapStaleRuns(silenceMs: number): Promise<string[]> {
  const db = getDb();
  const data = await attempt('No se pudieron leer las corridas en curso', () =>
    db
      .select({
        id: scrapeRuns.id,
        target_id: scrapeRuns.target_id,
        started_at: scrapeRuns.started_at,
        stats: scrapeRuns.stats,
      })
      .from(scrapeRuns)
      .where(eq(scrapeRuns.status, 'running')),
  );

  const now = Date.now();
  const reaped: string[] = [];

  for (const run of data) {
    const progress = (run.stats as { progress?: RunProgress } | null)?.progress;
    const lastSignal = progress?.at ?? (run.started_at as string);
    if (now - new Date(lastSignal).getTime() < silenceMs) continue;

    const aliveFor = Math.round((new Date(lastSignal).getTime() - new Date(run.started_at as string).getTime()) / 1000);
    const detail = progress
      ? `Ultima senal ${aliveFor} s despues de arrancar, en la etapa "${progress.stage}" ` +
        `(${progress.httpRequests} requests${progress.lastMessage ? `; ultimo mensaje: ${progress.lastMessage}` : ''})`
      : 'No llego a dar ninguna senal despues de arrancar';

    await attempt(`No se pudo cerrar la corrida colgada ${run.id}`, () =>
      db
        .update(scrapeRuns)
        .set({
          status: 'failed',
          finished_at: new Date().toISOString(),
          duration_ms: aliveFor * 1000,
          error_message: `Corrida abandonada: el proceso dejo de responder antes de cerrarla. ${detail}`,
        })
        .where(and(eq(scrapeRuns.id, run.id), eq(scrapeRuns.status, 'running'))),
    );
    if (run.target_id) reaped.push(run.target_id);
  }

  return [...new Set(reaped)];
}

export async function finishRun(
  runId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  // `patch` lo arma el runner con nombres de columna de scrape_runs.
  const values = { ...patch, finished_at: new Date().toISOString() } as Partial<typeof scrapeRuns.$inferInsert>;
  await attempt(`No se pudo cerrar la corrida ${runId}`, () =>
    getDb().update(scrapeRuns).set(values).where(eq(scrapeRuns.id, runId)),
  );
}

/**
 * Actualiza la planificacion del target segun como salio la corrida.
 * Tras `failure_threshold` fallos seguidos el target se pausa solo, para no
 * seguir golpeando un sitio que cambio de estructura o nos esta bloqueando.
 */
export async function updateTargetAfterRun(params: {
  target: ScrapeTargetRow;
  status: ScrapeRunStatus;
  errorMessage?: string | null;
}): Promise<void> {
  const { target, status } = params;
  const succeeded = status === 'success' || status === 'partial';
  const failures = succeeded ? 0 : target.consecutive_failures + 1;
  const shouldPause = !succeeded && failures >= target.failure_threshold;

  const frequency = target.frequency_minutes ?? 24 * 60;

  /**
   * Reprogramacion.
   *
   * Con exito se salta al siguiente punto de la rejilla `ancla + k*intervalo`,
   * NO a `ahora + intervalo`. La diferencia importa para toda agenda de
   * calendario: sumar desde el final de la corrida empuja el horario unos
   * segundos cada vez, y en un mes "los lunes a las 08:00" ya cae en cualquier
   * lado (ver src/db/migrations/0023_schedule_anchor.sql).
   *
   * Tras un fallo se sale de la rejilla a proposito: se reintenta antes, con
   * backoff creciente para no insistir cada minuto sobre un sitio caido. En
   * cuanto una corrida vuelve a salir bien, la formula de arriba lo devuelve
   * solo a su horario.
   */
  const anchor = target.schedule_anchor_at;
  const nextRunAt = succeeded
    ? // Sin ancla (targets anteriores a la migracion 0023) se conserva el
      // comportamiento viejo en vez de inventar una rejilla.
      anchor
      ? nextRunFromAnchor(anchor, frequency)
      : new Date(Date.now() + frequency * 60_000)
    : new Date(Date.now() + Math.min(frequency, 5 * 2 ** Math.min(failures, 5)) * 60_000);

  const patch: Partial<typeof scrapeTargets.$inferInsert> = {
    last_run_at: new Date().toISOString(),
    last_status: status,
    consecutive_failures: failures,
    next_run_at: nextRunAt.toISOString(),
  };

  if (succeeded) patch.last_success_at = new Date().toISOString();
  if (shouldPause) {
    patch.is_active = false;
    patch.paused_reason = `Pausado automaticamente tras ${failures} fallos seguidos. Ultimo error: ${
      params.errorMessage ?? 'sin detalle'
    }`;
  }

  await attempt(`No se pudo reprogramar el target ${target.id}`, () =>
    getDb().update(scrapeTargets).set(patch).where(eq(scrapeTargets.id, target.id)),
  );
}

// -----------------------------------------------------------------------------
// Categorias
// -----------------------------------------------------------------------------

/**
 * Guarda el arbol crudo de la tienda y devuelve el mapa
 * `codigo externo -> id interno`, que el runner usa para enlazar cada producto
 * con su categoria.
 */
export async function upsertStoreCategories(
  storeId: string,
  categories: NormalizedCategory[],
): Promise<Map<string, string>> {
  const db = getDb();

  if (categories.length > 0) {
    const rows = categories.map((c) => ({
      store_id: storeId,
      external_id: c.external_id,
      external_parent_id: c.external_parent_id ?? null,
      name: c.name,
      slug: c.slug ?? null,
      url: c.url ?? null,
      level: c.level ?? 0,
      position: c.position ?? null,
      product_count: c.product_count ?? null,
      raw: c.raw ?? {},
      is_active: true,
      last_seen_at: new Date().toISOString(),
    }));

    // Igual que el upsert de PostgREST: lo que viene pisa todo lo que se manda,
    // y lo que no se manda (category_id, parent_id) queda como estaba.
    await attempt('No se pudieron guardar las categorias', () =>
      db
        .insert(storeCategories)
        .values(rows)
        .onConflictDoUpdate({
          target: [storeCategories.store_id, storeCategories.external_id],
          set: {
            external_parent_id: sql`excluded.external_parent_id`,
            name: sql`excluded.name`,
            slug: sql`excluded.slug`,
            url: sql`excluded.url`,
            level: sql`excluded.level`,
            position: sql`excluded.position`,
            product_count: sql`excluded.product_count`,
            raw: sql`excluded.raw`,
            is_active: sql`excluded.is_active`,
            last_seen_at: sql`excluded.last_seen_at`,
          },
        }),
    );

    // Segunda pasada: ahora que todas existen, se enlaza cada una con su padre.
    await linkCategoryParents(storeId);
  }

  const data = await attempt('No se pudo leer el mapa de categorias', () =>
    db
      .select({ id: storeCategories.id, external_id: storeCategories.external_id })
      .from(storeCategories)
      .where(eq(storeCategories.store_id, storeId)),
  );

  return new Map(data.map((row) => [row.external_id, row.id]));
}

/** Resuelve external_parent_id -> parent_id dentro de una misma tienda. */
async function linkCategoryParents(storeId: string): Promise<void> {
  const db = getDb();
  const data = await attempt('No se pudo leer el arbol de categorias', () =>
    db
      .select({
        id: storeCategories.id,
        external_id: storeCategories.external_id,
        external_parent_id: storeCategories.external_parent_id,
        parent_id: storeCategories.parent_id,
      })
      .from(storeCategories)
      .where(eq(storeCategories.store_id, storeId)),
  );

  const byExternal = new Map(data.map((row) => [row.external_id, row]));
  const updates = data
    .filter((row) => row.external_parent_id)
    .map((row) => ({ row, parent: byExternal.get(row.external_parent_id as string) }))
    .filter(({ row, parent }) => parent && parent.id !== row.id && row.parent_id !== parent.id)
    .map(({ row, parent }) => ({ id: row.id, parent_id: parent!.id }));

  for (const update of updates) {
    await db.update(storeCategories).set({ parent_id: update.parent_id }).where(eq(storeCategories.id, update.id));
  }
}

// -----------------------------------------------------------------------------
// Ingesta de productos
// -----------------------------------------------------------------------------

/**
 * Envia los productos a `find_your_prices.ingest_store_products`, que resuelve
 * alta/actualizacion, historico de precios, imagenes y variantes del lado de
 * Postgres. Se manda por lotes para no armar un request gigante.
 */
/** Lote minimo al partir: por debajo de esto el problema no es el tamaño. */
const INGEST_MIN_CHUNK_SIZE = 10;

/**
 * Postgres corta toda sentencia que pase su `statement_timeout`. Un lote de 250
 * con muchas imagenes o cambios de precio a veces no alcanza, y el corte hace
 * rollback del lote entero: reintentarlo partido es seguro.
 */
function isStatementTimeout(message: string): boolean {
  return /statement timeout|canceling statement/i.test(message);
}

export async function ingestProducts(
  storeId: string,
  runId: string,
  products: NormalizedProduct[],
  onSplit?: (message: string) => void,
): Promise<IngestCounters> {
  const totals: IngestCounters = {
    items_found: 0,
    items_new: 0,
    items_updated: 0,
    items_unchanged: 0,
    price_changes: 0,
  };

  const ingestChunk = async (offset: number, chunk: NormalizedProduct[]): Promise<void> => {
    let data: Partial<IngestCounters> | null;
    try {
      data = await rpc<Partial<IngestCounters> | null>('ingest_store_products', {
        p_store_id: storeId,
        p_run_id: runId,
        p_items: chunk,
      });
    } catch (failure) {
      const message = pgErrorMessage(failure);
      if (isStatementTimeout(message) && chunk.length > INGEST_MIN_CHUNK_SIZE) {
        const half = Math.ceil(chunk.length / 2);
        onSplit?.(
          `Lote ${offset}-${offset + chunk.length} excedio el tiempo de la base; se reintenta en dos de ${half}`,
        );
        await ingestChunk(offset, chunk.slice(0, half));
        await ingestChunk(offset + half, chunk.slice(half));
        return;
      }
      throw new Error(
        `Fallo la ingesta del lote ${offset}-${offset + chunk.length}: ${message}`,
      );
    }

    const counters = data ?? {};
    totals.items_found += counters.items_found ?? 0;
    totals.items_new += counters.items_new ?? 0;
    totals.items_updated += counters.items_updated ?? 0;
    totals.items_unchanged += counters.items_unchanged ?? 0;
    totals.price_changes += counters.price_changes ?? 0;
  };

  for (let offset = 0; offset < products.length; offset += INGEST_CHUNK_SIZE) {
    await ingestChunk(offset, products.slice(offset, offset + INGEST_CHUNK_SIZE));
  }

  return totals;
}

/**
 * Desactiva lo que dejo de aparecer. Solo tiene sentido despues de un barrido
 * de catalogo completo: llamarlo tras scrapear una categoria daria de baja el
 * resto de la tienda.
 */
export async function markDelistedProducts(storeId: string, runId: string): Promise<number> {
  const data = await attempt('No se pudieron marcar los productos retirados', () =>
    rpc<number | null>('mark_delisted_products', {
      p_store_id: storeId,
      p_run_id: runId,
      p_scope_store_category_id: null,
    }),
  );
  return data ?? 0;
}

/**
 * Refresca `mv_catalog`, la materializada que lee el catálogo público
 * (migración 0030). Es lo que hace visible una corrida: hasta que corre, la
 * portada y la búsqueda siguen mostrando el estado anterior.
 *
 * Nunca lanza: un refresco fallido no debe convertir una corrida buena en una
 * fallida, y el pg_cron de respaldo lo reintenta solo. Devuelve `null` en ese
 * caso para que el llamador lo anote.
 */
export async function refreshCatalog(
  triggeredBy: string,
): Promise<{ durationMs: number } | null> {
  let payload: { duration_ms?: number } | null;
  try {
    payload = await rpc<{ duration_ms?: number } | null>('refresh_catalog', { p_triggered_by: triggeredBy });
  } catch (error) {
    // Si esto falla, el catálogo público queda con los precios de la corrida
    // anterior sin que nadie lo note: va a la bitácora.
    await logError({
      source: 'handled',
      error: new Error(`No se pudo refrescar el catálogo: ${pgErrorMessage(error)}`),
      route: 'refresh_catalog',
      context: { triggeredBy, code: pgErrorCode(error) },
    });
    return null;
  }
  return { durationMs: Number(payload?.duration_ms ?? 0) };
}
