/**
 * Lectura de una visita: tipo de página, dispositivo, navegador, sistema, de
 * dónde vino y si es un bot. Puro y sin dependencias —una librería de
 * user-agent pesa más que todo el resto del recolector— y probado aparte.
 *
 * No intenta ser exhaustivo: la meta es un reporte que diga "70 % desde
 * teléfono, la mitad desde Facebook", no identificar el modelo del aparato.
 */

export type DeviceType = "mobile" | "tablet" | "desktop";

export type PageType =
  | "home"
  | "search"
  | "product"
  | "category"
  | "store"
  | "partner"
  | "quote"
  | "favorites"
  | "info"
  | "other";

export interface UserAgentInfo {
  device: DeviceType;
  browser: string;
  os: string;
}

const BOT_PATTERN =
  /bot\b|bot\/|crawl|spider|slurp|archiver|preview|facebookexternalhit|whatsapp\/|telegrambot|headless|lighthouse|pagespeed|pingdom|uptime|monitor|curl\/|wget\/|python|axios|node-fetch|go-http|java\/|httpclient|scrapy|phantom|puppeteer|playwright/i;

/** Rastreadores, vistas previas de enlaces y clientes HTTP sueltos. */
export function isBot(userAgent: string): boolean {
  return !userAgent.trim() || BOT_PATTERN.test(userAgent);
}

export function parseUserAgent(userAgent: string): UserAgentInfo {
  const ua = userAgent;

  let device: DeviceType = "desktop";
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    device = "tablet";
  } else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) {
    device = "mobile";
  }

  // Los navegadores dentro de apps primero: en Honduras buena parte del
  // tráfico llega desde Facebook e Instagram, y eso es un dato en sí.
  let browser = "Otro";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) browser = "Facebook (app)";
  else if (/Instagram/i.test(ua)) browser = "Instagram (app)";
  else if (/TikTok|musical_ly|BytedanceWebview/i.test(ua)) browser = "TikTok (app)";
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/.test(ua)) browser = "Firefox";
  else if (/Chrome|CriOS|Chromium/.test(ua)) browser = "Chrome";
  else if (/Safari/.test(ua)) browser = "Safari";

  let os = "Otro";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  return { device, browser, os };
}

/**
 * Qué clase de página es. Las rutas tienen nombre distinto en cada idioma
 * ("/tiendas" y "/en/stores"), así que se normaliza quitando el prefijo
 * y aceptando las dos formas.
 */
export function classifyPath(path: string, search = ""): PageType {
  const clean = path.replace(/^\/en(?=\/|$)/, "") || "/";
  const segment = clean.split("/")[1] ?? "";

  if (clean === "/") return new URLSearchParams(search).get("q") ? "search" : "home";
  if (segment === "p" || segment === "producto" || segment === "product") return "product";
  if (segment === "categorias" || segment === "categories") return "category";
  if (segment === "tiendas" || segment === "stores") return "store";
  if (segment === "aliados" || segment === "partners") return "partner";
  if (segment === "cotizacion" || segment === "quote") return "quote";
  if (segment === "favoritos" || segment === "favorites") return "favorites";
  if (
    ["acerca", "about", "terminos", "terms", "privacidad", "privacy", "uso-de-contenido", "content-use"].includes(segment)
  ) {
    return "info";
  }
  return "other";
}

/**
 * Dominio de referencia, normalizado: sin "www."/"m."/"l." y con las
 * variantes de Google y Facebook juntas. `null` si viene del propio sitio o
 * no vino de ningún lado (escrito a mano, marcador, app de mensajería).
 */
export function normalizeReferrer(referrer: string, ownHost: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return null;
  }
  const own = ownHost.toLowerCase().replace(/^www\./, "");
  host = host.replace(/^(www|m|l|lm|mobile)\./, "");
  if (!host || host === own || host.endsWith(`.${own}`) || host === "localhost") return null;
  if (/^(.+\.)?google\.[a-z.]+$/.test(host)) return "google.com";
  if (/^(.+\.)?bing\.com$/.test(host)) return "bing.com";
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(host)) return "facebook.com";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram.com";
  if (host === "t.co") return "x.com";
  return host;
}

export interface Utm {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

/** `utm_source`, `utm_medium`, `utm_campaign` de la búsqueda, recortados. */
export function readUtm(search: string): Utm {
  const params = new URLSearchParams(search);
  const read = (key: string) => {
    const value = params.get(key)?.trim().slice(0, 80);
    return value ? value.toLowerCase() : null;
  };
  return { source: read("utm_source"), medium: read("utm_medium"), campaign: read("utm_campaign") };
}

/**
 * Una ruta que vale la pena contar: del sitio público, sin el panel, la API
 * ni las salidas a aliados (esas se cuentan aparte, como clics).
 */
export function isTrackablePath(path: string): boolean {
  if (!path.startsWith("/") || path.length > 300) return false;
  return !/^\/(admin|api|go|_next)(\/|$)/.test(path);
}
