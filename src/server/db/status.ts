import 'server-only';
import { sql } from 'drizzle-orm';
import { describeConnection, getDb, type ConnectionInfo } from './client';
import { pgErrorMessage } from './pg';

/**
 * Prueba en vivo de la conexión del panel: una consulta real por Drizzle
 * (postgres.js, TCP a Postgres), no por la API REST de Supabase. Lo que
 * Postgres dice de la sesión (`application_name`, usuario, servidor) confirma
 * por qué camino llegó la consulta.
 */

export interface DatabaseStatus {
  connection: ConnectionInfo;
  ok: boolean;
  latencyMs: number | null;
  error: string | null;
  database: string | null;
  user: string | null;
  serverVersion: string | null;
  applicationName: string | null;
}

export async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const connection = describeConnection();
  const base = { connection, database: null, user: null, serverVersion: null, applicationName: null };
  if (connection.source === 'none') {
    return { ...base, ok: false, latencyMs: null, error: 'No hay DATABASE_URL ni binding HYPERDRIVE.' };
  }

  const started = performance.now();
  try {
    const rows = await getDb().execute<{
      database: string;
      db_user: string;
      server_version: string;
      application_name: string | null;
    }>(sql`
      select current_database() as database,
             current_user as db_user,
             current_setting('server_version') as server_version,
             current_setting('application_name', true) as application_name
    `);
    const row = rows[0];
    return {
      connection,
      ok: true,
      latencyMs: Math.round(performance.now() - started),
      error: null,
      database: row?.database ?? null,
      user: row?.db_user ?? null,
      serverVersion: row?.server_version ?? null,
      applicationName: row?.application_name || null,
    };
  } catch (error) {
    return { ...base, ok: false, latencyMs: Math.round(performance.now() - started), error: pgErrorMessage(error) };
  }
}
