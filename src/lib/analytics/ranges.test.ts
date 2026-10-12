import { describe, expect, it } from "vitest";
import { bucketFor, percentChange, resolveRange } from "./ranges";

// 12 de octubre de 2026, 10:00 en Honduras (16:00 UTC).
const NOW = new Date("2026-10-12T16:00:00Z");

describe("resolveRange", () => {
  it("30 días termina mañana a medianoche de Honduras e incluye hoy", () => {
    const range = resolveRange({ range: "30d" }, NOW);
    expect(range.to.toISOString()).toBe("2026-10-13T06:00:00.000Z");
    expect(range.from.toISOString()).toBe("2026-09-13T06:00:00.000Z");
    expect(range.toDate).toBe("2026-10-12");
    expect(range.fromDate).toBe("2026-09-13");
    expect(range.days).toBe(30);
    expect(range.bucket).toBe("day");
    expect(range.prevTo).toEqual(range.from);
    expect(range.prevFrom.toISOString()).toBe("2026-08-14T06:00:00.000Z");
  });

  it("de noche en Honduras ya es mañana en UTC, pero el día local manda", () => {
    const lateNight = new Date("2026-10-13T03:00:00Z"); // 12 de octubre, 21:00 local
    expect(resolveRange({ range: "7d" }, lateNight).toDate).toBe("2026-10-12");
  });

  it("este mes y el mes pasado", () => {
    const month = resolveRange({ range: "month" }, NOW);
    expect(month.fromDate).toBe("2026-10-01");
    const prev = resolveRange({ range: "prev-month" }, NOW);
    expect(prev.fromDate).toBe("2026-09-01");
    expect(prev.toDate).toBe("2026-09-30");
    expect(prev.days).toBe(30);
  });

  it("12 meses va por semana; un rango personalizado inválido cae a 30 días", () => {
    expect(resolveRange({ range: "12m" }, NOW).bucket).toBe("week");
    expect(resolveRange({ range: "custom", from: "2026-10-10", to: "2026-10-01" }, NOW).key).toBe("30d");
    const custom = resolveRange({ range: "custom", from: "2026-10-01", to: "2026-10-05" }, NOW);
    expect(custom.days).toBe(5);
    expect(custom.toDate).toBe("2026-10-05");
  });

  it("no pasa de hoy aunque se pida el futuro", () => {
    expect(resolveRange({ range: "custom", from: "2026-10-01", to: "2026-12-31" }, NOW).toDate).toBe("2026-10-12");
  });
});

describe("bucketFor y percentChange", () => {
  it("elige el tramo y compara", () => {
    expect(bucketFor(30)).toBe("day");
    expect(bucketFor(200)).toBe("week");
    expect(bucketFor(730)).toBe("month");
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(5, 0)).toBeNull();
  });
});
