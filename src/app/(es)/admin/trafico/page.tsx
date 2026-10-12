import type { Metadata } from 'next';
import Link from 'next/link';
import {
  cityLabel,
  countryName,
  dateLabel,
  DEVICE_LABEL,
  formatDecimal,
  formatInt,
  formatPercent,
  LOCALE_LABEL,
  PAGE_TYPE_LABEL,
} from '@/features/admin-analytics/format';
import { HourHeatmap } from '@/features/admin-analytics/HourHeatmap';
import { deriveKpis, loadTraffic } from '@/features/admin-analytics/loadTraffic';
import { TimeSeriesChart } from '@/features/admin-analytics/TimeSeriesChart';
import { BarList, Card, RangeControls, StatTile } from '@/features/admin-analytics/Widgets';
import { BotToggle } from '@/features/admin-analytics/BotToggle';
import { botSampleRate } from '@/lib/analytics/botLog';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { hasAdminSession } from '@/server/admin/session';

/**
 * Panel de tráfico: quién entra, a qué, desde dónde y cuándo. Lee de
 * `page_views` (migración 0048) por el servicio de servidor; detrás de la
 * puerta de /admin.
 */
export const metadata: Metadata = { title: 'Tráfico', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string; bots?: string }>;
}

const BUCKET_LABEL = { day: 'por día', week: 'por semana', month: 'por mes' } as const;

export default async function TrafficPage({ searchParams }: PageProps) {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  const params = await searchParams;
  const { range, report, previous, live, error } = await loadTraffic(params, 15);
  const includeBots = params.bots === '1';
  const sampleRate = botSampleRate();
  const baseQuery = { range: range.key, from: range.fromDate, to: range.toDate };
  const query = new URLSearchParams({ ...baseQuery, ...(includeBots ? { bots: '1' } : {}) }).toString();
  // El reporte para aliados va siempre sin bots: son cifras de personas.
  const reportQuery = new URLSearchParams(baseQuery).toString();
  const toggleHref = `/admin/trafico?${new URLSearchParams({ ...baseQuery, ...(includeBots ? {} : { bots: '1' }) })}`;

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] px-6 pt-20 pb-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl">
          <p className="enter-fade text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">
              Panel
            </Link>
            {' · '}
            <Link href="/admin/aliados" className="text-[var(--accent)] hover:opacity-70">
              Aliados
            </Link>
          </p>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
            <div>
              <h1 className="enter text-[clamp(2rem,5vw,3.5rem)] leading-[0.95] font-semibold tracking-[-0.04em] text-[var(--text)]">
                Tráfico
              </h1>
              <p className="enter mt-3 text-[0.9375rem] text-[var(--text-secondary)]">
                Del {dateLabel(range.fromDate)} al {dateLabel(range.toDate)} · hora de Honduras
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex items-center gap-2 rounded-full bg-[var(--price-win-soft)] px-3.5 py-1.5 text-[0.8125rem] text-[var(--price-win)]">
                <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-[var(--price-win)]" />
                <strong className="font-semibold tabular-nums">{formatInt(live)}</strong> en los últimos 30 min
              </p>
              <Link
                href={`/admin/trafico/reporte?${reportQuery}`}
                className="rounded-full bg-[var(--text)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
              >
                Reporte para aliados
              </Link>
              <a
                href={`/admin/trafico/export?${query}`}
                className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] hover:bg-[var(--bg-subtle)]"
              >
                Exportar CSV
              </a>
            </div>
          </div>
          <div className="mt-8 space-y-4">
            <RangeControls range={range} basePath="/admin/trafico" extra={includeBots ? { bots: '1' } : {}} />
            <BotToggle
              checked={includeBots}
              toggleHref={toggleHref}
              botViews={report?.botViews ?? 0}
              sampleRate={sampleRate}
            />
          </div>
        </div>
      </header>

      <main className="px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          {error || !report ? (
            <p role="alert" className="rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
              {error ?? 'No se pudo leer el tráfico.'}
            </p>
          ) : (
            <Dashboard report={report} previous={previous} range={range} includeBots={includeBots} sampleRate={sampleRate} />
          )}
        </div>
      </main>
    </div>
  );
}

function Dashboard({
  report,
  previous,
  range,
  includeBots,
  sampleRate,
}: {
  report: NonNullable<Awaited<ReturnType<typeof loadTraffic>>['report']>;
  previous: Awaited<ReturnType<typeof loadTraffic>>['previous'];
  range: Awaited<ReturnType<typeof loadTraffic>>['range'];
  includeBots: boolean;
  sampleRate: number;
}) {
  const kpi = deriveKpis(report, previous, range.days);
  const total = report.totals.views;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Visitantes únicos" value={formatInt(kpi.visitors)} change={kpi.change.visitors} />
        <StatTile label="Visitantes por día" value={formatInt(Math.round(kpi.dailyVisitors))} change={kpi.change.dailyVisitors} note="promedio" />
        <StatTile label="Páginas vistas" value={formatInt(kpi.views)} change={kpi.change.views} />
        <StatTile label="Sesiones" value={formatInt(kpi.sessions)} change={kpi.change.sessions} />
        <StatTile label="Páginas por sesión" value={formatDecimal(kpi.pagesPerSession)} change={kpi.change.pagesPerSession} />
        <StatTile
          label="Desde teléfono"
          value={formatPercent(report.totals.mobile, total)}
          note={`${formatPercent(report.totals.honduras, total)} desde Honduras`}
        />
      </dl>

      <Card title={`Visitantes y vistas ${BUCKET_LABEL[range.bucket]}`} hint="Pasá el cursor o usá las flechas del teclado sobre el gráfico.">
        <TimeSeriesChart points={report.series} bucket={range.bucket} title={`Visitantes y vistas ${BUCKET_LABEL[range.bucket]}`} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Páginas más vistas">
          <BarList rows={report.pages} total={total} href={(row) => row.label} />
        </Card>
        <Card title="Secciones" hint="Qué clase de página: fichas, categorías, tiendas, búsquedas…">
          <BarList rows={report.pageTypes} total={total} label={(row) => PAGE_TYPE_LABEL[row.label] ?? row.label} />
        </Card>
        <Card title="Países" hint="Ubicación aproximada según la red de quien visita.">
          <BarList rows={report.countries} total={total} label={(row) => countryName(row.label)} />
        </Card>
        <Card title="Ciudades">
          <BarList rows={report.cities} total={total} label={(row) => cityLabel(row.label)} empty="Sin ciudades todavía (solo se conocen en producción)." />
        </Card>
        <Card title="Dispositivos">
          <BarList rows={report.devices} total={total} label={(row) => DEVICE_LABEL[row.label] ?? row.label} />
        </Card>
        <Card title="Navegadores" hint="Las apps (Facebook, Instagram) cuentan aparte: es su navegador interno.">
          <BarList rows={report.browsers} total={total} />
        </Card>
        <Card title="Sistemas operativos">
          <BarList rows={report.os} total={total} />
        </Card>
        <Card title="De dónde llegan" hint="Sitio de referencia de la primera página de cada visita. «Directo» incluye WhatsApp y enlaces escritos a mano.">
          <BarList rows={report.referrers} total={total} label={(row) => (row.label === '(directo)' ? 'Directo' : row.label)} />
        </Card>
        <Card title="Campañas (UTM)" hint="Enlaces con utm_source / utm_medium / utm_campaign.">
          <BarList rows={report.campaigns} total={total} empty="Ningún enlace con UTM en el período." />
        </Card>
        <Card title="Idioma del sitio">
          <BarList rows={report.locales} total={total} label={(row) => LOCALE_LABEL[row.label] ?? row.label} />
        </Card>
      </div>

      <Card title="Cuándo entran" hint="Vistas por día de la semana y hora, en hora de Honduras.">
        <HourHeatmap cells={report.heatmap} />
      </Card>

      {includeBots && (
        <Card
          title="Bots y rastreadores"
          hint={`Vistas registradas en el servidor de buscadores, vistas previas de enlaces (WhatsApp, Facebook), IA y scripts. Ahora están sumadas en todas las cifras de arriba.${sampleRate > 0 && sampleRate < 1 ? ` Es una muestra: se anota 1 de cada ${Math.round(1 / sampleRate)} visitas de bots.` : ''}`}
        >
          <BarList rows={report.bots} total={report.botViews} empty="Ningún bot en el período." />
        </Card>
      )}

      <Card
        title="Clics hacia aliados"
        hint={`Salidas por /go/<aliado>${includeBots ? ', bots incluidos' : ', sin bots'}. Visitantes = visitantes distintos que hicieron clic.`}
      >
        <BarList
          rows={report.partnerClicks}
          total={report.partnerClicks.reduce((sum, row) => sum + row.views, 0)}
          empty="Sin clics a aliados en el período."
        />
      </Card>

      <p className="text-[0.75rem] leading-[1.55] text-[var(--text-tertiary)]">
        Visitantes únicos: se cuentan por mes (el identificador anónimo se renueva el día 1), así que un rango que cruza
        meses puede contar dos veces a la misma persona. Los bots y las vistas previas de enlaces solo se cuentan con
        «Incluir bots» marcado.
      </p>
    </>
  );
}
