/**
 * Utilidades chicas para que lo que sale de Postgres por Drizzle tenga la misma
 * forma que lo que daba PostgREST. Sin dependencias de servidor: lo usan el
 * esquema, los servicios y sus tests.
 */

/**
 * Timestamp de Postgres → ISO 8601 como lo escribía PostgREST.
 *
 * postgres.js entrega `timestamptz` en el formato de texto de Postgres
 * (`2026-10-16 12:00:00.123456+00`), que `new Date()` no garantiza entender y
 * que no compara igual que el ISO que ya hay guardado en cachés y cookies. Se
 * pasa a `2026-10-16T12:00:00.123456+00:00`.
 */
export function isoTimestamp(value: string | Date): string;
export function isoTimestamp(value: string | Date | null | undefined): string | null;
export function isoTimestamp(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
}

/** Código SQLSTATE de un error de Postgres, venga envuelto por Drizzle o no. */
export function pgErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Mensaje útil de un error de Postgres: el de la causa, no el "Failed query: …" de Drizzle. */
export function pgErrorMessage(error: unknown): string {
  const cause = (error as { cause?: unknown } | null)?.cause;
  if (cause instanceof Error) return cause.message;
  return error instanceof Error ? error.message : String(error);
}

/** numeric / bigint que llegan como texto en consultas crudas (`db.execute`). */
export function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
