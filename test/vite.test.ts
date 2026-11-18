import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pagesAnalytics from "../src/vite.js";
import { START_MARKER } from "../src/inject.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pages-analytics-vite-"));
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><head><title>t</title></head><body><script type="module" src="/main.js"></script></body></html>',
  );
  await writeFile(join(root, "main.js"), "console.log('hi');");
  await mkdir(join(root, "other"));
  await writeFile(
    join(root, "other/page.html"),
    '<!doctype html><html><head></head><body><script type="module" src="/main.js"></script></body></html>',
  );
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function runBuild(plugin = pagesAnalytics()) {
  await build({
    root,
    configFile: false,
    logLevel: "silent",
    plugins: [plugin],
    build: {
      outDir: join(root, "dist"),
      emptyOutDir: true,
      rollupOptions: { input: [join(root, "index.html"), join(root, "other/page.html")] },
    },
  });
  return {
    index: await readFile(join(root, "dist/index.html"), "utf8"),
    other: await readFile(join(root, "dist/other/page.html"), "utf8"),
  };
}

describe("vite plugin (real build)", () => {
  it("injects into every html entry when ANALYTICS_ID is set", async () => {
    vi.stubEnv("ANALYTICS_ID", "G-ABC123XYZ9");
    const { index, other } = await runBuild();
    for (const html of [index, other]) {
      expect(html).toContain(START_MARKER);
      expect(html).toContain("googletagmanager.com/gtag/js?id=G-ABC123XYZ9");
      expect(html.split(START_MARKER)).toHaveLength(2);
    }
  });

  it("does nothing when no ID is set", async () => {
    vi.stubEnv("ANALYTICS_ID", "");
    const { index } = await runBuild();
    expect(index).not.toContain("gtag");
    expect(index).not.toContain(START_MARKER);
  });

  it("uses options over the environment", async () => {
    vi.stubEnv("ANALYTICS_ID", "G-ABC123XYZ9");
    const { index } = await runBuild(pagesAnalytics({ provider: "plausible", id: "example.com" }));
    expect(index).toContain("plausible.io/js/script.js");
    expect(index).not.toContain("G-ABC123XYZ9");
  });

  it("fails the build on an invalid ID", async () => {
    vi.stubEnv("ANALYTICS_ID", "not-a-real-id");
    await expect(runBuild()).rejects.toThrow(/Invalid ga4 ID/);
  });

  it("fails the build on an unknown provider", async () => {
    vi.stubEnv("ANALYTICS_ID", "G-ABC123XYZ9");
    vi.stubEnv("ANALYTICS_PROVIDER", "nope");
    await expect(runBuild()).rejects.toThrow(/Unknown provider/);
  });
});

describe("vite plugin (shape)", () => {
  it("only applies to builds, not the dev server", () => {
    expect(pagesAnalytics().apply).toBe("build");
  });
});
