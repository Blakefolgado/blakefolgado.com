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
const MIN_BODY_LENGTH = 600;

const FORBIDDEN_TAG_REGEX = /<(?:!DOCTYPE|html|head|body|title|link|meta|base)\b/i;

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

const SYSTEM_PROMPT = [
  "You are an experimental artist shipping a DAILY INTERNET ART PIECE that lives at one URL.",
  "It is not a website. It is not a portfolio. It is an interactive artefact — a toy, a game, a puzzle, a simulator, a weird UI. Something a person would screenshot and share because it's unexpected.",
  "",
  "EVERY DAY YOU MUST INVENT SOMETHING STRUCTURALLY DIFFERENT. Not a different colour scheme over the same cards-in-a-grid. A different KIND of thing.",
  "",
  "PICK ONE FORM (rotate — never repeat yesterday's category):",
  "- Playable game: snake, pong, tic-tac-toe, minesweeper, breakout, solitaire, memory match, simon-says, dodger, typing race, reaction timer, chess puzzle, clicker, whack-a-mole, flappy bird, space invaders.",
  "- Interactive toy: drawing pad, particle fountain, physics sandbox, music sequencer, drum machine, synth keyboard, magic 8-ball, tarot draw, oracle, fortune teller, fake ouija, radio dial, TV tuner.",
  "- Puzzle: sliding tile, crossword, maze, word unscramble, hidden object, logic grid, riddle, one-screen escape room, cipher, pipe connector.",
  "- Simulator: Conway's Life, flocking birds, plant growth, orbit, weather, pendulum, ant colony, lava lamp, fireflies, starfield, ecosystem.",
  "- Generative art that reacts: Perlin landscape, ASCII fractal, cellular automaton, mouse-trail painter, spirograph, kaleidoscope, pixel-by-pixel bloom.",
  "- Weird UI: terminal REPL, text adventure, fake OS desktop with draggable windows, fax machine, pager, answering machine, typewriter, elevator panel, dial-up modem, CRT TV, Teletext, BBS forum, vending machine.",
  "",
  "HARD REQUIREMENTS (failure to meet any = garbage output):",
  "1. INTERACTIVE. Something must respond to clicks, keys, drags, scroll, touch, hover, or tilt. Static scrolling pages are failures.",
  "2. EMBED THE PERSON'S DATA INSIDE THE EXPERIENCE. Not as a contact card. Examples:",
  "   - name = title of the text adventure, or the game-over screen, or the high-score holder",
  "   - projects = inventory items, app icons on a fake desktop, cards in a deck, stations on a dial, rooms in a map",
  "   - facts = fortune cookies, oracle readings, NPC dialogue, lore tooltips, loading-screen tips",
  "   - talks = tracks on a radio, channels on a TV, tapes in a deck, files on a drive",
  "   - socials = exits in a maze, NPCs, inbox items, contacts in a fake phone",
  "   - email = hidden reward at the end",
  "3. No external fetch(). No CDN imports. No dynamic code execution from strings.",
  "4. Works on mobile touch AND desktop mouse+keyboard. Use pointer events where possible.",
  "5. STABLE. No infinite loops. No runaway setInterval. Use requestAnimationFrame for animation. Listen for resize. Clean up listeners. Handle the case where the user has no mouse or no keyboard.",
  "6. All project URLs, social URLs, talk URLs, and email must be REACHABLE inside the experience (clickable, selectable). If a user can't get from the artefact to a real link, you failed.",
  "7. If you render the profile image, use referrerpolicy=\"no-referrer\" on the <img>.",
  "8. No TypeScript. No JSX. Plain HTML + CSS + JS. No framework imports.",
  "",
  "STYLE:",
  "- Fonts provided as CSS variables; use them or override in your <style>.",
  "- Theme colours provided as CSS variables; use them or override.",
  "- Keep CSS and JS tight. No dead code. No comments describing what the code does.",
  "- Prefer canvas or inline SVG for graphics. Prefer CSS animations over JS loops when you can.",
  "",
  "YOUR OUTPUT: a single JSON object, exactly these fields:",
  "{",
  "  \"theme_name\": \"a creative name for today's piece\",",
  "  \"primary_font\": \"Google Fonts name for body\",",
  "  \"display_font\": \"Google Fonts name for headings\",",
  "  \"theme\": { \"background\": \"#hex\", \"surface\": \"#hex\", \"text\": \"#hex\", \"muted\": \"#hex\", \"accent\": \"#hex\", \"accent_alt\": \"#hex\", \"border\": \"#hex\" },",
  "  \"daily_label\": \"a short tagline for today's drop\",",
  "  \"body_html\": \"the full interactive fragment, including inline <style> and <script> tags\"",
  "}",
  "",
  "BODY_HTML RULES:",
  "- The fragment gets inserted directly inside <body>. Write <style> and <script> tags in it.",
  "- DO NOT include: <!DOCTYPE>, <html>, <head>, <body>, <link>, <meta>, <title>, <base>.",
  "- CSS vars on :root: --bg, --surface, --text, --muted, --accent, --accent-alt, --border, --font-body, --font-display.",
  "- All scripts run inline. Wrap your JS in an IIFE. Don't pollute global scope.",
  "- No module imports, no require, no ES modules syntax.",
  "",
  "BE BOLD. BE WEIRD. BE SPECIFIC. Don't make a personal site. Make a thing worth sharing.",
  "",
  "Return valid JSON only, no markdown fences."
].join("\n");

async function generatePage({ apiKey, content, dateSeed, numericSeed }) {
  const personPayload = {
    date: dateSeed,
    formattedDate: formatHumanDate(dateSeed),
    person: {
      name: content.person.name,
      bio: content.person.tagline,
      email: content.person.email,
      profileImage: content.site.images.profile,
      socials: content.person.socials,
      projects: content.projects,
      facts: content.facts,
      talks: content.talks
    },
    location: content.site.locationLabel,
    timezone: content.site.timezone
  };

  const baseBody = {
    model: "moonshotai/kimi-k2.6",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(personPayload) }
    ],
    temperature: 1.25,
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
        "Return fresh JSON. body_html must be a complete, working, INTERACTIVE fragment.",
        "Do NOT include <!DOCTYPE>, <html>, <head>, <body>, <link>, <meta>, <title>, or <base> tags.",
        "Include inline <style> and <script>. It must NOT be a scrolling card layout."
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
  const themeName = str(data.theme_name) || "Daily Drop";
  const primaryFont = str(data.primary_font) || "Inter";
  const displayFont = str(data.display_font) || "Space Grotesk";
  const fallbackTheme = { background: "#0a0a0f", surface: "#161622", text: "#f0f0f5", muted: "#8888a0", accent: "#5af2c6", accent_alt: "#ff6b9d", border: "#2a2a3a" };
  const theme = {};
  for (const key of Object.keys(fallbackTheme)) {
    const v = data?.theme?.[key];
    theme[key] = (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim())) ? v.trim() : fallbackTheme[key];
  }
  const dailyLabel = str(data.daily_label) || themeName;
  const bodyHtml = normalizeBodyHtml(data.body_html);
  validateBodyHtml(bodyHtml);

  return {
    themeName,
    primaryFont,
    displayFont,
    theme,
    dailyLabel,
    bodyHtml,
    formattedDate: formatHumanDate(dateSeed)
  };
}

function normalizeBodyHtml(v) {
  if (typeof v !== "string") return "";
  let html = v.trim();
  if (!html) return "";

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) html = bodyMatch[1];

  return html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?(?:html|head|body|title)\b[^>]*>/gi, "")
    .replace(/<(?:link|meta|base)\b[^>]*\/?>/gi, "")
    .trim();
}

function validateBodyHtml(html) {
  if (!html || html.length < MIN_BODY_LENGTH) {
    throw new Error(`body_html too short (${html?.length ?? 0} chars, need at least ${MIN_BODY_LENGTH})`);
  }
  if (FORBIDDEN_TAG_REGEX.test(html)) {
    throw new Error("body_html contains document-level tags that couldn't be stripped");
  }
  if (!/<script\b[^>]*>[\s\S]*?<\/script>/i.test(html) && !/<style\b[^>]*>[\s\S]*?<\/style>/i.test(html)) {
    throw new Error("body_html missing <style> and <script> — must include inline styles and scripts for an interactive piece");
  }
}

function renderSite({ content, dateSeed, design }) {
  const fonts = [...new Set([design.primaryFont, design.displayFont])].map((f) => f.replace(/ /g, "+") + ":wght@300;400;500;600;700;800").join("&family=");
  const cfg = JSON.stringify({ timezone: content.site.timezone, locationLabel: content.site.locationLabel, weather: content.site.weather, refreshScheduleUtc: DAILY_REFRESH_UTC }).replace(/</g, "\\u003c");

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
    *,*::before,*::after{box-sizing:border-box}html,body{margin:0;padding:0;min-height:100%}body{background:var(--bg);color:var(--text);font-family:var(--font-body);line-height:1.5;overflow-x:hidden}img{max-width:100%}a{color:inherit}
    .refresh-pill{position:fixed;right:max(.6rem,env(safe-area-inset-right));bottom:max(.6rem,env(safe-area-inset-bottom));z-index:9999;padding:.4rem .7rem;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--border));border-radius:999px;background:rgba(10,10,12,.65);backdrop-filter:blur(14px);pointer-events:none;font-size:.62rem;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap;font-family:var(--font-body)}
    .refresh-pill span{color:var(--text);font-family:var(--font-display)}
    @media(max-width:640px){.refresh-pill{font-size:.55rem;padding:.3rem .55rem}}
  </style>
</head>
<body>
${design.bodyHtml}
<div class="refresh-pill">next drop in <span data-role="design-countdown">--</span></div>
<script id="daily-site-config" type="application/json">${cfg}</script>
<script>${clientJs()}</script>
</body>
</html>
`;

  return htmlDoc;
}

function esc(v) { return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }

function createMockDesign({ dateSeed, numericSeed }) {
  const palettes = [
    { background: "#0a0a0f", surface: "#141420", text: "#f0f0f5", muted: "#8888a0", accent: "#5af2c6", accent_alt: "#ff6b9d", border: "#2a2a3a" },
    { background: "#1a0033", surface: "#2a0055", text: "#ffeeff", muted: "#aa88cc", accent: "#ffcc00", accent_alt: "#ff00aa", border: "#3a0066" }
  ];
  const palette = palettes[numericSeed % palettes.length];
  return {
    themeName: "Mock Letter Toy",
    primaryFont: "IBM Plex Mono",
    displayFont: "Space Mono",
    theme: palette,
    dailyLabel: "Mock drop",
    bodyHtml: mockBodyHtml(),
    formattedDate: formatHumanDate(dateSeed)
  };
}

function mockBodyHtml() {
  return `<style>
body{font-family:var(--font-body);overflow:hidden;height:100vh}
.stage{position:fixed;inset:0;display:grid;place-items:center}
.word{font-family:var(--font-display);font-size:clamp(2.5rem,12vw,7rem);font-weight:700;letter-spacing:.02em;user-select:none}
.word span{display:inline-block;cursor:pointer;transition:transform .25s cubic-bezier(.2,.9,.3,1.4),color .2s}
.word span:hover{color:var(--accent);transform:translateY(-.35rem) rotate(-6deg)}
.hint{position:fixed;left:0;right:0;bottom:3.2rem;text-align:center;color:var(--muted);font-size:.8rem;letter-spacing:.2em;text-transform:uppercase}
.links{position:fixed;top:1.2rem;left:1.2rem;display:flex;flex-direction:column;gap:.4rem}
.links a{font-size:.75rem;color:var(--muted);text-decoration:none;border-bottom:1px dashed var(--border);padding-bottom:.15rem}
.links a:hover{color:var(--accent-alt)}
</style>
<div class="stage">
  <div class="word" id="mock-word"></div>
</div>
<div class="links">
  <a href="mailto:blake@blakefolgado.com">email</a>
  <a href="https://x.com/blakefolgado" target="_blank" rel="noreferrer">x</a>
</div>
<div class="hint">click the letters</div>
<script>
(function(){
  var word=document.getElementById('mock-word');
  'BLAKE FOLGADO'.split('').forEach(function(ch){
    var s=document.createElement('span');
    s.textContent=ch===' '?'\\u00A0':ch;
    s.addEventListener('click',function(){
      s.style.color='hsl('+Math.floor(Math.random()*360)+',80%,65%)';
      s.style.transform='translateY('+(Math.random()*-20-5)+'px) rotate('+(Math.random()*40-20)+'deg)';
    });
    word.appendChild(s);
  });
})();
</script>`;
}

function clientJs() {
  return `(function(){var el=document.getElementById("daily-site-config");if(!el)return;var c=JSON.parse(el.textContent);function nr(now){var n=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),c.refreshScheduleUtc.hour,c.refreshScheduleUtc.minute));if(n<=now)n.setUTCDate(n.getUTCDate()+1);return n}function cd(){var s=Math.max(0,Math.floor((nr(new Date())-new Date())/1000));var e=document.querySelector("[data-role='design-countdown']");if(e){var h=Math.floor(s/3600);var m=Math.floor((s%3600)/60);e.textContent=h>0?h+"h "+m+"m":m>0?m+"m":s+"s"}}function cl(){var t=new Intl.DateTimeFormat("en-GB",{timeZone:c.timezone,hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date()).toLowerCase();document.querySelectorAll("[data-role='local-time']").forEach(function(n){n.textContent=t})}function w(){fetch("https://api.open-meteo.com/v1/forecast?latitude="+c.weather.latitude+"&longitude="+c.weather.longitude+"&current_weather=true").then(function(r){return r.json()}).then(function(d){var t=Math.round(d.current_weather.temperature);var m={0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Cloudy",45:"Fog",48:"Fog",51:"Drizzle",53:"Drizzle",55:"Drizzle",61:"Rain",63:"Rain",65:"Rain",71:"Snow",73:"Snow",75:"Snow",80:"Showers",81:"Showers",82:"Showers",95:"Storm",96:"Storm",99:"Storm"};document.querySelectorAll("[data-role='local-weather']").forEach(function(n){n.textContent=(m[d.current_weather.weathercode]||"Weather")+" \\u00b7 "+t+"C"})}).catch(function(){document.querySelectorAll("[data-role='local-weather']").forEach(function(n){n.textContent="Unavailable"})})}cd();cl();w();setInterval(cd,1000);setInterval(cl,1000);setInterval(w,900000)})()`;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
