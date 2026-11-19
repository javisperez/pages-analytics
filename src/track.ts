/**
 * Browser-side event tracking that works with whichever provider pages-analytics injected.
 *
 * - Browser safe: no Node imports, no dependencies.
 * - A silent no-op when nothing was injected (dev server, forks, local builds), so call sites
 *   never need an "is analytics on?" check.
 * - Never throws: a broken analytics call must not break the app.
 */

import { CONSENT_STORAGE_KEY, type ConsentState } from "./consent.js";

export type { ConsentState } from "./consent.js";

/** Event parameters. Primitive values only, which every provider accepts. */
export type EventParams = Record<string, string | number | boolean>;

/**
 * Maps event names to their parameters. Use `undefined` for events that take none:
 *
 *     interface Events {
 *       palette_exported: { format: "css" | "json" };
 *       app_opened: undefined;
 *     }
 */
export type EventMap<Events> = { [Name in keyof Events]: EventParams | undefined };

export type TrackFn<Events extends EventMap<Events>> = <Name extends keyof Events & string>(
  name: Name,
  ...params: undefined extends Events[Name] ? [params?: Events[Name]] : [params: Events[Name]]
) => void;

interface TrackerWindow {
  gtag?: (...args: unknown[]) => void;
  plausible?: (name: string, options?: { props?: EventParams }) => void;
  localStorage?: Pick<Storage, "getItem" | "setItem">;
}

function send(name: string, params: EventParams | undefined): void {
  if (typeof window === "undefined") return;
  const w = window as TrackerWindow;
  try {
    if (typeof w.gtag === "function") w.gtag("event", name, params);
    if (typeof w.plausible === "function") {
      w.plausible(name, params ? { props: params } : undefined);
    }
  } catch {
    // Analytics must never break the app.
  }
}

/**
 * Record the visitor's consent choice. Call it from your consent banner.
 *
 * Only meaningful for pages built with consent mode (`--consent` / `--consent-pages`), where
 * nothing is collected until this is called with `true`. The choice is remembered, so later
 * page loads start out granted without the banner. Pass `false` to withdraw consent.
 *
 * Like `track`, it does nothing when no snippet was injected and never throws.
 */
export function setConsent(granted: boolean): void {
  if (typeof window === "undefined") return;
  const w = window as TrackerWindow;
  const state: ConsentState = granted ? "granted" : "denied";
  try {
    if (typeof w.gtag !== "function") return;
    w.gtag("consent", "update", { analytics_storage: state });
  } catch {
    // Analytics must never break the app.
  }
  try {
    w.localStorage?.setItem(CONSENT_STORAGE_KEY, state);
  } catch {
    // Storage can be blocked (private mode, disabled cookies); the choice then lasts one page view.
  }
}

/**
 * The visitor's saved choice, or `undefined` if they haven't made one yet. Use it to decide
 * whether to show your banner.
 */
export function getConsent(): ConsentState | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = (window as TrackerWindow).localStorage?.getItem(CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Create a tracker whose event names and parameters are checked against `Events`. */
export function createTracker<Events extends EventMap<Events>>(): TrackFn<Events> {
  return ((name: string, params?: EventParams) => send(name, params)) as TrackFn<Events>;
}

/** Untyped tracker: any event name, optional params. Prefer `createTracker<Events>()`. */
export const track: TrackFn<Record<string, EventParams | undefined>> = createTracker();
