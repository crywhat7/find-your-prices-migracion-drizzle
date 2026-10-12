import { SITE_ROUTES } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";

/**
 * Reglas puras del programa de afiliados: rutas, ventana de campaña, enlaces
 * y precios. Sin servidor ni base, para que el panel, las páginas y las
 * pruebas usen exactamente las mismas.
 */

/** La página de un aliado en cada idioma, colgando del índice. */
export function partnerPaths(slug: string): Record<Locale, string> {
  return { es: `${SITE_ROUTES.partners.es}/${slug}`, en: `${SITE_ROUTES.partners.en}/${slug}` };
}

/**
 * La salida hacia el aliado. Pasa por `/go/<aliado>` y no directo al enlace
 * de afiliado por dos razones: así se cuenta el clic sin JavaScript, y el
 * enlace de afiliado se puede cambiar en el panel sin tocar páginas en caché.
 */
export function partnerOutboundPath(slug: string, offerId?: string): string {
  return offerId ? `/go/${slug}?o=${encodeURIComponent(offerId)}` : `/go/${slug}`;
}

/** `rel` de todo enlace de afiliado: Google pide `sponsored` para estos. */
export const AFFILIATE_LINK_REL = "sponsored nofollow noopener";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** "Eneba Games!" → "eneba-games". */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Solo http(s). Lo que se escribe en el panel termina en un `href` público:
 * un `javascript:` ahí sería un XSS servido desde nuestro dominio.
 */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Si una campaña está vigente. Sin fechas, siempre; con fechas, dentro de la
 * ventana (inicio incluido, fin excluido).
 */
export function isWithinWindow(
  startsAt: string | null,
  endsAt: string | null,
  now: Date = new Date(),
): boolean {
  const time = now.getTime();
  if (startsAt && Date.parse(startsAt) > time) return false;
  if (endsAt && Date.parse(endsAt) <= time) return false;
  return true;
}

/** ISO 4217 en mayúsculas o `null`. */
export function normalizeCurrency(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Precio en la moneda del aliado, con el formato del idioma. Lempiras con el
 * formato hondureño ("L 1,299.00"); el resto, con el estándar del idioma.
 */
export function formatOfferPrice(amount: number, currency: string, locale: Locale): string {
  const intlLocale = locale === "es" ? "es-HN" : "en-US";
  try {
    return new Intl.NumberFormat(intlLocale, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Porcentaje de descuento entero, o `null` si no hay descuento real. */
export function offerDiscount(price: number | null, listPrice: number | null): number | null {
  if (price === null || listPrice === null || listPrice <= 0 || price >= listPrice) return null;
  const percent = Math.round(((listPrice - price) / listPrice) * 100);
  return percent > 0 ? percent : null;
}

/** El texto en el idioma pedido, cayendo al español si falta el inglés. */
export function localized(es: string | null, en: string | null, locale: Locale): string | null {
  if (locale === "en" && en) return en;
  return es;
}
