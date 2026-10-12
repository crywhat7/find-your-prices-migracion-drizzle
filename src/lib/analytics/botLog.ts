import { siteConfig } from "@/config/site";
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
} from "./visitor";

/**
 * Registro de visitas de bots desde `src/proxy.ts`.
 *
 * Va aparte del recolector de personas (`server/services/analytics.ts`) por
 * dónde corre: el proxy pasa por cada petición y tiene que ser liviano y
 * portátil. Nada de `supabase-js` ni de `node:crypto`: un `fetch` a la API
 * REST de Supabase y Web Crypto, que existen igual en Node, en el runtime
 * edge y en Cloudflare Workers.
 */

const DB_SCHEMA = "find_your_prices";

/** Solo en producción, por la misma razón que el recolector de personas. */
function enabled(): boolean {
  return process.env.NODE_ENV === "production" || process.env.ANALYTICS_IN_DEV === "1";
}

async function sha256Short(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest).slice(0, 11), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** True si la petición es de un bot y vale la pena anotarla. */
export function shouldLogBot(method: string, path: string, headers: Headers): boolean {
  if (method !== "GET" || !isTrackablePath(path)) return false;
  // Prefetch y pedidos RSC del router: no son páginas vistas.
  if (headers.get("rsc") || headers.get("next-router-prefetch") || headers.get("purpose") === "prefetch") return false;
  return isBot(headers.get("user-agent") ?? "");
}

/**
 * Fracción de las visitas de bots que se anotan: 1 de cada 10 por defecto.
 *
 * Anotarlas todas era una escritura a Supabase por cada página que pide
 * Googlebot, y Googlebot pide decenas de miles por día: justo cuando el sitio
 * más necesita responder rápido al rastreador, la base se llenaba de
 * inserciones que compiten con las consultas de las fichas. Una muestra
 * alcanza para lo que se quiere ver —qué bots entran, a qué y en qué
 * proporción—. El panel avisa que esas cifras son una muestra.
 *
 * Se ajusta con `BOT_LOG_SAMPLE_RATE` (entre 0 y 1; 0 apaga el registro, 1
 * anota todo).
 */
export const DEFAULT_BOT_SAMPLE_RATE = 0.1;

export function botSampleRate(): number {
  const raw = process.env.BOT_LOG_SAMPLE_RATE?.trim();
  const value = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : DEFAULT_BOT_SAMPLE_RATE;
}

/** True si esta visita entra en la muestra. `random` sólo existe para las pruebas. */
export function inBotSample(random: number = Math.random()): boolean {
  return random < botSampleRate();
}

/** Anota la visita de un bot. Nunca lanza: un registro perdido no importa. */
export async function logBotVisit(url: URL, headers: Headers): Promise<void> {
  if (!enabled()) return;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_SECRET;
  if (!base || !key) return;

  try {
    const userAgent = headers.get("user-agent") ?? "";
    const utm = readUtm(url.search);
    const path = url.pathname;
    const name = botName(userAgent);
    const { device, os } = parseUserAgent(userAgent);

    const row = {
      path,
      page_type: classifyPath(path, url.search),
      locale: /^\/en(\/|$)/.test(path) ? "en" : "es",
      referrer_host: normalizeReferrer(headers.get("referer") ?? "", new URL(siteConfig.url).hostname),
      utm_source: utm.source,
      utm_medium: utm.medium,
      utm_campaign: utm.campaign,
      ...readGeo(headers),
      device,
      browser: name,
      os,
      // Un bot no es una persona que contar: el hash solo separa instancias
      // del mismo bot, sin sal mensual.
      visitor_hash: `bot-${await sha256Short(`${clientIp(headers)}|${userAgent}`)}`,
      is_bot: true,
      bot_name: name,
    };

    const response = await fetch(`${base}/rest/v1/page_views`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Content-Profile": DB_SCHEMA,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
    if (!response.ok) console.warn("[analytics] no se pudo registrar el bot:", response.status, await response.text());
  } catch (error) {
    console.warn("[analytics] no se pudo registrar el bot:", error);
  }
}
