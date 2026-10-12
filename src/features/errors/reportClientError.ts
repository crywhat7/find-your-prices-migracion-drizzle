/**
 * Manda un error del navegador a /api/errors. Con `sendBeacon` cuando se
 * puede (sale aunque la página se esté yendo) y sin esperar respuesta.
 * Nunca lanza.
 */

const ENDPOINT = "/api/errors";

/** Tope por carga de página: un error en un bucle no puede mandar mil avisos. */
const MAX_PER_PAGE = 5;
let sent = 0;
const seen = new Set<string>();

export function reportClientError(error: unknown, kind: string): void {
  try {
    if (sent >= MAX_PER_PAGE) return;
    const message =
      error instanceof Error ? error.message || error.name : typeof error === "string" ? error : String(error);
    if (!message) return;
    const key = `${kind}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    sent += 1;

    const body = JSON.stringify({
      message: message.slice(0, 2000),
      stack: error instanceof Error ? error.stack?.slice(0, 8000) : undefined,
      digest: error instanceof Error ? (error as Error & { digest?: string }).digest : undefined,
      path: window.location.pathname + window.location.search,
      kind,
    });

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(
        () => {},
      );
    }
  } catch {
    // Reportar un error no puede producir otro.
  }
}
