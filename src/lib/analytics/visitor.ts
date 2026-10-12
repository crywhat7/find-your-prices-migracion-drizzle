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

const KNOWN_BOTS: [RegExp, string][] = [
  [/Googlebot-Image/i, "Googlebot Imágenes"],
  [/Google-InspectionTool/i, "Google Search Console"],
  [/Googlebot|Google-Site-Verification|GoogleOther/i, "Googlebot"],
  [/AdsBot-Google|Mediapartners-Google/i, "Google Ads"],
  [/bingbot|BingPreview|msnbot/i, "Bingbot"],
  [/YandexBot|YandexImages/i, "YandexBot"],
  [/Baiduspider/i, "Baidu"],
  [/DuckDuckBot|DuckAssistBot/i, "DuckDuckGo"],
  [/Applebot/i, "Applebot"],
  [/facebookexternalhit|facebookcatalog|meta-externalagent|Facebot/i, "Facebook / Meta"],
  [/WhatsApp/i, "WhatsApp (vista previa)"],
  [/Twitterbot/i, "X / Twitter"],
  [/LinkedInBot/i, "LinkedIn"],
  [/TelegramBot/i, "Telegram"],
  [/Slackbot/i, "Slack"],
  [/Discordbot/i, "Discord"],
  [/GPTBot|ChatGPT-User|OAI-SearchBot/i, "OpenAI"],
  [/ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai/i, "Anthropic"],
  [/PerplexityBot|Perplexity-User/i, "Perplexity"],
  [/Bytespider|TikTokSpider/i, "ByteDance / TikTok"],
  [/Amazonbot/i, "Amazonbot"],
  [/CCBot/i, "Common Crawl"],
  [/AhrefsBot|AhrefsSiteAudit/i, "Ahrefs"],
  [/SemrushBot|SiteAuditBot/i, "Semrush"],
  [/MJ12bot/i, "Majestic"],
  [/DotBot/i, "Moz"],
  [/PetalBot/i, "PetalBot (Huawei)"],
  [/Lighthouse|Chrome-Lighthouse|PageSpeed/i, "Lighthouse / PageSpeed"],
  [/HeadlessChrome|Puppeteer|Playwright|PhantomJS/i, "Navegador automatizado"],
  [/curl\/|wget\/|python|axios|node-fetch|Go-http-client|java\/|okhttp|httpclient|scrapy/i, "Script / cliente HTTP"],
  [/uptime|pingdom|monitor|statuscake|better ?stack/i, "Monitor de disponibilidad"],
];

/**
 * El nombre legible de un bot, para el desglose del panel. Los conocidos por
 * su nombre; el resto, por la palabra con "bot"/"crawl"/"spider" que traiga
 * su agente, o "Otro bot".
 */
export function botName(userAgent: string): string {
  if (!userAgent.trim()) return "Sin agente";
  for (const [pattern, name] of KNOWN_BOTS) if (pattern.test(userAgent)) return name;
  const token = userAgent.match(/[A-Za-z0-9_.-]*(?:bot|crawl|spider|slurp)[A-Za-z0-9_.-]*/i)?.[0];
  return token ? token.slice(0, 40) : "Otro bot";
}

// -----------------------------------------------------------------------------
// Cabeceras del proveedor (Cloudflare primero, Vercel como alternativa)
// -----------------------------------------------------------------------------

/**
 * La IP real. En Cloudflare `cf-connecting-ip` es la fuente confiable: la
 * pone Cloudflare y el visitante no la puede falsear, cosa que sí puede con
 * `x-forwarded-for`. Las demás quedan para otros proveedores.
 */
export function clientIp(headers: Headers): string {
  const cloudflare = headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip") || "";
}

function header(headers: Headers, name: string): string | null {
  const value = headers.get(name)?.trim();
  if (!value) return null;
  try {
    // Algunos proveedores mandan la ciudad codificada ("San%20Pedro%20Sula").
    return decodeURIComponent(value).slice(0, 80);
  } catch {
    return value.slice(0, 80);
  }
}

export interface Geo {
  country: string | null;
  region: string | null;
  city: string | null;
}

/**
 * Ubicación aproximada desde las cabeceras que pone el proveedor, sin
 * consultar a nadie más. En Cloudflare (donde corre el sitio):
 *   - `cf-ipcountry` llega siempre.
 *   - `cf-ipcity`, `cf-region-code` y `cf-region` solo llegan con la regla
 *     administrada "Add visitor location headers" activada en el panel de
 *     Cloudflare (Rules → Settings → Managed Transforms). Sin ella, país sí,
 *     ciudad no.
 * Las de Vercel quedan como alternativa. En local no existe ninguna.
 */
export function readGeo(headers: Headers): Geo {
  const country = header(headers, "cf-ipcountry") ?? header(headers, "x-vercel-ip-country");
  return {
    // Cloudflare usa "XX" para desconocido y "T1" para Tor: ninguno es un país.
    country: country && /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : null,
    region: header(headers, "cf-region-code") ?? header(headers, "cf-region") ?? header(headers, "x-vercel-ip-country-region"),
    city: header(headers, "cf-ipcity") ?? header(headers, "x-vercel-ip-city"),
  };
}
