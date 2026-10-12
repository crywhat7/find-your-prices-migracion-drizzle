"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const COLLECT_ENDPOINT = "/api/analytics/collect";
const SESSION_KEY = "fyp-sid";

/**
 * Un número al azar por pestaña, en `sessionStorage`: muere al cerrarla.
 * Sirve para contar sesiones y páginas por sesión; no identifica a nadie.
 */
function sessionId(): string | null {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/**
 * Cuenta una página vista al entrar y en cada navegación del App Router.
 *
 * Vive en `PageLayout`, así que cubre todas las páginas públicas y ninguna
 * del panel. Cambiar filtros del catálogo no cuenta (cambia la búsqueda, no
 * la ruta). La referencia externa solo viaja en la primera vista de la
 * pestaña: después `document.referrer` sigue diciendo lo mismo aunque la
 * persona ya esté navegando adentro.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    // React en desarrollo monta dos veces: la misma ruta no se cuenta doble.
    if (!pathname || lastSent.current === pathname) return;
    lastSent.current = pathname;

    const body = JSON.stringify({
      p: pathname,
      s: window.location.search,
      r: first.current ? document.referrer : "",
      l: document.documentElement.lang,
      sid: sessionId(),
      w: window.screen?.width ?? null,
    });
    first.current = false;

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(COLLECT_ENDPOINT, new Blob([body], { type: "application/json" }));
    } else {
      fetch(COLLECT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }, [pathname]);

  return null;
}
