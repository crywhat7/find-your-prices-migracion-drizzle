import 'server-only';
import { describeError, errorFingerprint, type ErrorSource } from '@/lib/errors/fingerprint';
import { getDb } from '@/server/db/client';
import { errorLogs } from '@/server/db/schema';

/**
 * Anota un error en `error_logs` (migración 0051) para verlo en
 * /admin/errores.
 *
 * Reglas:
 *   - Nunca lanza. Un error al anotar un error no puede tumbar nada; si la
 *     base no responde, queda al menos en la consola.
 *   - Siempre sale también por `console.error`, que es lo que se ve en los
 *     logs del proveedor.
 *   - Solo escribe en producción (o con `ERRORS_IN_DEV=1`): el entorno local
 *     apunta a la misma base, y los errores de quien está programando no son
 *     errores del sitio.
 *   - Una ráfaga del mismo error (misma huella) en la misma instancia se
 *     anota una vez cada 5 s: un error que pasa en cada petición no puede
 *     convertirse en mil inserciones por minuto.
 *
 * Devuelve el id de la fila, para mostrarlo como código de referencia.
 */

export interface LogErrorInput {
  source: ErrorSource;
  error: unknown;
  level?: 'error' | 'warning';
  /** Ruta pedida: "/admin/categorias", "/p/samsung-a15?x=1". */
  path?: string | null;
  /** Ruta de archivo de Next ("/(es)/p/[slug]") o una ruta estable. */
  route?: string | null;
  method?: string | null;
  digest?: string | null;
  userAgent?: string | null;
  context?: Record<string, unknown>;
}

const BURST_WINDOW_MS = 5000;
const lastWritten = new Map<string, number>();

function enabled(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.ERRORS_IN_DEV === '1';
}

export async function logError(input: LogErrorInput): Promise<number | null> {
  const { message, stack, digest } = describeError(input.error);
  const level = input.level ?? 'error';
  const route = input.route ?? input.path?.split('?')[0] ?? null;
  const fingerprint = errorFingerprint(input.source, message, route);

  const log = level === 'warning' ? console.warn : console.error;
  log(`[${input.source}] ${route ?? ''} ${message}`);

  if (!enabled()) return null;

  const now = Date.now();
  if (now - (lastWritten.get(fingerprint) ?? 0) < BURST_WINDOW_MS) return null;
  lastWritten.set(fingerprint, now);
  if (lastWritten.size > 500) lastWritten.clear();

  try {
    const [row] = await getDb()
      .insert(errorLogs)
      .values({
        source: input.source,
        level,
        message,
        digest: input.digest ?? digest,
        fingerprint,
        path: input.path?.slice(0, 500) ?? null,
        route: route?.slice(0, 300) ?? null,
        method: input.method ?? null,
        stack,
        context: input.context ?? null,
        user_agent: input.userAgent?.slice(0, 300) ?? null,
      })
      .returning({ id: errorLogs.id });
    return row ? Number(row.id) : null;
  } catch (failure) {
    console.error('[errores] no se pudo anotar el error:', failure);
    return null;
  }
}
