import type { Locale } from "@/features/i18n/translate";

/**
 * Textos fijos de la sección de aliados, por idioma. Como `storeCopy.ts`:
 * las páginas son Server Components y la ruta pasa el idioma.
 *
 * La declaración de afiliado no es letra chica: va arriba, en las dos
 * páginas, y dice lo que pasa sin rodeos. Es lo que la ley de publicidad de
 * casi cualquier país pide y, sobre todo, lo que el compromiso "el
 * comparador no se vende" exige para que siga siendo cierto.
 */
export interface AffiliateCopy {
  breadcrumbs: string;
  home: string;
  indexTitle: string;
  indexEyebrow: string;
  indexNative: string;
  indexTagline: string;
  metaTitle: string;
  metaDescription: string;
  partnerMetaDescription: (partner: string, tagline: string | null) => string;
  disclosureTitle: string;
  disclosure: string;
  partnersHeading: string;
  partnersSub: string;
  offersHeading: string;
  offersSub: string;
  partnerOffersHeading: (partner: string) => string;
  partnerOffersSub: string;
  emptyTitle: string;
  emptyBody: string;
  emptyAction: string;
  noOffers: (partner: string) => string;
  codeLabel: string;
  copy: string;
  copied: string;
  copyFailed: string;
  noCode: string;
  visit: (partner: string) => string;
  viewOffer: string;
  seeOffers: (count: number) => string;
  priceNote: string;
  partnerEyebrow: string;
}

export const AFFILIATE_COPY: Record<Locale, AffiliateCopy> = {
  es: {
    breadcrumbs: "Ubicación",
    home: "Inicio",
    indexTitle: "Aliados",
    indexEyebrow: "Códigos y ofertas",
    indexNative: "Un descuento más, si te sirve",
    indexTagline:
      "Tiendas en línea con las que trabajamos. Cada una trae su código: copialo, pegalo al pagar y listo.",
    metaTitle: "Aliados y códigos promocionales",
    metaDescription:
      "Códigos promocionales y ofertas de las tiendas en línea aliadas de Find Your Prices, para comprar desde Honduras.",
    partnerMetaDescription: (partner, tagline) =>
      `Código promocional y ofertas de ${partner}${tagline ? `: ${tagline.toLowerCase()}` : ""}. Comprá desde Honduras con descuento.`,
    disclosureTitle: "Cómo funciona esto",
    disclosure:
      "Son enlaces de afiliado: si comprás por ellos, el aliado nos paga una comisión. A vos no te cuesta nada extra, y no cambia en nada el comparador: ahí ninguna tienda paga por aparecer ni por salir primero. Así se sostiene el sitio sin anuncios.",
    partnersHeading: "Nuestros aliados",
    partnersSub: "Entrá a cada uno para ver sus ofertas.",
    offersHeading: "Ofertas destacadas",
    offersSub: "Lo que elegimos de cada aliado. Precio y existencia los manda el aliado al momento de pagar.",
    partnerOffersHeading: (partner) => `Ofertas en ${partner}`,
    partnerOffersSub: "Si un producto trae su propio código, ese es el que vale para él.",
    emptyTitle: "Todavía no hay aliados activos",
    emptyBody: "Estamos cerrando los primeros acuerdos. Mientras tanto, el comparador sigue abierto.",
    emptyAction: "Ir al comparador",
    noOffers: (partner) => `Todavía no destacamos productos de ${partner}. El código vale en toda la tienda.`,
    codeLabel: "Código",
    copy: "Copiar",
    copied: "Copiado",
    copyFailed: "Seleccionalo y copialo a mano",
    noCode: "Sin código: el descuento ya va en el enlace.",
    visit: (partner) => `Ir a ${partner}`,
    viewOffer: "Ver oferta",
    seeOffers: (count) => (count === 1 ? "1 oferta" : `${count} ofertas`),
    priceNote: "Precio publicado por el aliado, en su moneda. Puede cambiar.",
    partnerEyebrow: "Aliado",
  },
  en: {
    breadcrumbs: "Breadcrumb",
    home: "Home",
    indexTitle: "Partners",
    indexEyebrow: "Codes and deals",
    indexNative: "One more discount, if it helps",
    indexTagline:
      "Online stores we work with. Each one comes with its own code: copy it, paste it at checkout, done.",
    metaTitle: "Partners and promo codes",
    metaDescription:
      "Promo codes and deals from Find Your Prices' partner online stores, for shopping from Honduras.",
    partnerMetaDescription: (partner, tagline) =>
      `${partner} promo code and deals${tagline ? `: ${tagline.toLowerCase()}` : ""}. Shop from Honduras for less.`,
    disclosureTitle: "How this works",
    disclosure:
      "These are affiliate links: if you buy through them, the partner pays us a commission. It costs you nothing extra and changes nothing in the comparator, where no store pays to appear or to rank first. That is how the site pays for itself without ads.",
    partnersHeading: "Our partners",
    partnersSub: "Open each one to see its deals.",
    offersHeading: "Featured deals",
    offersSub: "Our picks from each partner. Price and stock are the partner's at checkout.",
    partnerOffersHeading: (partner) => `Deals at ${partner}`,
    partnerOffersSub: "If a product has its own code, that is the one that applies to it.",
    emptyTitle: "No active partners yet",
    emptyBody: "We are closing the first agreements. Meanwhile, the comparator is open.",
    emptyAction: "Go to the comparator",
    noOffers: (partner) => `We are not featuring products from ${partner} yet. The code works store-wide.`,
    codeLabel: "Code",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Select it and copy it by hand",
    noCode: "No code needed: the discount is in the link.",
    visit: (partner) => `Go to ${partner}`,
    viewOffer: "View deal",
    seeOffers: (count) => (count === 1 ? "1 deal" : `${count} deals`),
    priceNote: "Price published by the partner, in its currency. It may change.",
    partnerEyebrow: "Partner",
  },
};
