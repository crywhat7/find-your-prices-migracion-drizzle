import { describe, expect, it } from "vitest";
import { COMBO_WINDOW_MS, hasPriorComboPress, isComboCode, trackComboPress } from "./crumble";

/**
 * Contrato del detector del combo Ctrl/Command + 0 + 0 + 0:
 *   - dispara a la tercera pulsación dentro de la ventana;
 *   - una pulsación vieja (fuera de la ventana) no cuenta;
 *   - tras disparar se vacía, así que seguir pulsando no lo repite;
 *   - sirve tanto el 0 de la fila de números como el del teclado numérico.
 */
describe("trackComboPress", () => {
  it("dispara a la tercera pulsación", () => {
    const presses: number[] = [];
    expect([0, 200, 400].map((at) => trackComboPress(presses, at))).toEqual([false, false, true]);
  });

  it("no cuenta pulsaciones fuera de la ventana", () => {
    const presses: number[] = [];
    trackComboPress(presses, 0);
    trackComboPress(presses, 100);
    expect(trackComboPress(presses, COMBO_WINDOW_MS + 101)).toBe(false);
  });

  it("se vacía al disparar", () => {
    const presses: number[] = [];
    [0, 100, 200].forEach((at) => trackComboPress(presses, at));
    expect(trackComboPress(presses, 300)).toBe(false);
    expect(trackComboPress(presses, 400)).toBe(false);
    expect(trackComboPress(presses, 500)).toBe(true);
  });
});

describe("hasPriorComboPress", () => {
  it("es falso con la primera pulsación y verdadero desde la segunda", () => {
    const presses: number[] = [];
    expect(hasPriorComboPress(presses, 0)).toBe(false);
    trackComboPress(presses, 0);
    expect(hasPriorComboPress(presses, 100)).toBe(true);
    expect(hasPriorComboPress(presses, COMBO_WINDOW_MS + 1)).toBe(false);
  });
});

describe("isComboCode", () => {
  it("acepta el 0 normal y el numérico, y nada más", () => {
    expect(isComboCode("Digit0")).toBe(true);
    expect(isComboCode("Numpad0")).toBe(true);
    expect(isComboCode("Digit1")).toBe(false);
  });
});
