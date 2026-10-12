"use client";

import { useEffect } from "react";
import { crumbleProducts, hasPriorComboPress, isComboCode, trackComboPress, type CrumbleRun } from "./crumble";

/**
 * Easter egg: Ctrl/Command + 0 + 0 + 0 y las fichas se destraban, se caen a
 * pedazos y vuelven a su sitio.
 *
 * No pinta nada: sólo escucha el teclado. Cada ficha marca sus piezas con
 * `data-fyp-piece` (ver `ProductTile`) y la animación vive en `crumble.ts`.
 *
 * Ctrl/Command+0 restablece el zoom del navegador, así que sólo se le cancela
 * ese comportamiento desde la segunda pulsación: quien restablece el zoom de
 * verdad (una sola vez) no nota nada.
 */
export function CrumbleEasterEgg() {
  useEffect(() => {
    const presses: number[] = [];
    let run: CrumbleRun | null = null;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        presses.length = 0;
        return;
      }
      if (!isComboCode(event.code)) return;

      const now = performance.now();
      if (hasPriorComboPress(presses, now)) event.preventDefault();

      // Mantener la tecla genera `keydown` repetidos: no cuentan como pulsaciones.
      if (event.repeat) return;

      if (trackComboPress(presses, now) && !run) {
        run = crumbleProducts();
        void run?.done.then(() => {
          run = null;
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      run?.cancel();
    };
  }, []);

  return null;
}
