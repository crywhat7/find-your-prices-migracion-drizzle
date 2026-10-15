import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/**
 * Datos del build: versión de package.json, commit y hora de compilación.
 *
 * Se calculan UNA vez, al compilar, y quedan grabados en el código (servidor
 * y navegador) por `env`. Así el servidor sabe qué build está corriendo
 * (/api/version) y el navegador sabe con qué build se cargó: si no coinciden,
 * el navegador tiene una versión vieja en caché y se le ofrece recargar
 * (ver `features/version/VersionWatcher`).
 *
 * El commit sale de la variable que pone cada plataforma de build
 * (Cloudflare Workers Builds, GitHub Actions, Vercel) o, si no hay, de git.
 */
function commitSha(): string {
  const fromCi =
    process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.CF_PAGES_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local";
  } catch {
    return "local";
  }
}

const APP_VERSION = (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
const BUILD_TIME = new Date().toISOString();
const COMMIT = commitSha();
/**
 * "a1b2c3d-202610121405": commit + minuto de compilación (UTC), así dos
 * builds del mismo commit se distinguen. En desarrollo va sin hora: Next
 * puede evaluar esta configuración más de una vez y cada evaluación daría
 * un id distinto, con avisos de "versión nueva" que no lo son.
 */
const BUILD_ID =
  process.env.NODE_ENV === "production" ? `${COMMIT}-${BUILD_TIME.replace(/\D/g, "").slice(0, 12)}` : `dev-${COMMIT}`;

const nextConfig: NextConfig = {
  generateBuildId: async () => BUILD_ID,
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
    NEXT_PUBLIC_BUILD_COMMIT: COMMIT,
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
  },
  experimental: {
    // 404 para URLs sin ruta: hay un layout raíz por idioma, así que no hay
    // un `app/not-found.tsx` posible. Ver `app/global-not-found.tsx`.
    globalNotFound: true,
    // Sin caché de Turbopack en `next build` (activa por defecto desde 16.3).
    // Cloudflare Workers Builds la restaura a medias y un `.sst` truncado
    // tumba el build con "Failed to lookup task ids". Compilar en frío es
    // más lento, pero siempre funciona.
    turbopackFileSystemCacheForBuild: false,
    serverActions: {
      // El panel sube imágenes de categoría (hasta 5 MB) por server action;
      // el tope por defecto es 1 MB. Con margen para el sobre de multipart.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
