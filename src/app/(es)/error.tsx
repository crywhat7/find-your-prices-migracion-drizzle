"use client";

import { ErrorView } from "@/features/errors/ErrorView";

/**
 * Pantalla de error de las páginas públicas (es). Ver `features/errors/ErrorView.tsx`.
 * `retry` vuelve a pedir el segmento al servidor (Next 16.2+).
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView locale="es" error={error} retry={retry} />;
}
