import { describe, expect, it } from "vitest";
import { normalizeWebsite, validateApplication, type ApplicationField } from "./applicationRules";

const base: Record<ApplicationField, string> = {
  storeName: "Tienda Ejemplo",
  website: "tiendaejemplo.hn",
  contactName: "Ana",
  email: "Ana@TiendaEjemplo.hn",
  phone: "",
  category: "Electrónica",
  message: "",
};

describe("validateApplication", () => {
  it("acepta una solicitud completa y normaliza correo y sitio", () => {
    const result = validateApplication(base, "es");
    expect(result).toEqual({
      ok: true,
      data: {
        storeName: "Tienda Ejemplo",
        website: "https://tiendaejemplo.hn",
        contactName: "Ana",
        email: "ana@tiendaejemplo.hn",
        phone: null,
        category: "Electrónica",
        message: null,
      },
    });
  });

  it("pide los obligatorios y avisa en el idioma de la página", () => {
    const result = validateApplication({ ...base, storeName: " ", email: "" }, "en");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.storeName).toBe("This field is required.");
      expect(result.errors.email).toBe("This field is required.");
    }
  });

  it("rechaza correos y sitios que no lo son", () => {
    const result = validateApplication({ ...base, email: "ana@", website: "no es un sitio" }, "es");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.email).toMatch(/correo/);
      expect(result.errors.website).toMatch(/sitio/);
    }
  });

  it("limita el largo del mensaje", () => {
    const result = validateApplication({ ...base, message: "x".repeat(2001) }, "es");
    expect(result.ok).toBe(false);
  });
});

describe("normalizeWebsite", () => {
  it("agrega https y rechaza otros protocolos", () => {
    expect(normalizeWebsite("https://www.eneba.com/")).toBe("https://www.eneba.com");
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("")).toBeNull();
  });
});
