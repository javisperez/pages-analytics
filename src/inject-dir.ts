import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { injectSnippet, type InjectOutcome } from "./inject.js";
import { getProvider, validateHost } from "./providers.js";

export interface InjectConfig {
  provider: string;
  id: string;
  host?: string;
  /**
   * Gate collection behind consent on every page: nothing is collected until the page calls
   * `setConsent(true)` from `pages-analytics/track`. GA4 only for now.
   */
  consent?: boolean;
  /**
   * Gate only the pages matching these globs (relative to the injected directory, e.g.
   * `app/**`). Other pages get the regular snippet. Implies `consent`.
   * `*` matches within a path segment, `**` across segments, `?` one character.
   */
  consentPages?: string[];
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

/** Parse an on/off environment variable. Anything but true/1/yes/on is off. */
export function parseFlag(value: string | undefined): boolean {
  return /^(true|1|yes|on)$/i.test((value ?? "").trim());
}

/** Split a comma-separated environment variable, dropping blanks. */
export function parseList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Compile a path glob: `*` within a segment, `**` across segments, `?` one character. */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i]!;
    if (char === "*") {
      if (glob[i + 1] === "*") {
        i += 1;
        if (glob[i + 1] === "/") {
          i += 1;
          source += "(?:.*/)?"; // `**/` also matches zero directories
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

/**
 * Validate the config and return a function that picks the snippet for a page, given its path
 * relative to the site root (e.g. `app/index.html`). Throws a readable Error on bad input.
 */
export function createSnippetPicker(config: InjectConfig): (file: string) => string {
  const provider = getProvider(config.provider);
  if (!provider.validateId(config.id)) {
    throw new Error(`Invalid ${provider.name} ID: expected ${provider.idHint}.`);
  }
  if (config.host !== undefined && !validateHost(config.host)) {
    throw new Error(
      "Invalid host: expected an https origin without a path, e.g. https://stats.example.com",
    );
  }

  const patterns = (config.consentPages ?? []).map((glob) => globToRegExp(glob.replace(/^\.?\//, "")));
  const gated = config.consent === true || patterns.length > 0;
  if (gated && !provider.supportsConsent) {
    // Fail rather than quietly ship a tracker that ignores the request for consent.
    throw new Error(`Consent mode is not supported for ${provider.name} yet.`);
  }

  const plain = provider.snippet(config.id, { host: config.host });
  if (!gated) return () => plain;
  const withConsent = provider.snippet(config.id, { host: config.host, consent: true });
  if (patterns.length === 0) return () => withConsent;
  return (file) => (patterns.some((pattern) => pattern.test(file)) ? withConsent : plain);
}

/**
 * Validate the config and build one snippet for every page. Throws a readable Error on bad input.
 * With `consentPages` set, use `createSnippetPicker` to get the per-page choice.
 */
export function buildSnippet(config: InjectConfig): string {
  return createSnippetPicker({ ...config, consentPages: undefined })("");
}

export async function injectDir(
  dir: string,
  config: InjectConfig,
  options: InjectDirOptions = {},
): Promise<InjectDirResult> {
  const pickSnippet = createSnippetPicker(config);

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
    const file = relative(dir, path).split(sep).join("/");
    const original = await readFile(path, "utf8");
    const { html, outcome } = injectSnippet(original, pickSnippet(file));
    if ((outcome === "inserted" || outcome === "updated") && !options.dryRun) {
      await writeFile(path, html, "utf8");
    }
    counts[outcome] += 1;
    files.push({ file, outcome });
  }

  return { files, counts };
}
