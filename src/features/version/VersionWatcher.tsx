"use client";

import { useEffect, useState } from "react";
import { BUILD_INFO, type BuildInfo } from "@/lib/buildInfo";

const COPY = {
  es: { title: "Hay una versión nueva del sitio", body: "Recargá para usar la última.", reload: "Recargar", dismiss: "Ahora no" },
  en: { title: "A new version of the site is out", body: "Reload to get the latest.", reload: "Reload", dismiss: "Not now" },
} as const;

const CHECK_EVERY_MS = 10 * 60 * 1000;
const DISMISS_KEY = "fyp-version-dismissed";

/** El build que está corriendo en el servidor ahora, o `null` si no se pudo saber. */
export async function fetchServerBuild(): Promise<BuildInfo | null> {
  try {
    const response = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as BuildInfo;
    return typeof data.buildId === "string" ? data : null;
  } catch {
    return null;
  }
}

/**
 * Detecta si este navegador quedó con una versión vieja del sitio.
 *
 * El JavaScript trae grabado el build con el que se compiló; /api/version
 * dice cuál corre en el servidor. Si difieren, hubo un despliegue después de
 * que se abrió la pestaña (o el navegador sirvió archivos de su caché) y se
 * ofrece recargar. Una pestaña vieja es la que después falla al navegar o
 * al mandar un formulario, porque pide archivos que ya no existen.
 *
 * Se revisa al volver a la pestaña y cada 10 minutos, nunca en un bucle
 * apretado. "Ahora no" lo calla hasta el siguiente despliegue.
 */
export function VersionWatcher({ locale = "es" }: { locale?: "es" | "en" }) {
  const [newer, setNewer] = useState<BuildInfo | null>(null);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      if (document.visibilityState !== "visible") return;
      const server = await fetchServerBuild();
      if (!alive || !server || server.buildId === BUILD_INFO.buildId) return;
      let dismissed: string | null = null;
      try {
        dismissed = window.sessionStorage.getItem(DISMISS_KEY);
      } catch {
        // Sin almacenamiento: se avisa igual.
      }
      if (dismissed !== server.buildId) setNewer(server);
    };

    const first = window.setTimeout(() => void check(), 4000);
    const interval = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!newer) return null;
  const copy = COPY[locale];

  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 left-4 z-50 mx-auto flex max-w-md items-center gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3 shadow-[var(--shadow-md)] print:hidden sm:left-auto"
      style={{ animation: "fyp-fade 220ms var(--ease-out-quart) both" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[0.875rem] font-medium text-[var(--text)]">{copy.title}</p>
        <p className="text-[0.75rem] text-[var(--text-tertiary)]">
          {copy.body} <span className="font-mono">v{newer.version} · {newer.commit}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            window.sessionStorage.setItem(DISMISS_KEY, newer.buildId);
          } catch {
            // Nada que hacer.
          }
          setNewer(null);
        }}
        className="shrink-0 text-[0.8125rem] text-[var(--text-tertiary)] hover:text-[var(--text)]"
      >
        {copy.dismiss}
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-[var(--text)] px-4 py-2 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
      >
        {copy.reload}
      </button>
    </div>
  );
}
