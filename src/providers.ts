import { CONSENT_STORAGE_KEY } from "./consent.js";

export interface ProviderOptions {
  /** Origin of a self-hosted instance, e.g. https://stats.example.com. */
  host?: string;
  /** Emit the consent-gated variant: nothing is collected until `setConsent(true)` is called. */
  consent?: boolean;
}

export interface Provider {
  readonly name: string;
  /** Whether `snippet` honors `options.consent`. Requesting consent from a provider without it is an error. */
  readonly supportsConsent?: boolean;
  /** Human-readable description of the expected ID, used in error messages. */
  readonly idHint: string;
  /** Strict check. IDs end up inside HTML, so anything that doesn't match is rejected. */
  validateId(id: string): boolean;
  snippet(id: string, options: ProviderOptions): string;
}

const HOST_PATTERN = /^https:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/i;
const DOMAIN_PATTERN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

export function validateHost(host: string): boolean {
  return HOST_PATTERN.test(host);
}

// Google Consent Mode v2. Everything starts denied; only analytics storage is ever granted
// (this tool does not do advertising). The saved choice is replayed synchronously, before
// `config`, so returning visitors who already accepted are not treated as denied on every page.
// `wait_for_update` gives an asynchronous consent banner a moment to answer before the first hit.
const GA4_CONSENT_DEFAULT =
  `gtag("consent","default",{ad_storage:"denied",analytics_storage:"denied",ad_user_data:"denied",ad_personalization:"denied",wait_for_update:500});` +
  `try{if(localStorage.getItem("${CONSENT_STORAGE_KEY}")==="granted")gtag("consent","update",{analytics_storage:"granted"})}catch(e){}`;

const ga4: Provider = {
  name: "ga4",
  supportsConsent: true,
  idHint: "a GA4 measurement ID such as G-XXXXXXXXXX",
  validateId: (id) => /^G-[A-Z0-9]{4,20}$/.test(id),
  snippet: (id, { consent }) =>
    [
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
      // Consent defaults must be queued before `config`, or the first hit goes out ungated.
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}${consent ? GA4_CONSENT_DEFAULT : ""}gtag("js",new Date());gtag("config","${id}");</script>`,
    ].join("\n"),
};

const plausible: Provider = {
  name: "plausible",
  idHint: "the site domain registered in Plausible, such as example.com",
  validateId: (id) => DOMAIN_PATTERN.test(id),
  // The inline stub queues track() calls made before the deferred script has loaded.
  snippet: (id, { host }) =>
    [
      `<script>window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}</script>`,
      `<script defer data-domain="${id}" src="${host ?? "https://plausible.io"}/js/script.js"></script>`,
    ].join("\n"),
};

export const providers: Readonly<Record<string, Provider>> = {
  ga4,
  plausible,
};

export function getProvider(name: string): Provider {
  const provider = providers[name];
  if (!provider) {
    throw new Error(
      `Unknown provider "${name}". Available: ${Object.keys(providers).join(", ")}`,
    );
  }
  return provider;
}
