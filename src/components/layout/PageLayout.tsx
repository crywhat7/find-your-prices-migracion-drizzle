import type { ReactNode } from "react";
import { BackToTop } from "@/components/shared/BackToTop";
import { CrumbleEasterEgg } from "@/components/shared/CrumbleEasterEgg";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteNav } from "@/components/layout/SiteNav";
import { LocaleProvider } from "@/features/i18n/LocaleContext";
import { ProductClickTracker } from "@/features/products/ProductClickTracker";
import { PartnerPromoPopup } from "@/features/affiliates/PartnerPromoPopup";
import { PageViewTracker } from "@/features/analytics/PageViewTracker";
import { ClientErrorListener } from "@/features/errors/ClientErrorListener";
import { VersionWatcher } from "@/features/version/VersionWatcher";
import type { Locale } from "@/features/i18n/translate";
import { ThemeProvider } from "@/features/theme/ThemeProvider";

/**
 * Estructura común de una página completa: tema, idioma, navegación y pie.
 *
 * Existe porque a la cuarta página este bloque ya estaba copiado cuatro veces,
 * y cada copia era una oportunidad de que una página se quedara sin
 * `ThemeProvider` y parpadeara en blanco al cargar.
 */
/**
 * El botón de volver arriba está fuera del proveedor de idioma —lo monta el
 * mismo componente que lo instala—, así que su texto se resuelve acá.
 */
const BACK_TO_TOP: Record<Locale, string> = {
  es: "Volver arriba",
  en: "Back to top",
};

/** Textos del pop-up de Eneba: también queda fuera del proveedor de idioma. */
const PARTNER_POPUP: Record<Locale, { label: string; alt: string; close: string }> = {
  es: {
    label: "Código de descuento de Eneba",
    alt: "Find Your Prices x Eneba: 5% de descuento con el código findyourprices",
    close: "Cerrar",
  },
  en: {
    label: "Eneba discount code",
    alt: "Find Your Prices x Eneba: 5% off with the code findyourprices",
    close: "Close",
  },
};

export interface PageLayoutProps {
  locale: Locale;
  /**
   * La misma página en el otro idioma. Se lo pasa al selector de idioma para
   * que cambiar de idioma en "Privacidad" lleve a "Privacy" y no a la portada,
   * que es lo que hacía antes por no tener esta información.
   */
  localePaths?: Record<Locale, string>;
  children: ReactNode;
}

export function PageLayout({ locale, localePaths, children }: PageLayoutProps) {
  return (
    <ThemeProvider>
      <LocaleProvider initialLocale={locale}>
        <div className="flex flex-1 flex-col">
          <SiteNav localePaths={localePaths} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          {/* Vive acá y no en el catálogo porque las páginas de texto también
              son largas, y el botón se esconde solo donde no hace falta. */}
          <BackToTop label={BACK_TO_TOP[locale]} />
          {/* Un solo listener por página cuenta los clics a productos. */}
          <ProductClickTracker />
          {/* Y otro cuenta las visitas, para /admin/trafico. */}
          <PageViewTracker />
          {/* Y los errores del navegador van a /admin/errores. */}
          <ClientErrorListener />
          {/* Avisa si esta pestaña quedó con una versión vieja del sitio. */}
          <VersionWatcher locale={locale} />
          {/* Flyer de Eneba: al entrar y cada 3-8 minutos. */}
          <PartnerPromoPopup
            locale={locale}
            label={PARTNER_POPUP[locale].label}
            alt={PARTNER_POPUP[locale].alt}
            closeLabel={PARTNER_POPUP[locale].close}
          />
          {/* Easter egg: Ctrl/Cmd + 0 + 0 + 0. */}
          <CrumbleEasterEgg />
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
