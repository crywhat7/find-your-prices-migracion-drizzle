import 'server-only';
import { createHmac } from 'node:crypto';
import { siteConfig } from '@/config/site';
import { getSupabaseAdmin } from '@/server/db/supabase';
import {
  classifyPath,
  isBot,
  isTrackablePath,
  normalizeReferrer,
  parseUserAgent,
  readUtm,
  type DeviceType,
} from '@/lib/analytics/visitor';
import type { Bucket } from '@/lib/analytics/ranges';
import { hasDatabase } from './catalog';

/**
 * Estadísticas de visitas (migración 0048): el recolector que alimenta
 * `page_views` y `affiliate_click_events`, y la lectura de los reportes.
 *
 * La IP no se guarda nunca. Se usa en el momento para dos cosas: la
 * ubicación aproximada (que ya viene resuelta en las cabeceras del
 * proveedor, sin consultar a nadie más) y el `visitor_hash`, un HMAC de
 * IP + navegador con una sal que cambia cada mes. Con eso se cuentan
 * visitantes únicos dentro del mes, y nada más: el hash no se puede
 * revertir a la IP ni sirve para seguir a alguien de un mes al siguiente.
 */

// -----------------------------------------------------------------------------
// Contexto de la petición
// -----------------------------------------------------------------------------

export interface VisitorContext {
  visitorHash: string;
  device: DeviceType;
  browser: string;
  os: string;
  country: string | null;
  region: string | null;
  city: string | null;
}

/** La sal: un secreto propio si existe; si no, derivado de CRON_SECRET. */
function saltSecret(): string {
  return process.env.ANALYTICS_SALT || process.env.CRON_SECRET || 'find-your-prices';
}

/** "2026-10" en hora de Honduras: la sal cambia el primer día de cada mes local. */
function monthKey(now: Date): string {
  return new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || headers.get('cf-connecting-ip') || '';
}

function header(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  if (!value) return null;
  try {
    // Vercel manda la ciudad codificada ("San%20Pedro%20Sula").
    return decodeURIComponent(value).slice(0, 80);
  } catch {
    return value.slice(0, 80);
  }
}

/**
 * Lo que se puede saber de quien hace la petición, o `null` si es un bot.
 * La ubicación sale de las cabeceras de Vercel (o Cloudflare); en local no
 * existen y queda vacía.
 */
export function readVisitor(headers: Headers, now: Date = new Date()): VisitorContext | null {
  const userAgent = headers.get('user-agent') ?? '';
  if (isBot(userAgent)) return null;

  const ip = clientIp(headers);
  const visitorHash = createHmac('sha256', `${saltSecret()}:${monthKey(now)}`)
    .update(`${ip}|${userAgent}`)
    .digest('base64url')
    .slice(0, 22);

  const country = header(headers, 'x-vercel-ip-country') ?? header(headers, 'cf-ipcountry');
  return {
    visitorHash,
    ...parseUserAgent(userAgent),
    country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    region: header(headers, 'x-vercel-ip-country-region'),
    city: header(headers, 'x-vercel-ip-city'),
  };
}

// -----------------------------------------------------------------------------
// Escritura
// -----------------------------------------------------------------------------

/**
 * Solo se registra en producción. El entorno local apunta a la misma base,
 * y cada recarga de quien desarrolla terminaría en el reporte que ven los
 * aliados. `ANALYTICS_IN_DEV=1` lo habilita para probar el recolector.
 */
function shouldRecord(): boolean {
  if (!hasDatabase()) return false;
  return process.env.NODE_ENV === 'production' || process.env.ANALYTICS_IN_DEV === '1';
}

export interface PageViewPayload {
  path: string;
  search: string;
  referrer: string;
  locale: string | null;
  sessionId: string | null;
  screenWidth: number | null;
}

export async function recordPageView(payload: PageViewPayload, visitor: VisitorContext): Promise<void> {
  if (!shouldRecord() || !isTrackablePath(payload.path)) return;
  const utm = readUtm(payload.search);
  const ownHost = new URL(siteConfig.url).hostname;

  const { error } = await getSupabaseAdmin().from('page_views').insert({
    path: payload.path,
    page_type: classifyPath(payload.path, payload.search),
    locale: payload.locale,
    referrer_host: normalizeReferrer(payload.referrer, ownHost),
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    country: visitor.country,
    region: visitor.region,
    city: visitor.city,
    device: visitor.device,
    browser: visitor.browser,
    os: visitor.os,
    screen_width: payload.screenWidth,
    visitor_hash: visitor.visitorHash,
    session_id: payload.sessionId,
  });
  // Una visita perdida no le importa a nadie; un error en la consola sí avisa
  // si falta la migración.
  if (error) console.warn('[analytics] no se pudo registrar la visita:', error.message);
}

export async function recordAffiliateClickEvent(
  partnerId: string,
  offerId: string | null,
  visitor: VisitorContext,
): Promise<void> {
  if (!shouldRecord()) return;
  const { error } = await getSupabaseAdmin().from('affiliate_click_events').insert({
    partner_id: partnerId,
    offer_id: offerId,
    country: visitor.country,
    device: visitor.device,
    visitor_hash: visitor.visitorHash,
  });
  if (error) console.warn('[analytics] no se pudo registrar el clic:', error.message);
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

export interface Totals {
  views: number;
  visitors: number;
  sessions: number;
  mobile: number;
  honduras: number;
  /** Suma de visitantes distintos de cada día; ÷ días = promedio diario. */
  visitorDays: number;
}

export interface Breakdown {
  label: string;
  views: number;
  visitors: number;
  slug?: string;
}

export interface SeriesPoint {
  /** Inicio del tramo, fecha local "YYYY-MM-DD". */
  bucket: string;
  views: number;
  visitors: number;
}

export interface AnalyticsReport {
  totals: Totals;
  series: SeriesPoint[];
  pages: Breakdown[];
  pageTypes: Breakdown[];
  countries: Breakdown[];
  cities: Breakdown[];
  devices: Breakdown[];
  browsers: Breakdown[];
  os: Breakdown[];
  referrers: Breakdown[];
  campaigns: Breakdown[];
  locales: Breakdown[];
  /** [día ISO 1=lunes, hora 0-23, vistas] */
  heatmap: [number, number, number][];
  partnerClicks: Breakdown[];
}

const EMPTY_TOTALS: Totals = { views: 0, visitors: 0, sessions: 0, mobile: 0, honduras: 0, visitorDays: 0 };

function explain(error: { code?: string; message: string }): string {
  if (error.code === '42883' || error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205') {
    return 'Faltan las tablas de estadísticas: corré la migración 0048_analytics.sql en Supabase.';
  }
  return error.message;
}

function toTotals(value: unknown): Totals {
  const raw = (value ?? {}) as Record<string, unknown>;
  return {
    views: Number(raw.views ?? 0),
    visitors: Number(raw.visitors ?? 0),
    sessions: Number(raw.sessions ?? 0),
    mobile: Number(raw.mobile ?? 0),
    honduras: Number(raw.honduras ?? 0),
    visitorDays: Number(raw.visitorDays ?? 0),
  };
}

export async function getAnalyticsReport(from: Date, to: Date, bucket: Bucket, limit = 12): Promise<AnalyticsReport> {
  const { data, error } = await getSupabaseAdmin().rpc('analytics_report', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_bucket: bucket,
    p_limit: limit,
  });
  if (error) throw new Error(explain(error));

  const raw = (data ?? {}) as Record<string, unknown>;
  const list = (key: string) => ((raw[key] ?? []) as Breakdown[]).map((row) => ({
    ...row,
    views: Number(row.views),
    visitors: Number(row.visitors),
  }));

  return {
    totals: toTotals(raw.totals),
    series: ((raw.series ?? []) as SeriesPoint[]).map((point) => ({
      bucket: String(point.bucket),
      views: Number(point.views),
      visitors: Number(point.visitors),
    })),
    pages: list('pages'),
    pageTypes: list('pageTypes'),
    countries: list('countries'),
    cities: list('cities'),
    devices: list('devices'),
    browsers: list('browsers'),
    os: list('os'),
    referrers: list('referrers'),
    campaigns: list('campaigns'),
    locales: list('locales'),
    heatmap: (raw.heatmap ?? []) as [number, number, number][],
    partnerClicks: list('partnerClicks'),
  };
}

export async function getAnalyticsTotals(from: Date, to: Date): Promise<Totals> {
  const { data, error } = await getSupabaseAdmin().rpc('analytics_totals', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) return EMPTY_TOTALS;
  return toTotals(data);
}

/** Visitantes distintos en los últimos 30 minutos: "ahora en el sitio". */
export async function getLiveVisitors(): Promise<number> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from('page_views')
    .select('visitor_hash')
    .gte('created_at', since)
    .limit(5000);
  if (error) return 0;
  return new Set((data ?? []).map((row) => String(row.visitor_hash))).size;
}
