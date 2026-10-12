import type { Metadata } from 'next';
import Link from 'next/link';
import { siteConfig } from '@/config/site';
import {
  cityLabel,
  countryName,
  dateLabel,
  DEVICE_LABEL,
  formatDecimal,
  formatInt,
  formatPercent,
  PAGE_TYPE_LABEL,
} from '@/features/admin-analytics/format';
import { deriveKpis, loadTraffic } from '@/features/admin-analytics/loadTraffic';
import { PrintButton } from '@/features/admin-analytics/PrintButton';
import { TimeSeriesChart } from '@/features/admin-analytics/TimeSeriesChart';
import { BarList, Card, RangeControls, StatTile } from '@/features/admin-analytics/Widgets';
import { NO_INDEX_ROBOTS } from '@/lib/seo/metadata';
import { listPartnersForAdmin } from '@/server/services/affiliates';
import { hasAdminSession } from '@/server/admin/session';

/**
 * Reporte de tráfico para aliados: la versión limpia del panel, pensada para
 * imprimir o guardar como PDF y mandarla. Solo cifras agregadas —nada que
 * identifique a una persona—, con la metodología al pie para que el aliado
 * sepa qué está mirando. Con `?partner=<slug>` agrega los clics hacia ese
 * aliado en el período.
 */
export const metadata: Metadata = { title: 'Reporte de tráfico', robots: NO_INDEX_ROBOTS };
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string; partner?: string }>;
}

const BUCKET_LABEL = { day: 'por día', week: 'por semana', month: 'por mes' } as const;

const ghost =
  'rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text)] hover:bg-[var(--bg-subtle)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]';

export default async function TrafficReportPage({ searchParams }: PageProps) {
  // El layout muestra la puerta, pero no frena esta función: sin esto los
  // datos viajan igual en el payload. Ver `server/admin/session.ts`.
  if (!(await hasAdminSession())) return null;
  const params = await searchParams;
  const [{ range, report, previous, error }, partners] = await Promise.all([
    loadTraffic(params, 8),
    listPartnersForAdmin().catch(() => []),
  ]);
  const partner = partners.find((row) => row.slug === params.partner) ?? null;
  const partnerClicks = partner && report ? report.partnerClicks.find((row) => row.slug === partner.slug) : null;
  const extra: Record<string, string> = partner ? { partner: partner.slug } : {};

  return (
    <div className="min-h-screen bg-[var(--bg)] print:bg-white">
      {/* Controles: no salen en el papel. */}
      <div className="border-b border-[var(--border)] px-6 pt-16 pb-6 sm:px-10 lg:px-16 print:hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <p className="text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            <Link href="/admin" className="text-[var(--accent)] hover:opacity-70">Panel</Link>
            {' · '}
            <Link href="/admin/trafico" className="text-[var(--accent)] hover:opacity-70">← Tráfico</Link>
          </p>
          <RangeControls range={range} basePath="/admin/trafico/reporte" extra={extra} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.8125rem] text-[var(--text-tertiary)]">Para:</span>
            <Link
              href={`/admin/trafico/reporte?${new URLSearchParams({ range: range.key, from: range.fromDate, to: range.toDate })}`}
              className={`${ghost} ${!partner ? 'bg-[var(--bg-subtle)]' : ''}`}
            >
              General
            </Link>
            {partners.map((row) => (
              <Link
                key={row.id}
                href={`/admin/trafico/reporte?${new URLSearchParams({ range: range.key, from: range.fromDate, to: range.toDate, partner: row.slug })}`}
                className={`${ghost} ${partner?.id === row.id ? 'bg-[var(--bg-subtle)]' : ''}`}
              >
                {row.name}
              </Link>
            ))}
            <PrintButton className="ml-auto rounded-full bg-[var(--text)] px-4 py-1.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" />
          </div>
        </div>
      </div>

      <main className="px-6 py-10 sm:px-10 lg:px-16 print:p-0">
        <article className="mx-auto w-full max-w-5xl space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--border)] pb-6">
            <div>
              <span role="img" aria-label={siteConfig.name} className="brand-logo h-[72px] self-start" />
              <h1 className="mt-5 text-[clamp(1.75rem,4vw,2.75rem)] leading-[1] font-semibold tracking-[-0.035em] text-[var(--text)]">
                Reporte de tráfico{partner ? ` para ${partner.name}` : ''}
              </h1>
              <p className="mt-2 text-[0.9375rem] text-[var(--text-secondary)]">
                Del {dateLabel(range.fromDate)} al {dateLabel(range.toDate)} ({range.days} días)
              </p>
            </div>
            <p className="max-w-[34ch] text-[0.8125rem] leading-[1.5] text-[var(--text-tertiary)]">
              {siteConfig.name} · comparador de precios de {siteConfig.countryName}. {siteConfig.url.replace(/^https?:\/\//, '')}
            </p>
          </header>

          {error || !report ? (
            <p role="alert" className="rounded-2xl bg-[var(--critical-soft)] px-4 py-3 text-[0.875rem] text-[var(--critical)]">
              {error ?? 'No se pudo leer el tráfico.'}
            </p>
          ) : (
            <ReportBody
              report={report}
              previous={previous}
              range={range}
              partnerName={partner?.name ?? null}
              partnerClicks={partnerClicks ?? null}
            />
          )}
        </article>
      </main>
    </div>
  );
}

function ReportBody({
  report,
  previous,
  range,
  partnerName,
  partnerClicks,
}: {
  report: NonNullable<Awaited<ReturnType<typeof loadTraffic>>['report']>;
  previous: Awaited<ReturnType<typeof loadTraffic>>['previous'];
  range: Awaited<ReturnType<typeof loadTraffic>>['range'];
  partnerName: string | null;
  partnerClicks: { views: number; visitors: number } | null;
}) {
  const kpi = deriveKpis(report, previous, range.days);
  const total = report.totals.views;

  return (
    <>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Visitantes únicos" value={formatInt(kpi.visitors)} change={kpi.change.visitors} />
        <StatTile label="Visitantes por día" value={formatInt(Math.round(kpi.dailyVisitors))} change={kpi.change.dailyVisitors} note="promedio del período" />
        <StatTile label="Páginas vistas" value={formatInt(kpi.views)} change={kpi.change.views} />
        <StatTile label="Páginas por sesión" value={formatDecimal(kpi.pagesPerSession)} />
        <StatTile label="Desde teléfono" value={formatPercent(report.totals.mobile, total)} />
        <StatTile label="Desde Honduras" value={formatPercent(report.totals.honduras, total)} />
      </dl>

      {partnerName && (
        <dl className="grid grid-cols-2 gap-3">
          <StatTile label={`Clics hacia ${partnerName}`} value={formatInt(partnerClicks?.views ?? 0)} />
          <StatTile label="Personas que hicieron clic" value={formatInt(partnerClicks?.visitors ?? 0)} />
        </dl>
      )}

      <Card title={`Visitantes y vistas ${BUCKET_LABEL[range.bucket]}`}>
        <TimeSeriesChart points={report.series} bucket={range.bucket} title={`Visitantes y vistas ${BUCKET_LABEL[range.bucket]}`} />
      </Card>

      <div className="grid gap-6 md:grid-cols-2 print:grid-cols-2">
        <Card title="Países">
          <BarList rows={report.countries} total={total} label={(row) => countryName(row.label)} limit={6} />
        </Card>
        <Card title="Ciudades">
          <BarList rows={report.cities} total={total} label={(row) => cityLabel(row.label)} limit={6} />
        </Card>
        <Card title="Dispositivos">
          <BarList rows={report.devices} total={total} label={(row) => DEVICE_LABEL[row.label] ?? row.label} />
        </Card>
        <Card title="De dónde llegan">
          <BarList rows={report.referrers} total={total} label={(row) => (row.label === '(directo)' ? 'Directo y mensajería' : row.label)} limit={6} />
        </Card>
        <Card title="Qué miran" className="md:col-span-2 print:col-span-2">
          <BarList rows={report.pageTypes} total={total} label={(row) => PAGE_TYPE_LABEL[row.label] ?? row.label} />
        </Card>
      </div>

      <footer className="break-inside-avoid border-t border-[var(--border)] pt-5 text-[0.75rem] leading-[1.6] text-[var(--text-tertiary)]">
        <p className="font-medium text-[var(--text-secondary)]">Cómo se mide</p>
        <p className="mt-1">
          Medición propia de {siteConfig.name}, sin herramientas de terceros. Se excluyen bots, rastreadores y vistas
          previas de enlaces. Una «página vista» es cada página abierta; un «visitante único» es una combinación anónima de
          red y navegador dentro del mes (no se guardan direcciones IP ni datos personales). La ubicación es aproximada y
          la da la red de quien visita. Las variaciones comparan con el período anterior de la misma duración. Cifras en
          hora de Honduras.
        </p>
      </footer>
    </>
  );
}
