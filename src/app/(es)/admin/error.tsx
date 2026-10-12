"use client";

import Link from "next/link";
import { AdminErrorNotice, retryLinkClass } from "@/features/errors/AdminErrorNotice";

/**
 * Pantalla de error del panel. Sin la navegación pública (el panel no la
 * usa) y con el detalle a mano: acá quien lee es del equipo. Los errores
 * del servidor ya quedaron en la bitácora (`instrumentation.ts`); Next solo
 * le pasa al navegador el `digest`, que se puede buscar allá.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] px-6 pt-20 pb-12 sm:px-10 lg:px-16">
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
          <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
            Panel
          </Link>
        </p>
        <div className="mt-6">
          <AdminErrorNotice
            title="Esta página del panel falló al cargar"
            detail={error.digest ? `Error del servidor. Código: ${error.digest}` : error.message}
            digest={error.digest}
            action={
              <button type="button" onClick={retry} className={retryLinkClass}>
                Reintentar
              </button>
            }
          />
        </div>
      </div>
    </div>
  );
}
