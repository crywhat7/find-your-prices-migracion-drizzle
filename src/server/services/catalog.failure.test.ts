import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Qué pasa cuando la base falla.
 *
 * Es la regresión del bug de "la portada muestra artículos de muestra":
 * `getCatalogSnapshot` devolvía un catálogo vacío ante cualquier error, la
 * regeneración de fondo lo cacheaba y todo el mundo veía el fixture durante
 * cinco minutos. La regla ahora es: con base configurada, un fallo se
 * reintenta y, si persiste, se lanza. Nunca se disfraza de "vacío".
 */

// El paquete real lanza en jsdom; la frontera la hace cumplir `next build`.
vi.mock("server-only", () => import("@/test/server-only-stub"));

const state = vi.hoisted(() => ({ failures: 0, calls: 0 }));

vi.mock("@/server/db/client", async () => {
  const { createDrizzleMock } = await import("@/test/drizzleMock");
  /** Cada consulta resuelve vacía, o revienta mientras queden fallos. */
  const { db } = createDrizzleMock(() => {
    state.calls += 1;
    if (state.failures > 0) {
      state.failures -= 1;
      throw new Error("fetch failed");
    }
    return [];
  });
  return { getDb: () => db, hasDatabaseConfig: () => Boolean(process.env.DATABASE_URL) };
});

// Import estático: cargar el módulo (y drizzle-orm) dentro del primer test se
// comía su plazo de 5 s con la suite completa corriendo en paralelo.
import { getCatalogSnapshot, getProductDetail, searchCatalog } from "./catalog";

// Con la variable puesta, el servicio considera que HAY base y no debe caer
// al fixture. Sin ella, `hasDatabase()` es falso y el fixture es lo correcto.
beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://prueba";
  state.failures = 0;
  state.calls = 0;
});

describe("getCatalogSnapshot ante fallos de base", () => {
  test("un fallo persistente se lanza, no se devuelve un catálogo vacío", async () => {
    state.failures = 100;
    await expect(getCatalogSnapshot({ limit: 10 })).rejects.toThrow(
      /fetch failed/,
    );
  });

  test("un fallo pasajero se reintenta y la lectura sale bien", async () => {
    state.failures = 1;
    const result = await searchCatalog({ limit: 10 });
    expect(result).toEqual({ products: [], total: 0 });
    expect(state.calls).toBeGreaterThanOrEqual(2);
  });

  test("sin base configurada devuelve vacío sin tocar la red (modo fixture)", async () => {
    delete process.env.DATABASE_URL;
    const snapshot = await getCatalogSnapshot({ limit: 10 });
    expect(snapshot.products).toEqual([]);
    expect(state.calls).toBe(0);
  });
});

describe("getProductDetail ante fallos de base", () => {
  test("un error de red no se convierte en 404", async () => {
    state.failures = 100;
    await expect(getProductDetail("algun-slug")).rejects.toThrow();
  });
});
