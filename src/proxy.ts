import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { logBotVisit, shouldLogBot } from "@/lib/analytics/botLog";

/**
 * Proxy: anota las visitas de bots para /admin/trafico.
 *
 * Las personas se cuentan desde el navegador (`PageViewTracker`), pero los
 * bots casi nunca ejecutan JavaScript: si se los quiere ver, hay que verlos
 * acá, en el servidor, antes de que la página salga de caché. No cambia la
 * respuesta ni la demora: el registro corre en `waitUntil`, después de
 * responder. A una persona no le hace nada.
 */
export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (shouldLogBot(request.method, request.nextUrl.pathname, request.headers)) {
    event.waitUntil(logBotVisit(new URL(request.url), request.headers));
  }
  return NextResponse.next();
}

export const config = {
  // Solo páginas: nada de archivos estáticos, imágenes, API, panel, salidas a
  // aliados ni sitemaps (todo lo que tenga un punto en la ruta queda fuera).
  matcher: ["/((?!_next/|api/|admin|go/|og/|sitemaps/|brand/|icons/|images/|.*\\..*).*)"],
};
