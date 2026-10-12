import 'server-only';
import { percentChange, resolveRange, type ResolvedRange } from '@/lib/analytics/ranges';
import {
  getAnalyticsReport,
  getAnalyticsTotals,
  getLiveVisitors,
  type AnalyticsReport,
  type Totals,
} from '@/server/services/analytics';

export interface TrafficData {
  range: ResolvedRange;
  report: AnalyticsReport | null;
  previous: Totals | null;
  live: number;
  error: string | null;
}

export interface TrafficParams {
  range?: string;
  from?: string;
  to?: string;
  /** "1" = incluir bots en todas las cifras. */
  bots?: string;
}

/** Todo lo que piden el panel y el reporte, en paralelo. Un fallo no tumba la página. */
export async function loadTraffic(params: TrafficParams, limit = 12): Promise<TrafficData> {
  const range = resolveRange(params);
  const includeBots = params.bots === '1';
  try {
    const [report, previous, live] = await Promise.all([
      getAnalyticsReport(range.from, range.to, range.bucket, limit, includeBots),
      getAnalyticsTotals(range.prevFrom, range.prevTo, includeBots),
      getLiveVisitors(),
    ]);
    return { range, report, previous, live, error: null };
  } catch (error) {
    return { range, report: null, previous: null, live: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Cifras derivadas que usan las dos páginas. */
export function deriveKpis(report: AnalyticsReport, previous: Totals | null, days: number) {
  const { totals } = report;
  const prev = previous ?? { views: 0, visitors: 0, sessions: 0, mobile: 0, honduras: 0, visitorDays: 0 };
  const pagesPerSession = totals.sessions > 0 ? totals.views / totals.sessions : 0;
  const prevPagesPerSession = prev.sessions > 0 ? prev.views / prev.sessions : 0;
  return {
    visitors: totals.visitors,
    views: totals.views,
    sessions: totals.sessions,
    pagesPerSession,
    dailyVisitors: totals.visitorDays / Math.max(1, days),
    mobileShare: totals.views > 0 ? totals.mobile / totals.views : 0,
    hondurasShare: totals.views > 0 ? totals.honduras / totals.views : 0,
    change: {
      visitors: percentChange(totals.visitors, prev.visitors),
      views: percentChange(totals.views, prev.views),
      sessions: percentChange(totals.sessions, prev.sessions),
      pagesPerSession: percentChange(pagesPerSession, prevPagesPerSession),
      dailyVisitors: percentChange(totals.visitorDays, prev.visitorDays),
    },
  };
}
