/**
 * Browser-side event tracking that works with whichever provider pages-analytics injected.
 *
 * - Browser safe: no Node imports, no dependencies.
 * - A silent no-op when nothing was injected (dev server, forks, local builds), so call sites
 *   never need an "is analytics on?" check.
 * - Never throws: a broken analytics call must not break the app.
 */

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
  gtag?: (command: "event", name: string, params?: EventParams) => void;
  plausible?: (name: string, options?: { props?: EventParams }) => void;
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

/** Create a tracker whose event names and parameters are checked against `Events`. */
export function createTracker<Events extends EventMap<Events>>(): TrackFn<Events> {
  return ((name: string, params?: EventParams) => send(name, params)) as TrackFn<Events>;
}

/** Untyped tracker: any event name, optional params. Prefer `createTracker<Events>()`. */
export const track: TrackFn<Record<string, EventParams | undefined>> = createTracker();
