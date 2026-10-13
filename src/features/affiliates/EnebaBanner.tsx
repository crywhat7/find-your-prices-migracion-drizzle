import { AFFILIATE_LINK_REL, ENEBA_AFFILIATE_URL } from "./affiliateRules";

/**
 * Banner de Eneba, para intercalar en la retícula del catálogo.
 *
 * El clic va directo al enlace de afiliado de Eneba, sin pasar por `/go/eneba`
 * (así no depende de que el aliado esté cargado y activo en la base, pero esa
 * salida no queda en el reporte de aliados). La imagen es el recurso oficial del
 * programa, con el tamaño fijo con el que Eneba la publica: 728×90 en pantallas
 * anchas, y en teléfono la versión cuadrada-ish de 720×300, que a 360px de
 * ancho todavía se lee (la apaisada quedaba en ~45px de alto). El `width`/`height`
 * reservan el hueco para que al cargar no empuje la lista.
 */

const MOBILE_BANNER_SRC = "https://static.eneba.games/branding/resource/mkqxofkvuu.png";
const MOBILE_BANNER_WIDTH = 720;
const MOBILE_BANNER_HEIGHT = 300;
/** Debajo del breakpoint `sm` de Tailwind (640px), el que pasa el catálogo a tres columnas. */
const MOBILE_MEDIA = "(max-width: 639px)";
const BANNER_SRC = "https://static.eneba.games/branding/resource/tvoyodlgxm-es.png";
const BANNER_WIDTH = 728;
const BANNER_HEIGHT = 90;

export interface EnebaBannerProps {
  /** Rótulo sobre el banner ("Conoce a nuestro aliado"), en el idioma de la página. */
  label: string;
  /** Texto alternativo de la imagen, en el idioma de la página. */
  alt: string;
}

export function EnebaBanner({ label, alt }: EnebaBannerProps) {
  return (
    <aside aria-label={label} className="flex flex-col items-center py-2">
      <p className="mb-2 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </p>
      <a
        href={ENEBA_AFFILIATE_URL}
        target="_blank"
        rel={AFFILIATE_LINK_REL}
        className="rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        <picture>
          <source
            media={MOBILE_MEDIA}
            srcSet={MOBILE_BANNER_SRC}
            width={MOBILE_BANNER_WIDTH}
            height={MOBILE_BANNER_HEIGHT}
          />
          <img
            src={BANNER_SRC}
            alt={alt}
            width={BANNER_WIDTH}
            height={BANNER_HEIGHT}
            loading="lazy"
            decoding="async"
            className="h-auto max-w-full rounded-2xl"
          />
        </picture>
      </a>
    </aside>
  );
}
