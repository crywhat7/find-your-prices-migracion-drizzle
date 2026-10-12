import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => import("@/test/server-only-stub"));

const insert = vi.fn();
vi.mock("@/server/db/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      insert: (row: unknown) => {
        insert(row);
        return { select: () => ({ single: async () => ({ data: { id: 42 }, error: null }) }) };
      },
    }),
  }),
}));

beforeEach(() => {
  vi.resetModules();
  insert.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://ejemplo.supabase.co");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logError", () => {
  it("anota el error con su huella y devuelve el id", async () => {
    vi.stubEnv("ERRORS_IN_DEV", "1");
    const { logError } = await import("./logError");
    const id = await logError({ source: "handled", error: new Error("canceling statement due to statement timeout"), path: "/admin/categorias" });
    expect(id).toBe(42);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "handled",
        message: "canceling statement due to statement timeout",
        route: "/admin/categorias",
        fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/),
      }),
    );
  });

  it("una ráfaga del mismo error se anota una sola vez", async () => {
    vi.stubEnv("ERRORS_IN_DEV", "1");
    const { logError } = await import("./logError");
    await logError({ source: "render", error: new Error("boom 1"), path: "/p/a" });
    await logError({ source: "render", error: new Error("boom 2"), path: "/p/b" });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("en desarrollo no escribe en la base, solo en la consola", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ERRORS_IN_DEV", "");
    const { logError } = await import("./logError");
    expect(await logError({ source: "client", error: "x" })).toBeNull();
    expect(insert).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
