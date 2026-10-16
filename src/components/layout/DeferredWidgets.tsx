"use client";

import dynamic from "next/dynamic";
import type { Locale } from "@/features/i18n/translate";

/**
 * Lo que va en todas las páginas pero no pinta nada al cargar: el flyer de
 * Eneba (sale a los segundos), el aviso de versión nueva (consulta a los
 * cuatro segundos) y el easter egg (espera una combinación de teclas).
 *
 * Cada uno va en su propio archivo de JS que se pide después de hidratar, no
 * en el que bloquea la primera carga. En un teléfono con mala señal eso es
 * menos código que bajar y ejecutar antes de que la página responda.
 *
 * Tiene que ser un componente de cliente: un `dynamic()` llamado desde un
 * Server Component (como `PageLayout`) no separa el código, y `ssr: false`
 * ni siquiera está permitido ahí.
 */
const PartnerPromoPopup = dynamic(
  () => import("@/features/affiliates/PartnerPromoPopup").then((mod) => mod.PartnerPromoPopup),
  { ssr: false },
);
const VersionWatcher = dynamic(
  () => import("@/features/version/VersionWatcher").then((mod) => mod.VersionWatcher),
  { ssr: false },
);
const CrumbleEasterEgg = dynamic(
  () => import("@/components/shared/CrumbleEasterEgg").then((mod) => mod.CrumbleEasterEgg),
  { ssr: false },
);

export interface DeferredWidgetsProps {
  locale: Locale;
  /** Textos del flyer: se resuelven en `PageLayout`, fuera del proveedor de idioma. */
  popup: { label: string; alt: string; close: string };
}

export function DeferredWidgets({ locale, popup }: DeferredWidgetsProps) {
  return (
    <>
      {/* Avisa si esta pestaña quedó con una versión vieja del sitio. */}
      <VersionWatcher locale={locale} />
      {/* Flyer de Eneba: al entrar y cada 3-8 minutos. */}
      <PartnerPromoPopup locale={locale} label={popup.label} alt={popup.alt} closeLabel={popup.close} />
      {/* Easter egg: Ctrl/Cmd + 0 + 0 + 0. */}
      <CrumbleEasterEgg />
    </>
  );
}
