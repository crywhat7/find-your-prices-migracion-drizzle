import { BUILD_INFO } from "@/lib/buildInfo";

/**
 * GET /api/version → el build que está corriendo en el servidor.
 *
 * Sirve para dos cosas: saber si el despliegue ya terminó (el commit que
 * responde es el último que subiste) y que el navegador detecte si quedó con
 * una versión vieja en caché. Nunca se cachea: si la respondiera una caché,
 * diría la versión de antes.
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(BUILD_INFO, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "CDN-Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
