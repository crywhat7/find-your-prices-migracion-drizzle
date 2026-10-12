import type { ReactNode } from "react";
import Link from "next/link";
import { RANGE_OPTIONS, type ResolvedRange } from "@/lib/analytics/ranges";
import type { Breakdown } from "@/server/services/analytics";
import { formatInt, formatPercent } from "./format";

/**
 * Piezas del panel de tráfico que no necesitan JavaScript: indicadores,
 * listas con barra, tarjetas y el selector de rango (un formulario GET, así
 * cada vista tiene su URL y se puede compartir o volver a ella).
 */

export function Card({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`break-inside-avoid rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:p-6 ${className}`}>
      <h2 className="text-[1rem] font-semibold tracking-[-0.01em] text-[var(--text)]">{title}</h2>
      {hint && <p className="mt-0.5 text-[0.75rem] leading-[1.45] text-[var(--text-tertiary)]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Una cifra grande con su variación contra el período anterior. La flecha y
 * el signo dicen la dirección; el color solo la acompaña.
 */
export function StatTile({
  label,
  value,
  change,
  note,
}: {
  label: string;
  value: string;
  change?: number | null;
  note?: string;
}) {
  const up = change !== null && change !== undefined && change > 0;
  const down = change !== null && change !== undefined && change < 0;
  return (
    <div className="break-inside-avoid rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-4 sm:px-5">
      <dt className="text-[0.6875rem] font-medium tracking-[0.14em] text-[var(--text-tertiary)] uppercase">{label}</dt>
      <dd className="mt-2 text-[clamp(1.5rem,3.2vw,2rem)] leading-none font-semibold tracking-[-0.03em] tabular-nums text-[var(--text)]">
        {value}
      </dd>
      {change !== undefined && (
        <dd
          className={`mt-2 text-[0.75rem] tabular-nums ${
            up ? "text-[var(--price-win)]" : down ? "text-[var(--critical)]" : "text-[var(--text-tertiary)]"
          }`}
        >
          {change === null ? "sin período anterior" : `${up ? "▲" : down ? "▼" : "="} ${Math.abs(change)} % vs. período anterior`}
        </dd>
      )}
      {note && <dd className="mt-1 text-[0.75rem] text-[var(--text-tertiary)]">{note}</dd>}
    </div>
  );
}

/**
 * Ranking con barra: una sola serie, así que una sola tinta. La cifra va en
 * texto al lado (nunca solo en la barra) con su porcentaje del total.
 */
export function BarList({
  rows,
  total,
  label = (row) => row.label,
  href,
  metric = "views",
  empty = "Sin datos en el período.",
  limit,
}: {
  rows: Breakdown[];
  total: number;
  label?: (row: Breakdown) => string;
  href?: (row: Breakdown) => string | null;
  metric?: "views" | "visitors";
  empty?: string;
  limit?: number;
}) {
  const shown = limit ? rows.slice(0, limit) : rows;
  if (shown.length === 0) return <p className="text-[0.8125rem] text-[var(--text-tertiary)]">{empty}</p>;
  const max = Math.max(1, ...shown.map((row) => row[metric]));

  return (
    <ol className="space-y-3">
      {shown.map((row) => {
        const text = label(row);
        const link = href?.(row);
        return (
          <li key={`${row.label}-${row.slug ?? ""}`}>
            <div className="flex items-baseline justify-between gap-3 text-[0.8125rem]">
              {link ? (
                <Link href={link} target="_blank" className="min-w-0 truncate text-[var(--text)] hover:underline">
                  {text}
                </Link>
              ) : (
                <span className="min-w-0 truncate text-[var(--text)]">{text}</span>
              )}
              <span className="shrink-0 tabular-nums">
                <strong className="font-semibold text-[var(--text)]">{formatInt(row[metric])}</strong>
                <span className="ml-2 text-[var(--text-tertiary)]">{formatPercent(row[metric], total)}</span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
              <div
                className="h-full rounded-full bg-[var(--viz-1)]"
                style={{ width: `${Math.max(1.5, (row[metric] / max) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const pillClass =
  "rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-medium outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

/** Selector de rango en una sola fila, arriba de todo. */
export function RangeControls({
  range,
  basePath,
  extra = {},
}: {
  range: ResolvedRange;
  basePath: string;
  extra?: Record<string, string>;
}) {
  const query = (params: Record<string, string>) => `${basePath}?${new URLSearchParams({ ...extra, ...params })}`;
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {RANGE_OPTIONS.map((option) => {
        const selected = range.key === option.key;
        return (
          <Link
            key={option.key}
            href={query({ range: option.key })}
            aria-current={selected ? "page" : undefined}
            className={`${pillClass} ${
              selected
                ? "border-[var(--text)] bg-[var(--text)] text-[var(--text-inverted)]"
                : "border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]"
            }`}
          >
            {option.label}
          </Link>
        );
      })}
      <form action={basePath} method="get" className="flex flex-wrap items-center gap-2">
        {Object.entries(extra).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <input type="hidden" name="range" value="custom" />
        <label className="sr-only" htmlFor="range-from">Desde</label>
        <input
          id="range-from"
          type="date"
          name="from"
          defaultValue={range.fromDate}
          className="rounded-full border border-[var(--border-strong)] bg-transparent px-3 py-1 text-[0.8125rem] text-[var(--text)] [color-scheme:light_dark]"
        />
        <span aria-hidden="true" className="text-[var(--text-tertiary)]">→</span>
        <label className="sr-only" htmlFor="range-to">Hasta</label>
        <input
          id="range-to"
          type="date"
          name="to"
          defaultValue={range.toDate}
          className="rounded-full border border-[var(--border-strong)] bg-transparent px-3 py-1 text-[0.8125rem] text-[var(--text)] [color-scheme:light_dark]"
        />
        <button
          type="submit"
          className={`${pillClass} ${range.key === "custom" ? "border-[var(--text)] bg-[var(--text)] text-[var(--text-inverted)]" : "border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-subtle)]"}`}
        >
          Aplicar
        </button>
      </form>
    </div>
  );
}
