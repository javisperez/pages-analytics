import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { injectDir } from "./inject-dir.js";
import { providers } from "./providers.js";

export interface Output {
  log(message: string): void;
  error(message: string): void;
}

const HELP = `pages-analytics: inject an analytics snippet into a built static site

Usage
  pages-analytics inject <dir> [options]

Options
  --provider <name>   ${Object.keys(providers).join(" | ")} (default: ga4, or $ANALYTICS_PROVIDER)
  --id <id>           Site/measurement ID (default: $ANALYTICS_ID)
  --host <origin>     Self-hosted instance origin, e.g. https://stats.example.com (or $ANALYTICS_HOST)
  --dry-run           Show what would change without writing files
  --strict            Fail instead of skipping when no ID is set
  -v, --version
  -h, --help

If no ID is set the command does nothing and exits 0, so forks and local
builds are never tracked.`;

function readVersion(): string {
  const require = createRequire(import.meta.url);
  return (require("../package.json") as { version: string }).version;
}

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  out: Output = console,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        provider: { type: "string" },
        id: { type: "string" },
        host: { type: "string" },
        "dry-run": { type: "boolean" },
        strict: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (error) {
    out.error(`pages-analytics: ${(error as Error).message}`);
    return 2;
  }

  const { values, positionals } = parsed;

  if (values.help) {
    out.log(HELP);
    return 0;
  }
  if (values.version) {
    out.log(readVersion());
    return 0;
  }

  const [command, dir, ...extra] = positionals;
  if (command !== "inject" || !dir || extra.length > 0) {
    out.error(HELP);
    return 2;
  }

  const id = (values.id ?? env.ANALYTICS_ID ?? "").trim();
  if (!id) {
    out.log("pages-analytics: no ID set (ANALYTICS_ID), skipping.");
    return values.strict ? 1 : 0;
  }

  const provider = (values.provider ?? env.ANALYTICS_PROVIDER ?? "ga4").trim();
  const host = (values.host ?? env.ANALYTICS_HOST ?? "").trim() || undefined;

  try {
    const { files, counts } = await injectDir(
      dir,
      { provider, id, host },
      { dryRun: values["dry-run"] },
    );
    const prefix = values["dry-run"] ? "pages-analytics (dry run)" : "pages-analytics";
    out.log(
      `${prefix}: ${provider}: ${counts.inserted} inserted, ${counts.updated} updated, ` +
        `${counts.unchanged} unchanged, ${counts.skipped} skipped in ${dir}`,
    );
    for (const { file, outcome } of files) {
      if (outcome === "skipped") out.log(`  skipped ${file} (no <head> found)`);
    }
    return 0;
  } catch (error) {
    out.error(`pages-analytics: ${(error as Error).message}`);
    return 1;
  }
}
