# Repository Guidelines

## Project Structure & Module Organization
Source lives at the repo root. `scrape.js` is the scraper entry point, `test-fetch.js` replays a single page for regression checks, and `scripts/` holds maintenance utilities such as `update-readme.js` (refreshes dataset stats) and `test-scrape.js` (manual smoke probes). Generated artifacts land in `out/` (`jobs.jsonl`, `jobs.csv`, `index.json`) and are committed so downstream consumers can pull the dataset without scraping. Keep auxiliary assets (docs, experiments) in clearly named folders under the root to avoid polluting the release surface.

## Build, Test, and Development Commands
- `npm ci` — install the exact dependency tree defined in `package-lock.json`.
- `npm run fetch:today` — scrape the latest board page(s) with a short delay; fastest way to validate scraper changes.
- `npm run fetch:all` / `npm run fetch:all:365` — backfill historical roles up to 180 or 365 days; expect longer runtimes.
- `npm run test:fetch` — execute `test-fetch.js`, which fetches a sample source page and asserts selector expectations.
- `npm run readme` — invoke `scripts/update-readme.js` to rewrite the dataset stats block in `README.md`.

## Coding Style & Naming Conventions
The project is pure ESM (`type: "module"`), so prefer `import`/`export` and top-level `await` patterns. Follow the existing two-space indentation, double-quoted strings, and descriptive camelCase identifiers (`parsePostedAgeDays`, `stableIdFromJobUrl`). Keep scraper helpers idempotent, avoid side effects inside parsing loops, and log actionable errors instead of raw objects. Configuration flags follow `--kebabCase` (e.g., `--maxAgeDays=180`); mirror that when adding CLI knobs.

## Testing Guidelines
Use `npm run test:fetch` as a fast gate before pushing; extend `test-fetch.js` with deterministic fixtures when adding new DOM selectors. For exploratory debugging, run `node scripts/test-scrape.js --url=<job-url>` (adjust or wrap the script as needed) to confirm parsing on tricky listings. Regenerate outputs via the appropriate `fetch:*` command and check diffs in `out/`—empty diffs usually signal the scraper failed silently. Aim for practical coverage of parsing branches rather than exhaustive mocks.

## Commit & Pull Request Guidelines
Git history currently follows short, imperative subjects (`Initial commit`), so keep messages under ~72 characters and focus on the observable outcome (e.g., `Update salary parser`). Reference linked issues with `Refs #123` in the body when relevant. PRs should include: summary of scraper or dataset changes, noteworthy diffs in `out/`, commands run (`fetch:*`, `test:fetch`, `readme`), and any outstanding risks (rate limits, API changes). Include screenshots or excerpts only when they clarify DOM shifts.

## Data & Ops Notes
Avoid committing secrets; the scraper only needs public endpoints. Respect `DEFAULTS` in `scrape.js` when tuning runtime knobs so incremental runs remain polite (500–800 ms delays). Large historical re-scrapes should be documented in the PR to justify the noise in `out/`. If you add new outputs, update `README.md` and keep filenames lowercase with hyphens for predictability.
