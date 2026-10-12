'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminErrorNotice, retryLinkClass } from '@/features/errors/AdminErrorNotice';
import { reportClientError } from '@/features/errors/reportClientError';
import { CategoryAdmin } from './CategoryAdmin';
import { computeUsage, decodeCategoryData, type CompactCategoryData } from './rowCodec';

const ENDPOINT = '/admin/categorias/datos';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string; logId: number | null }
  | { status: 'ready'; data: ReturnType<typeof decodeCategoryData> & { usage: ReturnType<typeof computeUsage> } };

/**
 * Trae los datos del panel de categorías después de pintar la página.
 *
 * Antes iban dentro de la página: ~5 000 filas, 2 MB, serializadas dos veces
 * por Next, y el worker de Cloudflare cortaba la respuesta a la mitad
 * ("Connection closed."). Ahora la página sale liviana y las filas llegan en
 * una sola respuesta JSON compacta. Después de mapear o editar se vuelven a
 * pedir, en segundo plano y sin perder lo que había en pantalla.
 */
export function CategoryAdminLoader() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async (): Promise<State> => {
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' });
      const payload = (await response.json().catch(() => ({}))) as CompactCategoryData & { error?: string; logId?: number };
      if (!response.ok || payload.error) {
        return { status: 'error', message: payload.error ?? `La petición falló con estado ${response.status}`, logId: payload.logId ?? null };
      }
      const decoded = decodeCategoryData(payload);
      return { status: 'ready', data: { ...decoded, usage: computeUsage(decoded.storeCategories) } };
    } catch (error) {
      reportClientError(error, 'categorias-datos');
      return { status: 'error', message: error instanceof Error ? error.message : String(error), logId: null };
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [load]);

  /** Recarga después de un cambio: lo de pantalla se queda hasta que llega lo nuevo. */
  const refresh = useCallback(() => {
    void load().then((next) => setState((current) => (next.status === 'ready' || current.status !== 'ready' ? next : current)));
  }, [load]);

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen bg-[var(--bg)] px-6 pt-20 sm:px-10 lg:px-16" aria-busy="true">
        <div className="mx-auto w-full max-w-6xl">
          <p role="status" className="text-[0.875rem] text-[var(--text-tertiary)]">
            Cargando categorías de tienda…
          </p>
          <div className="mt-8 space-y-2" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-xl bg-[var(--bg-subtle)]" style={{ opacity: 1 - index * 0.1 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="min-h-screen bg-[var(--bg)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-4xl">
          <AdminErrorNotice
            title="No se pudieron leer las categorías"
            hint={/timeout/i.test(state.message) ? 'La base tardó demasiado en responder. Probá de nuevo en un momento.' : undefined}
            detail={state.message}
            logId={state.logId}
            action={
              <button
                type="button"
                onClick={() => {
                  setState({ status: 'loading' });
                  refresh();
                }}
                className={retryLinkClass}
              >
                Reintentar
              </button>
            }
          />
        </div>
      </div>
    );
  }

  return <CategoryAdmin {...state.data} onChanged={refresh} />;
}
