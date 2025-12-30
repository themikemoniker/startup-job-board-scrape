// scripts/update-readme.js
// Refreshes README.md with dataset stats and visual insights for jobseekers.
// Run: npm run readme

import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("out");
const INDEX_PATH = path.join(OUT_DIR, "index.json");
const README_PATH = path.resolve("README.md");
const CHART_DIR = path.join(OUT_DIR, "charts");

const START = "<!-- DATASET_STATS:START -->";
const END = "<!-- DATASET_STATS:END -->";
const INSIGHTS_START = "<!-- DATASET_INSIGHTS:START -->";
const INSIGHTS_END = "<!-- DATASET_INSIGHTS:END -->";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function daysAgo(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSection(src, start, end, block) {
  const pattern = new RegExp(`${escapeRegex(start)}[\\s\\S]*?${escapeRegex(end)}`);
  if (!pattern.test(src)) return src;
  return src.replace(pattern, `${start}\n\n${block}\n${end}`);
}

function formatPercent(part, total) {
  if (!total || !part) return "0%";
  return `${Math.round((part / total) * 100) || 0}%`;
}

function classifyRole(title) {
  const t = (title ?? "").toLowerCase();
  if (!t) return "Other";
  const match = (keywords) => keywords.some((kw) => t.includes(kw));
  if (match(["engineer", "developer", "software", "full stack", "backend", "frontend", "mobile", "ios", "android", "devops", "sre", "platform", "security"]))
    return "Engineering & Infra";
  if (match(["data", "machine learning", "ml", "ai", "analytics", "science", "scientist", "bi", "llm"]))
    return "Data & AI";
  if (match(["product manager", "product management", "product lead", "pm"]))
    return "Product";
  if (match(["designer", "design", "ux", "ui", "research", "brand design"]))
    return "Design & Research";
  if (match(["marketing", "growth", "demand gen", "community", "content", "communications", "pr"]))
    return "Marketing & Growth";
  if (match(["sales", "account executive", "customer success", "partner success", "bizdev", "business development"]))
    return "Sales & Success";
  if (match(["operations", "people", "talent", "recruiter", "finance", "legal", "chief of staff"]))
    return "Operations & People";
  return "Other";
}

function classifyWorkStyle(row) {
  const blob = `${row.location ?? ""} ${row.what_they_do ?? ""}`.toLowerCase();
  if (!blob.trim()) return "Onsite/Unspecified";
  if (blob.includes("remote") || blob.includes("anywhere") || blob.includes("distributed") || blob.includes("global"))
    return "Remote";
  if (blob.includes("hybrid")) return "Hybrid";
  return "Onsite/Unspecified";
}

const FUNDING_RULES = [
  { name: "Pre-Seed", test: (text) => /\bpre[-\s]?seed\b/.test(text) || /\bangel\b/.test(text) },
  { name: "Seed", test: (text) => /\bseed\b/.test(text) },
  { name: "Series A", test: (text) => /series\s*a\b/.test(text) },
  { name: "Series B", test: (text) => /series\s*b\b/.test(text) },
  { name: "Series C+", test: (text) => /series\s*(c|d|e|f|g)\b/.test(text) },
  { name: "Bootstrapped", test: (text) => /bootstrapped|profitable/i.test(text) },
];

function detectFundingStage(row) {
  const tags = Array.isArray(row.funding_tags) ? row.funding_tags : [];
  const text = tags.join(" ").toLowerCase();
  if (!text.trim()) return "Other";
  for (const rule of FUNDING_RULES) {
    if (rule.test(text)) return rule.name;
  }
  return "Other";
}

function aggregateCounts(rows, classifier) {
  const counts = new Map();
  for (const row of rows) {
    const key = classifier(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function toTopArray(countsMap, limit = 5) {
  return Array.from(countsMap.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function writeBarChartSvg(filename, data, options = {}) {
  ensureDir(CHART_DIR);
  const width = options.width ?? 520;
  const barHeight = options.barHeight ?? 20;
  const gap = options.gap ?? 12;
  const margin = options.margin ?? 24;
  const labelWidth = options.labelWidth ?? 220;
  const title = options.title ?? "";
  const chartWidth = width - labelWidth - margin * 2 - 32;
  const items = data.length ? data : [{ label: "No data yet", value: 0 }];
  const chartHeight =
    margin * 2 + (title ? 16 : 0) + items.length * (barHeight + gap) + barHeight;
  const maxValue = items.reduce((m, item) => Math.max(m, item.value), 0) || 1;
  let yOffset = margin + (title ? 24 : 8);

  let svg = `<svg width="${width}" height="${chartHeight}" viewBox="0 0 ${width} ${chartHeight}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(
    title || "Bar chart"
  )}">\n`;
  svg += `<style>
    text { font-family: "Inter", "Segoe UI", sans-serif; font-size: 12px; fill: #111827; }
    .title { font-size: 14px; font-weight: 600; }
  </style>\n`;
  svg += `<rect width="${width}" height="${chartHeight}" fill="#ffffff" rx="8" ry="8" stroke="#e5e7eb" />\n`;
  if (title) {
    svg += `<text class="title" x="${margin}" y="${margin + 12}">${escapeHtml(title)}</text>\n`;
    yOffset += 12;
  }

  for (const item of items) {
    const centerY = yOffset + barHeight / 2;
    const barX = margin + labelWidth;
    const barWidth = chartWidth * (item.value / maxValue);
    svg += `<text x="${margin}" y="${centerY + 4}">${escapeHtml(item.label)}</text>\n`;
    svg += `<rect x="${barX}" y="${centerY - barHeight / 2}" width="${barWidth}" height="${barHeight}" fill="#2563eb" rx="4" />\n`;
    svg += `<text x="${barX + barWidth + 8}" y="${centerY + 4}">${item.value}</text>\n`;
    yOffset += barHeight + gap;
  }
  svg += "</svg>\n";
  fs.writeFileSync(path.join(CHART_DIR, filename), svg, "utf8");
}

function writeLineChartSvg(filename, data, options = {}) {
  ensureDir(CHART_DIR);
  const width = options.width ?? 540;
  const height = options.height ?? 220;
  const margin = options.margin ?? 32;
  const title = options.title ?? "";
  const items = data.length ? data : [{ label: "No data", value: 0 }];
  const titleSpace = title ? 20 : 0;
  const chartWidth = width - margin * 2;
  const chartHeight = height - margin * 2 - titleSpace;
  const maxValue = items.reduce((m, item) => Math.max(m, item.value), 0) || 1;
  const minValue = 0;
  const step = items.length > 1 ? chartWidth / (items.length - 1) : 0;
  const baselineY = margin + titleSpace + chartHeight;

  const points = items.map((item, idx) => {
    const x = margin + idx * step;
    const valueRatio = (item.value - minValue) / (maxValue - minValue || 1);
    const y = baselineY - valueRatio * chartHeight;
    return { x, y };
  });

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(
    title || "Line chart"
  )}">\n`;
  svg += `<style>
    text { font-family: "Inter", "Segoe UI", sans-serif; font-size: 11px; fill: #111827; }
    .title { font-size: 14px; font-weight: 600; }
  </style>\n`;
  svg += `<rect width="${width}" height="${height}" fill="#ffffff" rx="8" ry="8" stroke="#e5e7eb" />\n`;
  if (title) {
    svg += `<text class="title" x="${margin}" y="${margin + 12}">${escapeHtml(title)}</text>\n`;
  }

  // Axes
  svg += `<line x1="${margin}" y1="${baselineY}" x2="${width - margin}" y2="${baselineY}" stroke="#d1d5db" />\n`;
  svg += `<line x1="${margin}" y1="${margin + titleSpace}" x2="${margin}" y2="${baselineY}" stroke="#d1d5db" />\n`;

  if (points.length > 1) {
    const areaPath = `M ${points[0].x} ${baselineY} ` + points.map((pt) => `L ${pt.x} ${pt.y}`).join(" ") + ` L ${points[points.length - 1].x} ${baselineY} Z`;
    svg += `<path d="${areaPath}" fill="rgba(37,99,235,0.15)" />\n`;
    const path = points.map((pt) => `${pt.x},${pt.y}`).join(" ");
    svg += `<polyline fill="none" stroke="#2563eb" stroke-width="2.5" points="${path}" />\n`;
  } else {
    const pt = points[0];
    svg += `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="#2563eb" />\n`;
  }

  points.forEach((pt, idx) => {
    const item = items[idx];
    svg += `<circle cx="${pt.x}" cy="${pt.y}" r="3" fill="#1d4ed8" stroke="#ffffff" stroke-width="1" />\n`;
    svg += `<text x="${pt.x}" y="${pt.y - 8}" text-anchor="middle">${item.value}</text>\n`;
  });

  items.forEach((item, idx) => {
    const x = margin + idx * step;
    svg += `<text x="${x}" y="${baselineY + 14}" text-anchor="middle">${escapeHtml(item.label)}</text>\n`;
  });

  svg += "</svg>\n";
  fs.writeFileSync(path.join(CHART_DIR, filename), svg, "utf8");
}

const index = safeReadJson(INDEX_PATH) ?? {};
const rows = Object.values(index);
const total = rows.length;

let newestUpdated = null;
for (const r of rows) {
  if (!r.updated_at) continue;
  if (!newestUpdated || Date.parse(r.updated_at) > Date.parse(newestUpdated)) {
    newestUpdated = r.updated_at;
  }
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

const companyCounts = aggregateCounts(
  rows,
  (row) => row.company?.trim() || "Unknown company"
);
const topCompanies = toTopArray(companyCounts, 5);

const roleCounts = aggregateCounts(rows, (row) => classifyRole(row.job_title));
const roleData = toTopArray(roleCounts, 6);

const workStyleCounts = aggregateCounts(rows, classifyWorkStyle);
const workStyleData = ["Remote", "Hybrid", "Onsite/Unspecified"]
  .map((label) => ({ label, value: workStyleCounts.get(label) ?? 0 }))
  .filter((item) => item.value > 0);

const fundingCounts = aggregateCounts(rows, detectFundingStage);
const fundingOrder = ["Pre-Seed", "Seed", "Series A", "Series B", "Series C+", "Bootstrapped", "Other"];
const fundingData = fundingOrder
  .map((label) => ({ label, value: fundingCounts.get(label) ?? 0 }))
  .filter((item) => item.value > 0);

writeBarChartSvg("top-companies.svg", topCompanies, { title: "Top hiring companies" });
writeBarChartSvg("role-mix.svg", roleData, { title: "Role mix" });
writeBarChartSvg("work-style.svg", workStyleData, { title: "Work style" });
writeBarChartSvg("funding-stages.svg", fundingData, { title: "Funding stages" });

function getIsoWeekKey(isoDate) {
  if (!isoDate) return null;
  const date = new Date(isoDate);
  if (Number.isNaN(date)) return null;
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return { label: `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`, order: target.getTime() };
}

const weekCounts = new Map();
for (const row of rows) {
  const key = getIsoWeekKey(row.created_at ?? row.updated_at);
  if (!key) continue;
  weekCounts.set(key.label, { count: (weekCounts.get(key.label)?.count ?? 0) + 1, order: key.order });
}

const sortedWeeks = Array.from(weekCounts.entries())
  .sort((a, b) => a[1].order - b[1].order)
  .slice(-12)
  .map(([label, info]) => ({ label, value: info.count }));

writeLineChartSvg("weekly-trend.svg", sortedWeeks, { title: "Jobs added per week (last 12)" });

const remotePct = formatPercent(workStyleCounts.get("Remote") ?? 0, total);
const hybridPct = formatPercent(workStyleCounts.get("Hybrid") ?? 0, total);
const onsitePct = formatPercent(workStyleCounts.get("Onsite/Unspecified") ?? 0, total);
const leadingCompany = topCompanies[0];
const leadingRole = roleData[0];
const fundingLeader = fundingData[0];

const insightsBlock =
  [
    "### Top hiring companies",
    "![Top hiring companies chart](out/charts/top-companies.svg)",
    leadingCompany
      ? `${leadingCompany.label} currently leads with ${leadingCompany.value} live roles.`
      : "No company posting data yet.",
    "",
    "### Weekly job trend",
    "![Weekly trend chart](out/charts/weekly-trend.svg)",
    sortedWeeks.length
      ? `Showing the last ${sortedWeeks.length} weeks of postings.`
      : "Trend data appears once weekly counts are available.",
    "",
    "### Role mix",
    "![Role mix chart](out/charts/role-mix.svg)",
    leadingRole
      ? `${leadingRole.label} roles make up ${formatPercent(leadingRole.value, total)} of all listings.`
      : "Add more jobs to see a role distribution.",
    "",
    "### Work style",
    "![Work style chart](out/charts/work-style.svg)",
    total
      ? `${remotePct} remote-friendly, ${hybridPct} hybrid, ${onsitePct} onsite/unspecified.` //
      : "Work style data will appear after the next scrape.",
    "",
    "### Funding stages",
    "![Funding stages chart](out/charts/funding-stages.svg)",
    fundingLeader
      ? `${fundingLeader.label} startups lead postings right now.`
      : "Funding information not available yet.",
    "",
  ].join("\n");

let readme = fs.existsSync(README_PATH) ? fs.readFileSync(README_PATH, "utf8") : "";

if (!readme.includes(START) || !readme.includes(END)) {
  readme =
    [
      "# Startup jobs dataset",
      "",
      START,
      END,
      "",
    ].join("\n");
}

if (!readme.includes(INSIGHTS_START) || !readme.includes(INSIGHTS_END)) {
  readme = `${readme.trim()}\n\n## Jobseeker insights\n\n${INSIGHTS_START}\n\n${INSIGHTS_END}\n`;
}

readme = replaceSection(readme, START, END, statsBlock);
readme = replaceSection(readme, INSIGHTS_START, INSIGHTS_END, insightsBlock);

fs.writeFileSync(README_PATH, readme);
console.log("README updated.");
