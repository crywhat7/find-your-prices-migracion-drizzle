/**
 * Rangos de fecha del panel de tráfico, en hora de Honduras.
 *
 * Honduras está en UTC−6 todo el año (no tiene horario de verano), así que
 * el desfase es fijo y no hace falta una librería de zonas: medianoche de
 * acá son las 06:00 UTC.
 */

export type RangeKey = "7d" | "30d" | "90d" | "12m" | "month" | "prev-month" | "custom";
export type Bucket = "day" | "week" | "month";

export interface ResolvedRange {
  key: RangeKey;
  /** Inicio incluido, en UTC. */
  from: Date;
  /** Fin excluido, en UTC. */
  to: Date;
  /** El período anterior de la misma duración, para comparar. */
  prevFrom: Date;
  prevTo: Date;
  bucket: Bucket;
  /** Fechas locales para los campos del formulario ("2026-10-12"). */
  fromDate: string;
  /** Último día incluido, local. */
  toDate: string;
  days: number;
}

export const RANGE_OPTIONS: { key: Exclude<RangeKey, "custom">; label: string }[] = [
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "90d", label: "90 días" },
  { key: "month", label: "Este mes" },
  { key: "prev-month", label: "Mes pasado" },
  { key: "12m", label: "12 meses" },
];

const OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Medianoche local (Honduras) del día local que contiene `instant`, en UTC. */
function localMidnight(instant: Date): Date {
  const local = new Date(instant.getTime() - OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET_MS);
}

/** Medianoche local de una fecha "YYYY-MM-DD", en UTC; `null` si no es válida. */
function parseLocalDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00-06:00`);
  return Number.isNaN(time) ? null : new Date(time);
}

export function toLocalDate(instant: Date): string {
  return new Date(instant.getTime() - OFFSET_MS).toISOString().slice(0, 10);
}

function startOfLocalMonth(instant: Date, monthDelta = 0): Date {
  const local = new Date(instant.getTime() - OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + monthDelta, 1) + OFFSET_MS);
}

/** Días: hasta 3 meses; semanas: hasta un año y algo; meses: más. */
export function bucketFor(days: number): Bucket {
  if (days <= 92) return "day";
  if (days <= 400) return "week";
  return "month";
}

export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  now: Date = new Date(),
): ResolvedRange {
  const tomorrow = new Date(localMidnight(now).getTime() + DAY_MS);
  let key = (params.range ?? "30d") as RangeKey;
  let from: Date;
  let to: Date = tomorrow;

  const customFrom = parseLocalDate(params.from);
  const customTo = parseLocalDate(params.to);

  if (key === "custom" && customFrom && customTo && customTo >= customFrom) {
    from = customFrom;
    to = new Date(Math.min(customTo.getTime() + DAY_MS, tomorrow.getTime()));
  } else if (key === "month") {
    from = startOfLocalMonth(now);
  } else if (key === "prev-month") {
    from = startOfLocalMonth(now, -1);
    to = startOfLocalMonth(now);
  } else if (key === "12m") {
    from = startOfLocalMonth(now, -11);
  } else {
    if (!["7d", "30d", "90d"].includes(key)) key = "30d";
    const days = Number.parseInt(key, 10);
    from = new Date(tomorrow.getTime() - days * DAY_MS);
  }

  const span = to.getTime() - from.getTime();
  const days = Math.max(1, Math.round(span / DAY_MS));

  return {
    key,
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    bucket: bucketFor(days),
    fromDate: toLocalDate(from),
    toDate: toLocalDate(new Date(to.getTime() - 1)),
    days,
  };
}

/** Variación porcentual, o `null` si no hay base para comparar. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
