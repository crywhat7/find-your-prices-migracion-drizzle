import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUILD_INFO } from "@/lib/buildInfo";
import { VersionWatcher } from "./VersionWatcher";

function mockServer(buildId: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ version: "0.2.0", buildId, commit: "abc1234", builtAt: "2026-10-12T20:00:00Z" })),
  );
}

async function afterFirstCheck() {
  await act(async () => {
    vi.advanceTimersByTime(4100);
  });
  // Deja resolver el fetch y el setState.
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("VersionWatcher", () => {
  it("no dice nada si el servidor corre el mismo build", async () => {
    mockServer(BUILD_INFO.buildId);
    render(<VersionWatcher />);
    await afterFirstCheck();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("ofrece recargar cuando hay un build nuevo desplegado", async () => {
    mockServer("nuevo-202610130000");
    render(<VersionWatcher />);
    await afterFirstCheck();
    expect(screen.getByRole("status")).toHaveTextContent("Hay una versión nueva del sitio");
    expect(screen.getByRole("button", { name: "Recargar" })).toBeInTheDocument();
  });

  it("«Ahora no» lo calla hasta el siguiente despliegue", async () => {
    mockServer("nuevo-202610130000");
    render(<VersionWatcher locale="en" />);
    await afterFirstCheck();
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.sessionStorage.getItem("fyp-version-dismissed")).toBe("nuevo-202610130000");
  });
});
