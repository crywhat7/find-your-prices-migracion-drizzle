import { describe, expect, it } from "vitest";
import { describeError, errorFingerprint, normalizeMessage, normalizeRoute } from "./fingerprint";

describe("normalizeMessage", () => {
  it("quita ids, números y URLs que cambian entre ocurrencias", () => {
    expect(normalizeMessage("Producto 8f3a2b1c-1111-2222-3333-444455556666 no encontrado")).toBe("Producto <id> no encontrado");
    expect(normalizeMessage("timeout tras 8312 ms en https://x.supabase.co/rest/v1/a")).toBe("timeout tras <n> ms en <url>");
  });
});

describe("normalizeRoute", () => {
  it("colapsa los segmentos variables y respeta la ruta de archivo", () => {
    expect(normalizeRoute("/p/samsung-a15")).toBe(normalizeRoute("/p/iphone-16"));
    expect(normalizeRoute("/tiendas/diunsa/abarrotes?x=1")).toBe("/tiendas/:x/:x");
    expect(normalizeRoute("/en/stores/diunsa")).toBe("/en/stores/:x");
    expect(normalizeRoute("/admin/categorias/contenido")).toBe("/admin/categorias/contenido");
    expect(normalizeRoute("/(es)/p/[slug]")).toBe("/(es)/p/[slug]");
    expect(normalizeRoute(null)).toBe("");
  });
});

describe("errorFingerprint", () => {
  it("el mismo error en distintos productos es un solo grupo", () => {
    const a = errorFingerprint("render", "timeout tras 8312 ms", "/p/samsung-a15");
    const b = errorFingerprint("render", "timeout tras 8101 ms", "/p/iphone-16");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it("distinto origen o distinto mensaje es otro grupo", () => {
    expect(errorFingerprint("render", "x", "/")).not.toBe(errorFingerprint("client", "x", "/"));
    expect(errorFingerprint("render", "x", "/")).not.toBe(errorFingerprint("render", "y", "/"));
  });
});

describe("describeError", () => {
  it("saca mensaje, pila y digest de lo que sea", () => {
    const error = Object.assign(new Error("se rompió"), { digest: "123abc" });
    expect(describeError(error)).toMatchObject({ message: "se rompió", digest: "123abc" });
    expect(describeError("texto")).toEqual({ message: "texto", stack: null, digest: null });
    expect(describeError({ code: 57014 }).message).toBe('{"code":57014}');
  });
});
