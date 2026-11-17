import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { injectSnippet, type InjectOutcome } from "./inject.js";
import { getProvider, validateHost } from "./providers.js";

export interface InjectConfig {
  provider: string;
  id: string;
  host?: string;
}

export interface InjectDirOptions {
  /** Report what would change without writing any file. */
  dryRun?: boolean;
}

export interface FileResult {
  /** Path relative to the injected directory. */
  file: string;
  outcome: InjectOutcome;
}

export interface InjectDirResult {
  files: FileResult[];
  counts: Record<InjectOutcome, number>;
}

const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
const HTML_FILE = /\.html?$/i;

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* walk(path);
    } else if (entry.isFile() && HTML_FILE.test(entry.name)) {
      yield path;
    }
  }
}

/** Validate the config and build the snippet. Throws a readable Error on bad input. */
export function buildSnippet(config: InjectConfig): string {
  const provider = getProvider(config.provider);
  if (!provider.validateId(config.id)) {
    throw new Error(`Invalid ${provider.name} ID: expected ${provider.idHint}.`);
  }
  if (config.host !== undefined && !validateHost(config.host)) {
    throw new Error(
      "Invalid host: expected an https origin without a path, e.g. https://stats.example.com",
    );
  }
  return provider.snippet(config.id, { host: config.host });
}

export async function injectDir(
  dir: string,
  config: InjectConfig,
  options: InjectDirOptions = {},
): Promise<InjectDirResult> {
  const snippet = buildSnippet(config);

  let info;
  try {
    info = await stat(dir);
  } catch {
    throw new Error(`Directory not found: ${dir}`);
  }
  if (!info.isDirectory()) throw new Error(`Not a directory: ${dir}`);

  const files: FileResult[] = [];
  const counts: Record<InjectOutcome, number> = {
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
  };

  for await (const path of walk(dir)) {
    const original = await readFile(path, "utf8");
    const { html, outcome } = injectSnippet(original, snippet);
    if ((outcome === "inserted" || outcome === "updated") && !options.dryRun) {
      await writeFile(path, html, "utf8");
    }
    counts[outcome] += 1;
    files.push({ file: relative(dir, path), outcome });
  }

  return { files, counts };
}
