import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const CONTENT_PATH = path.join(ROOT, "content", "site-content.json");
const DEFAULT_OUTPUT_DIR = ROOT;
const META_PATH = path.join(ROOT, "generated", "site-meta.json");
const OG_IMAGE_PATH = path.join(ROOT, "og.png");

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const SITE_URL = "https://blakefolgado.com/";
const SITE_TITLE = "blakefolgado.com";
const DAILY_REFRESH_UTC = { hour: 8, minute: 17 };

const REQUIRED_TEMPLATE_TOKENS = [
  "{{PROFILE_IMAGE_URL}}",
  "{{NAME}}",
  "{{BIO}}",
  "{{SOCIAL_LINK_ITEMS}}",
  "{{PROJECT_ITEMS}}",
  "{{FACT_ITEMS}}",
  "{{TALK_ITEMS}}",
  "{{DAILY_NOTE}}",
  "{{STATUS_PANELS}}"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = await readJson(CONTENT_PATH);
  const dateSeed = args.date ?? getCurrentDateInTimezone(content.site.timezone);
  const numericSeed = hashStringToInt(dateSeed);
  const outputDir = path.resolve(ROOT, process.env.SITE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
  const outputPath = path.join(outputDir, "index.html");

  if (args.mock || !process.env.OPENROUTER_API_KEY) {
    if (!args.mock) console.warn("[generator] OPENROUTER_API_KEY not set.");
    process.exitCode = 1;
    return;
  }

  const freeModels = await getFreeModels();
  const design = await generatePage({ apiKey: process.env.OPENROUTER_API_KEY, content, dateSeed, numericSeed, freeModels });
  const html = renderSite({ content, dateSeed, design });

  await mkdir(path.dirname(META_PATH), { recursive: true });
  await prepareOutputDirectory(outputDir);
  await writeFile(outputPath, html, "utf8");
  await copyPublicAssets(outputDir);
  await writeFile(META_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), dateSeed, themeName: design.themeName }, null, 2) + "\n", "utf8");
  console.log(`[generator] Wrote ${path.relative(ROOT, outputPath)} (${design.themeName})`);
}

function parseArgs(argv) {
  const args = { mock: false, date: null };
  for (const arg of argv) {
    if (arg === "--mock") args.mock = true;
    if (arg.startsWith("--date=")) args.date = arg.slice("--date=".length);
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function prepareOutputDirectory(outputDir) {
  await mkdir(outputDir, { recursive: true });
  if (outputDir !== ROOT) {
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
  }
}

async function copyPublicAssets(outputDir) {
  if (outputDir !== ROOT) await cp(OG_IMAGE_PATH, path.join(outputDir, "og.png"));
}

function getCurrentDateInTimezone(timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function formatHumanDate(dateSeed) {
  const [year, month, day] = dateSeed.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", day: "numeric" }).format(new Date(Date.UTC(year, month - 1, day)));
}

function hashStringToInt(value) {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

async function getFreeModels() {
  const res = await fetch(OPENROUTER_MODELS_URL, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Model list fetch failed (${res.status})`);
  const models = (await res.json()).data ?? [];
  return [...new Set(
    models
      .filter((m) => Number(m?.pricing?.prompt ?? 1) === 0 && Number(m?.pricing?.completion ?? 1) === 0 && (m?.architecture?.input_modalities ?? []).includes("text") && (m?.architecture?.output_modalities ?? []).includes("text"))
      .map((m) => m.id)
      .filter((id) => id && id !== "openrouter/free")
  )];
}

async function generatePage({ apiKey, content, dateSeed, numericSeed, freeModels }) {
  const modelsToTry = freeModels.length
    ? [freeModels[numericSeed % freeModels.length], ...freeModels.slice(0, 5), "openrouter/auto"]
    : ["openrouter/auto"];

  const body = {
    messages: [
      {
        role: "system",
        content: [
          "You generate a page that displays a person's info. It can take any form — a website, a game, a poster, an interactive experience, an artwork, anything you can imagine. Return JSON with: theme_name, primary_font, display_font, theme (object with background, surface, text, muted, accent, accent_alt, border as hex colors), daily_label, body_html, css.",
          "This page regenerates daily and must be completely different every time. You have total creative freedom over what it is and how it looks.",
          "Technical constraints:",
          "1. body_html is placed inside a <body> tag. No <script>, <style>, <head>, <body>, <form>, or <iframe> tags in it.",
          "2. CSS goes in the css field.",
          "3. Place these tokens in body_html (they get swapped for real content): {{PROFILE_IMAGE_URL}}, {{NAME}}, {{BIO}}, {{SOCIAL_LINK_ITEMS}}, {{PROJECT_ITEMS}}, {{FACT_ITEMS}}, {{TALK_ITEMS}}, {{DAILY_NOTE}}, {{STATUS_PANELS}}. All must appear.",
          "4. Responsive and readable.",
          "5. primary_font and display_font must be valid Google Fonts.",
          "6. Don't invent facts — only use what's provided."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          date: dateSeed,
          person: { name: content.person.name, bio: content.person.tagline, projects: content.projects.map((p) => p.name), facts: content.facts.map((f) => f.label), talks: content.talks.map((t) => t.label) }
        })
      }
    ],
    temperature: 1.8,
    max_tokens: 8000,
    seed: numericSeed
  };

  let data;
  for (const model of [...new Set(modelsToTry)]) {
    console.log(`[generator] Trying model: ${model}`);
    try {
      data = await callOpenRouter(apiKey, { ...body, model, response_format: { type: "json_object" } });
      break;
    } catch (e1) {
      try {
        data = await callOpenRouter(apiKey, { ...body, model });
        break;
      } catch (e2) {
        console.warn(`[generator] ${model} failed: ${e2.message}`);
      }
    }
  }
  if (!data) throw new Error("All models failed");

  const themeName = str(data.theme_name) || "Daily Edition";
  const primaryFont = str(data.primary_font) || "Inter";
  const displayFont = str(data.display_font) || "Space Grotesk";
  const fallbackTheme = { background: "#0a0a0f", surface: "#161622", text: "#f0f0f5", muted: "#8888a0", accent: "#5af2c6", accent_alt: "#ff6b9d", border: "#2a2a3a" };
  const theme = {};
  for (const key of Object.keys(fallbackTheme)) {
    const v = data?.theme?.[key];
    theme[key] = (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim())) ? v.trim() : fallbackTheme[key];
  }
  const dailyLabel = str(data.daily_label) || themeName;
  const bodyHtml = cleanHtml(data.body_html);
  const css = cleanCss(data.css);

  if (!bodyHtml || !REQUIRED_TEMPLATE_TOKENS.every((t) => bodyHtml.includes(t))) {
    throw new Error("Generated HTML missing required tokens");
  }

  return { themeName, primaryFont, displayFont, theme, dailyLabel, bodyHtml, css: css || "", formattedDate: formatHumanDate(dateSeed) };
}

async function callOpenRouter(apiKey, body) {
  const res = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", "http-referer": SITE_URL, "x-title": SITE_TITLE },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const raw = (await res.json())?.choices?.[0]?.message?.content;
  const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((c) => c?.text ?? c ?? "").join("") : JSON.stringify(raw ?? "");
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON in response");
  return JSON.parse(cleaned.slice(start, end + 1));
}

function str(v) { return typeof v === "string" ? v.replace(/[\r\n\t]+/g, " ").trim().slice(0, 80) : ""; }

function cleanHtml(v) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s || s.length > 50000 || [/<\/?(script|style|iframe|form|object|embed|link|meta|head|body)/i, /\son[a-z]+\s*=/i, /javascript:/i].some((p) => p.test(s))) return "";
  return s;
}

function cleanCss(v) {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s || s.length > 60000 || [/@import/i, /expression\s*\(/i, /javascript:/i, /<\/style/i].some((p) => p.test(s))) return "";
  return s;
}

function renderSite({ content, dateSeed, design }) {
  const tokenMap = {
    "{{PROFILE_IMAGE_URL}}": esc(content.site.images.profile),
    "{{NAME}}": esc(content.person.name),
    "{{BIO}}": esc(content.person.tagline),
    "{{SOCIAL_LINK_ITEMS}}": content.person.socials.map((s) => `<a class="content-social-link" href="${esc(s.url)}" ${s.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${esc(s.label)}</a>`).join(""),
    "{{PROJECT_ITEMS}}": content.projects.map((p) => `<a class="content-project-card" href="${esc(p.url)}" target="_blank" rel="noreferrer"><img class="content-project-image" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"><div class="content-project-copy"><div class="content-project-name">${esc(p.name)}</div><div class="content-project-summary">${esc(p.subtitle)}</div></div></a>`).join(""),
    "{{FACT_ITEMS}}": content.facts.map((f) => { const inner = f.url ? `<a class="content-fact-label" href="${esc(f.url)}" target="_blank" rel="noreferrer">${f.icon ? `<img class="content-mini-icon" src="${esc(f.icon)}" alt="" loading="lazy">` : ""}${esc(f.label)}</a>` : `<div class="content-fact-label">${esc(f.label)}</div>`; return `<article class="content-fact-item">${inner}</article>`; }).join(""),
    "{{TALK_ITEMS}}": content.talks.map((t) => `<a class="content-talk-item" href="${esc(t.url)}" target="_blank" rel="noreferrer"><div class="content-talk-title">${esc(t.label)}</div><div class="content-talk-meta">Watch the talk</div></a>`).join(""),
    "{{DAILY_NOTE}}": esc(`${design.dailyLabel} \u00b7 ${design.formattedDate}`),
    "{{STATUS_PANELS}}": `<div class="content-status-strip"><div class="content-status-panel"><div class="content-status-label">${esc(content.site.locationLabel)} time</div><div class="content-status-value" data-role="local-time">--</div></div><div class="content-status-panel"><div class="content-status-label">${esc(content.site.locationLabel)} weather</div><div class="content-status-value" data-role="local-weather">Loading...</div></div></div>`
  };

  let body = design.bodyHtml;
  for (const [token, value] of Object.entries(tokenMap)) body = body.split(token).join(value);

  const fonts = [...new Set([design.primaryFont, design.displayFont])].map((f) => f.replace(/ /g, "+") + ":wght@300;400;500;600;700;800").join("&family=");
  const cfg = JSON.stringify({ timezone: content.site.timezone, locationLabel: content.site.locationLabel, weather: content.site.weather, refreshScheduleUtc: DAILY_REFRESH_UTC }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(content.site.title)}</title>
  <meta name="description" content="${esc(content.site.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(content.site.url)}">
  <meta property="og:title" content="${esc(content.site.title)}">
  <meta property="og:description" content="${esc(content.site.description)}">
  <meta property="og:image" content="${esc(content.site.images.og)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${esc(content.site.url)}">
  <meta name="twitter:title" content="${esc(content.site.title)}">
  <meta name="twitter:description" content="${esc(content.site.description)}">
  <meta name="twitter:image" content="${esc(content.site.images.og)}">
  <meta name="theme-color" content="${design.theme.background}">
  <link rel="icon" href="${esc(content.site.images.profile)}">
  <link rel="apple-touch-icon" href="${esc(content.site.images.profile)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fonts}&display=swap" rel="stylesheet">
  <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>
  <script defer src="/_vercel/insights/script.js"></script>
  <style>
    :root{--bg:${design.theme.background};--surface:${design.theme.surface};--text:${design.theme.text};--muted:${design.theme.muted};--accent:${design.theme.accent};--accent-alt:${design.theme.accent_alt};--border:${design.theme.border};--font-body:"${design.primaryFont}",sans-serif;--font-display:"${design.displayFont}",sans-serif}
    *,*::before,*::after{box-sizing:border-box}html{min-height:100%}body{margin:0;min-height:100vh;color:var(--text);background:var(--bg);font-family:var(--font-body);line-height:1.5;overflow-x:hidden}img{max-width:100%}a{color:inherit}
    .refresh-pill{position:fixed;right:max(1rem,env(safe-area-inset-right));bottom:max(1rem,env(safe-area-inset-bottom));z-index:9999;padding:.5rem .8rem;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--border));border-radius:999px;background:rgba(10,10,12,.75);backdrop-filter:blur(14px);pointer-events:none;font-size:.7rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .refresh-pill span{color:var(--text);font-family:var(--font-display)}
    @media(max-width:640px){.refresh-pill{left:.6rem;right:.6rem;border-radius:16px;text-align:center}}
    ${design.css}
  </style>
</head>
<body>
  ${body}
  <div class="refresh-pill">Next design in <span data-role="design-countdown">--</span></div>
  <script id="daily-site-config" type="application/json">${cfg}</script>
  <script>${clientJs()}</script>
  <script src="https://book-sparky.com/widget.js" data-slug="blake-folgado-electrical-london"></script>
</body>
</html>
`;
}

function esc(v) { return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

function clientJs() {
  return `(function(){var el=document.getElementById("daily-site-config");if(!el)return;var c=JSON.parse(el.textContent);function nr(now){var n=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),c.refreshScheduleUtc.hour,c.refreshScheduleUtc.minute));if(n<=now)n.setUTCDate(n.getUTCDate()+1);return n}function cd(){var s=Math.max(0,Math.floor((nr(new Date())-new Date())/1000));var e=document.querySelector("[data-role='design-countdown']");if(e)e.textContent=s.toLocaleString("en-GB")+"s"}function cl(){var t=new Intl.DateTimeFormat("en-GB",{timeZone:c.timezone,hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date()).toLowerCase();document.querySelectorAll("[data-role='local-time']").forEach(function(n){n.textContent=t})}function w(){fetch("https://api.open-meteo.com/v1/forecast?latitude="+c.weather.latitude+"&longitude="+c.weather.longitude+"&current_weather=true").then(function(r){return r.json()}).then(function(d){var t=Math.round(d.current_weather.temperature);var m={0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Cloudy",45:"Fog",48:"Fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Rain",63:"Rain",65:"Rain",71:"Snow",73:"Snow",75:"Snow",80:"Showers",81:"Showers",82:"Showers",95:"Storm",96:"Storm",99:"Storm"};document.querySelectorAll("[data-role='local-weather']").forEach(function(n){n.textContent=(m[d.current_weather.weathercode]||"Weather")+" \\u00b7 "+t+"C"})}).catch(function(){document.querySelectorAll("[data-role='local-weather']").forEach(function(n){n.textContent="Unavailable"})})}cd();cl();w();setInterval(cd,1000);setInterval(cl,1000);setInterval(w,900000)})()`;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
