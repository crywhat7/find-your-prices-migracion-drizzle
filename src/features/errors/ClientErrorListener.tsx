"use client";

import { useEffect } from "react";
import { reportClientError } from "./reportClientError";

/**
 * Errores que se escapan en el navegador sin pasar por una pantalla de
 * error: un `onClick` que lanza, una promesa rechazada que nadie atrapó.
 *
 * Se filtra el ruido conocido, que no es del sitio: errores de scripts de
 * otro origen (extensiones, traductores) que el navegador entrega como
 * "Script error." sin detalle, y el aviso inofensivo de ResizeObserver.
 */
const NOISE = [/^Script error\.?$/i, /ResizeObserver loop/i, /chrome-extension:|moz-extension:|safari-extension:/i];

function isNoise(message: string, source?: string): boolean {
  if (NOISE.some((pattern) => pattern.test(message))) return true;
  return Boolean(source && !source.startsWith(window.location.origin));
}

export function ClientErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const message = event.message || (event.error instanceof Error ? event.error.message : "");
      if (!message || isNoise(message, event.filename)) return;
      reportClientError(event.error ?? message, "window.error");
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      if (!message || isNoise(message)) return;
      reportClientError(reason, "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
