"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AdminErrorNotice, retryLinkClass } from "@/features/errors/AdminErrorNotice";
import { reportClientError } from "@/features/errors/reportClientError";

/**
 * Pantalla de error del panel. Sin la navegación pública (el panel no la
 * usa) y con el detalle a mano: acá quien lee es del equipo. Los errores
 * del servidor ya quedaron en la bitácora (`instrumentation.ts`); Next solo
 * le pasa al navegador el `digest`, que se puede buscar allá.
 *
 * Los que NO traen `digest` pasaron en el navegador —o el servidor cortó la
 * respuesta a medias ("Connection closed.", error #412 de React)— y del lado
 * del servidor no quedó nada: se reportan desde acá, con la URL.
 */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    if (!error.digest) reportClientError(error, "admin-boundary");
  }, [error]);

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
            detail={error.digest ? `Error del servidor. Código: ${error.digest}` : explainClientError(error.message)}
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

/**
 * Los errores de React en producción llegan como "Minified React error #N".
 * Los que de verdad aparecen tienen su explicación acá.
 */
function explainClientError(message: string): string {
  if (/#412|Connection closed/i.test(message)) {
    return `${message}

Qué significa: el servidor cortó la respuesta antes de terminar de mandar la página ("Connection closed."). En Cloudflare Workers suele ser el worker pasándose del límite de CPU o memoria con una página pesada. Los logs del worker (Cloudflare → Workers → Logs) dicen cuál.`;
  }
  return message;
}
