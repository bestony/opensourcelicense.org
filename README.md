# opensourcelicense.org

A decision workbench for open source licenses: a license library, an extreme-scenario matrix, a project license map, a rule-engine wizard, an AI advisor, and a dependency license check. The site is static (Astro) with one Cloudflare Worker for `/api/*`.

> The site gives general information, not legal advice.

## Architecture

```
data/                  source of truth (CC-BY-4.0, see data/LICENSE)
  licenses/            one YAML per license (slug = file name)
  matrices.yaml        scenario matrices (code, model) and their license columns
  scenarios/           A1..E6, one cell per matrix column
  projects/            real projects and their license timelines
  license-aliases.yaml licenses used by projects but not in the matrices
  rules/engine.yaml    rule engine weights (wizard, report, AI advisor)
  rules/compat.yaml    dependency license compatibility table
  texts/               official license texts (SPDX license list)
  i18n/<locale>/       ui.yaml, licenses/*.yaml, scenarios/*.yaml
src/domain/            pure TypeScript: schema, catalog, integrity, engine, radar,
                       profile codec, compat, projects, deps parsers, license detection
src/lib/               loader, i18n helpers, logger, deps.dev client
src/pages/[...lang]/   localized pages (English has no prefix)
src/components/        Astro components (site/) and React islands (islands/)
worker/                Cloudflare Worker: /api/chat (Workers AI) and /api/deps (deps.dev proxy)
scripts/               validate, sync bot, translation drafts, PR license check, advisor smoke test
tests/                 vitest, including the 52-case engine eval set (tests/eval)
```

Key rules:

- The rule engine decides; the AI advisor only extracts the profile, asks questions and explains the engine result.
- `pnpm validate` (also run before every build) fails on a missing scenario cell, a dangling reference, a license with fewer than 5 projects, or missing English text. Translations fall back to English with a visible badge; a translation made from older English text is flagged as stale.
- Verdict symbols (✓ ◐ ✗ —) never change between languages.

## Commands

| Command | Action |
| --- | --- |
| `pnpm dev` / `astro dev --background` | Dev server at `localhost:4321` (no `/api`) |
| `pnpm build` | Build the site to `dist/` and the Pagefind search index |
| `pnpm cf:preview` | Build and run the Worker locally with `wrangler dev` (uses the remote Workers AI binding) |
| `pnpm validate [--strict]` | Data integrity check (`--strict` fails on `tbd` cells: release gate) |
| `pnpm check` | `astro check` and the Worker type check |
| `pnpm test` | Unit tests and the engine eval set |
| `pnpm sync [--dry-run] [--only=a,b]` | Weekly GitHub / Hugging Face license sync (opens a PR in CI) |
| `pnpm translate [--locale=ja] [--kind=ui,licenses,scenarios] [--dry-run]` | Machine translation drafts via Workers AI (`reviewed: false`) |
| `pnpm license-check --base=<sha>` | PR check: LICENSE changes and licenses of added dependencies |
| `pnpm advisor:smoke [baseUrl] "<message>"` | Drive the AI advisor loop against a running Worker |

## Deployment (Cloudflare Workers)

`wrangler.jsonc` serves `dist/` as static assets and runs the Worker only for `/api/*`.

- Workers AI binding `AI`; model from `ADVISOR_MODEL` (default `@cf/meta/llama-3.1-8b-instruct-fp8-fast`).
- Secrets: `wrangler secret put TURNSTILE_SECRET` and `SESSION_SECRET`. Build variable: `PUBLIC_TURNSTILE_SITE_KEY`. Without them, bot protection is off (logged as a warning).
- Rate limiting: create a KV namespace (`wrangler kv namespace create RATE_LIMIT`) and bind it as `RATE_LIMIT`; `DAILY_LIMIT` sets model turns per client per day.
- GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (deploy); `CLOUDFLARE_AI_TOKEN` (translation drafts).

## Licensing

Code: AGPL-3.0-or-later (`LICENSE`). Data in `data/`: CC-BY-4.0 (`data/LICENSE`). See `REUSE.toml`. Cite as "Data from opensourcelicense.org, CC-BY-4.0".

## Release gates (from the product design)

- Every matrix cell (882 cells across 60 licenses) reviewed by a lawyer; `pnpm validate --strict` must pass.
- Every license change in `data/projects` links to an official announcement; entries with `needsReview: true` are checked by a human.
- Engine eval agreement with expert expectations ≥ 90% (`tests/engine-eval.test.ts`).
- Machine-translated files (`reviewed: false`) reviewed by native speakers.

## Limits to watch

- The static build has about 18,000 files. The Cloudflare Workers free plan allows 20,000 static assets per deployment (paid plans allow more). Adding many more licenses or languages needs a paid plan or fewer generated pages (for example, dropping per-language scenario-cell pages).
