/**
 * El build con el que se compiló este código (ver `next.config.ts`).
 *
 * Los valores quedan grabados al compilar, tanto en el servidor como en el
 * JavaScript del navegador. Por eso comparar el `buildId` del navegador con
 * el que responde /api/version dice si el navegador quedó con una versión
 * vieja en caché.
 */

export interface BuildInfo {
  /** "0.1.0", de package.json. */
  version: string;
  /** "a1b2c3d-202610121405": commit + minuto de compilación. */
  buildId: string;
  /** Commit corto, "a1b2c3d", o "local". */
  commit: string;
  /** ISO de la compilación. */
  builtAt: string;
}

export const BUILD_INFO: BuildInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
  commit: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "local",
  builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? "",
};

export const REPO_URL = "https://github.com/fq962/find-your-prices";

/** Enlace al commit en GitHub, o `null` si no hay commit real. */
export function commitUrl(commit: string): string | null {
  return /^[0-9a-f]{7,40}$/.test(commit) ? `${REPO_URL}/commit/${commit}` : null;
}

/** "12 oct 2026, 14:05" en hora de Honduras. */
export function formatBuildTime(iso: string, locale: "es" | "en" = "es"): string {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "—";
  return new Intl.DateTimeFormat(locale === "es" ? "es-HN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Tegucigalpa",
  }).format(time);
}
