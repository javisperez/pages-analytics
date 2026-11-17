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

  it("rejects an invalid id before touching any file", async () => {
    await writeFile(join(root, "index.html"), PAGE);
    await expect(injectDir(root, { provider: "ga4", id: "bad" })).rejects.toThrow(/Invalid ga4 ID/);
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
  });
});
