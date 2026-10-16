import { describe, expect, test } from "vitest";

/**
 * Prueba que falla A PROPÓSITO.
 *
 * Sirve para comprobar que el build de Cloudflare corre los tests antes de
 * compilar (`npm run test:run && npx opennextjs-cloudflare build`) y que un
 * test en rojo frena el deploy: el build tiene que salir fallido y producción
 * seguir con la versión anterior.
 *
 * BORRAR este archivo apenas se confirme.
 */
describe("compuerta de CI", () => {
  test("Test para frenar un deploy", () => {
    // expect("tests en rojo").toBe("deploy frenado");
    expect("Test apagado").toBe("Test apagado");
  });
});
