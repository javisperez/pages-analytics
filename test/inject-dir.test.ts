import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { injectDir } from "../src/inject-dir.js";
import { START_MARKER } from "../src/inject.js";

const PAGE = "<html><head></head><body></body></html>";
const CONFIG = { provider: "ga4", id: "G-ABC123XYZ9" };

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pages-analytics-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("injectDir", () => {
  it("injects into nested html files and ignores everything else", async () => {
    await mkdir(join(root, "docs/guide"), { recursive: true });
    await mkdir(join(root, "node_modules/pkg"), { recursive: true });
    await writeFile(join(root, "index.html"), PAGE);
    await writeFile(join(root, "docs/guide/page.htm"), PAGE);
    await writeFile(join(root, "node_modules/pkg/index.html"), PAGE);
    await writeFile(join(root, "app.js"), "// not html");

    const { counts, files } = await injectDir(root, CONFIG);

    expect(counts.inserted).toBe(2);
    expect(files.map((f) => f.file).sort()).toEqual(["docs/guide/page.htm", "index.html"]);
    expect(await readFile(join(root, "index.html"), "utf8")).toContain("G-ABC123XYZ9");
    expect(await readFile(join(root, "node_modules/pkg/index.html"), "utf8")).toBe(PAGE);
    expect(await readFile(join(root, "app.js"), "utf8")).toBe("// not html");
  });

  it("does not write anything on a dry run", async () => {
    await writeFile(join(root, "index.html"), PAGE);
    const { counts } = await injectDir(root, CONFIG, { dryRun: true });
    expect(counts.inserted).toBe(1);
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
  });

  it("is idempotent across runs", async () => {
    await writeFile(join(root, "index.html"), PAGE);
    await injectDir(root, CONFIG);
    const second = await injectDir(root, CONFIG);
    expect(second.counts.unchanged).toBe(1);
    const html = await readFile(join(root, "index.html"), "utf8");
    expect(html.split(START_MARKER)).toHaveLength(2);
  });

  it("reports pages it had to skip", async () => {
    await writeFile(join(root, "fragment.html"), "<p>no head</p>");
    const { counts, files } = await injectDir(root, CONFIG);
    expect(counts.skipped).toBe(1);
    expect(files[0]).toEqual({ file: "fragment.html", outcome: "skipped" });
  });

  it("does not follow symlinks", async () => {
    const outside = await mkdtemp(join(tmpdir(), "pages-analytics-outside-"));
    try {
      await writeFile(join(outside, "secret.html"), PAGE);
      await symlink(outside, join(root, "link"));
      const { files } = await injectDir(root, CONFIG);
      expect(files).toEqual([]);
      expect(await readFile(join(outside, "secret.html"), "utf8")).toBe(PAGE);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("fails clearly for a missing directory and for a file", async () => {
    await expect(injectDir(join(root, "nope"), CONFIG)).rejects.toThrow(/Directory not found/);
    await writeFile(join(root, "f.html"), PAGE);
    await expect(injectDir(join(root, "f.html"), CONFIG)).rejects.toThrow(/Not a directory/);
  });

  describe("consent", () => {
    const CONSENT_DEFAULT = 'gtag("consent","default"';

    async function setupSite() {
      await mkdir(join(root, "app/deep"), { recursive: true });
      await mkdir(join(root, "blog"), { recursive: true });
      for (const file of ["index.html", "app/index.html", "app/deep/page.html", "blog/index.html"]) {
        await writeFile(join(root, file), PAGE);
      }
    }
    const read = (file: string) => readFile(join(root, file), "utf8");

    it("gates every page with `consent`", async () => {
      await setupSite();
      await injectDir(root, { ...CONFIG, consent: true });
      for (const file of ["index.html", "app/index.html", "app/deep/page.html", "blog/index.html"]) {
        expect(await read(file)).toContain(CONSENT_DEFAULT);
      }
    });

    it("gates only pages matching `consentPages`", async () => {
      await setupSite();
      await injectDir(root, { ...CONFIG, consentPages: ["app/**"] });
      expect(await read("app/index.html")).toContain(CONSENT_DEFAULT);
      expect(await read("app/deep/page.html")).toContain(CONSENT_DEFAULT);
      // Everything else still gets analytics, just not gated.
      for (const file of ["index.html", "blog/index.html"]) {
        const html = await read(file);
        expect(html).toContain("G-ABC123XYZ9");
        expect(html).not.toContain(CONSENT_DEFAULT);
      }
    });

    it("narrows `consent` to `consentPages` when both are given", async () => {
      await setupSite();
      await injectDir(root, { ...CONFIG, consent: true, consentPages: ["blog/*"] });
      expect(await read("blog/index.html")).toContain(CONSENT_DEFAULT);
      expect(await read("index.html")).not.toContain(CONSENT_DEFAULT);
    });

    it.each([
      ["*.html", ["index.html"]],
      ["*/index.html", ["app/index.html", "blog/index.html"]],
      ["**/index.html", ["index.html", "app/index.html", "blog/index.html"]],
      ["app/*", ["app/index.html"]],
      ["app/**", ["app/index.html", "app/deep/page.html"]],
      ["app/deep/pag?.html", ["app/deep/page.html"]],
      ["./blog/**", ["blog/index.html"]],
      ["/blog/**", ["blog/index.html"]],
    ])("glob %j matches %j", async (glob, expected) => {
      await setupSite();
      await injectDir(root, { ...CONFIG, consentPages: [glob] });
      const gated: string[] = [];
      for (const file of ["index.html", "app/index.html", "app/deep/page.html", "blog/index.html"]) {
        if ((await read(file)).includes(CONSENT_DEFAULT)) gated.push(file);
      }
      expect(gated.sort()).toEqual([...expected].sort());
    });

    it("treats regex characters in a glob literally", async () => {
      await writeFile(join(root, "a+b.html"), PAGE);
      await writeFile(join(root, "aab.html"), PAGE);
      await injectDir(root, { ...CONFIG, consentPages: ["a+b.html"] });
      expect(await read("a+b.html")).toContain(CONSENT_DEFAULT);
      expect(await read("aab.html")).not.toContain(CONSENT_DEFAULT);
    });

    it("switches an already-injected page to the gated snippet on re-run", async () => {
      await writeFile(join(root, "index.html"), PAGE);
      await injectDir(root, CONFIG);
      const second = await injectDir(root, { ...CONFIG, consent: true });
      expect(second.counts.updated).toBe(1);
      const html = await read("index.html");
      expect(html).toContain(CONSENT_DEFAULT);
      expect(html.split(START_MARKER)).toHaveLength(2);
    });

    it("fails instead of shipping an ungated tracker for a provider without consent", async () => {
      await writeFile(join(root, "index.html"), PAGE);
      const plausible = { provider: "plausible", id: "example.com" };
      await expect(injectDir(root, { ...plausible, consent: true })).rejects.toThrow(
        /Consent mode is not supported for plausible/,
      );
      await expect(injectDir(root, { ...plausible, consentPages: ["app/**"] })).rejects.toThrow(
        /Consent mode is not supported/,
      );
      expect(await read("index.html")).toBe(PAGE);
    });
  });

  it("rejects an invalid id before touching any file", async () => {
    await writeFile(join(root, "index.html"), PAGE);
    await expect(injectDir(root, { provider: "ga4", id: "bad" })).rejects.toThrow(/Invalid ga4 ID/);
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
  });
});
