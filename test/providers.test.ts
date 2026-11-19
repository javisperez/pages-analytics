import { describe, expect, it } from "vitest";
import { buildSnippet } from "../src/inject-dir.js";
import { getProvider, validateHost } from "../src/providers.js";

describe("ga4", () => {
  const ga4 = getProvider("ga4");

  it("accepts real-looking measurement IDs", () => {
    expect(ga4.validateId("G-ABC123XYZ9")).toBe(true);
  });

  it.each([
    "",
    "UA-12345-1",
    "g-abc123xyz9",
    "G-",
    'G-ABC"></script><script>alert(1)</script>',
    "G-ABC123 XYZ",
  ])("rejects %j", (id) => {
    expect(ga4.validateId(id)).toBe(false);
  });

  it("builds the gtag snippet", () => {
    const snippet = ga4.snippet("G-ABC123XYZ9", {});
    expect(snippet).toContain("googletagmanager.com/gtag/js?id=G-ABC123XYZ9");
    expect(snippet).toContain('gtag("config","G-ABC123XYZ9")');
  });

  it("does not touch consent unless asked", () => {
    expect(ga4.snippet("G-ABC123XYZ9", {})).not.toContain("consent");
  });

  describe("consent mode", () => {
    const snippet = ga4.snippet("G-ABC123XYZ9", { consent: true });

    it("denies everything by default, before config", () => {
      const defaults = snippet.indexOf('gtag("consent","default"');
      expect(defaults).toBeGreaterThan(-1);
      expect(defaults).toBeLessThan(snippet.indexOf('gtag("config"'));
      for (const signal of ["ad_storage", "analytics_storage", "ad_user_data", "ad_personalization"]) {
        expect(snippet).toContain(`${signal}:"denied"`);
      }
    });

    it("replays a saved choice before config, granting analytics only", () => {
      const update = snippet.indexOf('gtag("consent","update",{analytics_storage:"granted"})');
      expect(update).toBeGreaterThan(snippet.indexOf('gtag("consent","default"'));
      expect(update).toBeLessThan(snippet.indexOf('gtag("config"'));
      expect(snippet).toContain('localStorage.getItem("pages-analytics:consent")');
      expect(snippet).not.toContain('ad_storage:"granted"');
    });

    it("keeps the loader and config intact", () => {
      expect(snippet).toContain("googletagmanager.com/gtag/js?id=G-ABC123XYZ9");
      expect(snippet).toContain('gtag("config","G-ABC123XYZ9")');
    });
  });
});

describe("plausible", () => {
  const plausible = getProvider("plausible");

  it("accepts domains", () => {
    expect(plausible.validateId("example.com")).toBe(true);
    expect(plausible.validateId("my-tools.example.co.uk")).toBe(true);
  });

  it.each(["", "example", "exa mple.com", 'a.com"><script>', "https://example.com"])(
    "rejects %j",
    (id) => {
      expect(plausible.validateId(id)).toBe(false);
    },
  );

  it("uses plausible.io by default and a custom host when given", () => {
    expect(plausible.snippet("example.com", {})).toContain('src="https://plausible.io/js/script.js"');
    expect(plausible.snippet("example.com", { host: "https://stats.example.com" })).toContain(
      'src="https://stats.example.com/js/script.js"',
    );
  });
});

describe("validateHost", () => {
  it("accepts https origins", () => {
    expect(validateHost("https://stats.example.com")).toBe(true);
    expect(validateHost("https://stats.example.com:8443")).toBe(true);
  });

  it.each([
    "http://stats.example.com",
    "https://stats.example.com/path",
    'https://a.com"><script>',
    "stats.example.com",
    "",
  ])("rejects %j", (host) => {
    expect(validateHost(host)).toBe(false);
  });
});

describe("getProvider / buildSnippet", () => {
  it("rejects unknown providers and lists the available ones", () => {
    expect(() => getProvider("nope")).toThrow(/ga4, plausible/);
  });

  it("explains what a valid ID looks like", () => {
    expect(() => buildSnippet({ provider: "ga4", id: "oops" })).toThrow(/measurement ID/);
  });

  it("rejects a bad host", () => {
    expect(() =>
      buildSnippet({ provider: "plausible", id: "example.com", host: "http://x.com" }),
    ).toThrow(/Invalid host/);
  });
});
