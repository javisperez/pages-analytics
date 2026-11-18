# pages-analytics

Inject an analytics snippet into your **built** static site at deploy time, using an ID from your CI environment instead of your source code.

Works with anything that outputs HTML (Vite, Astro, Jekyll, plain files) and is aimed at GitHub Pages deploys. Zero runtime dependencies.

## Why

- **Forks, clones and local builds are never tracked.** If the ID isn't set, nothing is injected, so contributors' dev servers and forked deploys don't pollute your stats.
- **No tracking code in your repo.** Your source stays free of snippets and IDs; the deploy adds them.
- **One setup for every project.** Same command, same environment variable.

> **Heads up:** an analytics ID is *not* a secret. A GA4 measurement ID or a Plausible domain is visible in the HTML of the deployed site by design. This tool keeps it out of your source tree, not out of the public page. Don't use it to hide anything sensitive.

## Quick start

### Vite

```bash
pnpm add -D pages-analytics
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import pagesAnalytics from "pages-analytics/vite";

export default defineConfig({
  plugins: [pagesAnalytics()],
});
```

Then give your deploy's build step the ID. That is the only workflow change:

```yaml
- run: pnpm build
  env:
    ANALYTICS_ID: ${{ secrets.ANALYTICS_ID }}   # or vars.ANALYTICS_ID
```

The plugin only runs for `vite build` (never the dev server), covers every HTML entry, does nothing without an ID, and **fails the build** on an invalid ID, host or provider so a typo never ships silently. Options (`provider`, `id`, `host`) override the environment variables.

### Any other tool

```bash
npx pages-analytics inject dist
```

with the ID in your environment:

```bash
ANALYTICS_ID=G-XXXXXXXXXX npx pages-analytics inject dist
```

Run it **after** your build and **before** you upload the output.

## Usage

```
pages-analytics inject <dir> [options]

  --provider <name>   ga4 | plausible   (default: ga4, or $ANALYTICS_PROVIDER)
  --id <id>           Site/measurement ID (default: $ANALYTICS_ID)
  --host <origin>     Self-hosted instance origin (or $ANALYTICS_HOST)
  --dry-run           Show what would change without writing files
  --strict            Fail instead of skipping when no ID is set
```

| Provider | `ANALYTICS_ID` | Notes |
|---|---|---|
| `ga4` | Measurement ID, e.g. `G-XXXXXXXXXX` | Google Analytics 4 |
| `plausible` | Your site domain, e.g. `example.com` | `--host https://stats.example.com` for self-hosted |

Behavior:

- Recursively finds `.html` / `.htm` files, skipping `node_modules` and `.git`, and does not follow symlinks.
- Inserts the snippet just before `</head>` (or right after `<head>`). Pages with no `<head>` (like redirect fragments) are left alone and reported as skipped.
- **Idempotent.** The snippet is wrapped in `<!-- pages-analytics:start -->` / `<!-- pages-analytics:end -->` markers. Running again replaces the block instead of duplicating it, so changing the ID works too.
- **No ID, no change.** An unset or empty ID prints a note and exits 0 (use `--strict` to fail instead).
- **Strict validation.** The ID and host are checked against a strict pattern before anything is written, so a bad CI variable can't inject arbitrary markup. The ID is never printed in logs.

## Tracking events

`pages-analytics/track` sends custom events through whichever provider was injected (`gtag` for GA4, `plausible` for Plausible). It is browser-safe, has no dependencies, and **does nothing when no snippet was injected** (dev server, forks, local builds), so there is no "is analytics on?" check to write. It never throws.

```ts
import { createTracker } from "pages-analytics/track";

interface Events {
  palette_exported: { format: "css" | "tailwind-v4" | "json" };
  app_opened: undefined; // events without params
}

export const track = createTracker<Events>();

track("palette_exported", { format: "css" }); // checked at compile time
track("palette_exportd", { format: "css" });  // type error
```

There is also an untyped `track(name, params?)` if you don't want an event map.

Notes:

- Params are `string | number | boolean` values.
- **GA4:** event params only show up in reports after you register them as custom dimensions (Admin → Custom definitions). Event names max 40 characters (letters, digits, underscores), param values max 100.
- **Plausible:** params are sent as custom props. The injected snippet includes the small queue stub Plausible recommends, so events fired before its script loads are not lost.
- Use `debug_mode` / GA4 DebugView to check events while developing.

## GitHub Pages workflow

Store the ID as a repository **variable** (Settings → Secrets and variables → Actions → Variables) named `ANALYTICS_ID`. A full example for a Vite project is in [`examples/deploy-pages.yml`](examples/deploy-pages.yml). The important part:

```yaml
- run: pnpm build
- run: npx pages-analytics inject dist
  env:
    ANALYTICS_ID: ${{ vars.ANALYTICS_ID }}
```

A fork deploying to its own Pages won't have that variable, so it ships without tracking.

### As an action

```yaml
- uses: javisperez/pages-analytics@v0
  with:
    dir: dist
    id: ${{ vars.ANALYTICS_ID }}
```

> The action runs the matching `pages-analytics` release from npm (`npx pages-analytics@<version>`), so it needs no build step. Pin a different release with the `version` input.

## Programmatic use

```ts
import { injectDir } from "pages-analytics";

await injectDir("dist", { provider: "ga4", id: process.env.ANALYTICS_ID! });
```

## Privacy and consent

This tool only inserts the provider's standard snippet. Whether you need a consent banner depends on the provider and where your visitors are. GA4 generally needs consent in the EU; cookieless options such as Plausible generally don't. Check the rules that apply to you. A consent-gated mode is on the roadmap.

## Roadmap

- [x] Publish to npm; the Action runs the published package
- [ ] More providers: Umami, GoatCounter, Cloudflare Web Analytics
- [ ] Consent-gated loading
- [x] Tiny `track()` helper that no-ops when no analytics is injected
- [ ] Support for a custom snippet file

## Development

```bash
pnpm install
pnpm test
pnpm build
node dist/bin.js inject some-folder --id G-TEST123456 --dry-run
```

## License

MIT
