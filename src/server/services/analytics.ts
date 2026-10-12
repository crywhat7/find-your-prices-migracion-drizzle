import 'server-only';
import { createHmac } from 'node:crypto';
import { siteConfig } from '@/config/site';
import { getSupabaseAdmin } from '@/server/db/supabase';
import {
  botName,
  classifyPath,
  clientIp,
  isBot,
  isTrackablePath,
  normalizeReferrer,
  parseUserAgent,
  readGeo,
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
  /** Rastreador, vista previa de enlaces o script. Se guarda marcado. */
  isBot: boolean;
  botName: string | null;
}

/** La sal: un secreto propio si existe; si no, derivado de CRON_SECRET. */
function saltSecret(): string {
  return process.env.ANALYTICS_SALT || process.env.CRON_SECRET || 'find-your-prices';
}

/** "2026-10" en hora de Honduras: la sal cambia el primer día de cada mes local. */
function monthKey(now: Date): string {
  return new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/**
 * Lo que se puede saber de quien hace la petición: código anónimo,
 * dispositivo, ubicación aproximada (ver `readGeo`) y si es un bot.
 */
export function readVisitor(headers: Headers, now: Date = new Date()): VisitorContext {
  const userAgent = headers.get('user-agent') ?? '';
  const bot = isBot(userAgent);

  const visitorHash = createHmac('sha256', `${saltSecret()}:${monthKey(now)}`)
    .update(`${clientIp(headers)}|${userAgent}`)
    .digest('base64url')
    .slice(0, 22);

  return {
    visitorHash,
    ...parseUserAgent(userAgent),
    ...readGeo(headers),
    isBot: bot,
    botName: bot ? botName(userAgent) : null,
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
    // Solo cuando es un bot: así las visitas de personas se siguen guardando
    // aunque la migración 0050 todavía no esté aplicada.
    ...(visitor.isBot ? { is_bot: true, bot_name: visitor.botName } : {}),
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
    ...(visitor.isBot ? { is_bot: true, bot_name: visitor.botName } : {}),
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
  /** Vistas de bots en el rango, se incluyan o no en el resto. */
  botViews: number;
  /** Qué bots, por nombre (solo vistas). */
  bots: Breakdown[];
}

const EMPTY_TOTALS: Totals = { views: 0, visitors: 0, sessions: 0, mobile: 0, honduras: 0, visitorDays: 0 };

function explain(error: { code?: string; message: string }): string {
  if (error.code === '42883' || error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205') {
    return 'Faltan las funciones de estadísticas: corré las migraciones 0048_analytics.sql y 0050_analytics_bots.sql en Supabase.';
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

export async function getAnalyticsReport(
  from: Date,
  to: Date,
  bucket: Bucket,
  limit = 12,
  includeBots = false,
): Promise<AnalyticsReport> {
  const { data, error } = await getSupabaseAdmin().rpc('analytics_report', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_bucket: bucket,
    p_limit: limit,
    // Solo se manda cuando se piden: así, sin la migración 0050, el panel
    // sigue andando con la función de 0048 (que excluye bots igual).
    ...(includeBots ? { p_include_bots: true } : {}),
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
    botViews: Number(raw.botViews ?? 0),
    bots: list('bots'),
  };
}

export async function getAnalyticsTotals(from: Date, to: Date, includeBots = false): Promise<Totals> {
  const { data, error } = await getSupabaseAdmin().rpc('analytics_totals', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    ...(includeBots ? { p_include_bots: true } : {}),
  });
  if (error) return EMPTY_TOTALS;
  return toTotals(data);
}

/** Visitantes distintos en los últimos 30 minutos: "ahora en el sitio". */
export async function getLiveVisitors(): Promise<number> {
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const query = () => getSupabaseAdmin().from('page_views').select('visitor_hash').gte('created_at', since).limit(5000);
  // Solo personas. Sin la 0050 no existe `is_bot` (ni hay bots guardados).
  let { data, error } = await query().eq('is_bot', false);
  if (error) ({ data, error } = await query());
  if (error) return 0;
  return new Set((data ?? []).map((row) => String(row.visitor_hash))).size;
}
