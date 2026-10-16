import 'server-only';
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
    // Hyperdrive ya agrupa conexiones; desde Node un pool chico alcanza para
    // los scripts y para `next dev`.
    max: opts.hyperdrive ? 5 : 10,
    // Ahorra un viaje por conexión. Los tipos propios del esquema (enums) llegan
    // como texto, que es lo que la app espera.
    fetch_types: false,
    // El pooler de Supabase en modo transacción (puerto 6543) no soporta
    // sentencias preparadas. Hyperdrive y una conexión directa sí.
    prepare: !isTransactionPooler(connectionString),
  });
  return drizzle({ client, schema });
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

const perRequest = new WeakMap<object, Db>();
let processDb: Db | null = null;

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

  if (processDb) return processDb;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Falta la variable de entorno DATABASE_URL (y no hay binding HYPERDRIVE). Copiala desde .env.example a .env.local.',
    );
  }
  processDb = createDb(url, { hyperdrive: false });
  return processDb;
}

export { schema };
