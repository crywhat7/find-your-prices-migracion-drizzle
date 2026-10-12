"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { reportClientError } from "./reportClientError";

const COPY: Record<Locale, { eyebrow: string; title: string; body: string; retry: string; home: string; reference: string }> = {
  es: {
    eyebrow: "Error",
    title: "Algo se trabó de nuestro lado",
    body: "No es tu culpa. Ya quedó anotado y lo vamos a revisar. Probá de nuevo en un momento; si sigue igual, el resto del sitio funciona.",
    retry: "Intentar de nuevo",
    home: "Ir al comparador",
    reference: "Código de referencia",
  },
  en: {
    eyebrow: "Error",
    title: "Something got stuck on our side",
    body: "It is not your fault. It has been logged and we will look into it. Try again in a moment; if it keeps happening, the rest of the site works.",
    retry: "Try again",
    home: "Go to the comparator",
    reference: "Reference code",
  },
};

/**
 * La pantalla que ve un visitante cuando algo falla. Nada técnico: qué
 * pasó en una frase, que no es su culpa, y dos salidas (reintentar o volver
 * al comparador). El código de referencia va chico, para que alguien pueda
 * decirlo si escribe; con él se encuentra el error en /admin/errores.
 *
 * Los errores del servidor ya se anotaron solos (`instrumentation.ts`); acá
 * solo se reportan los del navegador, que son los que no traen `digest`.
 */
export function ErrorView({
  locale,
  error,
  retry,
}: {
  locale: Locale;
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const copy = COPY[locale];

  useEffect(() => {
    if (!error.digest) reportClientError(error, "boundary");
  }, [error]);

  return (
    <PageLayout locale={locale}>
      <div className={`${SHELL} py-24 sm:py-32`}>
        <div className="mx-auto max-w-[34rem] text-center">
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="enter mx-auto h-12 w-12 text-[var(--text-tertiary)]"
          >
            {/* Una etiqueta de precio con el hilo cortado. */}
            <path d="M25.2 6H10.8A4.8 4.8 0 0 0 6 10.8v14.4c0 1.3.5 2.5 1.4 3.4l13.4 13.4a4.8 4.8 0 0 0 6.8 0l12.4-12.4a4.8 4.8 0 0 0 0-6.8L26.6 9.4" />
            <circle cx="16" cy="16" r="2.4" />
            <path d="M30 6l4-3M33 9l5-1" />
          </svg>
          <p className="enter mt-6 text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
            {copy.eyebrow}
          </p>
          <h1 className="enter mt-3 text-[clamp(1.75rem,5vw,2.75rem)] leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-[var(--text)]">
            {copy.title}
          </h1>
          <p className="enter mt-4 text-[1rem] leading-[1.6] text-[var(--text-secondary)]">{copy.body}</p>

          <div className="enter mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-[var(--text)] px-6 py-3 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              {copy.retry}
            </button>
            <Link
              href={routeFor("home", locale)}
              className="rounded-full border border-[var(--border-strong)] px-6 py-3 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-colors hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {copy.home}
            </Link>
          </div>

          {error.digest && (
            <p className="mt-10 text-[0.75rem] text-[var(--text-tertiary)]">
              {copy.reference}: <span className="font-mono select-all">{error.digest}</span>
            </p>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
