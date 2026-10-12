import { afterEach, describe, expect, it, vi } from "vitest";
import { inBotSample, logBotVisit, shouldLogBot } from "./botLog";

const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const PERSON = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("shouldLogBot", () => {
  it("solo bots, solo GET de páginas, sin prefetch", () => {
    expect(shouldLogBot("GET", "/tiendas", new Headers({ "user-agent": GOOGLEBOT }))).toBe(true);
    expect(shouldLogBot("GET", "/tiendas", new Headers({ "user-agent": PERSON }))).toBe(false);
    expect(shouldLogBot("POST", "/tiendas", new Headers({ "user-agent": GOOGLEBOT }))).toBe(false);
    expect(shouldLogBot("GET", "/admin", new Headers({ "user-agent": GOOGLEBOT }))).toBe(false);
    expect(shouldLogBot("GET", "/tiendas", new Headers({ "user-agent": GOOGLEBOT, rsc: "1" }))).toBe(false);
  });
});

describe("inBotSample", () => {
  it("anota 1 de cada 10 por defecto", () => {
    vi.stubEnv("BOT_LOG_SAMPLE_RATE", "");
    expect(inBotSample(0.05)).toBe(true);
    expect(inBotSample(0.1)).toBe(false);
    expect(inBotSample(0.5)).toBe(false);
  });

  it("respeta BOT_LOG_SAMPLE_RATE y descarta valores inválidos", () => {
    vi.stubEnv("BOT_LOG_SAMPLE_RATE", "1");
    expect(inBotSample(0.99)).toBe(true);
    vi.stubEnv("BOT_LOG_SAMPLE_RATE", "0");
    expect(inBotSample(0)).toBe(false);
    vi.stubEnv("BOT_LOG_SAMPLE_RATE", "7");
    expect(inBotSample(0.05)).toBe(true);
    expect(inBotSample(0.2)).toBe(false);
  });
});

describe("logBotVisit", () => {
  it("manda la fila marcada como bot a la API REST de Supabase", async () => {
    vi.stubEnv("ANALYTICS_IN_DEV", "1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_prueba");
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await logBotVisit(
      new URL("https://findyourprices.com/en/stores/diunsa?utm_source=Prueba"),
      new Headers({ "user-agent": GOOGLEBOT, "cf-ipcountry": "US", "cf-connecting-ip": "66.249.66.1" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ejemplo.supabase.co/rest/v1/page_views");
    expect((init.headers as Record<string, string>)["Content-Profile"]).toBe("find_your_prices");
    expect(JSON.parse(String(init.body))).toMatchObject({
      path: "/en/stores/diunsa",
      page_type: "store",
      locale: "en",
      country: "US",
      utm_source: "prueba",
      is_bot: true,
      bot_name: "Googlebot",
    });
  });

  it("en desarrollo no manda nada", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ANALYTICS_IN_DEV", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_prueba");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await logBotVisit(new URL("https://findyourprices.com/tiendas"), new Headers({ "user-agent": GOOGLEBOT }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
