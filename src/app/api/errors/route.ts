import { after } from "next/server";
import { isBot } from "@/lib/analytics/visitor";
import { logError } from "@/server/errors/logError";

/**
 * POST /api/errors   body: { message, stack?, digest?, path?, kind? }
 *
 * Errores del navegador: los que atrapan las pantallas de error (`error.tsx`)
 * y los que se escapan sueltos (`ClientErrorListener`). Responde 204 al
 * instante y anota después.
 *
 * Mismas defensas que el recolector de visitas: solo del propio sitio, sin
 * bots, cuerpo chico. `logError` además corta las ráfagas del mismo error.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY = 12_000;

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : null;
}

export async function POST(request: Request): Promise<Response> {
  const done = new Response(null, { status: 204 });

  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return done;
  const userAgent = request.headers.get("user-agent") ?? "";
  if (isBot(userAgent)) return done;

  let payload: Record<string, unknown>;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY) return done;
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return done;
  }

  const message = text(payload.message, 2000);
  if (!message) return done;
  const stack = text(payload.stack, 8000);

  after(() =>
    logError({
      source: "client",
      error: Object.assign(new Error(message), { stack: stack ?? undefined }),
      digest: text(payload.digest, 100),
      path: text(payload.path, 500),
      userAgent,
      context: { kind: text(payload.kind, 40) ?? "unknown" },
    }),
  );

  return done;
}
