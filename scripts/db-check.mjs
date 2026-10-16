/**
 * Chequeo de la base antes de `next build` (corre como `prebuild`).
 *
 * El build prerenderiza páginas que consultan Postgres. Si la conexión no
 * llega, Next no muestra el error: espera 60 s por página, reintenta tres
 * veces y el build se arrastra durante muchos minutos. Este chequeo lanza un
 * lote de consultas en paralelo con timeout corto e imprime qué pasó (así
 * también caza el cuelgue de Supavisor con pipelining, porsager/postgres#970).
 * Si el host es el pooler de Supabase y falla, prueba el otro clúster
 * (aws-0 / aws-1) para decir cuál es el correcto.
 *
 * Solo corre en Vercel/CI. Sin DATABASE_URL no hace nada.
 */
import postgres from 'postgres';

const onCi = Boolean(process.env.VERCEL || process.env.CI || process.env.GITHUB_ACTIONS);
const raw = process.env.DATABASE_URL;

if (!onCi || !raw) process.exit(0);

function describe(urlString) {
  const url = new URL(urlString);
  return `${url.username}@${url.hostname}:${url.port || '5432'}`;
}

async function probe(urlString) {
  const url = new URL(urlString);
  const transactionPooler = url.port === '6543';
  // Opciones de `createDb` en Vercel, con un pool aún más chico (3) para que
  // haya más consultas que conexiones: en modo transacción, sin pipelining.
  const sql = postgres(urlString, {
    max: 3,
    connect_timeout: 10,
    idle_timeout: 1,
    fetch_types: false,
    prepare: !transactionPooler,
    ...(transactionPooler ? { max_pipeline: 0 } : {}),
  });
  const started = Date.now();
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('sin respuesta en 15 s')), 15_000));
    // Una consulta sola no alcanza: el build lanza muchas en paralelo sobre
    // el pool, que es donde el pooler se trababa.
    const burst = Promise.all(
      Array.from({ length: 24 }, (_, i) => sql`select ${i}::int as n, current_database() as db, current_user as usr`),
    );
    const rows = await Promise.race([burst, timeout]);
    const [row] = rows[0];
    return { ok: true, ms: Date.now() - started, detail: `${row.db} · ${row.usr}, 24 consultas en paralelo` };
  } catch (error) {
    return { ok: false, ms: Date.now() - started, detail: `${error.code ?? ''} ${error.message}`.trim() };
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error('[db-check] DATABASE_URL no es una URL válida.');
  process.exit(1);
}

console.log(`[db-check] Probando ${describe(raw)} …`);
const result = await probe(raw);
if (result.ok) {
  console.log(`[db-check] OK en ${result.ms} ms (${result.detail}).`);
  process.exit(0);
}

console.error(`[db-check] FALLÓ en ${result.ms} ms: ${result.detail}`);

const cluster = url.hostname.match(/^aws-(\d)-(.+)\.pooler\.supabase\.com$/);
if (cluster) {
  const other = cluster[1] === '0' ? '1' : '0';
  const alt = new URL(raw);
  alt.hostname = `aws-${other}-${cluster[2]}.pooler.supabase.com`;
  console.log(`[db-check] Probando el otro clúster: ${describe(alt.toString())} …`);
  const altResult = await probe(alt.toString());
  if (altResult.ok) {
    console.error(
      `[db-check] El otro clúster SÍ responde (${altResult.ms} ms). Cambiá DATABASE_URL en Vercel a host ${alt.hostname}.`,
    );
  } else {
    console.error(`[db-check] El otro clúster tampoco: ${altResult.detail}`);
  }
}

console.error('[db-check] Sin base, el prerender de páginas se cuelga: corregí DATABASE_URL y volvé a desplegar.');
process.exit(1);
