import { afterEach, describe, expect, it, vi } from "vitest";
import { createTracker, track } from "../src/track.js";
import { getProvider } from "../src/providers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("track", () => {
  it("is a silent no-op when nothing was injected", () => {
    vi.stubGlobal("window", {});
    expect(() => track("anything", { a: 1 })).not.toThrow();
  });

  it("is a no-op outside the browser", () => {
    // No window global at all (SSR / Node).
    expect(() => track("anything")).not.toThrow();
  });

  it("sends GA4 events through gtag", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    track("palette_exported", { format: "css", shades: 11, dark: false });
    expect(gtag).toHaveBeenCalledWith("event", "palette_exported", {
      format: "css",
      shades: 11,
      dark: false,
    });
  });

  it("sends Plausible events with params as props", () => {
    const plausible = vi.fn();
    vi.stubGlobal("window", { plausible });
    track("palette_exported", { format: "css" });
    track("app_opened");
    expect(plausible).toHaveBeenNthCalledWith(1, "palette_exported", { props: { format: "css" } });
    expect(plausible).toHaveBeenNthCalledWith(2, "app_opened", undefined);
  });

  it("never throws when the provider throws", () => {
    vi.stubGlobal("window", {
      gtag: () => {
        throw new Error("boom");
      },
    });
    expect(() => track("x")).not.toThrow();
  });

  it("looks the provider up at call time, so a late-loading script still works", () => {
    const t = createTracker<{ ping: undefined }>();
    const win: Record<string, unknown> = {};
    vi.stubGlobal("window", win);
    t("ping"); // before gtag exists: dropped
    const gtag = vi.fn();
    win.gtag = gtag;
    t("ping");
    expect(gtag).toHaveBeenCalledTimes(1);
  });
});

describe("createTracker typing", () => {
  interface Events {
    palette_exported: { format: "css" | "json" };
    app_opened: undefined;
  }
  const t = createTracker<Events>();

  it("accepts valid events", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    t("palette_exported", { format: "json" });
    t("app_opened");
    expect(gtag).toHaveBeenCalledTimes(2);
  });

  // Compile-time checks, verified by `pnpm typecheck` (the callbacks never run).
  it("rejects bad events at compile time", () => {
    const never = () => {
      // @ts-expect-error unknown event name
      t("palette_exportd", { format: "css" });
      // @ts-expect-error invalid param value
      t("palette_exported", { format: "pdf" });
      // @ts-expect-error missing required params
      t("palette_exported");
    };
    expect(never).toBeTypeOf("function");
  });
});

describe("plausible snippet", () => {
  it("includes the queue stub so early track() calls are not lost", () => {
    const snippet = getProvider("plausible").snippet("example.com", {});
    expect(snippet).toContain("window.plausible.q");
    expect(snippet.indexOf("window.plausible.q")).toBeLessThan(snippet.indexOf("script.js"));
  });
});
