import { describe, expect, it } from "vitest";
import {
  nextPromoInterval,
  PROMO_POPUP_FIRST_DELAY_MS,
  PROMO_POPUP_MAX_MS,
  PROMO_POPUP_MIN_MS,
  promoPopupDelay,
} from "./promoPopupRules";

describe("nextPromoInterval", () => {
  it("queda entre 5 y 10 minutos", () => {
    expect(nextPromoInterval(() => 0)).toBe(PROMO_POPUP_MIN_MS);
    expect(nextPromoInterval(() => 1)).toBe(PROMO_POPUP_MAX_MS);
    expect(nextPromoInterval(() => 0.5)).toBe(7.5 * 60_000);
  });
});

describe("promoPopupDelay", () => {
  it("sale pronto en la primera entrada", () => {
    expect(promoPopupDelay(null, 1_000)).toBe(PROMO_POPUP_FIRST_DELAY_MS);
  });

  it("sale pronto si la hora guardada ya pasó o es inválida", () => {
    expect(promoPopupDelay(500, 1_000)).toBe(PROMO_POPUP_FIRST_DELAY_MS);
    expect(promoPopupDelay(Number.NaN, 1_000)).toBe(PROMO_POPUP_FIRST_DELAY_MS);
  });

  it("espera lo que falta si la hora guardada es futura", () => {
    expect(promoPopupDelay(61_000, 1_000)).toBe(60_000);
  });
});
