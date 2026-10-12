/**
 * Lógica del easter egg "se cae todo": detector del combo de teclas y la
 * animación de las fichas desmoronándose. Sin React, para poder probar el
 * detector solo.
 */

/** Teclas del combo (por `code`, no `key`: no dependen del idioma del teclado). */
const COMBO_CODES: readonly string[] = ["Digit0", "Numpad0"];

/** Cuántas veces hay que pulsar el 0 (con Ctrl/Command sostenido). */
const COMBO_PRESSES = 3;

/**
 * Ventana en la que las tres pulsaciones cuentan como un solo gesto.
 *
 * Se miden pulsaciones (`keydown`) y no teclas "abajo": en macOS, con Command
 * sostenido, el navegador no emite `keyup` de las otras teclas, así que no hay
 * forma fiable de saber qué sigue pulsado.
 */
export const COMBO_WINDOW_MS = 1500;

export function isComboCode(code: string): boolean {
  return COMBO_CODES.includes(code);
}

/** Descarta las pulsaciones que ya cayeron fuera de la ventana. */
function prune(presses: number[], at: number): void {
  while (presses.length > 0 && at - presses[0] > COMBO_WINDOW_MS) presses.shift();
}

/** ¿Ya hay una pulsación previa dentro de la ventana (o sea, esta es la 2.ª o más)? */
export function hasPriorComboPress(presses: number[], at: number): boolean {
  prune(presses, at);
  return presses.length > 0;
}

/**
 * Registra una pulsación y dice si con ella el combo quedó completo. Al
 * completarse se vacía, para que seguir pulsando no lo dispare en bucle.
 */
export function trackComboPress(presses: number[], at: number): boolean {
  prune(presses, at);
  presses.push(at);

  const complete = presses.length >= COMBO_PRESSES;
  if (complete) presses.length = 0;
  return complete;
}

/** Duración total de cada pieza: sacudida, caída, ausencia y regreso. */
const TOTAL_MS = 3800;
/** Cada ficha empieza a destrabarse en un momento distinto, para que no caigan en bloque. */
const MAX_TILE_DELAY_MS = 700;
const MAX_PIECE_DELAY_MS = 250;

const FALL_EASING = "cubic-bezier(0.5, 0, 1, 0.55)";
const RETURN_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function pose(x: number, y: number, rotate: number, scale = 1): string {
  return `translate(${x}px, ${y}px) rotate(${rotate}deg) scale(${scale})`;
}

/**
 * Guion de una pieza, en fracciones de `TOTAL_MS`:
 *
 *   0 – 0.23   se destraba: sacudida y se descuelga de una esquina
 *   0.23– 0.55 cae con aceleración, girando y derivando hacia un lado
 *   0.55– 0.80 fuera de la vista
 *   0.80– 1    vuelve a su sitio
 */
function buildKeyframes(side: 1 | -1, fallX: number, fallY: number): Keyframe[] {
  const sag = side * rand(9, 17);
  const spin = sag + side * rand(40, 120);

  return [
    { offset: 0, transform: pose(0, 0, 0), opacity: 1 },
    { offset: 0.05, transform: pose(0, 0, -sag * 0.25), opacity: 1 },
    { offset: 0.1, transform: pose(0, 1, sag * 0.2), opacity: 1 },
    { offset: 0.17, transform: pose(0, 3, sag), opacity: 1 },
    { offset: 0.23, transform: pose(0, 4, sag * 1.08), opacity: 1, easing: FALL_EASING },
    { offset: 0.55, transform: pose(fallX, fallY, spin), opacity: 1 },
    { offset: 0.58, transform: pose(fallX, fallY, spin), opacity: 0 },
    { offset: 0.8, transform: pose(0, 28, 0, 0.92), opacity: 0, easing: RETURN_EASING },
    { offset: 1, transform: pose(0, 0, 0), opacity: 1 },
  ];
}

export interface CrumbleRun {
  /** Resuelve cuando todo volvió a su estado normal (o se canceló). */
  done: Promise<void>;
  /** Corta la animación y deja todo como estaba. */
  cancel: () => void;
}

/**
 * Desmorona las piezas (`[data-fyp-piece]`) de las fichas visibles en pantalla.
 * Cada ficha marca con `data-fyp-tile` su raíz, que reparte el retraso base.
 *
 * Devuelve `null` si no hay nada que animar o si la persona pidió menos
 * movimiento: este efecto es puro movimiento, no hay versión "quieta" útil.
 */
export function crumbleProducts(): CrumbleRun | null {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;

  const viewportHeight = window.innerHeight;
  const tileDelays = new Map<Element, number>();
  const animations: Animation[] = [];
  const origins: HTMLElement[] = [];

  for (const piece of document.querySelectorAll<HTMLElement>("[data-fyp-piece]")) {
    const rect = piece.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= viewportHeight) continue;

    const tile = piece.closest("[data-fyp-tile]") ?? piece;
    let tileDelay = tileDelays.get(tile);
    if (tileDelay === undefined) {
      tileDelay = rand(0, MAX_TILE_DELAY_MS);
      tileDelays.set(tile, tileDelay);
    }

    // Se descuelga de una de las dos esquinas de arriba.
    const side = Math.random() < 0.5 ? 1 : -1;
    piece.style.transformOrigin = side === 1 ? "0% 0%" : "100% 0%";
    origins.push(piece);

    // Cae hasta salir por el borde de abajo de la ventana, no del documento.
    const fallY = viewportHeight - rect.top + 80;

    animations.push(
      piece.animate(buildKeyframes(side, rand(-60, 60), fallY), {
        duration: TOTAL_MS,
        delay: tileDelay + rand(0, MAX_PIECE_DELAY_MS),
        fill: "backwards",
      }),
    );
  }

  if (animations.length === 0) return null;

  // Las piezas se salen de su sitio hacia los lados: sin esto, la página
  // gana una barra horizontal mientras dura.
  const root = document.documentElement;
  const previousOverflowX = root.style.overflowX;
  root.style.overflowX = "clip";

  const restore = () => {
    root.style.overflowX = previousOverflowX;
    for (const piece of origins) piece.style.transformOrigin = "";
  };

  const done = Promise.allSettled(animations.map((a) => a.finished)).then(restore);

  return {
    done,
    cancel: () => {
      for (const animation of animations) animation.cancel();
    },
  };
}
