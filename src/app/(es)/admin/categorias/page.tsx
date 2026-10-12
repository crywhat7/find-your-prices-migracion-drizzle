import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { loadCategoryAdminData } from '@/server/services/categories';
import { CategoryAdmin } from '@/features/admin-categories/CategoryAdmin';
import { hasAdminSession } from '@/server/admin/session';
import Link from 'next/link';
import { AdminErrorNotice, retryLinkClass } from '@/features/errors/AdminErrorNotice';
import { logError } from '@/server/errors/logError';

/**
 * Panel de categorías.
 *
 * Dos trabajos en una pantalla: relacionar las categorías de cada tienda con
 * el árbol propio del sitio, y mantener ese árbol. Los datos se leen acá con
 * la service key; las acciones van contra /api/admin/categories/*.
 *
 * Misma situación de acceso que el panel de scraping: abierto hasta que
 * entre OAuth; ADMIN_API_SECRET cierra la API.
 */

export const metadata: Metadata = {
  title: 'Panel de categorías',
  robots: NO_INDEX_ROBOTS,
};

export const dynamic = 'force-dynamic';

type LoadResult =
  | { ok: true; data: Awaited<ReturnType<typeof loadCategoryAdminData>> }
  | { ok: false; message: string; logId: number | null };

async function load(): Promise<LoadResult> {
  try {
    return { ok: true, data: await loadCategoryAdminData() };
  } catch (error) {
    // Se muestra un aviso en vez de romper la página entera, y el motivo
    // queda en la bitácora: antes desaparecía con la recarga.
    const logId = await logError({ source: 'handled', error, path: '/admin/categorias', route: '/admin/categorias' });
    return { ok: false, message: error instanceof Error ? error.message : String(error), logId };
  }
}

export default async function CategoryAdminPage() {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  const result = await load();
  if (result.ok) return <CategoryAdmin {...result.data} />;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
          <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
            Panel
          </Link>
        </p>
        <h1 className="mt-6 text-[clamp(2rem,5vw,3.25rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
          Árbol y mapeo de categorías
        </h1>
        <div className="mt-8">
          <AdminErrorNotice
            title="No se pudieron leer las categorías"
            hint={
              /timeout/i.test(result.message)
                ? 'La base tardó demasiado en responder. Probá de nuevo en un momento; si se repite, revisá la bitácora.'
                : undefined
            }
            detail={result.message}
            logId={result.logId}
            action={
              <Link href="/admin/categorias" className={retryLinkClass}>
                Reintentar
              </Link>
            }
          />
        </div>
      </div>
    </div>
  );
}
