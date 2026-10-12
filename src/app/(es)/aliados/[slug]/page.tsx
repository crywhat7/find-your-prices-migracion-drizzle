import type { Metadata } from "next";
import { PartnerRoute, partnerPageMetadata } from "@/features/affiliates/affiliateRoutes";

/**
 * Página de un aliado (es). Ver `features/affiliates/affiliateRoutes.tsx`.
 */
export const revalidate = 900;

/** Cada página se guarda (ISR) en su primera visita. Ver `app/(es)/p/[slug]/page.tsx`. */
export async function generateStaticParams() {
  return [];
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return partnerPageMetadata(slug, "es");
}

export default async function PartnerPage({ params }: PageProps) {
  const { slug } = await params;
  return <PartnerRoute slug={slug} locale="es" />;
}
