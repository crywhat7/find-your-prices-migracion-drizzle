import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Aviso de error dentro del panel. Reemplaza la caja roja con el mensaje
 * crudo de Postgres: primero qué pasó en palabras y qué se puede hacer, y el
 * detalle técnico plegado, para quien lo necesite. Con el número de la
 * bitácora cuando quedó anotado, enlazado a /admin/errores.
 *
 * Sirve tanto para errores atrapados en el servidor como dentro del
 * `error.tsx` del panel (por eso no usa nada de servidor).
 */
export function AdminErrorNotice({
  title = 'No se pudo cargar esta parte del panel',
  hint,
  detail,
  logId,
  digest,
  action,
}: {
  title?: string;
  hint?: string;
  /** El mensaje técnico (Postgres, PostgREST, la excepción). */
  detail?: string | null;
  logId?: number | null;
  digest?: string | null;
  /** El botón de reintentar: un enlace o un botón, según quién lo use. */
  action?: ReactNode;
}) {
  const reference = logId ? `#${logId}` : digest ?? null;

  return (
    <div role="alert" className="rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--critical-soft)] text-[var(--critical)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M12 8v5" />
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor" />
            <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.125rem] font-semibold tracking-[-0.015em] text-[var(--text)]">{title}</h2>
          <p className="mt-1 max-w-[62ch] text-[0.875rem] leading-[1.55] text-[var(--text-secondary)]">
            {hint ?? 'Quedó anotado en la bitácora de errores. Probá de nuevo; si sigue, el detalle de abajo dice qué falló.'}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {action}
            <Link
              href="/admin/errores"
              className="text-[0.8125rem] text-[var(--accent)] underline-offset-[3px] hover:underline"
            >
              Ver bitácora de errores{reference ? ` (${reference})` : ''}
            </Link>
          </div>

          {detail && (
            <details className="mt-5 text-[0.8125rem]">
              <summary className="cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text)]">Detalle técnico</summary>
              <pre className="mt-2 overflow-x-auto rounded-xl bg-[var(--bg-subtle)] px-4 py-3 font-mono text-[0.75rem] leading-[1.6] whitespace-pre-wrap text-[var(--text-secondary)]">
                {detail}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

export const retryLinkClass =
  'rounded-full bg-[var(--text)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
