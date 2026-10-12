import 'server-only';
import { getSupabaseAdmin } from '@/server/db/supabase';

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

function explain(error: { code?: string; message: string }): string {
  if (['42883', 'PGRST202', '42P01', 'PGRST205'].includes(error.code ?? '')) {
    return 'Falta la bitácora de errores: corré la migración 0051_error_log_and_category_counts.sql en Supabase.';
  }
  return error.message;
}

export async function listErrorGroups(since: Date, includeResolved: boolean): Promise<ErrorGroup[]> {
  const { data, error } = await getSupabaseAdmin().rpc('admin_error_groups', {
    p_since: since.toISOString(),
    p_include_resolved: includeResolved,
    p_limit: 200,
  });
  if (error) throw new Error(explain(error));
  return ((data ?? []) as ErrorGroup[]).map((group) => ({
    ...group,
    occurrences: Number(group.occurrences),
    paths: Number(group.paths),
    lastId: Number(group.lastId),
  }));
}

/** Marca resueltas todas las ocurrencias abiertas de un grupo. */
export async function resolveErrorGroup(fingerprint: string): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from('error_logs')
    .update({ resolved_at: new Date().toISOString() })
    .eq('fingerprint', fingerprint)
    .is('resolved_at', null);
  if (error) throw new Error(explain(error));
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
