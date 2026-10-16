import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

/**
 * Conexión a Postgres por Drizzle, para uso EXCLUSIVO en el servidor.
 *
 * De dónde sale la conexión:
 *   - En el Worker de producción: del binding `HYPERDRIVE` (wrangler.jsonc).
 *     Hyperdrive mantiene el pool del lado de Cloudflare; el Worker abre un
 *     socket barato por request.
 *   - En `next dev`, scripts y GitHub Actions: de `DATABASE_URL`.
 *
 * En el Worker no se puede reusar un socket entre requests (Cloudflare lo
 * corta con "Cannot perform I/O on behalf of a different request"), así que
 * hay un cliente por request, guardado contra el `ctx` de ese request. Fuera
 * del Worker hay uno solo por proceso.
 *
 * Este módulo no lleva `server-only` porque también lo carga `src/proxy.ts`,
 * que no se compila con la condición `react-server`. El resto del código
 * importa desde `client.ts`, que sí la lleva.
 */

export type Db = ReturnType<typeof createDb>;

interface HyperdriveBinding {
  connectionString: string;
}

declare global {
  interface CloudflareEnv {
    HYPERDRIVE?: HyperdriveBinding;
  }
}

function createDb(connectionString: string, opts: { hyperdrive: boolean }) {
  const client = postgres(connectionString, {
    max: poolSize(opts.hyperdrive),
    // En serverless no conviene dejar conexiones colgadas ocupando cupo del pooler.
    idle_timeout: 20,
    // Ahorra un viaje por conexión. Los tipos propios del esquema (enums) llegan
    // como texto, que es lo que la app espera.
    fetch_types: false,
    // El pooler de Supabase en modo transacción (puerto 6543) no soporta
    // sentencias preparadas. Hyperdrive y una conexión directa sí.
    prepare: !isTransactionPooler(connectionString),
  });
  return drizzle({ client, schema });
}

/**
 * Tamaño del pool por proceso. El pooler de Supabase en modo sesión (5432)
 * corta en 15 clientes para TODO el proyecto (EMAXCONNSESSION), y en Vercel
 * cada función y cada worker del build abre su propio pool. Ahí va chico.
 */
function poolSize(hyperdrive: boolean): number {
  const fromEnv = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  if (hyperdrive) return 5;
  if (process.env.VERCEL || process.env.CI) return 3;
  return 10;
}

/**
 * La conexión directa de Supabase (`db.<ref>.supabase.co`) solo tiene IPv6.
 * Vercel, GitHub Actions y Workers Builds no salen por IPv6, así que ahí falla
 * con un `getaddrinfo ENOTFOUND` que no dice nada. Mejor cortar con la causa.
 */
function assertReachableHost(connectionString: string): void {
  const onIpv4OnlyHost = Boolean(process.env.VERCEL || process.env.CI || process.env.GITHUB_ACTIONS);
  if (!onIpv4OnlyHost) return;
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return;
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
    throw new Error(
      `DATABASE_URL apunta a ${host}, la conexión directa de Supabase, que solo tiene IPv6 y no se alcanza desde este entorno (Vercel/CI). ` +
        'Usá el pooler de Supavisor: Supabase → Connect → "Transaction pooler" ' +
        '(postgresql://postgres.<ref>:<password>@aws-X-<region>.pooler.supabase.com:6543/postgres).',
    );
  }
}

function isTransactionPooler(connectionString: string): boolean {
  try {
    return new URL(connectionString).port === '6543';
  } catch {
    return false;
  }
}

/** El binding de Hyperdrive y el `ctx` del request, si estamos dentro del Worker. */
function workerContext(): { hyperdrive: HyperdriveBinding; ctx: object } | null {
  try {
    const { env, ctx } = getCloudflareContext();
    if (env.HYPERDRIVE?.connectionString && ctx) return { hyperdrive: env.HYPERDRIVE, ctx };
  } catch {
    // Fuera del Worker (scripts, tests, `next dev` sin bindings): no hay contexto.
  }
  return null;
}

/**
 * True si hay de dónde conectarse: `DATABASE_URL` o el binding de Hyperdrive.
 *
 * Ojo con el build de producción (Workers Builds): ahí no hay bindings, así que
 * la página que se arma en el build sale de `DATABASE_URL`, que tiene que estar
 * en las variables del build.
 */
export function hasDatabaseConfig(): boolean {
  return Boolean(process.env.DATABASE_URL) || workerContext() !== null;
}

const perRequest = new WeakMap<object, Db>();
// En `globalThis` y no en una variable del módulo: Turbopack puede meter este
// módulo en varios chunks (uno por página en el build) y cada copia abriría su
// propio pool contra el mismo cupo del pooler.
const PROCESS_DB = Symbol.for('find-your-prices.processDb');
type GlobalWithDb = typeof globalThis & { [PROCESS_DB]?: Db };

export type ConnectionSource = 'hyperdrive' | 'database_url' | 'none';
export type ConnectionMode = 'hyperdrive' | 'transaction-pooler' | 'session-pooler' | 'direct' | 'unknown';

export interface ConnectionInfo {
  source: ConnectionSource;
  mode: ConnectionMode;
  host: string | null;
  port: string | null;
}

/** De dónde sale la conexión que usaría `getDb()` ahora mismo. Sin credenciales. */
export function describeConnection(): ConnectionInfo {
  const worker = workerContext();
  const source: ConnectionSource = worker ? 'hyperdrive' : process.env.DATABASE_URL ? 'database_url' : 'none';
  const raw = worker?.hyperdrive.connectionString ?? process.env.DATABASE_URL;
  if (!raw) return { source, mode: 'unknown', host: null, port: null };

  let host: string | null = null;
  let port: string | null = null;
  try {
    const url = new URL(raw);
    host = url.hostname;
    port = url.port || '5432';
  } catch {
    return { source, mode: 'unknown', host: null, port: null };
  }

  let mode: ConnectionMode = 'direct';
  if (worker) mode = 'hyperdrive';
  else if (host.endsWith('.pooler.supabase.com')) mode = port === '6543' ? 'transaction-pooler' : 'session-pooler';
  return { source, mode, host, port };
}

export function getDb(): Db {
  const worker = workerContext();
  if (worker) {
    let db = perRequest.get(worker.ctx);
    if (!db) {
      db = createDb(worker.hyperdrive.connectionString, { hyperdrive: true });
      perRequest.set(worker.ctx, db);
    }
    return db;
  }

  const holder = globalThis as GlobalWithDb;
  const existing = holder[PROCESS_DB];
  if (existing) return existing;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta la variable de entorno DATABASE_URL (y no hay binding HYPERDRIVE). Copiala desde .env.example a .env.local.',
    );
  }
  assertReachableHost(url);
  const db = createDb(url, { hyperdrive: false });
  holder[PROCESS_DB] = db;
  return db;
}
