/**
 * Shared between the injected snippet (build time) and the browser helpers in `track.ts`.
 * Pure constants and types only: no Node imports, safe to bundle in the browser.
 */

/** localStorage key holding the visitor's last choice. */
export const CONSENT_STORAGE_KEY = "pages-analytics:consent";

export type ConsentState = "granted" | "denied";
