import type { Locale } from "@/features/i18n/translate";

/**
 * Textos fijos de la sección de aliados, por idioma. Como `storeCopy.ts`:
 * las páginas son Server Components y la ruta pasa el idioma.
 *
 * Cómo funcionan los enlaces de afiliado no se explica acá sino en los
 * términos de uso (sección "Transparencia"), como en cualquier sitio de
 * afiliados: en la página, un aviso así se leía como advertencia.
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
  apply: ApplyCopy;
}

/** El formulario "¿Tenés una tienda?" de /aliados. */
export interface ApplyCopy {
  cta: string;
  heading: string;
  sub: string;
  storeName: string;
  website: string;
  websitePlaceholder: string;
  contactName: string;
  email: string;
  phone: string;
  phoneHint: string;
  category: string;
  categoryPlaceholder: string;
  message: string;
  messagePlaceholder: string;
  optional: string;
  privacy: string;
  submit: string;
  sending: string;
  successTitle: string;
  successBody: string;
  emailAlternative: string;
  emailSubject: string;
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
    apply: {
      cta: "¿Tenés una tienda? Afiliate",
      heading: "¿Tenés una tienda en línea?",
      sub: "Si querés aparecer como aliado, con tu código y tus ofertas, dejanos tus datos y te escribimos.",
      storeName: "Nombre de la tienda",
      website: "Sitio web",
      websitePlaceholder: "tutienda.com",
      contactName: "Tu nombre",
      email: "Correo",
      phone: "Teléfono o WhatsApp",
      phoneHint: "Por si es más fácil hablar por ahí.",
      category: "Qué vendés",
      categoryPlaceholder: "Juegos, ropa, electrónica…",
      message: "Algo más que debamos saber",
      messagePlaceholder: "Tu programa de afiliados, comisiones, códigos…",
      optional: "opcional",
      privacy: "Usamos estos datos solo para contactarte por esta solicitud.",
      submit: "Enviar solicitud",
      sending: "Enviando…",
      successTitle: "Listo, recibimos tu solicitud",
      successBody: "Te vamos a escribir al correo que dejaste.",
      emailAlternative: "¿Preferís escribirnos directo?",
      emailSubject: "Quiero ser aliado de Find Your Prices",
    },
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
    apply: {
      cta: "Have a store? Become a partner",
      heading: "Do you run an online store?",
      sub: "If you want to appear as a partner, with your code and your deals, leave your details and we will get in touch.",
      storeName: "Store name",
      website: "Website",
      websitePlaceholder: "yourstore.com",
      contactName: "Your name",
      email: "Email",
      phone: "Phone or WhatsApp",
      phoneHint: "In case it is easier to talk there.",
      category: "What you sell",
      categoryPlaceholder: "Games, clothing, electronics…",
      message: "Anything else we should know",
      messagePlaceholder: "Your affiliate programme, commissions, codes…",
      optional: "optional",
      privacy: "We only use these details to contact you about this request.",
      submit: "Send request",
      sending: "Sending…",
      successTitle: "Done, we got your request",
      successBody: "We will write to the email you left.",
      emailAlternative: "Prefer to email us directly?",
      emailSubject: "I want to become a Find Your Prices partner",
    },
  },
};
