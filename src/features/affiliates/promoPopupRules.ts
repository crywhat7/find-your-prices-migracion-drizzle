/**
 * Cadencia del pop-up promocional de Eneba.
 *
 * Sale al entrar al sitio y luego cada 5 a 10 minutos: el intervalo se sortea
 * en cada aparición para que no sea un reloj. La próxima hora se guarda en
 * `sessionStorage` y así cambiar de página (que vuelve a montar el pop-up) no
 * lo reinicia ni lo repite: se sigue contando desde donde iba.
 */

export const PROMO_POPUP_MIN_MS = 5 * 60_000;
export const PROMO_POPUP_MAX_MS = 10 * 60_000;
/** Espera tras cargar la página, para no tapar el primer pintado. */
export const PROMO_POPUP_FIRST_DELAY_MS = 1_500;

/** Clave en `sessionStorage` con la hora (ms epoch) de la próxima aparición. */
export const PROMO_POPUP_STORAGE_KEY = "fyp-promo-next";

/** Un intervalo al azar en [5, 10] minutos. `random` va inyectable para probarlo. */
export function nextPromoInterval(random: () => number = Math.random): number {
  return PROMO_POPUP_MIN_MS + random() * (PROMO_POPUP_MAX_MS - PROMO_POPUP_MIN_MS);
}

/**
 * Cuánto falta para mostrar el pop-up, dada la próxima hora guardada.
 * Sin dato (primera entrada) o con la hora ya vencida, sale tras el retraso corto.
 */
export function promoPopupDelay(nextAt: number | null, now: number): number {
  if (nextAt === null || !Number.isFinite(nextAt) || nextAt <= now) return PROMO_POPUP_FIRST_DELAY_MS;
  return nextAt - now;
}
