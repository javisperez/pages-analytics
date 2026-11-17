export interface ProviderOptions {
  /** Origin of a self-hosted instance, e.g. https://stats.example.com. */
  host?: string;
}

export interface Provider {
  readonly name: string;
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

const ga4: Provider = {
  name: "ga4",
  idHint: "a GA4 measurement ID such as G-XXXXXXXXXX",
  validateId: (id) => /^G-[A-Z0-9]{4,20}$/.test(id),
  snippet: (id) =>
    [
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
      `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${id}");</script>`,
    ].join("\n"),
};

const plausible: Provider = {
  name: "plausible",
  idHint: "the site domain registered in Plausible, such as example.com",
  validateId: (id) => DOMAIN_PATTERN.test(id),
  snippet: (id, { host }) =>
    `<script defer data-domain="${id}" src="${host ?? "https://plausible.io"}/js/script.js"></script>`,
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
