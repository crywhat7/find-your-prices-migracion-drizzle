"use client";

import { useState } from "react";
import { formatInt } from "./format";

const DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const STEPS = 6;

/** Paso de la rampa secuencial (0 = sin visitas, 1..6 = de poco a mucho). */
function stepFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((value / max) * STEPS));
}

function fill(step: number): string {
  return step === 0 ? "var(--bg-subtle)" : `var(--viz-seq-${step})`;
}

/**
 * Cuándo entra la gente: día de la semana × hora (hora de Honduras), con la
 * rampa azul de una sola tinta —más oscuro/brillante es más visitas—. Cada
 * celda tiene su tooltip al pasar o con foco, y su `aria-label` con la cifra
 * exacta; arriba, en texto, la hora pico.
 */
export function HourHeatmap({ cells }: { cells: [number, number, number][] }) {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const [day, hour, views] of cells) {
    if (day >= 1 && day <= 7 && hour >= 0 && hour < 24) grid[day - 1][hour] = views;
  }
  const max = Math.max(0, ...grid.flat());
  const [active, setActive] = useState<{ day: number; hour: number } | null>(null);

  let peak = { day: 0, hour: 0, views: 0 };
  grid.forEach((row, day) => row.forEach((views, hour) => {
    if (views > peak.views) peak = { day, hour, views };
  }));

  return (
    <div>
      <p className="text-[0.8125rem] text-[var(--text-secondary)]">
        {peak.views > 0 ? (
          <>
            Hora pico: <strong className="font-semibold text-[var(--text)]">{DAYS[peak.day].toLowerCase()} a las {peak.hour}:00</strong>{" "}
            ({formatInt(peak.views)} vistas en el período).
          </>
        ) : (
          "Sin visitas en el período."
        )}
      </p>

      <div className="relative mt-4 overflow-x-auto pb-1">
        <div className="grid min-w-[560px] grid-cols-[4.5rem_repeat(24,minmax(0,1fr))] gap-[2px]">
          <span />
          {Array.from({ length: 24 }, (_, hour) => (
            <span key={hour} className="text-center text-[0.625rem] tabular-nums text-[var(--text-tertiary)]">
              {hour % 3 === 0 ? hour : ""}
            </span>
          ))}
          {grid.map((row, day) => (
            <div key={day} className="contents">
              <span className="pr-2 text-[0.75rem] leading-[1.5rem] text-[var(--text-secondary)]">{DAYS[day].slice(0, 3)}</span>
              {row.map((views, hour) => {
                const isActive = active?.day === day && active.hour === hour;
                return (
                  <span
                    key={hour}
                    tabIndex={0}
                    role="img"
                    aria-label={`${DAYS[day]} ${hour}:00 — ${formatInt(views)} vistas`}
                    onPointerEnter={() => setActive({ day, hour })}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive({ day, hour })}
                    onBlur={() => setActive(null)}
                    className={`h-6 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
                      isActive ? "ring-2 ring-[var(--text)]" : ""
                    }`}
                    style={{ background: fill(stepFor(views, max)) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[0.75rem] text-[var(--text-tertiary)]">
        <p aria-live="polite" className="min-h-[1.25em] text-[var(--text-secondary)]">
          {active ? (
            <>
              {DAYS[active.day]} {active.hour}:00–{active.hour}:59 ·{" "}
              <strong className="font-semibold tabular-nums text-[var(--text)]">{formatInt(grid[active.day][active.hour])}</strong> vistas
            </>
          ) : (
            "Pasá el cursor por una celda para ver la cifra."
          )}
        </p>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          Menos
          {Array.from({ length: STEPS + 1 }, (_, step) => (
            <span key={step} className="inline-block h-3 w-4 rounded-[2px]" style={{ background: fill(step) }} />
          ))}
          Más
        </span>
      </div>
    </div>
  );
}
