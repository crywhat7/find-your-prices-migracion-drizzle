/**
 * Huella de un error: lo que hace que mil ocurrencias del mismo problema se
 * vean como un solo grupo en /admin/errores.
 *
 * Se normaliza el mensaje antes de mezclarlo: los ids, números, URLs y
 * fechas cambian de una ocurrencia a otra ("producto 8f3a… no encontrado",
 * "timeout tras 8312 ms") sin que cambie el error. Pura y sincrónica, para
 * que el servidor y el navegador calculen lo mismo.
 */

export type ErrorSource = "render" | "route" | "action" | "proxy" | "handled" | "client";

export function normalizeMessage(message: string): string {
  return message
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hash>")
    .replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, "<fecha>")
    .replace(/\d+(\.\d+)?/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** FNV-1a de 32 bits en hex: corto, estable y sin depender de crypto. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * La ruta entra en la huella con los segmentos variables colapsados: se
 * conserva la sección ("/p", "/en/stores") y lo de después se vuelve ":x",
 * así "/p/samsung-a15" y "/p/iphone-16" son la misma página. Las del panel
 * se dejan enteras (cada una es una herramienta distinta), igual que la
 * ruta de archivo de Next ("/(es)/p/[slug]"), que ya es estable.
 */
export function normalizeRoute(route: string | null | undefined): string {
  if (!route) return "";
  const path = route.split("?")[0] ?? "";
  if (path.includes("[")) return path;
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "admin") return `/${segments.join("/")}`;
  const keep = segments[0] === "en" ? 2 : 1;
  return `/${segments.map((segment, index) => (index >= keep ? ":x" : segment)).join("/")}`;
}

export function errorFingerprint(source: ErrorSource, message: string, route?: string | null): string {
  return fnv1a(`${source}|${normalizeRoute(route)}|${normalizeMessage(message)}`);
}

/** Mensaje y pila de cualquier cosa que se haya lanzado. */
export function describeError(error: unknown): { message: string; stack: string | null; digest: string | null } {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    return {
      message: (error.message || error.name || "Error sin mensaje").slice(0, 2000),
      stack: error.stack ? error.stack.slice(0, 8000) : null,
      digest: typeof digest === "string" ? digest : null,
    };
  }
  if (typeof error === "string") return { message: error.slice(0, 2000), stack: null, digest: null };
  try {
    return { message: JSON.stringify(error).slice(0, 2000), stack: null, digest: null };
  } catch {
    return { message: String(error).slice(0, 2000), stack: null, digest: null };
  }
}
