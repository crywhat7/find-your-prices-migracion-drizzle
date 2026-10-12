import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { PageLayout } from "@/components/layout/PageLayout";
import { SHELL } from "@/components/layout/shell";
import { Breadcrumbs } from "@/components/shared/Breadcrumbs";
import { ImagePlate } from "@/components/shared/ImagePlate";
import { SectionHeading } from "@/features/categories/CategoryIndexView";
import { SITE_ROUTES } from "@/features/i18n/routes";
import type { Locale } from "@/features/i18n/translate";
import type { AffiliatePartner } from "@/server/services/affiliates";
import { AFFILIATE_COPY } from "./affiliateCopy";
import { AFFILIATE_LINK_REL, localized, partnerOutboundPath, partnerPaths } from "./affiliateRules";
import { AffiliateApplyForm } from "./AffiliateApplyForm";
import { ExternalGlyph, OfferCard } from "./OfferCard";
import { PromoCode } from "./PromoCode";

/**
 * Las dos vistas de la sección de aliados: el índice y la página de cada
 * aliado. Misma gramática que tiendas y categorías —migas, eyebrow, título
 * monumental, lectura en serif itálica— para que no parezca un anexo pegado
 * al sitio.
 */

const OFFER_GRID = "mt-6 grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4";

// -----------------------------------------------------------------------------
// Índice
// -----------------------------------------------------------------------------

export function AffiliateIndexView({ locale, partners }: { locale: Locale; partners: AffiliatePartner[] }) {
  const copy = AFFILIATE_COPY[locale];
  const paths = SITE_ROUTES.partners;
  const featured = partners.flatMap((partner) =>
    partner.offers.slice(0, 4).map((offer) => ({ offer, partner })),
  );

  return (
    <PageLayout locale={locale} localePaths={paths}>
      <div className={SHELL}>
        <div className="pt-6 sm:pt-8">
          <Breadcrumbs
            label={copy.breadcrumbs}
            items={[
              { name: copy.home, path: SITE_ROUTES.home[locale] },
              { name: copy.indexTitle, path: paths[locale] },
            ]}
          />
        </div>

        <Hero eyebrow={copy.indexEyebrow} title={copy.indexTitle} native={copy.indexNative} tagline={copy.indexTagline} />

        <a
          href="#afiliate"
          className="enter inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] px-4 py-2 text-[0.875rem] font-medium text-[var(--text)] outline-none transition-colors duration-[var(--dur-fast)] hover:bg-[var(--bg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {copy.apply.cta}
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        </a>

        {partners.length === 0 ? (
          <section className="py-16 sm:py-20">
            <div className="rounded-3xl border border-dashed border-[var(--border-strong)] px-6 py-12 text-center">
              <h2 className="text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)]">{copy.emptyTitle}</h2>
              <p className="mx-auto mt-2 max-w-[44ch] text-[0.9375rem] leading-[1.5] text-[var(--text-secondary)]">
                {copy.emptyBody}
              </p>
              <Link
                href={SITE_ROUTES.home[locale]}
                className="mt-6 inline-flex rounded-full bg-[var(--text)] px-6 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                {copy.emptyAction}
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="partners-heading" className="pt-14 sm:pt-16">
              <SectionHeading id="partners-heading" title={copy.partnersHeading} sub={copy.partnersSub} />
              <ul className="mt-6 grid gap-4 md:grid-cols-2">
                {partners.map((partner, index) => (
                  <li key={partner.id}>
                    <PartnerCard partner={partner} locale={locale} index={index} />
                  </li>
                ))}
              </ul>
            </section>

            {featured.length > 0 && (
              <section aria-labelledby="offers-heading" className="pt-16 pb-20 sm:pt-20 sm:pb-28">
                <SectionHeading id="offers-heading" title={copy.offersHeading} sub={copy.offersSub} />
                <ul className={OFFER_GRID}>
                  {featured.map(({ offer, partner }, index) => (
                    <li key={offer.id}>
                      <OfferCard offer={offer} partner={partner} locale={locale} showPartner index={index} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {/* La puerta para que una tienda pida ser aliada. Va al final: quien
            vino a buscar un código no tiene que pasar por encima de ella. */}
        <section id="afiliate" aria-labelledby="apply-heading" className="scroll-mt-20 pt-4 pb-20 sm:pb-28">
          <SectionHeading id="apply-heading" title={copy.apply.heading} sub={copy.apply.sub} />
          <div className="mt-6 max-w-3xl">
            <AffiliateApplyForm locale={locale} />
          </div>
        </section>
      </div>
    </PageLayout>
  );
}

function PartnerCard({ partner, locale, index }: { partner: AffiliatePartner; locale: Locale; index: number }) {
  const copy = AFFILIATE_COPY[locale];
  const tagline = localized(partner.taglineEs, partner.taglineEn, locale);
  const promo = localized(partner.promoTextEs, partner.promoTextEn, locale);
  const pagePath = partnerPaths(partner.slug)[locale];

  return (
    <article
      className="enter flex h-full flex-col gap-5 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 sm:p-6"
      style={{ "--enter-delay": `${Math.min(index, 6) * 70}ms` } as CSSProperties}
    >
      <Link
        href={pagePath}
        className="group flex items-center gap-4 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--bg-elevated)]"
      >
        <ImagePlate
          imageUrl={partner.logoUrl}
          alt={partner.imageAlt ?? partner.name}
          name={partner.name}
          eager={index < 2}
          className="h-16 w-16 shrink-0 rounded-2xl border border-[var(--border)] sm:h-20 sm:w-20"
          initialClassName="text-[2.25rem]"
        />
        <span className="min-w-0">
          <span className="block text-[1.25rem] font-semibold tracking-[-0.02em] text-[var(--text)] group-hover:underline">
            {partner.name}
          </span>
          {tagline && (
            <span className="mt-0.5 block text-[0.875rem] leading-[1.45] text-[var(--text-secondary)]">{tagline}</span>
          )}
          {partner.offers.length > 0 && (
            <span className="mt-1 block text-[0.75rem] tabular-nums text-[var(--text-tertiary)]">
              {copy.seeOffers(partner.offers.length)}
            </span>
          )}
        </span>
      </Link>

      {promo && <p className="text-[0.9375rem] leading-[1.5] font-medium text-[var(--text)]">{promo}</p>}

      <div className="mt-auto grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        {partner.promoCode ? (
          <PromoCode
            code={partner.promoCode}
            label={copy.codeLabel}
            copyLabel={copy.copy}
            copiedLabel={copy.copied}
            failedLabel={copy.copyFailed}
          />
        ) : (
          <p className="text-[0.8125rem] text-[var(--text-tertiary)] sm:pb-6">{copy.noCode}</p>
        )}
        <VisitButton partner={partner} locale={locale} className="sm:mb-6" />
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// Página de un aliado
// -----------------------------------------------------------------------------

export function AffiliatePartnerView({ locale, partner }: { locale: Locale; partner: AffiliatePartner }) {
  const copy = AFFILIATE_COPY[locale];
  const paths = partnerPaths(partner.slug);
  const tagline = localized(partner.taglineEs, partner.taglineEn, locale);
  const description = localized(partner.descriptionEs, partner.descriptionEn, locale);
  const promo = localized(partner.promoTextEs, partner.promoTextEn, locale);

  return (
    <PageLayout locale={locale} localePaths={paths}>
      <div className={SHELL}>
        <div className="pt-6 sm:pt-8">
          <Breadcrumbs
            label={copy.breadcrumbs}
            items={[
              { name: copy.home, path: SITE_ROUTES.home[locale] },
              { name: copy.indexTitle, path: SITE_ROUTES.partners[locale] },
              { name: partner.name, path: paths[locale] },
            ]}
          />
        </div>

        <header className="grid gap-8 pt-10 pb-10 sm:pt-14 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-end md:gap-12">
          <div className="flex flex-col gap-5">
            <ImagePlate
              imageUrl={partner.logoUrl}
              alt={partner.imageAlt ?? partner.name}
              name={partner.name}
              eager
              className="enter h-20 w-20 rounded-[1.5rem] border border-[var(--border)] sm:h-24 sm:w-24"
              initialClassName="text-[3rem]"
            />
            <div>
              <p className="enter text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase">
                {copy.partnerEyebrow}
              </p>
              <h1 className="enter mt-3 text-[clamp(2.5rem,8vw,5.5rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-balance text-[var(--text)]">
                {partner.name}
              </h1>
              {tagline && (
                <p className="enter mt-3 font-serif text-[clamp(1.25rem,3.5vw,2rem)] leading-[1.1] tracking-[-0.01em] text-[var(--accent)] italic">
                  {tagline}
                </p>
              )}
            </div>
            {description && (
              <p className="enter max-w-[56ch] text-[1rem] leading-[1.6] text-[var(--text-secondary)]">{description}</p>
            )}
          </div>

          <aside className="enter flex flex-col gap-4 rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
            {promo && <p className="text-[1.0625rem] leading-[1.4] font-semibold tracking-[-0.01em] text-[var(--text)]">{promo}</p>}
            {partner.promoCode ? (
              <PromoCode
                code={partner.promoCode}
                label={copy.codeLabel}
                copyLabel={copy.copy}
                copiedLabel={copy.copied}
                failedLabel={copy.copyFailed}
                size="large"
              />
            ) : (
              <p className="text-[0.875rem] text-[var(--text-secondary)]">{copy.noCode}</p>
            )}
            <VisitButton partner={partner} locale={locale} size="large" />
          </aside>
        </header>

        <section aria-labelledby="partner-offers-heading" className="pt-14 pb-20 sm:pt-16 sm:pb-28">
          <SectionHeading
            id="partner-offers-heading"
            title={copy.partnerOffersHeading(partner.name)}
            sub={partner.offers.length > 0 ? copy.partnerOffersSub : undefined}
          />
          {partner.offers.length > 0 ? (
            <>
              <ul className={OFFER_GRID}>
                {partner.offers.map((offer, index) => (
                  <li key={offer.id}>
                    <OfferCard offer={offer} partner={partner} locale={locale} index={index} />
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-[0.75rem] text-[var(--text-tertiary)]">{copy.priceNote}</p>
            </>
          ) : (
            <p className="mt-6 max-w-[56ch] text-[0.9375rem] leading-[1.5] text-[var(--text-secondary)]">
              {copy.noOffers(partner.name)}
            </p>
          )}
        </section>
      </div>
    </PageLayout>
  );
}

// -----------------------------------------------------------------------------
// Piezas
// -----------------------------------------------------------------------------

function Hero({ eyebrow, title, native, tagline }: { eyebrow: string; title: string; native: string; tagline: string }) {
  return (
    <header className="relative isolate overflow-hidden pt-10 pb-10 sm:pt-16 sm:pb-12">
      <div
        aria-hidden="true"
        className="parallax-slow pointer-events-none absolute -top-24 -right-32 -z-10 h-[420px] w-[620px] max-w-[150vw]"
      >
        <div
          className="aurora h-full w-full rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--accent-soft), transparent 72%)" }}
        />
      </div>
      <p
        className="enter text-[0.6875rem] font-medium tracking-[0.24em] text-[var(--text-tertiary)] uppercase"
        style={{ "--enter-delay": "60ms" } as CSSProperties}
      >
        {eyebrow}
      </p>
      <h1
        className="enter mt-4 text-[clamp(2.75rem,9vw,7rem)] leading-[0.92] font-semibold tracking-[-0.045em] text-balance text-[var(--text)]"
        style={{ "--enter-delay": "140ms" } as CSSProperties}
      >
        {title}
      </h1>
      <p
        className="enter -mt-1 ml-[6%] font-serif text-[clamp(1.5rem,5vw,3.25rem)] leading-[1.05] tracking-[-0.015em] text-[var(--accent)] italic sm:-mt-2 sm:ml-[12%]"
        style={{ "--enter-delay": "300ms" } as CSSProperties}
      >
        {native}
      </p>
      <p
        className="enter mt-6 max-w-[46ch] text-[clamp(1rem,2vw,1.25rem)] leading-[1.5] tracking-[-0.01em] text-[var(--text-secondary)]"
        style={{ "--enter-delay": "420ms" } as CSSProperties}
      >
        {tagline}
      </p>
    </header>
  );
}

function VisitButton({
  partner,
  locale,
  size = "compact",
  className = "",
}: {
  partner: AffiliatePartner;
  locale: Locale;
  size?: "compact" | "large";
  className?: string;
}): ReactNode {
  const large = size === "large";
  return (
    <a
      href={partnerOutboundPath(partner.slug)}
      target="_blank"
      rel={AFFILIATE_LINK_REL}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--text)] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)] ${
        large ? "px-6 py-3 text-[0.9375rem]" : "px-5 py-2.5 text-[0.8125rem]"
      } ${className}`}
    >
      {AFFILIATE_COPY[locale].visit(partner.name)}
      <ExternalGlyph />
    </a>
  );
}
