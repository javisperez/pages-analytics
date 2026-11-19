import { afterEach, describe, expect, it, vi } from "vitest";
import { CONSENT_STORAGE_KEY } from "../src/consent.js";
import { createTracker, getConsent, setConsent, track } from "../src/track.js";
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

describe("setConsent / getConsent", () => {
  const makeStorage = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    return {
      data,
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => void (data[key] = value),
    };
  };

  it("updates GA4 consent for analytics only and remembers the choice", () => {
    const gtag = vi.fn();
    const localStorage = makeStorage();
    vi.stubGlobal("window", { gtag, localStorage });

    setConsent(true);
    expect(gtag).toHaveBeenCalledWith("consent", "update", { analytics_storage: "granted" });
    expect(localStorage.data["pages-analytics:consent"]).toBe("granted");
    expect(getConsent()).toBe("granted");

    setConsent(false);
    expect(gtag).toHaveBeenLastCalledWith("consent", "update", { analytics_storage: "denied" });
    expect(getConsent()).toBe("denied");
  });

  it("is a silent no-op when nothing was injected", () => {
    const localStorage = makeStorage();
    vi.stubGlobal("window", { localStorage });
    expect(() => setConsent(true)).not.toThrow();
    expect(localStorage.data).toEqual({});
  });

  it("is a no-op outside the browser", () => {
    expect(() => setConsent(true)).not.toThrow();
    expect(getConsent()).toBeUndefined();
  });

  it("never throws when gtag throws, and still saves the choice", () => {
    const localStorage = makeStorage();
    vi.stubGlobal("window", {
      gtag: () => {
        throw new Error("boom");
      },
      localStorage,
    });
    expect(() => setConsent(true)).not.toThrow();
    expect(getConsent()).toBe("granted");
  });

  it("survives blocked storage and still updates consent for this page view", () => {
    const gtag = vi.fn();
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    vi.stubGlobal("window", { gtag, localStorage: blocked });
    expect(() => setConsent(true)).not.toThrow();
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(getConsent()).toBeUndefined();
  });

  it("ignores junk in storage", () => {
    vi.stubGlobal("window", { localStorage: makeStorage({ "pages-analytics:consent": "maybe" }) });
    expect(getConsent()).toBeUndefined();
  });

  it("uses the same storage key the injected snippet reads", () => {
    const snippet = getProvider("ga4").snippet("G-ABC123XYZ9", { consent: true });
    expect(snippet).toContain(`localStorage.getItem("${CONSENT_STORAGE_KEY}")`);
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
