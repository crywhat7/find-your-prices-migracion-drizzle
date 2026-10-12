import type { Bucket } from "@/lib/analytics/ranges";

/**
 * Formato de cifras y etiquetas del panel de tráfico. El panel es solo en
 * español: es herramienta interna y reporte para aliados hondureños.
 */

const integer = new Intl.NumberFormat("es-HN", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("es-HN", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const regions = new Intl.DisplayNames(["es"], { type: "region" });

export function formatInt(value: number): string {
  return integer.format(value);
}

export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function formatPercent(part: number, total: number): string {
  if (total <= 0) return "0 %";
  return `${Math.round((part / total) * 100)} %`;
}

/** "HN" → "Honduras". Los que no se resolvieron quedan como "Desconocido". */
export function countryName(code: string): string {
  if (!code || code === "??") return "Desconocido";
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "San Pedro Sula, CR, HN" → "San Pedro Sula, CR, Honduras". */
export function cityLabel(label: string): string {
  const parts = label.split(", ");
  const country = parts.at(-1);
  if (country && /^[A-Z]{2}$/.test(country)) parts[parts.length - 1] = countryName(country);
  return parts.join(", ");
}

export const PAGE_TYPE_LABEL: Record<string, string> = {
  home: "Portada",
  search: "Búsquedas",
  product: "Fichas de producto",
  category: "Categorías",
  store: "Tiendas",
  partner: "Aliados",
  quote: "Cotización",
  favorites: "Favoritos",
  info: "Acerca y políticas",
  other: "Otras",
};

export const DEVICE_LABEL: Record<string, string> = {
  mobile: "Teléfono",
  desktop: "Computadora",
  tablet: "Tableta",
};

export const LOCALE_LABEL: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  "??": "Desconocido",
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Etiqueta corta de un tramo: "12 oct", "sem. 6 oct", "oct 2026". */
export function bucketLabel(bucket: string, kind: Bucket): string {
  const [year, month, day] = bucket.split("-").map(Number);
  const name = MONTHS[(month ?? 1) - 1];
  if (kind === "month") return `${name} ${year}`;
  if (kind === "week") return `sem. ${day} ${name}`;
  return `${day} ${name}`;
}

/** Etiqueta larga para el tooltip: "lunes 12 oct 2026". */
export function bucketLongLabel(bucket: string, kind: Bucket): string {
  const [year, month, day] = bucket.split("-").map(Number);
  const name = MONTHS[(month ?? 1) - 1];
  if (kind === "month") return `${name} ${year}`;
  if (kind === "week") return `semana del ${day} ${name} ${year}`;
  const weekday = new Date(Date.UTC(year, (month ?? 1) - 1, day)).toLocaleDateString("es-HN", {
    weekday: "long",
    timeZone: "UTC",
  });
  return `${weekday} ${day} ${name} ${year}`;
}

/** "12 oct 2026" a partir de "2026-10-12". */
export function dateLabel(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}
