#!/usr/bin/env node
// Node.js ESM script. Requires: cheerio
// Usage examples:
//   node scrape.js --mode=today
//   node scrape.js --mode=all --maxAgeDays=180
//   node scrape.js --mode=all --maxAgeDays=365 --delayMs=800

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";

/* -------------------- Defaults -------------------- */

const DEFAULTS = {
  mode: "today", // today | all
  baseUrl: "https://topstartups.io/jobs/",
  startPage: 1,
  delayMs: 500,
  maxAgeDays: 180, // used when mode=all
  outDir: "out",
  commitEveryPages: 1, // rewrite index.json every N pages
  userAgent:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
  timeoutMs: 30_000,
  retries: 3,
  retryBackoffMs: 800,
};

/* -------------------- Args -------------------- */

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, vRaw] = a.slice(2).split("=", 2);
    const v = vRaw ?? "true";
    switch (k) {
      case "mode":
        args.mode = v;
        break;
      case "baseUrl":
        args.baseUrl = v;
        break;
      case "startPage":
        args.startPage = Number(v);
        break;
      case "delayMs":
        args.delayMs = Number(v);
        break;
      case "maxAgeDays":
        args.maxAgeDays = Number(v);
        break;
      case "outDir":
        args.outDir = v;
        break;
      case "commitEveryPages":
        args.commitEveryPages = Math.max(1, Number(v));
        break;
      default:
        break;
    }
  }
  if (args.mode !== "today" && args.mode !== "all") {
    throw new Error(`Invalid --mode=${args.mode}. Expected "today" or "all".`);
  }
  return args;
}

/* -------------------- FS utils -------------------- */

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readJsonIfExists(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    const raw = fs.readFileSync(p, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* -------------------- Helpers -------------------- */

function nowIso() {
  return new Date().toISOString();
}

function stableIdFromJobUrl(jobUrl) {
  return jobUrl?.trim() || "";
}

function normalizeSpace(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function stripTrailingNew(s) {
  return normalizeSpace(
    String(s ?? "")
      .replace(/\bNew\b$/i, "")
      .replace(/tags\.new$/i, "")
  );
}

function parsePostedAgeDays(postedText) {
  const t = normalizeSpace(postedText).toLowerCase();
  if (!t) return null;

  if (t.includes("today")) return 0;

  const dayMatch = t.match(/(\d+)\s*day/);
  if (dayMatch) return Number(dayMatch[1]);

  const hourMatch = t.match(/(\d+)\s*hour/);
  if (hourMatch) return 0;

  const minMatch = t.match(/(\d+)\s*minute/);
  if (minMatch) return 0;

  return null;
}

/* -------------------- Fetch -------------------- */

async function fetchWithRetry(url, { timeoutMs, retries, retryBackoffMs, userAgent }) {
  let lastErr = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          "user-agent": userAgent,
          accept: "text/html,*/*",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      clearTimeout(timeout);
      lastErr = e;
      if (attempt < retries) await sleep(retryBackoffMs * attempt);
    }
  }
  throw lastErr;
}

/* -------------------- Parse -------------------- */

function extractJobsFromHtml(html, sourceUrl) {
  const $ = cheerio.load(html);
  const cards = $(".infinite-container .infinite-item > .card.card-body#item-card-filter");
  const jobs = [];

  cards.each((_, el) => {
    const card = $(el);

    const jobA = card
      .find('a#startup-website-link[href]')
      .filter((__, a) => $(a).find("#job-title").length > 0)
      .first();

    const jobUrl = normalizeSpace(jobA.attr("href"));
    if (!jobUrl) return;

    const companyA = card
      .find('a#startup-website-link[href]')
      .filter((__, a) => $(a).find("h7").length > 0 && $(a).find("#job-title").length === 0)
      .first();

    const job = {
      id: stableIdFromJobUrl(jobUrl),
      company: stripTrailingNew(companyA.text()),
      company_site: normalizeSpace(companyA.attr("href")),
      job_title: stripTrailingNew(card.find("#job-title").first().text()),
      job_url: jobUrl,
      apply_url:
        normalizeSpace(card.find('a#apply-button[href]').attr("href")) || jobUrl,
      location: normalizeSpace(card.find(".fa-map-marker-alt").parent().text()),
      experience: normalizeSpace(card.find(".fa-briefcase").parent().text()),
      posted: normalizeSpace(card.find(".fa-clock").parent().text()),
      posted_age_days: parsePostedAgeDays(
        normalizeSpace(card.find(".fa-clock").parent().text())
      ),
      logo: normalizeSpace(card.find("img").first().attr("src")),
      company_size: normalizeSpace(card.find("#company-size-tags").first().text()),
      funding_tags: card
        .find("#funding-tags")
        .toArray()
        .map((s) => normalizeSpace($(s).text()))
        .filter(Boolean),
      what_they_do: normalizeSpace(
        card
          .find('b#card-header')
          .filter((__, b) => normalizeSpace($(b).text()).toLowerCase().startsWith("what they do"))
          .parent()
          .text()
          .replace(/what they do:\s*/i, "")
      ),
      industries: card
        .find("#industry-tags")
        .toArray()
        .map((s) => normalizeSpace($(s).text()))
        .filter(Boolean),
      source: sourceUrl,
    };

    jobs.push(job);
  });

  const seen = new Set();
  return jobs.filter((j) => j.id && !seen.has(j.id) && seen.add(j.id));
}

/* -------------------- Index -------------------- */

function upsertIndex(indexObj, job, ts) {
  const existing = indexObj[job.id];
  if (!existing) {
    indexObj[job.id] = { ...job, created_at: ts, updated_at: ts };
    return { isNew: true, changed: true };
  }
  indexObj[job.id] = {
    ...existing,
    ...job,
    created_at: existing.created_at,
    updated_at: ts,
  };
  return { isNew: false, changed: true };
}

/* -------------------- Stop logic -------------------- */

function computeStopForMode(mode, jobs, maxAgeDays) {
  if (jobs.length === 0) return { stop: true, reason: "no_cards" };

  if (mode === "today") {
    // UPDATED: keep scanning while we see jobs posted ≤ 1 day ago
    const hasRecent = jobs.some(
      (j) => typeof j.posted_age_days === "number" && j.posted_age_days <= 1
    );
    if (!hasRecent) return { stop: true, reason: "no_recent_<=_1_day_on_page" };
    return { stop: false, reason: "" };
  }

  const ages = jobs.map((j) => j.posted_age_days).filter((n) => typeof n === "number");
  if (ages.length === 0) return { stop: false, reason: "" };
  const oldest = Math.max(...ages);
  if (oldest > maxAgeDays) return { stop: true, reason: `older_than_${maxAgeDays}` };
  return { stop: false, reason: "" };
}

/* -------------------- CSV -------------------- */

function csvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsvRowsFromIndex(indexObj) {
  const rows = Object.values(indexObj);
  const header = [
    "id",
    "company",
    "job_title",
    "job_url",
    "apply_url",
    "company_site",
    "location",
    "experience",
    "posted",
    "posted_age_days",
    "company_size",
    "funding_tags",
    "industries",
    "what_they_do",
    "logo",
    "created_at",
    "updated_at",
    "source",
  ];

  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      header
        .map((k) =>
          csvEscape(
            k === "funding_tags" || k === "industries"
              ? JSON.stringify(r[k] ?? [])
              : r[k] ?? ""
          )
        )
        .join(",")
    );
  }
  return lines.join("\n") + "\n";
}

/* -------------------- Main -------------------- */

async function main() {
  const args = parseArgs(process.argv);

  const outDir = path.resolve(process.cwd(), args.outDir);
  ensureDir(outDir);

  const indexPath = path.join(outDir, "index.json");
  const snapshotJsonPath = path.join(outDir, "jobs.json");
  const snapshotCsvPath = path.join(outDir, "jobs.csv");
  const eventsPath = path.join(outDir, "jobs.jsonl");

  const index = readJsonIfExists(indexPath, {});
  const eventsStream = fs.createWriteStream(eventsPath, { flags: "a" });

  let page = args.startPage;

  while (true) {
    const url = `${args.baseUrl}?page=${page}&`;
    console.log(`Fetching: ${url}`);

    const html = await fetchWithRetry(url, args);
    const jobs = extractJobsFromHtml(html, args.baseUrl);
    const ts = nowIso();

    console.log(`  page items: ${jobs.length}`);

    for (const job of jobs) {
      eventsStream.write(JSON.stringify({ observed_at: ts, ...job }) + "\n");
      upsertIndex(index, job, ts);
    }

    writeJsonAtomic(indexPath, index);

    const stopInfo = computeStopForMode(args.mode, jobs, args.maxAgeDays);
    if (stopInfo.stop) {
      console.log(`Stop: ${stopInfo.reason} (page=${page})`);
      break;
    }

    page++;
    await sleep(args.delayMs);
  }

  eventsStream.end();
  writeJsonAtomic(snapshotJsonPath, Object.values(index));
  fs.writeFileSync(snapshotCsvPath, buildCsvRowsFromIndex(index), "utf8");

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
