import type { Metadata } from "next";
import { PartnerIndexRoute, partnerIndexMetadata } from "@/features/affiliates/affiliateRoutes";

/**
 * Índice de aliados (es). Ver `features/affiliates/affiliateRoutes.tsx`.
 *
 * Quince minutos de revalidación: el panel ya regenera la página al guardar,
 * y esto acota cuánto sigue a la vista una campaña que terminó por fecha.
 */
export const revalidate = 900;

export function generateMetadata(): Metadata {
  return partnerIndexMetadata("es");
}

export default function AliadosIndexPage() {
  return <PartnerIndexRoute locale="es" />;
}
