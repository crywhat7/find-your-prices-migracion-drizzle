import { beforeEach, describe, expect, test, vi } from "vitest";

/**
 * Caché de búsquedas y `withTotal`.
 *
 * Dos garantías: la clave de caché es la forma canónica de los parámetros
 * (dos peticiones equivalentes comparten entrada, dos distintas no), y el
 * `count(*)` solo se pide cuando alguien va a usar el total.
 */

vi.mock("server-only", () => import("@/test/server-only-stub"));

import type { DrizzleCall } from "@/test/drizzleMock";

const state = vi.hoisted(() => ({ calls: [] as DrizzleCall[] }));

vi.mock("@/server/db/client", async () => {
  const { createDrizzleMock, isCount } = await import("@/test/drizzleMock");
  // Las filas salen vacías y toda cuenta da 42.
  const { db } = createDrizzleMock((call) => {
    state.calls.push(call);
    return isCount(call) ? [{ n: 42 }] : [];
  });
  return { getDb: () => db, hasDatabaseConfig: () => Boolean(process.env.DATABASE_URL) };
});

const pages = () => state.calls.filter((call) => call.kind === "select" && !("n" in (call.select ?? {})));
const counts = () => state.calls.filter((call) => call.kind === "select" && "n" in (call.select ?? {}));

// `unstable_cache` fuera de Next no tiene dónde guardar: se reemplaza por un
// memo en memoria que registra las claves, que es lo que se quiere probar.
const cacheState = vi.hoisted(() => ({ keys: [] as string[] }));
vi.mock("next/cache", () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>) => {
    const store = new Map<string, Promise<R>>();
    return (...args: A) => {
      const key = JSON.stringify(args);
      cacheState.keys.push(key);
      if (!store.has(key)) store.set(key, fn(...args));
      return store.get(key)!;
    };
  },
}));

import { normalizeSearchParams, searchCatalog, searchCatalogCached } from "./catalog";

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://prueba";
  state.calls = [];
  cacheState.keys = [];
});

describe("normalizeSearchParams", () => {
  test("ordena y deduplica las listas, y aplica los defaults", () => {
    const a = normalizeSearchParams({ store: ["Walmart", "Diunsa", "Walmart"], query: "  tv " });
    const b = normalizeSearchParams({ store: ["Diunsa", "Walmart"], query: "tv", sort: "discount" });
    expect(a).toEqual(b);
    expect(a.store).toEqual(["Diunsa", "Walmart"]);
    expect(a.withTotal).toBe(true);
    expect(a.offset).toBe(0);
  });

  test("todo lo que cambia el resultado cambia la clave", () => {
    const base = normalizeSearchParams({ query: "tv" });
    for (const variant of [
      { query: "tvs" },
      { query: "tv", store: "Diunsa" },
      { query: "tv", category: "hogar" },
      { query: "tv", brand: "LG" },
      { query: "tv", minPrice: 100 },
      { query: "tv", maxPrice: 100 },
      { query: "tv", onlyDiscounted: true },
      { query: "tv", includeUnavailable: true },
      { query: "tv", sort: "price-asc" as const },
      { query: "tv", limit: 30 },
      { query: "tv", offset: 60 },
      { query: "tv", locale: "en" as const },
      { query: "tv", withTotal: false },
      { query: "tv", exact: true },
    ]) {
      expect(normalizeSearchParams(variant)).not.toEqual(base);
    }
  });
});

describe("searchCatalogCached", () => {
  test("peticiones equivalentes comparten entrada y consultan la base una vez", async () => {
    await searchCatalogCached({ store: ["B", "A"], query: "tv " });
    await searchCatalogCached({ store: ["A", "B"], query: "tv", sort: "discount" });
    expect(cacheState.keys).toHaveLength(2);
    expect(cacheState.keys[0]).toBe(cacheState.keys[1]);
    expect(pages()).toHaveLength(1);
  });

  test("peticiones distintas no comparten entrada", async () => {
    await searchCatalogCached({ query: "tv" });
    await searchCatalogCached({ query: "tv", offset: 60 });
    expect(new Set(cacheState.keys).size).toBe(2);
    expect(pages()).toHaveLength(2);
  });
});

describe("withTotal", () => {
  test("por defecto pide el count exacto y lo devuelve", async () => {
    const result = await searchCatalog({ query: "tv" });
    expect(counts()).toHaveLength(1);
    expect(result.total).toBe(42);
  });

  test("con withTotal: false no pide count y devuelve null", async () => {
    const result = await searchCatalog({ query: "tv", withTotal: false });
    expect(counts()).toHaveLength(0);
    expect(result.total).toBeNull();
  });
});
