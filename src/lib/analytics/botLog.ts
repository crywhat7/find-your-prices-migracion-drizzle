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
