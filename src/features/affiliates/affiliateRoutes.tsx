import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SITE_ROUTES } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import { JsonLd } from "@/lib/seo/JsonLd";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { breadcrumbJsonLd, contentPageJsonLd, graph, organizationJsonLd, websiteJsonLd } from "@/lib/seo/schema";
import { getPublicPartner, listPublicPartners } from "@/server/services/affiliates";
import { AFFILIATE_COPY } from "./affiliateCopy";
import { localized, partnerPaths } from "./affiliateRules";
import { AffiliateIndexView, AffiliatePartnerView } from "./AffiliateViews";

/**
 * Lo que comparten las cuatro rutas de aliados (índice y aliado, en dos
 * idiomas). Cada `page.tsx` solo elige el idioma, como en tiendas.
 */

export function partnerIndexMetadata(locale: Locale): Metadata {
  const copy = AFFILIATE_COPY[locale];
  return buildPageMetadata({
    locale,
    title: copy.metaTitle,
    description: copy.metaDescription,
    paths: SITE_ROUTES.partners,
  });
}

export async function PartnerIndexRoute({ locale }: { locale: Locale }) {
  const copy = AFFILIATE_COPY[locale];
  const partners = await listPublicPartners();

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd(locale),
          websiteJsonLd(locale),
          contentPageJsonLd({
            type: "WebPage",
            locale,
            path: SITE_ROUTES.partners[locale],
            name: copy.metaTitle,
            description: copy.metaDescription,
          }),
          breadcrumbJsonLd([
            { name: copy.home, path: SITE_ROUTES.home[locale] },
            { name: copy.indexTitle, path: SITE_ROUTES.partners[locale] },
          ]),
        ])}
      />
      <AffiliateIndexView locale={locale} partners={partners} />
    </>
  );
}

export async function partnerPageMetadata(slug: string, locale: Locale): Promise<Metadata> {
  const partner = await getPublicPartner(slug);
  if (!partner) {
    return {
      title: locale === "es" ? "Aliado no encontrado" : "Partner not found",
      robots: { index: false, follow: true },
    };
  }
  const copy = AFFILIATE_COPY[locale];
  const tagline = localized(partner.taglineEs, partner.taglineEn, locale);
  return buildPageMetadata({
    locale,
    title: locale === "es" ? `Código promocional de ${partner.name}` : `${partner.name} promo code`,
    description: copy.partnerMetaDescription(partner.name, tagline),
    paths: partnerPaths(partner.slug),
  });
}

export async function PartnerRoute({ slug, locale }: { slug: string; locale: Locale }) {
  const partner = await getPublicPartner(slug);
  // Inactivo, fuera de campaña o inexistente: 404 real.
  if (!partner) notFound();

  const copy = AFFILIATE_COPY[locale];
  const path = partnerPaths(partner.slug)[locale];
  const tagline = localized(partner.taglineEs, partner.taglineEn, locale);

  return (
    <>
      <JsonLd
        data={graph([
          organizationJsonLd(locale),
          websiteJsonLd(locale),
          contentPageJsonLd({
            type: "WebPage",
            locale,
            path,
            name: partner.name,
            description: copy.partnerMetaDescription(partner.name, tagline),
          }),
          breadcrumbJsonLd([
            { name: copy.home, path: SITE_ROUTES.home[locale] },
            { name: copy.indexTitle, path: SITE_ROUTES.partners[locale] },
            { name: partner.name, path },
          ]),
        ])}
      />
      <AffiliatePartnerView locale={locale} partner={partner} />
    </>
  );
}
