import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { routeFor } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";

const COPY: Record<Locale, { eyebrow: string; title: string; body: string; home: string; categories: string; stores: string }> = {
  es: {
    eyebrow: "Error 404",
    title: "Esta página no existe",
    body: "El enlace puede estar mal escrito, o el producto ya no está en el catálogo. Buscalo desde el comparador o recorré las categorías.",
    home: "Ir al comparador",
    categories: "Ver categorías",
    stores: "Ver tiendas",
  },
  en: {
    eyebrow: "Error 404",
    title: "This page does not exist",
    body: "The link may be misspelled, or the product is no longer in the catalog. Search from the comparator or browse the categories.",
    home: "Go to the comparator",
    categories: "Browse categories",
    stores: "Browse stores",
  },
};

/**
 * La pantalla de "no encontrado": una URL que no existe, o un producto,
 * categoría o tienda que ya no está. El estado HTTP 404 lo pone Next; esto
 * es solo lo que ve la persona, con tres salidas hacia contenido que sí
 * existe.
 *
 * Una caída de la base de datos NO llega acá: las consultas lanzan el error
 * en vez de devolver `null`, y eso cae en `ErrorView` (500). Así un corte
 * temporal no le dice a Google que las fichas dejaron de existir.
 *
 * Es un Server Component a propósito: no necesita nada del navegador, y se
 * reutiliza tanto en `not-found.tsx` de cada idioma como en
 * `global-not-found.tsx`.
 */
export function NotFoundView({ locale }: { locale: Locale }) {
  const copy = COPY[locale];

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
            {/* La misma etiqueta de precio del error, ahora con una lupa vacía. */}
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
            <Link
              href={routeFor("home", locale)}
              className="rounded-full bg-[var(--text)] px-6 py-3 text-[0.875rem] font-medium text-[var(--text-inverted)] outline-none transition-transform duration-[var(--dur-base)] ease-[var(--ease-out-quart)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
            >
              {copy.home}
            </Link>
            <Link
              href={routeFor("categories", locale)}
              className="rounded-full border border-[var(--border-strong)] px-6 py-3 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-colors hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {copy.categories}
            </Link>
            <Link
              href={routeFor("stores", locale)}
              className="rounded-full border border-[var(--border-strong)] px-6 py-3 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-colors hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {copy.stores}
            </Link>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
