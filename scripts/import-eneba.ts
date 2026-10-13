/**
 * Importa el catalogo de Eneba desde el CSV que comparte el aliado. Solo local.
 *
 * Eneba no se scrapea: nos manda un export (formato Google Shopping) cada
 * tanto y se carga con esto. Pide la ruta del archivo si no se la pasan:
 *
 *   npm run eneba:import
 *   npm run eneba:import -- "C:\ruta\eneba_export_2026-10-12.csv"
 *
 * Opciones:
 *   --dry            valida y muestra el resumen, sin tocar la base
 *   --keep-missing   no da de baja lo que no venga en el archivo (para un
 *                    export parcial; por defecto el CSV es el catalogo entero)
 *   --yes            no pide confirmacion
 *
 * Entra por el mismo runner que las tiendas scrapeadas, con el target de la
 * migracion 0055: queda en la bitacora (scrape_runs, trigger 'manual'), los
 * productos se identifican por el `id` de Eneba (nunca se duplican: lo que ya
 * existe se actualiza, y si no cambio nada ni se reescribe), los cambios de
 * precio van a price_history, lo que dejo de venir se da de baja y al final
 * se refresca el catalogo publico.
 *
 * El archivo interpretado se guarda en scrape-data/eneba/ antes de escribir
 * en la base. Si la ingesta falla a medias:
 *   npm run reingest:local -- scrape-data/eneba/<archivo>.json
 *
 * Importar dos veces el mismo CSV es inofensivo: todo sale "sin cambios".
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { getSupabaseAdmin } from '@/server/db/supabase';
import { publishCatalog, recoverStaleRuns, runTarget, type ScrapeSnapshot } from '@/server/scraping/runner';
import { ENEBA_CATEGORIES, parseEnebaFeed, type EnebaCategoryKey } from '@/server/scraping/strategies/eneba';
import type { ScrapeTargetRow, StoreRow } from '@/server/scraping/types';

const STORE_SLUG = 'eneba';
/** Si el archivo trae menos de esto respecto a lo activo, se avisa antes de dar de baja. */
const DELIST_WARNING_RATIO = 0.5;

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const dry = flag('--dry');
const keepMissing = flag('--keep-missing');
const assumeYes = flag('--yes');

/**
 * Preguntas por consola. Cola propia en vez de `readline/promises`: con la
 * entrada por tuberia (`echo ruta | npm run eneba:import`) las lineas llegan
 * antes que la pregunta y `question()` las pierde. `null` = se cerro la entrada.
 */
const rl = createInterface({ input: process.stdin, terminal: false });
const pendingLines: string[] = [];
const waiting: Array<(line: string | null) => void> = [];
let inputClosed = false;
rl.on('line', (line) => {
  const next = waiting.shift();
  if (next) next(line);
  else pendingLines.push(line);
});
rl.on('close', () => {
  inputClosed = true;
  while (waiting.length > 0) waiting.shift()!(null);
});

function ask(question: string): Promise<string | null> {
  process.stdout.write(question);
  if (pendingLines.length > 0) return Promise.resolve(pendingLines.shift()!);
  if (inputClosed) return Promise.resolve(null);
  return new Promise((resolveLine) => waiting.push(resolveLine));
}

/** Arrastrar el archivo a la terminal lo pega entre comillas (o con `& '...'` en PowerShell). */
function cleanPath(raw: string): string {
  return raw
    .trim()
    .replace(/^&\s*/, '')
    .replace(/^(["'])(.*)\1$/, '$2')
    .trim();
}

async function askPath(): Promise<string> {
  const given = argv.find((arg) => !arg.startsWith('--'));
  let path = given ? cleanPath(given) : '';
  while (true) {
    if (!path) {
      const answer = await ask('Ruta del CSV de Eneba: ');
      if (answer === null) throw new Error('\nSin ruta: no se importa nada.');
      path = cleanPath(answer);
    }
    if (!path) continue;
    const full = resolve(path);
    if (existsSync(full) && statSync(full).isFile()) return full;
    console.error(`  No existe el archivo: ${full}`);
    path = '';
  }
}

async function confirm(question: string): Promise<boolean> {
  if (assumeYes) return true;
  const answer = ((await ask(`${question} [s/N] `)) ?? '').trim().toLowerCase();
  return answer === 's' || answer === 'si' || answer === 'sí' || answer === 'y' || answer === 'yes';
}

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function loadStoreAndTarget(): Promise<{ store: StoreRow; target: ScrapeTargetRow }> {
  const db = getSupabaseAdmin();
  const { data: store, error } = await db.from('stores').select('*').eq('slug', STORE_SLUG).maybeSingle();
  if (error) throw new Error(`No se pudo leer la tienda: ${error.message}`);
  if (!store) throw new Error('No existe la tienda "eneba". Correr src/db/migrations/0054 y 0055 en Supabase.');

  const { data: targets, error: targetError } = await db
    .from('scrape_targets')
    .select('*')
    .eq('store_id', store.id)
    .eq('kind', 'full_catalog');
  if (targetError) throw new Error(`No se pudo leer el target: ${targetError.message}`);
  if (!targets || targets.length !== 1) {
    throw new Error(`Se esperaba un target full_catalog para Eneba y hay ${targets?.length ?? 0}. Revisar 0055.`);
  }
  return { store: store as StoreRow, target: targets[0] as ScrapeTargetRow };
}

async function main(): Promise<number> {
  const file = await askPath();
  console.info(`\nArchivo: ${relative(process.cwd(), file) || file}`);

  const context = dry ? null : await loadStoreAndTarget();
  const affiliateParams = (context?.store.config?.affiliateParams as Record<string, string> | undefined) ?? {
    af_id: 'findyourprices',
  };

  const feed = parseEnebaFeed(readFileSync(file, 'utf8'), { affiliateParams });
  const { products } = feed;

  // ---------------------------------------------------------------------------
  // Resumen
  // ---------------------------------------------------------------------------
  const priced = products.filter((p) => p.price !== null && p.price !== undefined);
  const available = products.filter((p) => p.availability === 'in_stock' || p.availability === 'preorder');
  const currencies = new Map<string, number>();
  for (const p of products) currencies.set(p.currency!, (currencies.get(p.currency!) ?? 0) + 1);

  console.info(`\n${feed.rows} filas · ${products.length} productos validos · ${feed.skipped.length} descartadas`);
  if (feed.duplicates.length > 0) {
    console.info(`  ${feed.duplicates.length} ids repetidos en el archivo (se usa la ultima fila): ${feed.duplicates.slice(0, 5).join(', ')}`);
  }
  for (const issue of feed.skipped.slice(0, 10)) {
    console.warn(`  linea ${issue.line}${issue.id ? ` (${issue.id})` : ''}: ${issue.reason}`);
  }
  if (feed.skipped.length > 10) console.warn(`  ... y ${feed.skipped.length - 10} mas`);

  console.info(`  ${available.length} disponibles · ${products.length - available.length} agotados o sin estado`);
  console.info(`  ${priced.length} con precio · ${products.length - priced.length} sin precio (no se muestran en el catalogo)`);
  for (const [currency, count] of currencies) {
    const values = priced.filter((p) => p.currency === currency).map((p) => p.price as number);
    const range = values.length ? ` · ${money(Math.min(...values), currency)} a ${money(Math.max(...values), currency)}` : '';
    console.info(`  ${currency}: ${count}${range}`);
  }
  console.info('  Por categoria:');
  for (const category of feed.categories) {
    console.info(`    ${ENEBA_CATEGORIES[category.external_id as EnebaCategoryKey].padEnd(30)} ${category.product_count}`);
  }

  if (products.length === 0) {
    console.error('\nEl archivo no trae ningun producto valido: no se importa nada.');
    return 1;
  }
  if (dry || !context) {
    console.info('\n--dry: no se escribio nada.');
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Chequeos contra la base
  // ---------------------------------------------------------------------------
  const { store, target } = context;
  const db = getSupabaseAdmin();

  if (!store.is_active) {
    console.error('\nLa tienda Eneba esta inactiva: el runner no la procesa. Activarla desde el panel o en stores.is_active.');
    return 1;
  }

  const { data: rates, error: ratesError } = await db.from('exchange_rates').select('currency, rate_to_hnl, updated_at');
  if (ratesError) {
    console.warn(`\nNo se pudieron leer las tasas de cambio (${ratesError.message}). ¿Corrio la migracion 0054?`);
  } else {
    const byCurrency = new Map((rates ?? []).map((row) => [String(row.currency), row]));
    for (const currency of currencies.keys()) {
      const rate = byCurrency.get(currency);
      if (!rate) {
        console.warn(
          `\n  OJO: no hay tasa para ${currency}. Esos productos se ven pero no entran al orden ni a los filtros de precio.\n` +
            `  insert into find_your_prices.exchange_rates (currency, rate_to_hnl, source) values ('${currency}', <tasa>, '<fuente>');`,
        );
      } else if (currency !== 'HNL') {
        const days = Math.floor((Date.now() - new Date(String(rate.updated_at)).getTime()) / 86_400_000);
        console.info(`  Tasa ${currency}: L ${Number(rate.rate_to_hnl).toFixed(4)} (actualizada hace ${days} dias)`);
      }
    }
  }

  const { count: activeNow, error: countError } = await db
    .from('store_products')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', store.id)
    .eq('is_active', true);
  if (countError) throw new Error(`No se pudo contar el catalogo actual: ${countError.message}`);

  const incomingIds = new Set(products.map((p) => p.external_id));
  console.info(`\nHoy Eneba tiene ${activeNow ?? 0} productos activos; el archivo trae ${incomingIds.size}.`);
  if (keepMissing) {
    console.info('--keep-missing: lo que no venga en el archivo se queda como esta.');
  } else if ((activeNow ?? 0) > 0) {
    console.info('Lo que no venga en el archivo se da de baja (usar --keep-missing si es un export parcial).');
    if (incomingIds.size < (activeNow ?? 0) * DELIST_WARNING_RATIO) {
      console.warn(
        `  OJO: el archivo trae menos de la mitad de lo activo. Si no es el catalogo completo, cancelar y usar --keep-missing.`,
      );
    }
  }

  if (!(await confirm(`\n¿Importar ${products.length} productos a Eneba?`))) {
    console.info('Cancelado: no se escribio nada.');
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Snapshot + runner
  // ---------------------------------------------------------------------------
  const snapshot: ScrapeSnapshot = {
    version: 1,
    targetId: target.id,
    targetName: target.name,
    storeSlug: store.slug,
    scrapedAt: new Date().toISOString(),
    aborted: false,
    result: {
      products,
      categories: feed.categories,
      pagesFetched: 1,
      totalReported: feed.rows,
      stats: {
        source: 'csv',
        file: file.split(/[\\/]/).pop(),
        rows: feed.rows,
        skipped: feed.skipped.length,
        duplicates: feed.duplicates.length,
      },
    },
  };

  const stamp = snapshot.scrapedAt.replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(process.cwd(), 'scrape-data', store.slug);
  mkdirSync(dir, { recursive: true });
  const snapshotFile = join(dir, `${stamp}-eneba-csv.json`);
  writeFileSync(snapshotFile, JSON.stringify(snapshot));
  console.info(`Snapshot: ${relative(process.cwd(), snapshotFile)}`);

  await recoverStaleRuns();
  console.info('\nIngiriendo...');
  const result = await runTarget({
    // El target vive inactivo (el cron no debe correrlo); la marca de bajas
    // se apaga solo para esta corrida.
    target: keepMissing ? { ...target, config: { ...(target.config ?? {}), markDelisted: false } } : target,
    store,
    trigger: 'manual',
    replay: snapshot,
    onLog: (entry) => {
      if (entry.level !== 'info') console.warn(`  ${String(entry.message)}`);
    },
  });

  console.info(
    `\n${result.status} · ${result.itemsFound} procesados · ${result.itemsNew} nuevos · ` +
      `${result.itemsUpdated} actualizados · ${result.itemsUnchanged} sin cambios · ` +
      `${result.priceChanges} cambios de precio · ${result.itemsDelisted} bajas` +
      (result.errorMessage ? `\n${result.errorMessage}` : ''),
  );

  if (result.status === 'success' || result.status === 'partial') {
    console.info('Refrescando el catalogo publico...');
    await publishCatalog([result], 'manual');
    console.info('Listo.');
  } else {
    console.error(`\nLa ingesta fallo. Reintentar sin volver a leer el CSV:\n  npm run reingest:local -- ${relative(process.cwd(), snapshotFile)}`);
  }
  return result.status === 'failed' || result.status === 'skipped' ? 1 : 0;
}

main()
  .then((code) => {
    rl.close();
    process.exit(code);
  })
  .catch((error) => {
    rl.close();
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
