// test-fetch.js
// Smoke test that verifies fetching + parsing returns at least one job from page 1.

import * as cheerio from "cheerio";

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function normalizeSpace(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function extractOneJob(html) {
  const $ = cheerio.load(html);
  const cards = $(".infinite-container .infinite-item > .card.card-body#item-card-filter");
  for (const el of cards.toArray()) {
    const card = $(el);
    const jobA = card
      .find('a#startup-website-link[href]')
      .filter((_, a) => $(a).find("#job-title").length > 0 || $(a).find("h5#job-title").length > 0)
      .first();

    const jobUrl = jobA.attr("href") ? normalizeSpace(jobA.attr("href")) : "";
    if (!jobUrl) continue;

    const title = normalizeSpace(card.find("#job-title").first().text());
    return { jobUrl, title };
  }
  return null;
}

async function main() {
  const url = "https://topstartups.io/jobs/?page=1&";
  const html = await fetchHtml(url);
  const job = extractOneJob(html);
  if (!job) {
    console.error("FAILED: parsed 0 jobs from page 1");
    process.exit(1);
  }
  console.log("OK:", job);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
