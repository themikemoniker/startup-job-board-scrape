# Startup jobs dataset

<!-- DATASET_STATS:START -->

## Dataset quick stats

Total unique jobs: 29
Most recent update: 2025-12-29T23:21:21.737Z (0 days ago)

Files:
- out/index.json (deduped index)
- out/jobs.jsonl (append-only log)
- out/jobs.csv (spreadsheet-friendly)

<!-- DATASET_STATS:END -->

## Quick start

```bash
git clone https://github.com/themikemoniker/startup-job-board-scrape.git
cd startup-job-board-scrape
npm ci   # install Node 22-compatible deps
```

The scraper saves outputs to `out/index.json`, `out/jobs.jsonl`, and `out/jobs.csv`. Keep those files under version control so readers always have the latest dataset.

## Scrape vs. fetch commands

- `npm run scrape` runs `scrape.js` directly. Use it when you want full control over flags (`node scrape.js --mode=today --startPage=3`).
- `npm run fetch:*` commands are shortcuts that call `scrape.js` with presets:
  - `fetch:today` → mode `today`, short run, great for daily updates.
  - `fetch:all` → mode `all`, backfills 180 days.
  - `fetch:all:365` → mode `all`, backfills 365 days.

Think of `fetch` as “opinionated presets” and `scrape` as “manual mode.”

## Which command should I use?

- New repo or major parser change → `npm run fetch:all` (or `fetch:all:365`). It walks historic pages and rebuilds the dataset from scratch, so expect a long run.
- Daily refresh → `npm run fetch:today`. It only grabs the newest listings, runs faster, and produces small diffs.
- After any run, check `git status`, review the `out/` changes, and commit data + code together.

## Testing and debugging

- Quick parser check: `npm run test:fetch` (runs `scripts/test-fetch.js`). It downloads a sample page and asserts that the selectors still work.
- Manual probing: `node scripts/test-scrape.js --url=<job-url>` to inspect one listing end-to-end.
- Docs update: `npm run readme` regenerates the stats block at the top of this file after a successful scrape.

## GitHub Actions automation

Located in `.github/workflows/`:

- `scrape.yml` (`scrape-topstartups`) runs every 4 hours. It executes `npm run scrape` + `npm run readme` and commits the updated dataset.
- `fetch-today.yml` also runs every 4 hours (and manually) but only performs the lightweight `npm run fetch:today`.
- `fetch-all.yml` is manual-only; trigger it when you need a fresh 180-day backfill.

Each workflow installs dependencies, runs the script, and commits with the GitHub Actions bot if files changed. Check the Actions tab when something fails or when you want to trigger a manual run.
