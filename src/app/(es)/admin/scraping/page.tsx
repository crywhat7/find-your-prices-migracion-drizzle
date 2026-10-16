import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { asc, count, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { pgErrorMessage } from '@/server/db/pg';
import { priceHistory, scrapeRuns, storeProducts, stores as storesTable, vScrapeTargetHealth } from '@/server/db/schema';
import { listStrategies } from '@/server/scraping/registry';
import { recoverStaleRuns } from '@/server/scraping/runner';
import { ScrapingDashboard } from '@/features/admin-scraping/ScrapingDashboard';
import type { RunSummary, StoreOption, TargetHealth } from '@/features/admin-scraping/types';
import { hasAdminSession } from '@/server/admin/session';
import { logError } from '@/server/errors/logError';

/**
 * Panel de scraping.
 *
 * Los datos se leen aqui, en el servidor, con la service key: el navegador
 * nunca ve credenciales de la base. Las acciones (crear, correr, pausar) van
 * contra /api/scraping/*.
 *
 * La ruta esta abierta a proposito en esta etapa. Cuando entre OAuth: proteger
 * este segmento y definir ADMIN_API_SECRET para cerrar tambien la API.
 */

/**
 * Fuera del indice, por partida doble: `noindex` aqui y `Disallow: /admin` en
 * robots.ts. No es redundante — robots.txt impide rastrear pero no indexar, y
 * una URL bloqueada alli igual aparece en resultados si alguien la enlaza. La
 * unica etiqueta que la saca del indice es esta.
 */
export const metadata: Metadata = {
  title: 'Panel de scraping',
  robots: NO_INDEX_ROBOTS,
};

// Siempre datos frescos: es un tablero operativo.
export const dynamic = 'force-dynamic';

interface LoadResult {
  targets: TargetHealth[];
  stores: StoreOption[];
  recentRuns: RunSummary[];
  metrics: DashboardMetrics;
  error: string | null;
}

/** Cifras del encabezado. Son la razón de ser del panel, no adorno. */
export interface DashboardMetrics {
  trackedProducts: number;
  pricePoints: number;
  activeStores: number;
}

async function loadDashboardData(): Promise<LoadResult> {
  try {
    const db = getDb();

    // Abrir el panel cierra las corridas que dejaron de latir: si no, se verian
    // en 'running' hasta el proximo disparo del cron.
    await recoverStaleRuns();

    const [targets, stores, recentRuns, [productsCount], [pricesCount]] = await Promise.all([
      db
        .select()
        .from(vScrapeTargetHealth)
        .orderBy(asc(vScrapeTargetHealth.store_name), asc(vScrapeTargetHealth.target_name)),
      db
        .select({
          id: storesTable.id,
          slug: storesTable.slug,
          name: storesTable.name,
          strategy_key: storesTable.strategy_key,
          is_active: storesTable.is_active,
        })
        .from(storesTable)
        .orderBy(asc(storesTable.name)),
      db.select().from(scrapeRuns).orderBy(desc(scrapeRuns.started_at)).limit(20),
      db.select({ n: count() }).from(storeProducts).where(eq(storeProducts.is_active, true)),
      db.select({ n: count() }).from(priceHistory),
    ]);

    return {
      targets: targets as TargetHealth[],
      stores: stores as StoreOption[],
      recentRuns: recentRuns as RunSummary[],
      metrics: {
        trackedProducts: productsCount?.n ?? 0,
        pricePoints: pricesCount?.n ?? 0,
        activeStores: stores.filter((store) => store.is_active).length,
      },
      error: null,
    };
  } catch (error) {
    // Antes de correr las migraciones el esquema no existe: se muestra el
    // motivo en pantalla en vez de romper la pagina entera. Y queda anotado.
    await logError({ source: 'handled', error, path: '/admin/scraping', route: '/admin/scraping' });
    return {
      targets: [],
      stores: [],
      recentRuns: [],
      metrics: { trackedProducts: 0, pricePoints: 0, activeStores: 0 },
      error: pgErrorMessage(error),
    };
  }
}

export default async function ScrapingAdminPage() {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  const { targets, stores, recentRuns, metrics, error } = await loadDashboardData();

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-24">
        <h1 className="text-2xl font-semibold text-[var(--text)]">Panel de scraping</h1>
        <div className="mt-6 rounded-2xl border border-red-500/25 bg-red-500/8 p-6">
          <p className="text-sm font-medium text-red-700 dark:text-red-300">
            No se pudo leer la base de datos
          </p>
          <p className="mt-2 font-mono text-xs text-[var(--text-secondary)]">{error}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
            <li>
              Corriste las migraciones de{' '}
              <code className="rounded bg-[var(--bg-inset)] px-1">src/db/migrations</code> en orden?
            </li>
            <li>
              Esta <code className="rounded bg-[var(--bg-inset)] px-1">DATABASE_URL</code> en .env.local
              (o el binding <code className="rounded bg-[var(--bg-inset)] px-1">HYPERDRIVE</code> en
              producción)?
            </li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <ScrapingDashboard
      targets={targets}
      stores={stores}
      strategies={listStrategies()}
      recentRuns={recentRuns}
      metrics={metrics}
      cronPath="/api/scraping/run?secret=…"
    />
  );
}
