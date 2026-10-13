import Link from "next/link";
import { siteConfig } from "@/config/site";
import type { Locale } from "@/features/i18n/translate";
import { partnerPaths } from "./affiliateRules";

/**
 * Franja "Find Your Prices × Eneba": cuenta que somos aliados, no vende nada.
 *
 * Va en el pie de todas las páginas. Es texto y logos, no una imagen de
 * campaña, y enlaza a nuestra propia página del aliado (`/aliados/eneba`), no
 * a Eneba: nada de esto parece un anuncio para un bloqueador —ni un pedido a
 * un tercero, ni un enlace de afiliado, ni medidas de banner—, y quien quiera
 * comprar llega desde ahí con el código y la salida contada por `/go/eneba`.
 *
 * Los logos van como fondo (`.ally-logo-eneba`, igual que `.brand-isotipo`)
 * para cambiar con el tema: el de Eneba tiene el texto morado en claro y
 * blanco en oscuro.
 */

const COPY: Record<Locale, { eyebrow: string; title: string; body: string; cta: string }> = {
  es: {
    eyebrow: "Aliado oficial",
    title: "Somos aliados de Eneba",
    body: "Juegos, tarjetas de regalo y suscripciones con 5% de descuento usando el código",
    cta: "Conocer la alianza",
  },
  en: {
    eyebrow: "Official partner",
    title: "We partner with Eneba",
    body: "Games, gift cards and subscriptions with 5% off using the code",
    cta: "About the partnership",
  },
};

const PROMO_CODE = "findyourprices";

export function EnebaAlliance({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  return (
    <section
      aria-label={copy.title}
      className="flex flex-col gap-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:flex-row sm:items-center sm:gap-8 sm:p-6"
    >
      <div className="flex shrink-0 items-center gap-3" aria-hidden="true">
        <span className="brand-isotipo h-9" />
        <span className="text-lg font-light text-[var(--text-tertiary)]">×</span>
        <span className="ally-logo-eneba h-8" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          {copy.eyebrow}
        </p>
        <h2 className="text-base font-semibold text-[var(--text)]">
          <span className="sr-only">{siteConfig.name} × Eneba: </span>
          {copy.title}
        </h2>
        <p className="text-[0.8125rem] leading-[1.5] text-[var(--text-secondary)]">
          {copy.body}{" "}
          <code className="rounded-md bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[var(--text)]">
            {PROMO_CODE}
          </code>
          .
        </p>
      </div>

      <Link
        href={partnerPaths("eneba")[locale]}
        className="self-start rounded-full border border-[var(--border)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out-quart)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:self-center"
      >
        {copy.cta} →
      </Link>
    </section>
  );
}
