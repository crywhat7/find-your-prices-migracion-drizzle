import { describe, expect, it } from "vitest";
import { computeUsage, decodeCategoryData, encodeCategoryData } from "./rowCodec";
import type { CanonicalCategory, StoreCategoryRow, StoreOption } from "./types";

const categories: CanonicalCategory[] = [
  { id: "c-1", parent_id: null, slug: "deportes", name: "Deportes", description: null, icon: null, path: null, level: 0, position: 0, is_active: true },
];
const stores: StoreOption[] = [{ id: "s-1", name: "Walmart Honduras", slug: "walmarthn" }];
const rows: StoreCategoryRow[] = [
  { id: "r-1", store_id: "s-1", store_name: "Walmart Honduras", external_id: "147", name: "Artículos deportivos", store_path: "Deportes › Artículos deportivos", is_active: true, reported_count: null, live_count: 12, category_id: "c-1" },
  { id: "r-2", store_id: "s-1", store_name: "Walmart Honduras", external_id: "148", name: "Raro › con flecha", store_path: "Raro › con flecha", is_active: false, reported_count: 3, live_count: 0, category_id: null },
];

describe("rowCodec", () => {
  it("ida y vuelta sin perder nada", () => {
    const decoded = decodeCategoryData(JSON.parse(JSON.stringify(encodeCategoryData(categories, stores, rows))));
    expect(decoded.storeCategories).toEqual(rows);
    expect(decoded.categories).toEqual(categories);
  });

  it("es bastante más chico que las filas como objetos", () => {
    const compact = JSON.stringify(encodeCategoryData(categories, stores, rows).rows).length;
    expect(compact).toBeLessThan(JSON.stringify(rows).length * 0.6);
  });

  it("un mapeo a un nodo borrado se sigue viendo", () => {
    const orphan = [{ ...rows[0], category_id: "no-existe" }];
    expect(decodeCategoryData(encodeCategoryData(categories, stores, orphan)).storeCategories[0].category_id).toBe("deleted");
  });

  it("computa el uso por nodo canónico", () => {
    expect(computeUsage(rows)).toEqual({ "c-1": { storeCategories: 1, products: 12 } });
  });
});
