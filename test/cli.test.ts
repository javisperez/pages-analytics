import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "../src/cli.js";

const PAGE = "<html><head></head><body></body></html>";

let root: string;
let logs: string[];
let errors: string[];
const out = {
  log: (m: string) => void logs.push(m),
  error: (m: string) => void errors.push(m),
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pages-analytics-cli-"));
  await writeFile(join(root, "index.html"), PAGE);
  logs = [];
  errors = [];
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("cli", () => {
  it("does nothing and exits 0 when no ID is set", async () => {
    expect(await main(["inject", root], {}, out)).toBe(0);
    expect(logs.join("\n")).toMatch(/skipping/);
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
  });

  it("treats an empty ID (unset CI variable) like a missing one", async () => {
    expect(await main(["inject", root], { ANALYTICS_ID: "  " }, out)).toBe(0);
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
  });

  it("fails with --strict when no ID is set", async () => {
    expect(await main(["inject", root, "--strict"], {}, out)).toBe(1);
  });

  it("injects using env vars", async () => {
    const env = { ANALYTICS_ID: "G-ABC123XYZ9" };
    expect(await main(["inject", root], env, out)).toBe(0);
    expect(await readFile(join(root, "index.html"), "utf8")).toContain("G-ABC123XYZ9");
    expect(logs.join("\n")).toMatch(/1 inserted/);
  });

  it("never prints the ID", async () => {
    await main(["inject", root], { ANALYTICS_ID: "G-ABC123XYZ9" }, out);
    expect([...logs, ...errors].join("\n")).not.toContain("G-ABC123XYZ9");
  });

  it("lets flags override env", async () => {
    const env = { ANALYTICS_ID: "G-ABC123XYZ9", ANALYTICS_PROVIDER: "ga4" };
    const args = ["inject", root, "--provider", "plausible", "--id", "example.com"];
    expect(await main(args, env, out)).toBe(0);
    const html = await readFile(join(root, "index.html"), "utf8");
    expect(html).toContain("plausible.io");
    expect(html).not.toContain("G-ABC123XYZ9");
  });

  describe("consent", () => {
    const ID = { ANALYTICS_ID: "G-ABC123XYZ9" };
    const gated = async () =>
      (await readFile(join(root, "index.html"), "utf8")).includes('gtag("consent","default"');

    it("is off by default", async () => {
      await main(["inject", root], ID, out);
      expect(await gated()).toBe(false);
    });

    it("turns on with --consent", async () => {
      expect(await main(["inject", root, "--consent"], ID, out)).toBe(0);
      expect(await gated()).toBe(true);
    });

    it('turns on with ANALYTICS_CONSENT=true and stays off for "false"', async () => {
      await main(["inject", root], { ...ID, ANALYTICS_CONSENT: "true" }, out);
      expect(await gated()).toBe(true);
      await writeFile(join(root, "index.html"), PAGE);
      await main(["inject", root], { ...ID, ANALYTICS_CONSENT: "false" }, out);
      expect(await gated()).toBe(false);
    });

    it("gates only matching pages with --consent-pages (repeatable)", async () => {
      await mkdir(join(root, "app"));
      await mkdir(join(root, "tools"));
      await writeFile(join(root, "app/index.html"), PAGE);
      await writeFile(join(root, "tools/index.html"), PAGE);
      const args = ["inject", root, "--consent-pages", "app/**", "--consent-pages", "tools/**"];
      expect(await main(args, ID, out)).toBe(0);
      expect(await readFile(join(root, "app/index.html"), "utf8")).toContain("consent");
      expect(await readFile(join(root, "tools/index.html"), "utf8")).toContain("consent");
      expect(await gated()).toBe(false);
    });

    it("reads ANALYTICS_CONSENT_PAGES as a comma-separated list", async () => {
      await mkdir(join(root, "app"));
      await writeFile(join(root, "app/index.html"), PAGE);
      await main(["inject", root], { ...ID, ANALYTICS_CONSENT_PAGES: " app/** , other/** " }, out);
      expect(await readFile(join(root, "app/index.html"), "utf8")).toContain("consent");
      expect(await gated()).toBe(false);
    });

    it("exits 1 for a provider without consent support", async () => {
      const args = ["inject", root, "--provider", "plausible", "--id", "example.com", "--consent"];
      expect(await main(args, {}, out)).toBe(1);
      expect(errors.join("\n")).toMatch(/Consent mode is not supported/);
      expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
    });
  });

  it("honors --dry-run", async () => {
    expect(await main(["inject", root, "--dry-run", "--id", "G-ABC123XYZ9"], {}, out)).toBe(0);
    expect(logs.join("\n")).toMatch(/dry run/);
    expect(await readFile(join(root, "index.html"), "utf8")).toBe(PAGE);
  });

  it("returns 1 for an invalid ID and unknown provider", async () => {
    expect(await main(["inject", root, "--id", "nope"], {}, out)).toBe(1);
    expect(await main(["inject", root, "--id", "x", "--provider", "zzz"], {}, out)).toBe(1);
    expect(errors.join("\n")).toMatch(/Invalid ga4 ID/);
    expect(errors.join("\n")).toMatch(/Unknown provider/);
  });

  it("returns 2 with usage for bad invocations", async () => {
    expect(await main([], {}, out)).toBe(2);
    expect(await main(["build", root], {}, out)).toBe(2);
    expect(await main(["inject"], {}, out)).toBe(2);
    expect(await main(["inject", root, "--wat"], {}, out)).toBe(2);
  });

  it("prints help and version", async () => {
    expect(await main(["--help"], {}, out)).toBe(0);
    expect(logs[0]).toMatch(/Usage/);
    expect(await main(["--version"], {}, out)).toBe(0);
    expect(logs[1]).toMatch(/^\d+\.\d+\.\d+/);
  });
});
