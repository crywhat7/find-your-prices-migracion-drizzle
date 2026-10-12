import { describe, expect, it } from "vitest";
import {
  formatOfferPrice,
  isSafeHttpUrl,
  isValidSlug,
  isWithinWindow,
  localized,
  normalizeCurrency,
  offerDiscount,
  partnerOutboundPath,
  partnerPaths,
  slugify,
} from "./affiliateRules";

describe("affiliateRules", () => {
  it("arma las rutas del aliado en los dos idiomas y la salida por /go", () => {
    expect(partnerPaths("eneba")).toEqual({ es: "/aliados/eneba", en: "/en/partners/eneba" });
    expect(partnerOutboundPath("eneba")).toBe("/go/eneba");
    expect(partnerOutboundPath("eneba", "abc")).toBe("/go/eneba?o=abc");
  });

  it("solo acepta enlaces http(s): nada de javascript:", () => {
    expect(isSafeHttpUrl("https://www.eneba.com/?af_id=1")).toBe(true);
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html,hola")).toBe(false);
    expect(isSafeHttpUrl("eneba.com")).toBe(false);
  });

  it("normaliza slugs", () => {
    expect(slugify("Eneba Games!")).toBe("eneba-games");
    expect(slugify("  Tienda Ñandú  ")).toBe("tienda-nandu");
    expect(isValidSlug("eneba")).toBe(true);
    expect(isValidSlug("Eneba")).toBe(false);
    expect(isValidSlug("-eneba")).toBe(false);
  });

  it("respeta la ventana de campaña: inicio incluido, fin excluido", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(isWithinWindow(null, null, now)).toBe(true);
    expect(isWithinWindow("2026-10-12T12:00:00Z", null, now)).toBe(true);
    expect(isWithinWindow("2026-10-13T00:00:00Z", null, now)).toBe(false);
    expect(isWithinWindow(null, "2026-10-12T12:00:00Z", now)).toBe(false);
    expect(isWithinWindow("2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z", now)).toBe(true);
  });

  it("valida monedas y formatea en la del aliado", () => {
    expect(normalizeCurrency(" usd ")).toBe("USD");
    expect(normalizeCurrency("dólar")).toBeNull();
    expect(formatOfferPrice(29.99, "USD", "en")).toBe("$29.99");
    expect(formatOfferPrice(1299, "HNL", "es")).toContain("1,299.00");
  });

  it("calcula el descuento solo cuando lo hay", () => {
    expect(offerDiscount(75, 100)).toBe(25);
    expect(offerDiscount(100, 100)).toBeNull();
    expect(offerDiscount(120, 100)).toBeNull();
    expect(offerDiscount(null, 100)).toBeNull();
    expect(offerDiscount(50, null)).toBeNull();
  });

  it("cae al español si falta el inglés", () => {
    expect(localized("Hola", null, "en")).toBe("Hola");
    expect(localized("Hola", "Hello", "en")).toBe("Hello");
    expect(localized("Hola", "Hello", "es")).toBe("Hola");
  });
});
