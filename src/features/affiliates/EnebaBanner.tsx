import type { Locale } from "@/features/i18n/translate";
import { AFFILIATE_LINK_REL, ENEBA_AFFILIATE_URL } from "./affiliateRules";

/**
 * Pieza de Eneba, para intercalar en la retícula del catálogo.
 *
 * El clic va directo al enlace de afiliado de Eneba, sin pasar por `/go/eneba`
 * (así no depende de que el aliado esté cargado y activo en la base, pero esa
 * salida no queda en el reporte de aliados). Las imágenes son los recursos
 * oficiales del programa: la apaisada (728×90) en pantallas anchas, y en
 * teléfono la de 720×300, que a 360px de ancho todavía se lee.
 *
 * Los bloqueadores de anuncios la escondían aunque es una alianza, no un
 * anuncio. Lo que los dispara son las señales típicas de un banner, así que
 * se evitan todas:
 * - Las imágenes se sirven desde nuestro dominio (`public/images/partners`),
 *   no desde `static.eneba.games`: un pedido a un tercero dentro de una
 *   retícula es lo primero que bloquean.
 * - Los archivos tienen nombres neutros, sin "banner", "ad" ni medidas.
 * - No lleva `width="728" height="90"`, el formato IAB que las reglas buscan
 *   por atributo: el hueco se reserva con `aspect-ratio` en CSS.
 */

const IMAGES: Record<Locale, { wide: string; mobile: string }> = {
  es: { wide: "/images/partners/eneba-ancho-es.webp", mobile: "/images/partners/eneba-cuadro-es.webp" },
  en: { wide: "/images/partners/eneba-ancho-en.webp", mobile: "/images/partners/eneba-cuadro-en.webp" },
};
/** Debajo del breakpoint `sm` de Tailwind (640px), el que pasa el catálogo a tres columnas. */
const MOBILE_MEDIA = "(max-width: 639px)";

export interface EnebaBannerProps {
  locale: Locale;
  /** Rótulo sobre la imagen ("Conoce a nuestro aliado"), en el idioma de la página. */
  label: string;
  /** Texto alternativo de la imagen, en el idioma de la página. */
  alt: string;
}

export function EnebaBanner({ locale, label, alt }: EnebaBannerProps) {
  const images = IMAGES[locale];
  return (
    <aside aria-label={label} className="flex flex-col items-center py-2">
      <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <a
        href={ENEBA_AFFILIATE_URL}
        target="_blank"
        rel={AFFILIATE_LINK_REL}
        className="block w-full max-w-[728px] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <picture>
          <source media={MOBILE_MEDIA} srcSet={images.mobile} />
          <img
            src={images.wide}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="aspect-[720/300] h-auto w-full rounded-2xl sm:aspect-[728/90]"
          />
        </picture>
      </a>
    </aside>
  );
}
