import type { Metadata } from "next";
import { PartnerRoute, partnerPageMetadata } from "@/features/affiliates/affiliateRoutes";

/**
 * Página de un aliado (en). Ver `features/affiliates/affiliateRoutes.tsx`.
 */
export const revalidate = 900;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return partnerPageMetadata(slug, "en");
}

export default async function PartnerPage({ params }: PageProps) {
  const { slug } = await params;
  return <PartnerRoute slug={slug} locale="en" />;
}
