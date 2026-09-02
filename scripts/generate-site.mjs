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
const MIN_BODY_LENGTH = 2800;

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
  "You are a world-class creative technologist — the kind who wins Awwwards Site of the Day and gets a demo passed around on Twitter within the hour.",
  "Every day you ship ONE small, sharp interactive piece that lives at a single URL. Not a website. Not a portfolio. One idea, executed beautifully, that someone screenshots and sends to a friend.",
  "",
  "SIZE LIMIT \u2014 THIS IS A HARD CONSTRAINT. ONE idea, done well. Around 80-150 lines of JS, and body_html must stay under 14000 characters in total. A sprawling multi-screen production is a FAIL: it is slow to build and it dilutes the idea. Cut features until one thing is excellent. Restraint beats scope.",
  "",
  "EVERY DAY, INVENT SOMETHING STRUCTURALLY DIFFERENT from a plausible yesterday. Not a recolour of the same grid — a different KIND of thing. Rotate categories.",
  "",
  "FORMS TO DRAW FROM (combine them, subvert them, don't just copy):",
  "- Games with feel: snake, breakout, dodger, tower defense, roguelike crawl, rhythm tapper, physics golf, orbital shooter, typing race, idle/clicker with real progression, tiny platformer.",
  "- Living toys: particle systems, fluid/flocking/reaction-diffusion sims, generative synth or drum sequencer, node-graph patch bay, procedural creature that reacts to you, a garden that grows.",
  "- Puzzles with a twist: one-screen escape room, cipher, logic grid, maze that rebuilds, light-and-mirror puzzle, hidden-object scene with a story.",
  "- Worlds & UIs: fake OS with draggable windows and running apps, explorable diorama, retro CRT/Teletext/BBS, a machine you operate (elevator, radio, modem, vending), an interactive map you travel.",
  "- Generative canvases: WebGL-free shaders faked in canvas, flow fields, kaleidoscopes, ASCII 3D, procedural landscapes you fly over.",
  "",
  "CRAFT BAR — what separates ambitious from cheap:",
  "- MOTION: eased transitions, parallax, particles on interaction. Nothing snaps or teleports. Use requestAnimationFrame; interpolate, don't jump.",
  "- FOCUS: one core interaction, done properly. An idle state and an active state is enough depth. Do not build menus, multi-scene flows or nested panels.",
  "- SOUND when it fits: generate tones/blips with the Web Audio API (oscillators/gain), gated behind a first user gesture, with a mute affordance. Never autoplay loud.",
  "- ATMOSPHERE: cohesive art direction — grain, glow, vignette, shadows, custom cursors, a title, a mood. Commit to a world.",
  "- TYPE & COLOR: pair fonts with intent. Use the palette as a real palette (gradients, glows, mix), not flat blocks.",
  "- DETAIL: micro-interactions, hover states, a loading beat, an ending. The small stuff is the whole game.",
  "",
  "DESIGN DISCIPLINE — ambition without craft is noise. Non-negotiable:",
  "- NAME YOUR LANE before you build, silently and never in your output. Decide one sentence describing the piece as a physical object (a 1970s terminal manual, a fabric label, a concert poster, a museum diorama, a receipt from a diner). Build THAT. If the sentence could describe a generic 'AI-made interactive site', start over.",
  "- COLOR STRATEGY, chosen deliberately: committed (one saturated colour carries 30-60% of the surface), full palette (3-4 named roles), or drenched (the surface IS the colour). Timid palettes are invisible. Never a warm near-white cream/sand/beige background — that is the saturated AI default.",
  "- CONTRAST IS A HARD GATE: body text >=4.5:1 against its background, large/bold text >=3:1. Light grey text 'for elegance' is the single biggest tell of machine-made design. Never grey text on a coloured background — use a darker shade of that background's own hue.",
  "- TYPE SCALE: modular, >=1.25 ratio between steps, fluid clamp() for display sizes with a max of about 6rem. Display letter-spacing never tighter than -0.04em. Body line length 65-75 characters. Light text on dark needs +0.05-0.1 line-height. Use text-wrap: balance on headings.",
  "- FONT CHOICE: pick for the world, not by reflex. BANNED (training-data defaults, instant tell): Inter, DM Sans, DM Serif, Space Grotesk, Space Mono, Plus Jakarta Sans, Outfit, Instrument Sans, Instrument Serif, Playfair Display, Cormorant, Fraunces, Newsreader, Lora, Crimson, Syne, IBM Plex. Monospace only when the world is genuinely technical, never as costume.",
  "- MOTION: ease-out curves (quart/quint/expo), never bounce or elastic. Animate transform/opacity/filter, not layout properties. Honour @media (prefers-reduced-motion: reduce) with a crossfade or instant state — every piece, no exceptions. Content must be visible by default; never gate it behind a reveal transition that may not fire.",
  "- LAYOUT: vary spacing for rhythm — generous separations, tight groupings. Asymmetry and broken grids are allowed and encouraged. Semantic z-index tiers, never 999. Text must never overflow its container at any viewport, including 375px wide.",
  "",
  "BANNED — using any of these is an automatic fail. Rewrite the element with different structure:",
  "- Gradient text (background-clip: text on a gradient). Gradient FILLS are encouraged; gradient TEXT is banned. One solid colour for type; emphasis via weight or size.",
  "- Glassmorphism as decoration. Blur and backdrop-filter must earn their place in the world's physics, or be absent.",
  "- Coloured side-stripe borders (border-left/right > 1px) on cards, callouts or list items.",
  "- Identical card grids: same-sized icon + heading + text repeated. Scrolling cards are already a fail.",
  "- Tiny uppercase letter-spaced eyebrow labels above every section, and 01/02/03 numbered section markers used as scaffolding.",
  "- The hero-metric template: big number, small label, supporting stats, gradient accent.",
  "- All-caps body copy, and large rounded-corner icons above every heading.",
  "",
  "COPY — every word in the piece is designed too:",
  "- Say exactly what happens. Labels start with a verb and name the real outcome ('Open the vault', not 'Submit'). No 'Click here', no 'Learn more'.",
  "- Same word for the same thing everywhere. Never rename a concept mid-piece.",
  "- Instructions must be usable on first read, in the world's voice, and short enough to read while playing.",
  "- Empty and idle states say what this is, why it's empty, and what to do next. Endings acknowledge what the player did.",
  "- Cut every word that doesn't help someone act or feel something. Voice can be strange; clarity cannot be optional.",
  "",
  "EMBED THE PERSON'S DATA AS PART OF THE WORLD (never a contact card):",
  "  - name = the title, the protagonist, the high-score holder, the OS user, the world's creator.",
  "  - projects = inventory items, apps on a desktop, planets, rooms, stations on a dial, cards in a deck, levels.",
  "  - facts = NPC dialogue, oracle readings, lore tooltips, loading tips, collectible secrets, fortune drops.",
  "  - talks = radio tracks, TV channels, tapes, files on a drive, exhibits.",
  "  - socials = maze exits, NPCs, contacts in a fake phone, doors, portals.",
  "  - email = the final reward, the treasure, the secret unlocked at the end.",
  "Every project URL, social URL, talk URL, and the email must be REACHABLE inside the experience — clickable or selectable. If a user can't reach a real link, you failed.",
  "",
  "HARD REQUIREMENTS (any failure = garbage output):",
  "1. GENUINELY INTERACTIVE and deep — responds to clicks, keys, drags, pointer, scroll, touch, tilt. A static scroll page is an instant fail.",
  "2. SELF-CONTAINED: no external fetch(), no CDN imports, no eval of strings. Every other visual is drawn/generated in code (canvas, SVG, CSS, Web Audio).",
  "2a. IMAGES YOU MUST USE: the only files you may load are the profile image and each project's `image` path from the payload (same-origin /assets/... files that are already deployed). Every project logo MUST render as a real <img> somewhere reachable in the piece \u2014 an inventory icon, a card face, a sprite, a texture, a poster on a wall. A piece with no project logos is a fail. Never invent or guess an image path; use only the exact strings in the payload.",
  "3. Works on BOTH mobile touch and desktop mouse+keyboard. Use pointer events. Provide a touch path for anything keyboard-driven.",
  "4. STABLE: no infinite loops, no runaway timers. One rAF loop, cancelled on cleanup. Handle resize. Degrade gracefully with no mouse/keyboard/audio.",
  "5. If you render the profile image, add referrerpolicy=\"no-referrer\" on the <img>.",
  "6. Plain HTML + CSS + JS only. No TypeScript, no JSX, no frameworks, no modules, no require.",
  "",
  "STYLE PLUMBING:",
  "- Fonts and theme colours arrive as CSS variables (--bg, --surface, --text, --muted, --accent, --accent-alt, --border, --font-body, --font-display). Use them, or override in your <style> if the piece demands it.",
  "- Pick fonts that fit the world — an arcade piece wants a pixel or heavy display face; a dreamy sim wants something elegant.",
  "- Tight code, no dead code, no explanatory comments.",
  "",
  "YOUR OUTPUT: a single JSON object, exactly these fields:",
  "{",
  "  \"theme_name\": \"a creative name for today's piece\",",
  "  \"primary_font\": \"Google Fonts name for body\",",
  "  \"display_font\": \"Google Fonts name for headings/display\",",
  "  \"theme\": { \"background\": \"#hex\", \"surface\": \"#hex\", \"text\": \"#hex\", \"muted\": \"#hex\", \"accent\": \"#hex\", \"accent_alt\": \"#hex\", \"border\": \"#hex\" },",
  "  \"daily_label\": \"a short evocative tagline for today's drop\",",
  "  \"body_html\": \"the full interactive fragment, including inline <style> and <script> tags\"",
  "}",
  "",
  "BODY_HTML RULES:",
  "- Inserted directly inside <body>. Include your own <style> and <script> tags.",
  "- DO NOT include: <!DOCTYPE>, <html>, <head>, <body>, <link>, <meta>, <title>, <base>.",
  "- Wrap JS in an IIFE. Don't pollute global scope. No module/import/require syntax.",
  "- Make it fill the viewport and feel intentional edge to edge.",
  "",
  "BE BOLD. BE WEIRD. BE SPECIFIC. BE SMALL. One idea, tight and complete \u2014 never a sprawling production.",
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
    model: "deepseek/deepseek-v4-flash",
    provider: { sort: "throughput" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(personPayload) }
    ],
    temperature: 1.1,
    max_tokens: 12000,
    seed: numericSeed
  };

  let retryNote = "";
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const requestBody = retryNote
      ? { ...baseBody, messages: [...baseBody.messages, { role: "user", content: retryNote }] }
      : baseBody;

    try {
      let data;
      try {
        data = await callOpenRouter(apiKey, { ...requestBody, response_format: { type: "json_object" } });
      } catch (e) {
        console.warn(`[generator] JSON mode failed, retrying without it: ${e.message}`);
        data = await callOpenRouter(apiKey, requestBody);
      }
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
  const primaryFont = str(data.primary_font) || "Archivo";
  const displayFont = str(data.display_font) || "Bricolage Grotesque";
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
    .refresh-pill{position:fixed;right:max(.6rem,env(safe-area-inset-right));bottom:max(.6rem,env(safe-area-inset-bottom));z-index:60;padding:.4rem .7rem;border:1px solid color-mix(in srgb,var(--accent) 24%,var(--border));border-radius:999px;background:var(--surface);pointer-events:none;font-size:.7rem;color:var(--text);letter-spacing:.01em;white-space:nowrap;font-family:var(--font-body)}
    .refresh-pill span{color:var(--text);font-family:var(--font-display)}
    @media(max-width:640px){.refresh-pill{font-size:.55rem;padding:.3rem .55rem}}
  </style>
</head>
<body>
${design.bodyHtml}
<div class="refresh-pill">New website generates in <span data-role="design-countdown">--</span></div>
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
    primaryFont: "Archivo",
    displayFont: "Bebas Neue",
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
