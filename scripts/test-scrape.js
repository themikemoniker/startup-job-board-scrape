// scripts/test-scrape.js
// Smoke test: fetch + parse 1 page, verify outputs + required fields.
// Run: npm run test:scrape

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const OUT_DIR = path.resolve("out");
const INDEX = path.join(OUT_DIR, "index.json");
const CSV = path.join(OUT_DIR, "jobs.csv");
const JSONL = path.join(OUT_DIR, "jobs.jsonl");

function assert(cond, msg) {
  if (!cond) {
    console.error("TEST FAILED:", msg);
    process.exit(1);
  }
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit", env: { ...process.env } });
}

console.log("Running scrape smoke test (max 1 page, max 50 new items)...");
run("node scrape.js --max-pages 1 --max-items 50");

assert(fs.existsSync(INDEX), "out/index.json not created");
assert(fs.existsSync(CSV), "out/jobs.csv not created");
assert(fs.existsSync(JSONL), "out/jobs.jsonl not created");

const index = JSON.parse(fs.readFileSync(INDEX, "utf8"));
const items = Object.values(index);

assert(items.length > 0, "index.json has 0 items");

const sample = items[0];
const required = ["id", "company", "job_title", "job_url", "created_at", "updated_at"];

for (const f of required) {
  assert(sample[f], `missing required field: ${f}`);
}

assert(!Number.isNaN(Date.parse(sample.created_at)), "created_at is not valid ISO date");
assert(!Number.isNaN(Date.parse(sample.updated_at)), "updated_at is not valid ISO date");

console.log(`OK: parsed total unique items: ${items.length}`);
console.log("SCRAPE SMOKE TEST PASSED");
