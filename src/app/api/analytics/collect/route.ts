import { after } from "next/server";
import { isTrackablePath } from "@/lib/analytics/visitor";
import { readVisitor, recordPageView } from "@/server/services/analytics";

/**
 * POST /api/analytics/collect   body: { p, s, r, l, sid, w }
 *
 * Registra una página vista. Lo llama `PageViewTracker` con `sendBeacon` al
 * entrar a cada página. Responde 204 al instante y escribe después
 * (`after`): la visita nunca espera a la base.
 *
 * Defensas, porque estas cifras se les muestran a aliados y no pueden ser
 * fáciles de inflar: solo peticiones del propio sitio (`Sec-Fetch-Site`),
 * sin bots, cuerpo chico y rutas públicas. No es infalible —nada que corra
 * en el navegador lo es—, pero un script casero no las pasa sin esfuerzo.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 2048;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

export async function POST(request: Request): Promise<Response> {
  const done = new Response(null, { status: 204 });

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return done;

  const visitor = readVisitor(request.headers);
  if (!visitor) return done;

  let payload: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY) return done;
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return done;
  }

  const path = text(payload.p, 300);
  if (!isTrackablePath(path)) return done;

  const width = Number(payload.w);
  const locale = text(payload.l, 5);
  const sessionId = text(payload.sid, 40);

  after(() =>
    recordPageView(
      {
        path,
        search: text(payload.s, 500),
        referrer: text(payload.r, 500),
        locale: locale === "es" || locale === "en" ? locale : null,
        sessionId: /^[a-z0-9-]{8,40}$/i.test(sessionId) ? sessionId : null,
        screenWidth: Number.isInteger(width) && width > 0 && width < 10000 ? width : null,
      },
      visitor,
    ),
  );

  return done;
}
