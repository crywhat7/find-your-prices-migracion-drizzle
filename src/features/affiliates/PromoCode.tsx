"use client";

import { useEffect, useRef, useState } from "react";

interface PromoCodeProps {
  code: string;
  label: string;
  copyLabel: string;
  copiedLabel: string;
  failedLabel: string;
  /** `compact` para las tarjetas de producto; `large` para la cabecera del aliado. */
  size?: "compact" | "large";
}

type CopyState = "idle" | "copied" | "failed";

/**
 * El código promocional con su botón de copiar.
 *
 * El código va en un `<output>` seleccionable además del botón: en un
 * navegador sin portapapeles (o con el permiso negado) la persona igual
 * puede seleccionarlo y copiarlo, y el aviso se lo dice. El cambio de estado
 * se anuncia por `aria-live` porque el botón no se mueve de lugar.
 */
export function PromoCode({ code, label, copyLabel, copiedLabel, failedLabel, size = "compact" }: PromoCodeProps) {
  const [state, setState] = useState<CopyState>("idle");
  const codeRef = useRef<HTMLOutputElement | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function copy(): Promise<void> {
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      next = "failed";
      // Deja el código seleccionado para que Ctrl+C funcione de una vez.
      const node = codeRef.current;
      const selection = window.getSelection();
      if (node && selection) {
        const range = document.createRange();
        range.selectNodeContents(node);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    setState(next);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setState("idle"), 2400);
  }

  const large = size === "large";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.6875rem] font-medium tracking-[0.18em] text-[var(--text-tertiary)] uppercase">
        {label}
      </span>
      <div
        className={`flex items-stretch overflow-hidden rounded-xl border border-dashed border-[var(--accent)] bg-[var(--accent-soft)] ${
          large ? "min-h-12" : "min-h-10"
        }`}
      >
        <output
          ref={codeRef}
          aria-label={`${label}: ${code}`}
          className={`flex min-w-0 flex-1 items-center truncate px-3 font-mono font-semibold tracking-[0.08em] text-[var(--text)] select-all ${
            large ? "text-[1.0625rem]" : "text-[0.875rem]"
          }`}
        >
          {code}
        </output>
        <button
          type="button"
          onClick={() => void copy()}
          className={`shrink-0 border-l border-dashed border-[var(--accent)] font-medium text-[var(--accent)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--accent)] hover:text-[var(--text-inverted)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-inset ${
            large ? "px-5 text-[0.875rem]" : "px-3.5 text-[0.8125rem]"
          }`}
        >
          {state === "copied" ? copiedLabel : copyLabel}
        </button>
      </div>
      <span aria-live="polite" className="min-h-[1em] text-[0.75rem] text-[var(--text-tertiary)]">
        {state === "failed" ? failedLabel : ""}
      </span>
    </div>
  );
}
