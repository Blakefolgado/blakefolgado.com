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
const ASSETS_DIR = path.join(ROOT, "assets");

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
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

const MULTI_ELEMENT_TEMPLATE_TOKENS = [
  "{{SOCIAL_LINK_ITEMS}}",
  "{{PROJECT_ITEMS}}",
  "{{FACT_ITEMS}}",
  "{{TALK_ITEMS}}",
  "{{STATUS_PANELS}}"
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = await readJson(CONTENT_PATH);
  const dateSeed = args.date ?? getCurrentDateInTimezone(content.site.timezone);
  const numericSeed = hashStringToInt(dateSeed);
  const outputDir = path.resolve(ROOT, process.env.SITE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
  const outputPath = path.join(outputDir, "index.html");

  if (!args.mock && !process.env.OPENROUTER_API_KEY) {
    console.warn("[generator] OPENROUTER_API_KEY not set.");
    process.exitCode = 1;
    return;
  }

  const design = args.mock
    ? createMockDesign({ dateSeed, numericSeed })
    : await generatePage({ apiKey: process.env.OPENROUTER_API_KEY, content, dateSeed, numericSeed });
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
  if (outputDir !== ROOT) {
    await cp(OG_IMAGE_PATH, path.join(outputDir, "og.png"));
    await cp(ASSETS_DIR, path.join(outputDir, "assets"), { recursive: true });
  }
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

async function generatePage({ apiKey, content, dateSeed, numericSeed }) {
  const baseBody = {
    model: "moonshotai/kimi-k2.6",
    messages: [
      {
        role: "system",
        content: [
          "You are a wildly creative front-end designer. You build a page that shows a person's info — but it can take ANY form.",
          "A brutalist zine. A retro OS desktop. A space mission control panel. A newspaper. A game UI. A travel postcard. An art gallery. A terminal. A 90s geocities page. A cyberpunk HUD. A film credits sequence. Anything you can imagine.",
          "This regenerates daily. Every day must feel like a completely different experience. Push boundaries. Surprise people.",
          "",
          "YOUR OUTPUT: Return a single JSON object with these fields:",
          "",
          "theme_name  — a creative name for today's concept",
          "primary_font — a Google Fonts name for body text",
          "display_font — a Google Fonts name for display/heading text",
          "theme — an object with hex color values: { background, surface, text, muted, accent, accent_alt, border }",
          "daily_label — a short tagline for today's edition",
          "body_html — the full HTML fragment (see rules below)",
          "",
          "BODY_HTML RULES:",
          "This fragment gets inserted inside an existing <body> tag. You can include <style> tags for CSS.",
          "",
          "DO NOT include: <!DOCTYPE>, <html>, <head>, <body>, <script>, <link>, <meta>, or <title> tags.",
          "",
          "CSS variables are pre-defined on :root and available to use:",
          "var(--bg), var(--surface), var(--text), var(--muted), var(--accent), var(--accent-alt), var(--border), var(--font-body), var(--font-display)",
          "",
          "CONTENT TOKENS — these are required placeholders that get replaced with real data. All must appear in body_html:",
          "",
          "{{PROFILE_IMAGE_URL}} — use as an <img> src with referrerpolicy=\"no-referrer\". Never use it in CSS url(). Style the image however you want.",
          "{{NAME}} — the person's name",
          "{{BIO}} — a short tagline",
          "{{DAILY_NOTE}} — text string with the edition label and date",
          "",
          "{{SOCIAL_LINK_ITEMS}} — expands to multiple <a> elements",
          "{{PROJECT_ITEMS}} — expands to multiple card elements (each is an <a> with an image and text)",
          "{{FACT_ITEMS}} — expands to multiple <article> elements",
          "{{TALK_ITEMS}} — expands to multiple <a> elements",
          "{{STATUS_PANELS}} — expands to status display elements",
          "",
          "IMPORTANT: The multi-element tokens above expand to sibling HTML elements. They MUST be placed directly inside a <div>, <section>, <nav>, <article>, <aside>, <header>, <footer>, or <main>.",
          "NEVER place them inside: <ul>, <ol>, <dl>, <table>, <tr>, <select>, <p>, <a>, or <button>.",
          "",
          "These expanded elements have their own base styles (padding, borders, border-radius). Your CSS can override them — style them however fits your concept.",
          "",
          "QUALITY BAR:",
          "- The page must work on mobile and desktop. Include responsive CSS.",
          "- All content must be visible and readable — no clipping, no invisible text.",
          "- The page must scroll if content overflows. Never overflow:hidden on the root container.",
          "- Be bold with the visual concept, but the HTML/CSS must actually work.",
          "",
          "Only use the person data provided. Return valid JSON only, no markdown fences."
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({
          date: dateSeed,
          person: { name: content.person.name, bio: content.person.tagline, projects: content.projects.map((p) => p.name), facts: content.facts.map((f) => f.label), talks: content.talks.map((t) => t.label) }
        })
      }
    ],
    temperature: 1.2,
    seed: numericSeed
  };

  let retryNote = "";
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const requestBody = retryNote
      ? { ...baseBody, messages: [...baseBody.messages, { role: "user", content: retryNote }] }
      : baseBody;

    let data;
    try {
      data = await callOpenRouter(apiKey, { ...requestBody, response_format: { type: "json_object" } });
    } catch (e) {
      console.warn(`[generator] JSON mode failed, retrying: ${e.message}`);
      data = await callOpenRouter(apiKey, requestBody);
    }

    try {
      return normalizeGeneratedDesign({ data, dateSeed });
    } catch (error) {
      lastError = error;
      retryNote = [
        `Your previous response could not be published because: ${error.message}.`,
        "Return fresh JSON with a new body_html fragment that obeys the exact token and valid-container rules.",
        "Do not wrap multi-element tokens in paragraph, list, table, anchor, or button containers."
      ].join(" ");
    }
  }

  throw lastError ?? new Error("Failed to generate a publishable page");
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

function normalizeGeneratedDesign({ data, dateSeed }) {
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
  const fragment = normalizeHtmlFragment(data.body_html);

  if (!fragment.markup || !REQUIRED_TEMPLATE_TOKENS.every((t) => fragment.markup.includes(t))) {
    throw new Error("Generated HTML missing required tokens");
  }

  validateFragmentMarkup(fragment.markup);

  return {
    themeName,
    primaryFont,
    displayFont,
    theme,
    dailyLabel,
    layoutCss: fragment.styles,
    bodyHtml: fragment.markup,
    formattedDate: formatHumanDate(dateSeed)
  };
}

function normalizeHtmlFragment(v) {
  if (typeof v !== "string") return { styles: "", markup: "" };

  const html = v.trim();
  if (!html) return { styles: "", markup: "" };

  const styleMatches = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((match) => match[1].trim()).filter(Boolean);
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);

  let content = bodyMatch
    ? bodyMatch[1]
    : html
        .replace(/<!DOCTYPE[^>]*>/gi, "")
        .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?(?:html|body)\b[^>]*>/gi, "");

  content = content
    .replace(/<\/?(?:head)\b[^>]*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/<(?:meta|link|base)\b[^>]*\/?>/gi, "")
    .trim();

  const orderedStyles = [];
  const seenStyles = new Set();
  for (const style of styleMatches) {
    if (seenStyles.has(style)) continue;
    seenStyles.add(style);
    orderedStyles.push(style);
  }

  return { styles: orderedStyles.join("\n"), markup: content };
}

function validateFragmentMarkup(markup) {
  if (/(?:<!DOCTYPE|<\/?(?:html|head|body|script|title)\b|<(?:meta|link|base)\b)/i.test(markup)) {
    throw new Error("Generated HTML contains document-level or disallowed tags");
  }

  const invalidContainers = ["ul", "ol", "dl", "table", "thead", "tbody", "tfoot", "tr", "select", "p", "a", "button"];
  for (const token of MULTI_ELEMENT_TEMPLATE_TOKENS) {
    const tokenPattern = escapeRegExp(token);
    for (const tag of invalidContainers) {
      const containerPattern = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?${tokenPattern}[\\s\\S]*?<\\/${tag}>`, "i");
      if (containerPattern.test(markup)) {
        throw new Error(`Generated HTML places ${token} inside <${tag}>`);
      }
    }
  }
}

function validateRenderedHtml(html) {
  if (/<style\b[^>]*>[\s\S]*<style\b/i.test(html)) {
    throw new Error("Rendered HTML contains nested <style> tags");
  }
}

function renderSite({ content, dateSeed, design }) {
  const tokenMap = {
    "{{PROFILE_IMAGE_URL}}": esc(content.site.images.profile),
    "{{NAME}}": esc(content.person.name),
    "{{BIO}}": esc(content.person.tagline),
    "{{SOCIAL_LINK_ITEMS}}": content.person.socials.map((s) => `<a class="content-social-link" href="${esc(s.url)}" ${s.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${esc(s.label)}</a>`).join(""),
    "{{PROJECT_ITEMS}}": content.projects.map((p) => `<a class="content-project-card" href="${esc(p.url)}" target="_blank" rel="noreferrer"><img class="content-project-image" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer"><div class="content-project-copy"><div class="content-project-name">${esc(p.name)}</div><div class="content-project-summary">${esc(p.subtitle)}</div></div></a>`).join(""),
    "{{FACT_ITEMS}}": content.facts.map((f) => { const inner = f.url ? `<a class="content-fact-label" href="${esc(f.url)}" target="_blank" rel="noreferrer">${f.icon ? `<img class="content-mini-icon" src="${esc(f.icon)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}${esc(f.label)}</a>` : `<div class="content-fact-label">${esc(f.label)}</div>`; return `<article class="content-fact-item">${inner}</article>`; }).join(""),
    "{{TALK_ITEMS}}": content.talks.map((t) => `<a class="content-talk-item" href="${esc(t.url)}" target="_blank" rel="noreferrer"><div class="content-talk-title">${esc(t.label)}</div><div class="content-talk-meta">Watch the talk</div></a>`).join(""),
    "{{DAILY_NOTE}}": esc(`${design.dailyLabel} \u00b7 ${design.formattedDate}`),
    "{{DAILY_LABEL}}": esc(design.dailyLabel),
    "{{FORMATTED_DATE}}": esc(design.formattedDate),
    "{{daily_label}}": esc(design.dailyLabel),
    "{{formatted_date}}": esc(design.formattedDate),
    "{{date}}": esc(design.formattedDate),
    "{{STATUS_PANELS}}": `<div class="content-status-strip"><div class="content-status-panel"><div class="content-status-label">${esc(content.site.locationLabel)} time</div><div class="content-status-value" data-role="local-time">--</div></div><div class="content-status-panel"><div class="content-status-label">${esc(content.site.locationLabel)} weather</div><div class="content-status-value" data-role="local-weather">Loading...</div></div></div>`
  };

  let body = design.bodyHtml;
  for (const [token, value] of Object.entries(tokenMap)) body = body.split(token).join(value);
  if (/{{\s*[^}]+\s*}}/.test(body)) throw new Error("Rendered HTML contains unresolved template tokens");

  const fonts = [...new Set([design.primaryFont, design.displayFont])].map((f) => f.replace(/ /g, "+") + ":wght@300;400;500;600;700;800").join("&family=");
  const cfg = JSON.stringify({ timezone: content.site.timezone, locationLabel: content.site.locationLabel, weather: content.site.weather, refreshScheduleUtc: DAILY_REFRESH_UTC }).replace(/</g, "\\u003c");
  const layoutCss = design.layoutCss ? `\n    ${design.layoutCss}` : "";

  const htmlDoc = `<!DOCTYPE html>
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
    ${tokenFallbackCss()}
    ${layoutCss}
    .refresh-pill{position:fixed;right:max(1rem,env(safe-area-inset-right));bottom:max(1rem,env(safe-area-inset-bottom));z-index:9999;padding:.5rem .8rem;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--border));border-radius:999px;background:rgba(10,10,12,.75);backdrop-filter:blur(14px);pointer-events:none;font-size:.7rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}
    .refresh-pill span{color:var(--text);font-family:var(--font-display)}
    @media(max-width:640px){.refresh-pill{left:.6rem;right:.6rem;border-radius:16px;text-align:center}}
  </style>
</head>
<body>
  ${body}
  <div class="refresh-pill">New website generated in <span data-role="design-countdown">--</span></div>
  <script id="daily-site-config" type="application/json">${cfg}</script>
  <script>${clientJs()}</script>
</body>
</html>
`;

  validateRenderedHtml(htmlDoc);
  return htmlDoc;
}

function esc(v) { return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function tokenFallbackCss() {
  return [
    ".content-social-link,.content-project-card,.content-fact-label,.content-talk-item{color:inherit;text-decoration:none;transition:transform .2s ease,border-color .2s ease,background .2s ease}",
    ".content-social-link{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .85rem;border-radius:999px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));background:color-mix(in srgb,var(--surface) 82%,transparent);font-size:.92rem;font-weight:600}",
    ".content-project-card{display:grid;grid-template-columns:minmax(0,4.5rem) minmax(0,1fr);gap:.9rem;align-items:center;padding:.95rem;border-radius:1rem;border:1px solid color-mix(in srgb,var(--border) 78%,var(--accent) 22%);background:color-mix(in srgb,var(--surface) 90%,transparent)}",
    ".content-project-image{width:4.5rem;height:4.5rem;border-radius:1.15rem;object-fit:cover;display:block;background:color-mix(in srgb,var(--surface) 68%,black)}",
    ".content-project-copy{display:grid;gap:.2rem;min-width:0}",
    ".content-project-name,.content-talk-title,.content-status-value{font-weight:700;line-height:1.2}",
    ".content-project-summary,.content-talk-meta,.content-status-label{color:var(--muted)}",
    ".content-project-summary,.content-talk-meta{font-size:.95rem}",
    ".content-fact-item{display:block}",
    ".content-fact-label{display:flex;align-items:center;gap:.7rem;padding:.8rem .95rem;border-radius:1rem;border:1px solid color-mix(in srgb,var(--border) 80%,var(--accent-alt) 20%);background:color-mix(in srgb,var(--surface) 88%,transparent)}",
    ".content-mini-icon{width:1.75rem;height:1.75rem;border-radius:.55rem;object-fit:cover;flex:none;background:color-mix(in srgb,var(--surface) 68%,black)}",
    ".content-talk-item{display:grid;gap:.22rem;padding:.9rem 1rem;border-radius:1rem;border:1px solid color-mix(in srgb,var(--border) 80%,var(--accent-alt) 20%);background:color-mix(in srgb,var(--surface) 90%,transparent)}",
    ".content-status-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.8rem;width:100%}",
    ".content-status-panel{padding:.9rem 1rem;border-radius:1rem;border:1px solid color-mix(in srgb,var(--border) 76%,var(--accent) 24%);background:color-mix(in srgb,var(--surface) 90%,transparent)}",
    ".content-status-label{text-transform:uppercase;letter-spacing:.08em;font-size:.72rem}",
    ".content-status-value{margin-top:.3rem;font-size:1.05rem}",
    "@media(hover:hover){.content-social-link:hover,.content-project-card:hover,.content-fact-label:hover,.content-talk-item:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--accent) 44%,var(--border))}}",
    "@media(max-width:640px){.content-project-card{grid-template-columns:minmax(0,3.5rem) minmax(0,1fr);padding:.8rem}.content-project-image{width:3.5rem;height:3.5rem;border-radius:.95rem}}"
  ].join("");
}

function createMockDesign({ dateSeed, numericSeed }) {
  const palettes = [
    { background: "#0f172a", surface: "#172554", text: "#eff6ff", muted: "#bfdbfe", accent: "#22d3ee", accent_alt: "#38bdf8", border: "#1d4ed8" },
    { background: "#111827", surface: "#1f2937", text: "#f9fafb", muted: "#cbd5e1", accent: "#f59e0b", accent_alt: "#fb7185", border: "#374151" },
    { background: "#052e16", surface: "#14532d", text: "#ecfdf5", muted: "#bbf7d0", accent: "#34d399", accent_alt: "#22d3ee", border: "#166534" }
  ];
  const palette = palettes[numericSeed % palettes.length];
  const labels = ["Signal Bloom", "Orbit Edition", "Canvas Shift"];

  return {
    themeName: "Mock Daily Edition",
    primaryFont: "Inter",
    displayFont: "Space Grotesk",
    theme: palette,
    dailyLabel: labels[numericSeed % labels.length],
    layoutCss: [
      ".daily-shell{max-width:72rem;margin:0 auto;padding:clamp(1rem,2vw,2rem);display:grid;gap:1rem}",
      ".daily-hero{display:grid;grid-template-columns:minmax(0,7rem) minmax(0,1fr);gap:1rem;align-items:center;padding:1.25rem;border-radius:1.5rem;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--border)}",
      ".daily-hero img{width:7rem;height:7rem;border-radius:1.5rem;object-fit:cover;border:2px solid color-mix(in srgb,var(--accent) 60%,var(--border))}",
      ".daily-kicker{font-size:.8rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}",
      ".daily-title{margin:.3rem 0 0;font:700 clamp(2rem,5vw,4rem)/.95 var(--font-display)}",
      ".daily-bio{margin:.65rem 0 0;max-width:40rem;color:var(--muted);font-size:1.05rem}",
      ".daily-meta{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1rem}",
      ".daily-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:1rem}",
      ".daily-panel{padding:1.1rem;border-radius:1.35rem;background:color-mix(in srgb,var(--surface) 88%,transparent);border:1px solid var(--border);display:grid;gap:.9rem}",
      ".daily-panel h2{margin:0;font:700 1.1rem/1.1 var(--font-display)}",
      ".daily-stack{display:grid;gap:.8rem}",
      ".daily-note{font-size:1.05rem}",
      "@media(max-width:860px){.daily-hero{grid-template-columns:1fr;text-align:center}.daily-hero img{margin:0 auto}.daily-grid{grid-template-columns:1fr}}"
    ].join(""),
    bodyHtml: `<main class="daily-shell">
      <section class="daily-hero">
        <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}">
        <div>
          <div class="daily-kicker">Mock preview for ${esc(dateSeed)}</div>
          <h1 class="daily-title">{{NAME}}</h1>
          <p class="daily-bio">{{BIO}}</p>
          <div class="daily-meta">{{SOCIAL_LINK_ITEMS}}</div>
        </div>
      </section>
      <section class="daily-grid">
        <section class="daily-panel">
          <h2>Today</h2>
          <div class="daily-note">{{DAILY_NOTE}}</div>
          {{STATUS_PANELS}}
          <div class="daily-stack">{{FACT_ITEMS}}</div>
        </section>
        <section class="daily-stack">
          <section class="daily-panel">
            <h2>Projects</h2>
            <div class="daily-stack">{{PROJECT_ITEMS}}</div>
          </section>
          <section class="daily-panel">
            <h2>Talks</h2>
            <div class="daily-stack">{{TALK_ITEMS}}</div>
          </section>
        </section>
      </section>
    </main>`,
    formattedDate: formatHumanDate(dateSeed)
  };
}

function clientJs() {
  return `(function(){var el=document.getElementById("daily-site-config");if(!el)return;var c=JSON.parse(el.textContent);function nr(now){var n=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),c.refreshScheduleUtc.hour,c.refreshScheduleUtc.minute));if(n<=now)n.setUTCDate(n.getUTCDate()+1);return n}function cd(){var s=Math.max(0,Math.floor((nr(new Date())-new Date())/1000));var e=document.querySelector("[data-role='design-countdown']");if(e){var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);e.textContent=h>0?h+"h "+m+"m":m>0?m+"m":s+"s"}}function cl(){var t=new Intl.DateTimeFormat("en-GB",{timeZone:c.timezone,hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date()).toLowerCase();document.querySelectorAll("[data-role='local-time']").forEach(function(n){n.textContent=t})}function w(){fetch("https://api.open-meteo.com/v1/forecast?latitude="+c.weather.latitude+"&longitude="+c.weather.longitude+"&current_weather=true").then(function(r){return r.json()}).then(function(d){var t=Math.round(d.current_weather.temperature);var m={0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Cloudy",45:"Fog",48:"Fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Rain",63:"Rain",65:"Rain",71:"Snow",73:"Snow",75:"Snow",80:"Showers",81:"Showers",82:"Showers",95:"Storm",96:"Storm",99:"Storm"};document.querySelectorAll("[data-role='local-weather']").forEach(function(n){n.textContent=(m[d.current_weather.weathercode]||"Weather")+" \\u00b7 "+t+"C"})}).catch(function(){document.querySelectorAll("[data-role='local-weather']").forEach(function(n){n.textContent="Unavailable"})})}cd();cl();w();setInterval(cd,1000);setInterval(cl,1000);setInterval(w,900000)})()`;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
