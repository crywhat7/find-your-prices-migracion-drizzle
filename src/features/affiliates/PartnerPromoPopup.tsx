"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/features/i18n/translate";
import { AFFILIATE_LINK_REL, ENEBA_OUTBOUND_PATH } from "./affiliateRules";
import {
  nextPromoInterval,
  PROMO_POPUP_STORAGE_KEY,
  promoPopupDelay,
} from "./promoPopupRules";

/**
 * Pop-up con el flyer de Eneba (5% con el código `findyourprices`).
 *
 * Sale al entrar y vuelve cada 3 a 8 minutos (ver `promoPopupRules`). Si el
 * momento llega con la pestaña en segundo plano espera a que vuelva a verse:
 * un pop-up que nadie ve no cuenta como aparición. Se cierra con la X, con
 * Escape o tocando fuera; el flyer entero es el enlace de afiliado.
 *
 * Vive en `PageLayout`, así que cubre las páginas públicas y no el panel.
 */

/** Mismo diseño en cada idioma (misma proporción); sólo cambia el texto del flyer. */
const FLYER_SRC: Record<Locale, string> = {
  es: "/images/partners/promo_1_fyp_x_eneba.webp",
  en: "/images/partners/promo_1_fyp_x_eneba_EN.webp",
};
const FLYER_WIDTH = 1145;
const FLYER_HEIGHT = 1374;

export interface PartnerPromoPopupProps {
  /** Idioma de la página: decide qué versión del flyer se muestra. */
  locale: Locale;
  /** Nombre accesible del diálogo. */
  label: string;
  /** Texto alternativo del flyer. */
  alt: string;
  closeLabel: string;
}

function readNextAt(): number | null {
  try {
    const raw = window.sessionStorage.getItem(PROMO_POPUP_STORAGE_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeNextAt(value: number): void {
  try {
    window.sessionStorage.setItem(PROMO_POPUP_STORAGE_KEY, String(value));
  } catch {
    // Sin almacenamiento (modo privado estricto): el pop-up sigue su cadencia en memoria.
  }
}

export function PartnerPromoPopup({ locale, label, alt, closeLabel }: PartnerPromoPopupProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Programa la próxima aparición. Cada aparición agenda la siguiente.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onVisible: (() => void) | undefined;

    function show() {
      if (document.visibilityState === "hidden") {
        onVisible = () => {
          if (document.visibilityState !== "visible") return;
          document.removeEventListener("visibilitychange", onVisible!);
          onVisible = undefined;
          show();
        };
        document.addEventListener("visibilitychange", onVisible);
        return;
      }
      returnFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
      const interval = nextPromoInterval();
      writeNextAt(Date.now() + interval);
      timer = setTimeout(show, interval);
    }

    timer = setTimeout(show, promoPopupDelay(readNextAt(), Date.now()));

    return () => {
      if (timer) clearTimeout(timer);
      if (onVisible) document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Mientras está abierto: Escape cierra, Tab no escapa del diálogo y la página
  // de atrás no se desplaza.
  useEffect(() => {
    if (!open) return;

    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const first = closeRef.current;
      const last = linkRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus({ preventScroll: true });
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 print:hidden"
      style={{ animation: "fyp-fade var(--dur-base) var(--ease-out-quart) both" }}
      onClick={close}
    >
      {/* El desenfoque sólo desde `sm`: en teléfono, con el flyer ocupando casi
          toda la pantalla, se leía como una página rota; ahí basta el velo. */}
      <div aria-hidden="true" className="absolute inset-0 bg-black/75 sm:bg-black/70 sm:backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative w-full max-w-[min(28rem,calc((100dvh-2rem)*1145/1374))]"
        style={{ animation: "fyp-scale-in 320ms var(--ease-out-expo) both" }}
        onClick={(event) => event.stopPropagation()}
      >
        <a
          ref={linkRef}
          href={ENEBA_OUTBOUND_PATH}
          target="_blank"
          rel={AFFILIATE_LINK_REL}
          onClick={close}
          className="block rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- mismo criterio que EnebaBanner: recurso fijo con tamaño propio */}
          <img
            src={FLYER_SRC[locale]}
            alt={alt}
            width={FLYER_WIDTH}
            height={FLYER_HEIGHT}
            decoding="async"
            className="h-auto w-full rounded-3xl shadow-[var(--shadow-md)]"
          />
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          aria-label={closeLabel}
          title={closeLabel}
          className="absolute top-2 right-2 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white outline-none backdrop-blur transition-[background-color,transform] duration-[var(--dur-base)] hover:bg-black/80 active:scale-95 focus-visible:ring-2 focus-visible:ring-white"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
