import { after, NextResponse } from "next/server";
import { SITE_ROUTES } from "@/features/i18n/routes";
import { resolveOutbound, type Outbound } from "@/server/services/affiliates";
import { readVisitor, recordAffiliateClickEvent } from "@/server/services/analytics";

/**
 * GET /go/<aliado>[?o=<producto>]
 *
 * La salida hacia un aliado: cuenta el clic y redirige al enlace de
 * afiliado (o al del producto, si vino `o`). El destino sale SIEMPRE de la
 * base, nunca de la URL, así que esto no es una redirección abierta.
 *
 * Si el aliado no existe o su campaña terminó, vuelve al índice de aliados
 * en vez de dar un 404: quien llega acá es alguien que quería comprar.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ partner: string }> },
): Promise<Response> {
  const { partner } = await params;
  const offer = new URL(request.url).searchParams.get("o");

  let outbound: Outbound | null = null;
  try {
    outbound = await resolveOutbound(partner, offer && UUID_PATTERN.test(offer) ? offer : null);
  } catch (error) {
    console.error("[go] no se pudo resolver el aliado:", error);
  }

  // El clic con fecha, país y dispositivo, para el reporte de aliados. Los
  // bots (vistas previas de WhatsApp, rastreadores) no cuentan.
  const visitor = readVisitor(request.headers);
  if (outbound && visitor) {
    const { partnerId, offerId } = outbound;
    after(() => recordAffiliateClickEvent(partnerId, offerId, visitor));
  }

  const destination = outbound?.target ?? new URL(SITE_ROUTES.partners.es, request.url).toString();
  return NextResponse.redirect(destination, { status: 302, headers: HEADERS });
}
