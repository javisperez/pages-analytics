import type { Plugin } from "vite";
import {
  createSnippetPicker,
  parseFlag,
  parseList,
  type InjectConfig,
} from "./inject-dir.js";
import { injectSnippet } from "./inject.js";

export interface PagesAnalyticsOptions {
  /** Provider name. Falls back to $ANALYTICS_PROVIDER, then "ga4". */
  provider?: string;
  /** Measurement ID / site domain. Falls back to $ANALYTICS_ID. */
  id?: string;
  /** Origin of a self-hosted instance. Falls back to $ANALYTICS_HOST. */
  host?: string;
  /** Collect nothing until the page grants consent (ga4 only). Falls back to $ANALYTICS_CONSENT. */
  consent?: boolean;
  /** Only gate pages matching these globs, e.g. `["app/**"]`. Falls back to $ANALYTICS_CONSENT_PAGES. */
  consentPages?: string[];
}

function resolveConfig(options: PagesAnalyticsOptions): InjectConfig | undefined {
  const env = process.env;
  const id = (options.id ?? env.ANALYTICS_ID ?? "").trim();
  if (!id) return undefined;
  return {
    provider: (options.provider ?? env.ANALYTICS_PROVIDER ?? "ga4").trim(),
    id,
    host: (options.host ?? env.ANALYTICS_HOST ?? "").trim() || undefined,
    consent: options.consent ?? parseFlag(env.ANALYTICS_CONSENT),
    consentPages: options.consentPages ?? parseList(env.ANALYTICS_CONSENT_PAGES),
  };
}

/**
 * Vite plugin that adds an analytics snippet to every built HTML page.
 *
 * - Only runs for `vite build`, never in the dev server.
 * - With no ID set (`ANALYTICS_ID`) it does nothing, so forks and local builds stay untracked.
 * - An invalid ID or host fails the build, so a typo never ships silently.
 */
export default function pagesAnalytics(options: PagesAnalyticsOptions = {}): Plugin {
  let pickSnippet: ((file: string) => string) | undefined;

  return {
    name: "pages-analytics",
    apply: "build",
    configResolved(config) {
      const resolved = resolveConfig(options);
      if (!resolved) {
        config.logger.info("pages-analytics: no ID set (ANALYTICS_ID), skipping.");
        return;
      }
      pickSnippet = createSnippetPicker(resolved); // throws on a bad ID/host/provider/consent
    },
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!pickSnippet) return html;
        // ctx.path is the page's URL path, e.g. "/app/index.html"; globs are site-root relative.
        return injectSnippet(html, pickSnippet(ctx.path.replace(/^\//, ""))).html;
      },
    },
  };
}
