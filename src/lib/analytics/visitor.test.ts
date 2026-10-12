import { describe, expect, it } from "vitest";
import { classifyPath, isBot, isTrackablePath, normalizeReferrer, parseUserAgent, readUtm } from "./visitor";

const IPHONE_FB =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const WINDOWS_EDGE =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("parseUserAgent", () => {
  it("reconoce teléfono, tableta y escritorio", () => {
    expect(parseUserAgent(ANDROID_CHROME)).toEqual({ device: "mobile", browser: "Chrome", os: "Android" });
    expect(parseUserAgent(ANDROID_TABLET).device).toBe("tablet");
    expect(parseUserAgent(WINDOWS_EDGE)).toEqual({ device: "desktop", browser: "Edge", os: "Windows" });
    expect(parseUserAgent(MAC_SAFARI)).toEqual({ device: "desktop", browser: "Safari", os: "macOS" });
  });

  it("separa el navegador interno de Facebook", () => {
    expect(parseUserAgent(IPHONE_FB)).toEqual({ device: "mobile", browser: "Facebook (app)", os: "iOS" });
  });
});

describe("isBot", () => {
  it("descarta rastreadores y vistas previas de enlaces", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isBot("facebookexternalhit/1.1")).toBe(true);
    expect(isBot("WhatsApp/2.23.20.0")).toBe(true);
    expect(isBot("curl/8.4.0")).toBe(true);
    expect(isBot("")).toBe(true);
    expect(isBot(ANDROID_CHROME)).toBe(false);
    expect(isBot(IPHONE_FB)).toBe(false);
  });
});

describe("classifyPath", () => {
  it("clasifica en los dos idiomas", () => {
    expect(classifyPath("/")).toBe("home");
    expect(classifyPath("/en")).toBe("home");
    expect(classifyPath("/", "?q=televisor")).toBe("search");
    expect(classifyPath("/p/samsung-a15")).toBe("product");
    expect(classifyPath("/en/p/samsung-a15")).toBe("product");
    expect(classifyPath("/categorias/electronica")).toBe("category");
    expect(classifyPath("/en/stores/diunsa")).toBe("store");
    expect(classifyPath("/aliados/eneba")).toBe("partner");
    expect(classifyPath("/privacidad")).toBe("info");
    expect(classifyPath("/algo-raro")).toBe("other");
  });
});

describe("normalizeReferrer", () => {
  it("junta variantes y descarta el propio sitio", () => {
    expect(normalizeReferrer("https://l.facebook.com/l.php?u=x", "findyourprices.com")).toBe("facebook.com");
    expect(normalizeReferrer("https://www.google.com.hn/", "findyourprices.com")).toBe("google.com");
    expect(normalizeReferrer("https://www.findyourprices.com/tiendas", "findyourprices.com")).toBeNull();
    expect(normalizeReferrer("", "findyourprices.com")).toBeNull();
    expect(normalizeReferrer("no es url", "findyourprices.com")).toBeNull();
    expect(normalizeReferrer("https://t.co/abc", "findyourprices.com")).toBe("x.com");
  });
});

describe("readUtm e isTrackablePath", () => {
  it("lee UTM en minúsculas y filtra rutas internas", () => {
    expect(readUtm("?utm_source=Facebook&utm_campaign=Navidad")).toEqual({
      source: "facebook",
      medium: null,
      campaign: "navidad",
    });
    expect(isTrackablePath("/tiendas")).toBe(true);
    expect(isTrackablePath("/admin/trafico")).toBe(false);
    expect(isTrackablePath("/go/eneba")).toBe(false);
    expect(isTrackablePath("https://otro.com")).toBe(false);
  });
});
