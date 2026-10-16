import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { pgErrorCode, pgErrorMessage } from '@/server/db/pg';
import { rpc } from '@/server/db/rpc';
import { errorLogs } from '@/server/db/schema';

/**
 * Lectura de la bitácora de errores (migración 0051) para /admin/errores.
 * La escritura vive en `logError.ts`.
 */

export interface ErrorGroup {
  fingerprint: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  /** Cuántas rutas distintas lo tuvieron. */
  paths: number;
  resolved: boolean;
  lastId: number;
  source: string;
  level: 'error' | 'warning';
  message: string;
  digest: string | null;
  path: string | null;
  route: string | null;
  method: string | null;
  stack: string | null;
  context: Record<string, unknown> | null;
  userAgent: string | null;
}

function explain(error: unknown): string {
  if (['42883', '42P01'].includes(pgErrorCode(error) ?? '')) {
    return 'Falta la bitácora de errores: corré la migración 0051_error_log_and_category_counts.sql.';
  }
  return pgErrorMessage(error);
}

export async function listErrorGroups(since: Date, includeResolved: boolean): Promise<ErrorGroup[]> {
  let data: ErrorGroup[] | null;
  try {
    data = await rpc<ErrorGroup[] | null>('admin_error_groups', {
      p_since: since.toISOString(),
      p_include_resolved: includeResolved,
      p_limit: 200,
    });
  } catch (error) {
    throw new Error(explain(error));
  }
  return ((data ?? []) as ErrorGroup[]).map((group) => ({
    ...group,
    occurrences: Number(group.occurrences),
    paths: Number(group.paths),
    lastId: Number(group.lastId),
  }));
}

/** Marca resueltas todas las ocurrencias abiertas de un grupo. */
export async function resolveErrorGroup(fingerprint: string): Promise<void> {
  try {
    await getDb()
      .update(errorLogs)
      .set({ resolved_at: new Date().toISOString() })
      .where(and(eq(errorLogs.fingerprint, fingerprint), isNull(errorLogs.resolved_at)));
  } catch (error) {
    throw new Error(explain(error));
  }
}

/** Grupos sin resolver en las últimas 24 h, para el aviso del panel. 0 si falta la migración. */
export async function countOpenErrorGroups(): Promise<number> {
  try {
    const groups = await listErrorGroups(new Date(Date.now() - 24 * 60 * 60 * 1000), false);
    return groups.filter((group) => group.level === 'error').length;
  } catch {
    return 0;
  }
}
