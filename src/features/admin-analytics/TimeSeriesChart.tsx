"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Bucket } from "@/lib/analytics/ranges";
import type { SeriesPoint } from "@/server/services/analytics";
import { bucketLabel, bucketLongLabel, formatInt } from "./format";

interface TimeSeriesChartProps {
  points: SeriesPoint[];
  bucket: Bucket;
  title: string;
}

const HEIGHT = 260;
const PAD = { top: 16, right: 76, bottom: 28, left: 44 };

const SERIES = [
  { key: "visitors" as const, label: "Visitantes", color: "var(--viz-1)" },
  { key: "views" as const, label: "Vistas", color: "var(--viz-2)" },
];

/** Techo "redondo" del eje: 1, 2 o 5 por una potencia de diez. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * power >= value) return step * power;
  }
  return 10 * power;
}

/**
 * Visitantes y vistas en el tiempo: dos líneas en un mismo eje (las dos son
 * conteos de personas o páginas, la misma unidad), con cruz de lectura que
 * se engancha al tramo más cercano y un tooltip que lista las dos series.
 * Con teclado: foco en el gráfico y flechas. La tabla de abajo tiene cada
 * cifra, así el tooltip nunca es la única forma de leer un valor.
 */
export function TimeSeriesChart({ points, bucket, title }: TimeSeriesChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(760);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const max = niceMax(Math.max(1, ...points.map((point) => point.views)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (index: number) => PAD.left + (points.length > 1 ? index * step : innerW / 2);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;

  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(innerW / 72))));

  function pathFor(key: "views" | "visitors"): string {
    return points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`).join(" ");
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const index = points.length > 1 ? Math.round((px - PAD.left) / step) : 0;
    setActive(Math.min(points.length - 1, Math.max(0, index)));
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (points.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      setActive((current) => Math.min(points.length - 1, Math.max(0, (current ?? (delta > 0 ? -1 : points.length)) + delta)));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  }

  const activePoint = active !== null ? points[active] : null;
  const last = points.at(-1);
  const tooltipLeft = active !== null ? x(active) : 0;
  const flip = tooltipLeft > width * 0.62;

  return (
    <figure className="m-0">
      <figcaption id={titleId} className="sr-only">
        {title}
      </figcaption>

      {/* Leyenda: siempre presente con dos series, y además etiqueta directa al final de cada línea. */}
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.8125rem] text-[var(--text-secondary)]">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded-full" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>

      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          className="block max-w-full touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {/* Grilla recesiva: solo horizontales, en el color del borde. */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={PAD.left} x2={PAD.left + innerW} y1={y(tick)} y2={y(tick)} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--text-tertiary)" className="tabular-nums">
                {formatInt(tick)}
              </text>
            </g>
          ))}

          {points.map((point, index) =>
            index % labelEvery === 0 || index === points.length - 1 ? (
              <text key={point.bucket} x={x(index)} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--text-tertiary)">
                {bucketLabel(point.bucket, bucket)}
              </text>
            ) : null,
          )}

          {SERIES.map((series) => (
            <path
              key={series.key}
              d={pathFor(series.key)}
              fill="none"
              stroke={series.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Etiquetas directas al final, en tinta de texto con la marca de color al lado. */}
          {last &&
            SERIES.map((series) => {
              const ly = y(last[series.key]);
              const offset = series.key === "views" && Math.abs(y(last.views) - y(last.visitors)) < 14 ? -8 : series.key === "visitors" && Math.abs(y(last.views) - y(last.visitors)) < 14 ? 8 : 0;
              return (
                <g key={`end-${series.key}`}>
                  <circle cx={x(points.length - 1)} cy={ly} r={3} fill={series.color} />
                  <text x={x(points.length - 1) + 8} y={ly + offset} dy="0.32em" fontSize={11} fill="var(--text-secondary)">
                    {series.label}
                  </text>
                </g>
              );
            })}

          {activePoint && active !== null && (
            <g aria-hidden="true">
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--text-tertiary)" strokeWidth={1} />
              {SERIES.map((series) => (
                <circle
                  key={series.key}
                  cx={x(active)}
                  cy={y(activePoint[series.key])}
                  r={4.5}
                  fill={series.color}
                  stroke="var(--bg-elevated)"
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>

        {activePoint && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 z-10 min-w-[11rem] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[0.8125rem] shadow-[var(--shadow-md)]"
            style={flip ? { right: width - tooltipLeft + 12 } : { left: tooltipLeft + 12 }}
          >
            <p className="mb-1 text-[0.75rem] text-[var(--text-tertiary)]">{bucketLongLabel(activePoint.bucket, bucket)}</p>
            {SERIES.map((series) => (
              <p key={series.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-[var(--text-secondary)]">
                  <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: series.color }} />
                  {series.label}
                </span>
                <strong className="font-semibold tabular-nums text-[var(--text)]">{formatInt(activePoint[series.key])}</strong>
              </p>
            ))}
          </div>
        )}
      </div>

      <details className="mt-3 text-[0.8125rem] print:hidden">
        <summary className="cursor-pointer text-[var(--text-tertiary)] hover:text-[var(--text)]">Ver como tabla</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-[var(--bg-subtle)] text-[var(--text-tertiary)]">
              <tr>
                <th className="px-3 py-2 font-medium">Tramo</th>
                <th className="px-3 py-2 text-right font-medium">Visitantes</th>
                <th className="px-3 py-2 text-right font-medium">Vistas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.bucket} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 text-[var(--text-secondary)]">{bucketLongLabel(point.bucket, bucket)}</td>
                  <td className="px-3 py-1.5 text-right text-[var(--text)]">{formatInt(point.visitors)}</td>
                  <td className="px-3 py-1.5 text-right text-[var(--text)]">{formatInt(point.views)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
