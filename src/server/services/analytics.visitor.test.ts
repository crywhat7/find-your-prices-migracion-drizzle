import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => import("@/test/server-only-stub"));
import { readVisitor } from "./analytics";

const UA =
  "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

describe("readVisitor en Cloudflare", () => {
  it("lee país, región y ciudad de las cabeceras de Cloudflare", () => {
    const visitor = readVisitor(
      new Headers({
        "user-agent": UA,
        "cf-connecting-ip": "190.4.1.10",
        "cf-ipcountry": "HN",
        "cf-region-code": "CR",
        "cf-ipcity": "San Pedro Sula",
      }),
    );
    expect(visitor).toMatchObject({ country: "HN", region: "CR", city: "San Pedro Sula", device: "mobile" });
  });

  it("usa cf-connecting-ip aunque x-forwarded-for diga otra cosa", () => {
    const now = new Date("2026-10-12T16:00:00Z");
    const real = readVisitor(new Headers({ "user-agent": UA, "cf-connecting-ip": "190.4.1.10" }), now);
    const spoofed = readVisitor(
      new Headers({ "user-agent": UA, "cf-connecting-ip": "190.4.1.10", "x-forwarded-for": "1.2.3.4" }),
      now,
    );
    expect(spoofed?.visitorHash).toBe(real?.visitorHash);
  });

  it("XX (desconocido) no es un país, y sin la regla de ubicación la ciudad queda vacía", () => {
    const visitor = readVisitor(new Headers({ "user-agent": UA, "cf-ipcountry": "XX" }));
    expect(visitor).toMatchObject({ country: null, city: null, region: null });
  });

  it("el código del visitante cambia de un mes al otro", () => {
    const headers = new Headers({ "user-agent": UA, "cf-connecting-ip": "190.4.1.10" });
    const octubre = readVisitor(headers, new Date("2026-10-20T16:00:00Z"));
    const noviembre = readVisitor(headers, new Date("2026-11-20T16:00:00Z"));
    expect(octubre?.visitorHash).not.toBe(noviembre?.visitorHash);
  });
});

describe("readVisitor con bots", () => {
  it("marca al bot con su nombre en vez de descartarlo", () => {
    const visitor = readVisitor(
      new Headers({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "cf-ipcountry": "US" }),
    );
    expect(visitor).toMatchObject({ isBot: true, botName: "Googlebot", country: "US" });
  });

  it("una persona no es bot", () => {
    expect(readVisitor(new Headers({ "user-agent": UA }))).toMatchObject({ isBot: false, botName: null });
  });
});
