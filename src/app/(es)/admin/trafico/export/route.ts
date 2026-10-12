import { hasAdminSession } from "@/server/admin/session";
import { cityLabel, countryName, DEVICE_LABEL, PAGE_TYPE_LABEL } from "@/features/admin-analytics/format";
import { resolveRange } from "@/lib/analytics/ranges";
import { getAnalyticsReport, type Breakdown } from "@/server/services/analytics";

/**
 * GET /admin/trafico/export?range=…  →  CSV del reporte.
 *
 * Un route handler no pasa por el layout de /admin, así que la sesión se
 * comprueba acá. Va en secciones (serie, páginas, países…) separadas por una
 * línea en blanco: abre bien en Excel y en Google Sheets, y cada sección se
 * puede copiar a su propia hoja.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cell(value: string | number): string {
  const text = String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function section(title: string, rows: Breakdown[], label: (row: Breakdown) => string = (row) => row.label): string[] {
  return [title, "Etiqueta,Vistas,Visitantes", ...rows.map((row) => [label(row), row.views, row.visitors].map(cell).join(",")), ""];
}

export async function GET(request: Request): Promise<Response> {
  if (!(await hasAdminSession())) return new Response("No autorizado", { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const range = resolveRange(params);
  const includeBots = params.bots === "1";
  const report = await getAnalyticsReport(range.from, range.to, range.bucket, 100, includeBots);

  const lines = [
    `Find Your Prices — tráfico del ${range.fromDate} al ${range.toDate} (hora de Honduras)${includeBots ? ", bots incluidos" : ", sin bots"}`,
    "",
    "Totales",
    "Vistas,Visitantes únicos,Sesiones,Desde teléfono,Desde Honduras",
    [report.totals.views, report.totals.visitors, report.totals.sessions, report.totals.mobile, report.totals.honduras].join(","),
    "",
    `Serie (${range.bucket})`,
    "Inicio del tramo,Vistas,Visitantes",
    ...report.series.map((point) => [point.bucket, point.views, point.visitors].join(",")),
    "",
    ...section("Páginas", report.pages),
    ...section("Secciones", report.pageTypes, (row) => PAGE_TYPE_LABEL[row.label] ?? row.label),
    ...section("Países", report.countries, (row) => countryName(row.label)),
    ...section("Ciudades", report.cities, (row) => cityLabel(row.label)),
    ...section("Dispositivos", report.devices, (row) => DEVICE_LABEL[row.label] ?? row.label),
    ...section("Navegadores", report.browsers),
    ...section("Sistemas", report.os),
    ...section("Referencias", report.referrers),
    ...section("Campañas UTM", report.campaigns),
    ...section("Clics a aliados", report.partnerClicks),
    ...(includeBots ? section("Bots", report.bots) : []),
  ];

  // BOM para que Excel lea las tildes en UTF-8.
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="trafico-${range.fromDate}-a-${range.toDate}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
