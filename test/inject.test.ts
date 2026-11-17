import { describe, expect, it } from "vitest";
import { END_MARKER, START_MARKER, injectSnippet } from "../src/inject.js";

const SNIPPET = '<script src="https://example.com/a.js"></script>';
const PAGE = "<!doctype html><html><head><title>x</title></head><body>hi</body></html>";

describe("injectSnippet", () => {
  it("inserts the block before </head>", () => {
    const { html, outcome } = injectSnippet(PAGE, SNIPPET);
    expect(outcome).toBe("inserted");
    expect(html).toContain(`${START_MARKER}\n${SNIPPET}\n${END_MARKER}\n</head>`);
    expect(html.indexOf(START_MARKER)).toBeGreaterThan(html.indexOf("<title>"));
  });

  it("matches </HEAD> case-insensitively", () => {
    const { html, outcome } = injectSnippet("<HEAD></HEAD><body></body>", SNIPPET);
    expect(outcome).toBe("inserted");
    expect(html).toContain(START_MARKER);
  });

  it("is idempotent", () => {
    const first = injectSnippet(PAGE, SNIPPET);
    const second = injectSnippet(first.html, SNIPPET);
    expect(second.outcome).toBe("unchanged");
    expect(second.html).toBe(first.html);
    expect(second.html.split(START_MARKER)).toHaveLength(2);
  });

  it("replaces an existing block when the snippet changes", () => {
    const first = injectSnippet(PAGE, SNIPPET);
    const second = injectSnippet(first.html, "<script>new()</script>");
    expect(second.outcome).toBe("updated");
    expect(second.html).toContain("new()");
    expect(second.html).not.toContain("a.js");
    expect(second.html.split(START_MARKER)).toHaveLength(2);
  });

  it("does not interpret $ sequences in the snippet", () => {
    const first = injectSnippet(PAGE, "<script>1</script>");
    const { html } = injectSnippet(first.html, "<script>'$&$1$$'</script>");
    expect(html).toContain("<script>'$&$1$$'</script>");
  });

  it("falls back to right after <head> when there is no </head>", () => {
    const { html, outcome } = injectSnippet('<html><head lang="en"><meta charset="utf-8"><body>', SNIPPET);
    expect(outcome).toBe("inserted");
    expect(html.indexOf(START_MARKER)).toBeGreaterThan(html.indexOf('<head lang="en">'));
    expect(html.indexOf(START_MARKER)).toBeLessThan(html.indexOf("<meta"));
  });

  it("does not treat <header> as <head>", () => {
    const input = "<html><body><header>hello</header></body></html>";
    const { html, outcome } = injectSnippet(input, SNIPPET);
    expect(outcome).toBe("skipped");
    expect(html).toBe(input);
  });

  it("skips fragments that have no head", () => {
    const { html, outcome } = injectSnippet("<p>redirecting</p>", SNIPPET);
    expect(outcome).toBe("skipped");
    expect(html).toBe("<p>redirecting</p>");
  });
});
