# pages-analytics

Inject an analytics snippet into your **built** static site at deploy time, using an ID from your CI environment instead of your source code.

Works with anything that outputs HTML (Vite, Astro, Jekyll, plain files) and is aimed at GitHub Pages deploys. Zero runtime dependencies.

## Why

- **Forks, clones and local builds are never tracked.** If the ID isn't set, nothing is injected, so contributors' dev servers and forked deploys don't pollute your stats.
- **No tracking code in your repo.** Your source stays free of snippets and IDs; the deploy adds them.
- **One setup for every project.** Same command, same environment variable.

> **Heads up:** an analytics ID is *not* a secret. A GA4 measurement ID or a Plausible domain is visible in the HTML of the deployed site by design. This tool keeps it out of your source tree, not out of the public page. Don't use it to hide anything sensitive.

## Quick start

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

> The action runs the compiled `dist/` from the tagged release, so release tags must include the built `dist/`. This is not set up yet (see Roadmap); until then use the `npx` form.

## Programmatic use

```ts
import { injectDir } from "pages-analytics";

await injectDir("dist", { provider: "ga4", id: process.env.ANALYTICS_ID! });
```

## Privacy and consent

This tool only inserts the provider's standard snippet. Whether you need a consent banner depends on the provider and where your visitors are. GA4 generally needs consent in the EU; cookieless options such as Plausible generally don't. Check the rules that apply to you. A consent-gated mode is on the roadmap.

## Roadmap

- [ ] Publish to npm and set up release tags that include `dist/` for the Action
- [ ] More providers: Umami, GoatCounter, Cloudflare Web Analytics
- [ ] Consent-gated loading
- [ ] Optional tiny `track(name)` helper that no-ops when no analytics is injected
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
