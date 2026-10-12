import type { CSSProperties } from "react";
import Link from "next/link";
import { ImagePlate } from "@/components/shared/ImagePlate";
import type { Locale } from "@/features/i18n/translate";
import type { AffiliateOffer, AffiliatePartner } from "@/server/services/affiliates";
import { AFFILIATE_COPY } from "./affiliateCopy";
import {
  AFFILIATE_LINK_REL,
  formatOfferPrice,
  localized,
  offerDiscount,
  partnerOutboundPath,
  partnerPaths,
} from "./affiliateRules";
import { PromoCode } from "./PromoCode";

interface OfferCardProps {
  offer: AffiliateOffer;
  partner: AffiliatePartner;
  locale: Locale;
  /** En el índice se nombra al aliado; en su propia página sobra. */
  showPartner?: boolean;
  index?: number;
}

const MAX_STAGGERED = 8;

/**
 * Un producto destacado de un aliado: imagen, nombre, precio en la moneda del
 * aliado, el código que le corresponde y la salida. La imagen y el nombre
 * también salen al aliado: es a donde la persona quiere ir, y obligarla a
 * apuntarle al botón sería pura fricción.
 */
export function OfferCard({ offer, partner, locale, showPartner = false, index = 0 }: OfferCardProps) {
  const copy = AFFILIATE_COPY[locale];
  const title = localized(offer.titleEs, offer.titleEn, locale) ?? offer.titleEs;
  const note = localized(offer.noteEs, offer.noteEn, locale);
  const code = offer.promoCode ?? partner.promoCode;
  const discount = offerDiscount(offer.price, offer.listPrice);
  const href = partnerOutboundPath(partner.slug, offer.id);

  return (
    <article
      className="enter flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-elevated)]"
      style={{ "--enter-delay": `${Math.min(index, MAX_STAGGERED) * 55}ms` } as CSSProperties}
    >
      <a href={href} target="_blank" rel={AFFILIATE_LINK_REL} tabIndex={-1} aria-hidden="true" className="group relative block">
        <ImagePlate
          imageUrl={offer.imageUrl}
          alt=""
          name={title}
          className="aspect-square w-full"
          imageClassName="transition-transform duration-[var(--dur-slow)] ease-[var(--ease-out-expo)] group-hover:scale-[1.03]"
          initialClassName="text-[4rem]"
        />
        {discount !== null && (
          <span className="absolute top-3 left-3 rounded-full bg-[var(--price-win)] px-2.5 py-1 text-[0.75rem] font-semibold tabular-nums text-white shadow-[var(--shadow-sm)]">
            −{discount}%
          </span>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-col gap-1">
          {showPartner && (
            <Link
              href={partnerPaths(partner.slug)[locale]}
              className="w-fit text-[0.75rem] font-medium tracking-[0.04em] text-[var(--accent)] outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {partner.name}
            </Link>
          )}
          <h3 className="text-[1rem] leading-snug font-medium tracking-[-0.01em] text-balance text-[var(--text)]">
            <a
              href={href}
              target="_blank"
              rel={AFFILIATE_LINK_REL}
              className="outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
            >
              {title}
            </a>
          </h3>
          {note && <p className="text-[0.8125rem] leading-[1.45] text-[var(--text-secondary)]">{note}</p>}
        </div>

        {offer.price !== null && (
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[1.25rem] font-semibold tabular-nums tracking-[-0.02em] text-[var(--text)]">
              {formatOfferPrice(offer.price, offer.currency, locale)}
            </span>
            {discount !== null && offer.listPrice !== null && (
              <s className="text-[0.8125rem] tabular-nums text-[var(--text-tertiary)]">
                {formatOfferPrice(offer.listPrice, offer.currency, locale)}
              </s>
            )}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-3 pt-1">
          {code ? (
            <PromoCode
              code={code}
              label={copy.codeLabel}
              copyLabel={copy.copy}
              copiedLabel={copy.copied}
              failedLabel={copy.copyFailed}
            />
          ) : null}
          <a
            href={href}
            target="_blank"
            rel={AFFILIATE_LINK_REL}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--text)] px-5 py-2.5 text-[0.8125rem] font-medium text-[var(--text-inverted)] outline-none transition-[transform,opacity] duration-[var(--dur-base)] ease-[var(--ease-spring)] hover:scale-[1.02] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-elevated)]"
          >
            {copy.viewOffer}
            <ExternalGlyph />
          </a>
        </div>
      </div>
    </article>
  );
}

export function ExternalGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M14 5h5v5" />
      <path d="M19 5 10 14" />
      <path d="M18 14v4a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 18V7.5A1.5 1.5 0 0 1 6.5 6H10" />
    </svg>
  );
}
