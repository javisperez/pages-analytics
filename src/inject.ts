export const START_MARKER = "<!-- pages-analytics:start -->";
export const END_MARKER = "<!-- pages-analytics:end -->";

export type InjectOutcome = "inserted" | "updated" | "unchanged" | "skipped";

export interface InjectResult {
  html: string;
  outcome: InjectOutcome;
}

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const EXISTING_BLOCK = new RegExp(
  `${escapeRegExp(START_MARKER)}[\\s\\S]*?${escapeRegExp(END_MARKER)}`,
);
const HEAD_CLOSE = /<\/head\s*>/i;
// `(?=[\s>])` keeps <header> from matching.
const HEAD_OPEN = /<head(?=[\s>])[^>]*>/i;

/**
 * Put `snippet` in the <head> of `html`.
 *
 * - Safe to run repeatedly: an existing marked block is replaced in place.
 * - Documents without a <head> are left untouched and reported as "skipped".
 */
export function injectSnippet(html: string, snippet: string): InjectResult {
  const block = `${START_MARKER}\n${snippet}\n${END_MARKER}`;

  if (EXISTING_BLOCK.test(html)) {
    // Function replacer so `$&`-style sequences in the snippet are never interpreted.
    const next = html.replace(EXISTING_BLOCK, () => block);
    return { html: next, outcome: next === html ? "unchanged" : "updated" };
  }

  const close = HEAD_CLOSE.exec(html);
  if (close) {
    const next = `${html.slice(0, close.index)}${block}\n${html.slice(close.index)}`;
    return { html: next, outcome: "inserted" };
  }

  const open = HEAD_OPEN.exec(html);
  if (open) {
    const end = open.index + open[0].length;
    const next = `${html.slice(0, end)}\n${block}${html.slice(end)}`;
    return { html: next, outcome: "inserted" };
  }

  return { html, outcome: "skipped" };
}
