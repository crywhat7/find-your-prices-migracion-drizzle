import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminErrorNotice } from '@/features/errors/AdminErrorNotice';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { hasAdminSession } from '@/server/admin/session';
import { listErrorGroups, type ErrorGroup } from '@/server/errors/errorLog';
import { resolveErrorAction } from './actions';

/**
 * Bitácora de errores: todo lo que falló en el servidor (render, rutas,
 * acciones, proxy), lo que el código atrapó y mostró con un aviso, y lo que
 * falló en el navegador de un visitante. Agrupado por huella: el mismo error
 * repetido mil veces es una fila con su cuenta.
 */
export const metadata: Metadata = { title: 'Errores', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ range?: string; resolved?: string; source?: string }>;
}

const RANGES = [
  { key: '24h', label: '24 horas', hours: 24 },
  { key: '7d', label: '7 días', hours: 24 * 7 },
  { key: '30d', label: '30 días', hours: 24 * 30 },
  { key: '90d', label: '90 días', hours: 24 * 90 },
] as const;

const SOURCE_LABEL: Record<string, string> = {
  render: 'Página',
  route: 'Ruta / API',
  action: 'Acción',
  proxy: 'Proxy',
  handled: 'Atrapado',
  client: 'Navegador',
};

const SOURCE_HINT: Record<string, string> = {
  render: 'Falló al generar una página en el servidor; el visitante vio la pantalla de error.',
  route: 'Falló un route handler (/api, /go, exportaciones).',
  action: 'Falló una server action (formularios).',
  proxy: 'Falló el proxy, antes de llegar a la página.',
  handled: 'El código lo atrapó y mostró un aviso; la página siguió en pie.',
  client: 'Pasó en el navegador de un visitante.',
};

const dateFormat = new Intl.DateTimeFormat('es-HN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Tegucigalpa' });

function relative(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

async function loadGroups(hours: number, showResolved: boolean): Promise<{ groups: ErrorGroup[]; loadError: string | null }> {
  try {
    return { groups: await listErrorGroups(new Date(Date.now() - hours * 60 * 60 * 1000), showResolved), loadError: null };
  } catch (error) {
    return { groups: [], loadError: error instanceof Error ? error.message : String(error) };
  }
}

const pill =
  'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)]';
const pillOn = 'border-[var(--text)] bg-[var(--text)] text-[var(--text-inverted)]';
const pillOff = 'border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]';

export default async function ErrorLogPage({ searchParams }: PageProps) {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  const params = await searchParams;
  const range = RANGES.find((item) => item.key === params.range) ?? RANGES[1];
  const showResolved = params.resolved === '1';
  const source = params.source && SOURCE_LABEL[params.source] ? params.source : null;

  const { groups, loadError } = await loadGroups(range.hours, showResolved);

  const visible = source ? groups.filter((group) => group.source === source) : groups;
  const open = groups.filter((group) => !group.resolved);
  const occurrences = groups.reduce((sum, group) => sum + group.occurrences, 0);

  const href = (next: Partial<{ range: string; resolved: string; source: string | null }>) => {
    const merged = { range: range.key, resolved: showResolved ? '1' : '', source: source ?? '', ...next };
    const query = new URLSearchParams(Object.entries(merged).filter(([, value]) => value) as [string, string][]);
    return `/admin/errores?${query}`;
  };
  const back = href({});

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
              Panel
            </Link>
          </p>
          <h1 className="mt-6 text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
            Errores
          </h1>
          <p className="mt-4 max-w-[62ch] text-[0.9375rem] leading-[1.55] text-[var(--text-secondary)]">
            Lo que falló en el servidor, lo que el código atrapó y lo que falló en el navegador de un visitante. El mismo
            error repetido es una sola fila con su cuenta. Se guardan 90 días.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[0.8125rem] text-[var(--text-tertiary)]">
            <Stat label="Grupos abiertos" value={open.length} />
            <Stat label="Ocurrencias" value={occurrences} />
          </dl>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            {RANGES.map((item) => (
              <Link key={item.key} href={href({ range: item.key })} aria-current={item.key === range.key ? 'page' : undefined} className={`${pill} ${item.key === range.key ? pillOn : pillOff}`}>
                {item.label}
              </Link>
            ))}
            <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden="true" />
            <Link href={href({ source: null })} className={`${pill} ${!source ? pillOn : pillOff}`}>
              Todos
            </Link>
            {Object.entries(SOURCE_LABEL).map(([key, label]) => (
              <Link key={key} href={href({ source: key })} title={SOURCE_HINT[key]} className={`${pill} ${source === key ? pillOn : pillOff}`}>
                {label}
              </Link>
            ))}
          </div>
          <Link
            href={href({ resolved: showResolved ? '' : '1' })}
            className="mt-4 inline-flex items-center gap-2 text-[0.8125rem] text-[var(--text-secondary)] hover:text-[var(--text)]"
          >
            <span
              aria-hidden="true"
              className={`flex h-4 w-4 items-center justify-center rounded border ${showResolved ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--text-inverted)]' : 'border-[var(--border-strong)]'}`}
            >
              {showResolved ? '✓' : ''}
            </span>
            Mostrar también los resueltos
          </Link>
        </div>
      </header>

      <main className="px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          {loadError ? (
            <AdminErrorNotice title="No se pudo leer la bitácora" detail={loadError} hint="Si dice que falta la migración, corré 0051 en Supabase." />
          ) : visible.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[var(--border-strong)] px-6 py-14 text-center">
              <p className="text-[1.125rem] font-semibold text-[var(--text)]">Sin errores</p>
              <p className="mt-1 text-[0.875rem] text-[var(--text-secondary)]">
                Nada {showResolved ? '' : 'abierto '}en {range.label.toLowerCase()}
                {source ? ` de tipo «${SOURCE_LABEL[source]}»` : ''}.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((group) => (
                <li key={group.fingerprint}>
                  <ErrorRow group={group} back={back} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

function ErrorRow({ group, back }: { group: ErrorGroup; back: string }) {
  const tone =
    group.level === 'warning'
      ? 'bg-[var(--bg-subtle)] text-[var(--text-secondary)]'
      : 'bg-[var(--critical-soft)] text-[var(--critical)]';

  return (
    <details className={`group rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] ${group.resolved ? 'opacity-60' : ''}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
        <span className={`rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium tracking-[0.06em] uppercase ${tone}`}>
          {group.level === 'warning' ? 'Aviso' : 'Error'} · {SOURCE_LABEL[group.source] ?? group.source}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[0.8125rem] text-[var(--text)]">{group.message}</span>
          <span className="mt-0.5 block truncate text-[0.75rem] text-[var(--text-tertiary)]">
            {group.route ?? group.path ?? 'sin ruta'}
            {group.paths > 1 ? ` · ${group.paths} rutas` : ''}
          </span>
        </span>
        <span className="flex shrink-0 items-baseline gap-3 text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">
          <strong className="text-[0.9375rem] font-semibold text-[var(--text)]">×{group.occurrences}</strong>
          <span title={dateFormat.format(new Date(group.lastSeen))}>{relative(group.lastSeen)}</span>
          {group.resolved && <span className="text-[var(--price-win)]">resuelto</span>}
        </span>
      </summary>

      <div className="space-y-5 border-t border-[var(--border)] px-4 py-5 sm:px-6">
        <dl className="grid gap-x-8 gap-y-3 text-[0.8125rem] sm:grid-cols-3">
          <Item label="Primera vez" value={dateFormat.format(new Date(group.firstSeen))} />
          <Item label="Última vez" value={dateFormat.format(new Date(group.lastSeen))} />
          <Item label="Referencia" value={`#${group.lastId}${group.digest ? ` · ${group.digest}` : ''}`} mono />
          {group.path && <Item label="Ruta pedida" value={`${group.method ? `${group.method} ` : ''}${group.path}`} mono />}
          {group.route && group.route !== group.path && <Item label="Archivo / ruta" value={group.route} mono />}
          <Item label="Tipo" value={SOURCE_HINT[group.source] ?? group.source} />
          {group.userAgent && <Item label="Navegador" value={group.userAgent} mono wide />}
        </dl>

        <Block label="Mensaje" text={group.message} />
        {group.stack && <Block label="Pila" text={group.stack} />}
        {group.context && Object.keys(group.context).length > 0 && (
          <Block label="Contexto" text={JSON.stringify(group.context, null, 2)} />
        )}

        {!group.resolved && (
          <form action={resolveErrorAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="fingerprint" value={group.fingerprint} />
            <input type="hidden" name="back" value={back} />
            <button
              type="submit"
              className="rounded-full bg-[var(--text)] px-5 py-2 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              Marcar como resuelto
            </button>
            <span className="text-[0.75rem] text-[var(--text-tertiary)]">Si vuelve a pasar, reaparece solo.</span>
          </form>
        )}
      </div>
    </details>
  );
}

function Item({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-3' : ''}>
      <dt className="text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{label}</dt>
      <dd className={`mt-0.5 break-words text-[var(--text)] ${mono ? 'font-mono text-[0.75rem]' : ''}`}>{value}</dd>
    </div>
  );
}

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-[0.6875rem] tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{label}</p>
      <pre className="mt-1.5 max-h-80 overflow-auto rounded-xl bg-[var(--bg-subtle)] px-4 py-3 font-mono text-[0.75rem] leading-[1.6] whitespace-pre-wrap text-[var(--text-secondary)]">
        {text}
      </pre>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="tracking-[0.14em] uppercase">{label}</dt>
      <dd className="text-[1rem] font-semibold tabular-nums text-[var(--text)]">{value}</dd>
    </div>
  );
}
