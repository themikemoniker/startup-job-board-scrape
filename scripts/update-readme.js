// scripts/update-readme.js
// Writes a small stats block into README.md between markers.
// Run: npm run readme

import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("out");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const README_PATH = path.resolve("README.md");

function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

const index = safeReadJson(INDEX_PATH) ?? {};
const rows = Object.values(index);

const total = rows.length;

function daysAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

let newestUpdated = null;
for (const r of rows) {
  if (!r.updated_at) continue;
  if (!newestUpdated || Date.parse(r.updated_at) > Date.parse(newestUpdated)) newestUpdated = r.updated_at;
}

const updatedAgo = newestUpdated ? daysAgo(newestUpdated) : null;

const statsBlock =
  [
    "## Dataset quick stats",
    "",
    `Total unique jobs: ${total}`,
    newestUpdated ? `Most recent update: ${newestUpdated} (${updatedAgo} days ago)` : "Most recent update: unknown",
    "",
    "Files:",
    "- out/index.json (deduped index)",
    "- out/jobs.jsonl (append-only log)",
    "- out/jobs.csv (spreadsheet-friendly)",
    "",
  ].join("\n");

const START = "<!-- DATASET_STATS:START -->";
const END = "<!-- DATASET_STATS:END -->";

let readme = fs.existsSync(README_PATH) ? fs.readFileSync(README_PATH, "utf8") : "";

if (!readme.includes(START) || !readme.includes(END)) {
  // create a minimal README if missing markers
  readme =
    [
      "# Startup jobs dataset",
      "",
      START,
      END,
      "",
      "## How to run",
      "",
      "```bash",
      "npm ci",
      "npm run scrape",
      "npm run readme",
      "```",
      "",
    ].join("\n");
}

const before = readme.split(START)[0];
const after = readme.split(END)[1];

const next = `${before}${START}\n\n${statsBlock}\n${END}${after}`;
fs.writeFileSync(README_PATH, next);
console.log("README updated.");
