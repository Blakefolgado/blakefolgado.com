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
const DAILY_REFRESH_UTC = {
  hour: 8,
  minute: 17
};

const EXPERIENCE_MODES = [
  "website",
  "poster",
  "dashboard",
  "game",
  "exhibit",
  "terminal",
  "studio"
];

const INTERACTION_PRESETS = [
  "spotlight",
  "drift",
  "ticker",
  "scanner",
  "arcade",
  "constellation",
  "pulse"
];

const MODE_INTERACTIONS = {
  website: ["spotlight", "drift", "pulse"],
  poster: ["ticker", "spotlight", "pulse"],
  dashboard: ["drift", "scanner", "pulse"],
  game: ["arcade", "scanner", "constellation"],
  exhibit: ["constellation", "spotlight", "ticker"],
  terminal: ["scanner", "ticker", "pulse"],
  studio: ["drift", "spotlight", "constellation"]
};

const FONT_CATALOG = {
  "Archivo Black": "Archivo+Black",
  "Bebas Neue": "Bebas+Neue",
  "Bricolage Grotesque": "Bricolage+Grotesque:wght@200;300;400;500;600;700;800",
  "Chivo Mono": "Chivo+Mono:wght@400;500;700",
  "Cormorant Garamond": "Cormorant+Garamond:wght@400;500;600;700",
  "DM Serif Display": "DM+Serif+Display:ital@0;1",
  "IBM Plex Mono": "IBM+Plex+Mono:wght@400;500;600",
  "Instrument Serif": "Instrument+Serif:ital@0;1",
  "JetBrains Mono": "JetBrains+Mono:wght@400;500;700;800",
  Manrope: "Manrope:wght@400;500;600;700;800",
  "Plus Jakarta Sans": "Plus+Jakarta+Sans:wght@400;500;600;700;800",
  "Public Sans": "Public+Sans:wght@400;500;600;700;800",
  Sora: "Sora:wght@300;400;500;600;700;800",
  "Space Grotesk": "Space+Grotesk:wght@300;400;500;700",
  Syne: "Syne:wght@400;500;600;700;800"
};

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

const CREATIVE_BANK = {
  mediums: [
    "museum placard system",
    "arcade cabinet",
    "racing HUD",
    "magazine cover",
    "airport departures board",
    "lab notebook",
    "night market signage",
    "operating system desktop",
    "trading terminal",
    "festival poster wall"
  ],
  materials: [
    "frosted acrylic",
    "sprayed metal",
    "CRT glow",
    "paper tape",
    "liquid chrome",
    "translucent vinyl",
    "matte rubber",
    "sun-faded poster ink",
    "laser-cut plastic",
    "neon wire"
  ],
  motion: [
    "slow scanner sweeps",
    "cursor-reactive light",
    "floating cards",
    "ticker belts",
    "score flashes",
    "orbiting dots",
    "gravity-like drift",
    "soft pulse hits"
  ],
  mood: [
    "sharp and playful",
    "expensive but weird",
    "found-object futurism",
    "restless editorial energy",
    "calm confidence",
    "optimistic machine age",
    "late-night internet energy",
    "softly competitive"
  ],
  accents: [
    "oversized numerals",
    "tiny system labels",
    "tilted frames",
    "thick borders",
    "micro-interaction HUD",
    "split-screen composition",
    "stacked badges",
    "unexpected whitespace"
  ]
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const content = await readJson(CONTENT_PATH);
  const dateSeed = args.date ?? getCurrentDateInTimezone(content.site.timezone);
  const numericSeed = hashStringToInt(dateSeed);
  const ingredients = buildCreativeIngredients(numericSeed);
  const outputDir = path.resolve(ROOT, process.env.SITE_OUTPUT_DIR || DEFAULT_OUTPUT_DIR);
  const outputPath = path.join(outputDir, "index.html");

  let generationSource = args.mock ? "mock" : "mock-fallback";
  let freeModels = [];
  let styleSpec = null;
  let designPackage = null;

  if (!args.mock && process.env.OPENROUTER_API_KEY) {
    try {
      freeModels = await getFreeModels();
      styleSpec = await generateStyleSpec({
        apiKey: process.env.OPENROUTER_API_KEY,
        content,
        dateSeed,
        numericSeed,
        ingredients,
        freeModels
      });
      designPackage = await generateDesignPackage({
        apiKey: process.env.OPENROUTER_API_KEY,
        content,
        dateSeed,
        numericSeed,
        freeModels,
        styleSpec
      });
      generationSource = "openrouter";
    } catch (error) {
      console.error(`[generator] OpenRouter generation failed: ${error.message}`);
    }
  } else if (!args.mock) {
    console.warn("[generator] OPENROUTER_API_KEY not set. Using deterministic local fallback.");
  }

  if (!styleSpec || !designPackage) {
    const fallback = generateLocalDesign({
      content,
      dateSeed,
      numericSeed,
      ingredients
    });
    styleSpec = fallback.styleSpec;
    designPackage = fallback.designPackage;
  }

  const normalized = normalizeDesign({
    styleSpec,
    designPackage,
    dateSeed,
    numericSeed
  });

  const html = renderSite({
    content,
    dateSeed,
    generationSource,
    design: normalized
  });

  await mkdir(path.dirname(META_PATH), { recursive: true });
  await prepareOutputDirectory(outputDir);
  await writeFile(outputPath, html, "utf8");
  await copyPublicAssets(outputDir);
  await writeFile(
    META_PATH,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        generationSource,
        dateSeed,
        model: "openrouter/auto",
        freeModelCount: freeModels.length,
        freeModelsSample: freeModels.slice(0, 12),
        themeName: normalized.themeName,
        experienceMode: normalized.experienceMode,
        interactionPreset: normalized.interactionPreset,
        primaryFont: normalized.primaryFont,
        displayFont: normalized.displayFont,
        dailyLabel: normalized.dailyLabel,
        stylePrompt: normalized.stylePrompt,
        motifs: normalized.motifs
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `[generator] Wrote ${path.relative(ROOT, outputPath)} (${generationSource}, ${normalized.experienceMode}, ${normalized.interactionPreset})`
  );
}

function parseArgs(argv) {
  const args = {
    mock: false,
    date: null
  };

  for (const arg of argv) {
    if (arg === "--mock") {
      args.mock = true;
      continue;
    }

    if (arg.startsWith("--date=")) {
      args.date = arg.slice("--date=".length);
    }
  }

  return args;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function prepareOutputDirectory(outputDir) {
  await mkdir(outputDir, { recursive: true });

  if (outputDir !== ROOT) {
    await rm(outputDir, { recursive: true, force: true });
    await mkdir(outputDir, { recursive: true });
  }
}

async function copyPublicAssets(outputDir) {
  if (outputDir === ROOT) {
    return;
  }

  await cp(OG_IMAGE_PATH, path.join(outputDir, "og.png"));
}

function getCurrentDateInTimezone(timezone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function formatHumanDate(dateSeed) {
  const [year, month, day] = dateSeed.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function hashStringToInt(value) {
  return createHash("sha256").update(value).digest().readUInt32BE(0);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne(items, rng, fallback = items[0]) {
  if (!items.length) {
    return fallback;
  }
  return items[Math.floor(rng() * items.length)] ?? fallback;
}

function pickUnique(items, rng, count) {
  const pool = [...items];
  const picked = [];

  while (pool.length && picked.length < count) {
    const index = Math.floor(rng() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }

  return picked;
}

function buildCreativeIngredients(seed) {
  const rng = mulberry32(seed ^ 0x9e3779b9);

  return {
    mediums: pickUnique(CREATIVE_BANK.mediums, rng, 2),
    materials: pickUnique(CREATIVE_BANK.materials, rng, 2),
    motion: pickUnique(CREATIVE_BANK.motion, rng, 2),
    mood: pickUnique(CREATIVE_BANK.mood, rng, 2),
    accents: pickUnique(CREATIVE_BANK.accents, rng, 2)
  };
}

async function getFreeModels() {
  const response = await fetch(OPENROUTER_MODELS_URL, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch model list (${response.status})`);
  }

  const payload = await response.json();
  const models = Array.isArray(payload.data) ? payload.data : [];

  const preferred = models.filter((model) => isFreeModel(model) && supportsJson(model) && supportsText(model));
  const fallback = models.filter((model) => isFreeModel(model) && supportsText(model));
  const source = preferred.length ? preferred : fallback;

  return [...new Set(source.map((model) => model.id).filter((id) => id && id !== "openrouter/free"))];
}

function isFreeModel(model) {
  const prompt = Number(model?.pricing?.prompt ?? "1");
  const completion = Number(model?.pricing?.completion ?? "1");
  return prompt === 0 && completion === 0;
}

function supportsText(model) {
  const inputs = model?.architecture?.input_modalities ?? [];
  const outputs = model?.architecture?.output_modalities ?? [];
  return inputs.includes("text") && outputs.includes("text");
}

function supportsJson(model) {
  const parameters = model?.supported_parameters ?? [];
  return parameters.includes("response_format") || parameters.includes("structured_outputs");
}

async function generateStyleSpec({
  apiKey,
  content,
  dateSeed,
  numericSeed,
  ingredients,
  freeModels
}) {
  const prompt = [
    "Create a one-day-only art direction for a personal homepage.",
    "The site belongs to Blake Folgado, a designer and product builder.",
    "The facts must stay true, but the presentation can be bold and strange.",
    "Sometimes the result should feel like a normal website, sometimes a game, poster, terminal, dashboard, or exhibit.",
    "Avoid generic startup portfolio design."
  ].join(" ");

  const { data } = await callOpenRouterJson({
    apiKey,
    freeModels,
    numericSeed,
    temperature: 1.2,
    maxTokens: 1200,
    messages: [
      {
        role: "system",
        content: [
          "You are an inventive creative director.",
          "Return JSON only.",
          `Allowed experience modes: ${EXPERIENCE_MODES.join(", ")}.`,
          `Allowed interaction presets: ${INTERACTION_PRESETS.join(", ")}.`,
          `Allowed fonts: ${Object.keys(FONT_CATALOG).join(", ")}.`,
          "Do not invent biography facts, companies, talks, or projects."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          seed: dateSeed,
          objective: prompt,
          site: {
            title: content.site.title,
            description: content.site.description
          },
          content_summary: {
            name: content.person.name,
            tagline: content.person.tagline,
            project_names: content.projects.map((project) => project.name),
            fact_labels: content.facts.map((fact) => fact.label),
            talk_labels: content.talks.map((talk) => talk.label)
          },
          creative_ingredients: ingredients,
          response_shape: {
            theme_name: "short name for the daily concept",
            experience_mode: "one allowed mode",
            interaction_preset: "one allowed interaction preset",
            primary_font: "one allowed font",
            display_font: "one allowed font",
            style_prompt: "120-220 words",
            palette_brief: "1-2 sentences",
            layout_brief: "1-2 sentences",
            microcopy_tone: "short phrase",
            motifs: ["3-6 motifs"],
            avoid: ["2-5 anti-patterns"]
          }
        })
      }
    ]
  });

  return normalizeStyleSpec(data, numericSeed, ingredients);
}

async function generateDesignPackage({
  apiKey,
  content,
  dateSeed,
  numericSeed,
  freeModels,
  styleSpec
}) {
  const contentSummary = {
    name: content.person.name,
    bio: content.person.tagline,
    socials: content.person.socials.map((social) => social.label),
    projects: content.projects.map((project) => ({
      name: project.name,
      subtitle: project.subtitle
    })),
    facts: content.facts.map((fact) => fact.label),
    talks: content.talks.map((talk) => talk.label)
  };

  const tokenGuide = {
    "{{PROFILE_IMAGE_URL}}": "raw image URL string",
    "{{NAME}}": "plain text name",
    "{{BIO}}": "plain text bio",
    "{{SOCIAL_LINK_ITEMS}}": "sequence of anchor tags",
    "{{PROJECT_ITEMS}}": "sequence of project article cards",
    "{{FACT_ITEMS}}": "sequence of fact article chips",
    "{{TALK_ITEMS}}": "sequence of talk anchor cards",
    "{{DAILY_NOTE}}": "plain text label for the day",
    "{{STATUS_PANELS}}": "complete responsive status block",
    "{{INTRO_KICKER}}": "plain text line",
    "{{PROJECTS_HEADING}}": "plain text heading",
    "{{FACTS_HEADING}}": "plain text heading",
    "{{TALKS_HEADING}}": "plain text heading",
    "{{FOOTER_NOTE}}": "plain text note"
  };

  const { data } = await callOpenRouterJson({
    apiKey,
    freeModels,
    numericSeed: numericSeed ^ 0x85ebca6b,
    temperature: 1.05,
    maxTokens: 4500,
    messages: [
      {
        role: "system",
        content: [
          "You design a static single-page homepage.",
          "Return JSON only.",
          "Do not include script tags, style tags, head tags, body tags, forms, or iframes inside the HTML string.",
          "The page must be responsive and visually coherent on desktop and mobile.",
          "Preserve readability even if the concept is game-like or experimental.",
          "Use the provided content tokens exactly as written.",
          "Do not invent new projects, jobs, or talks."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify({
          seed: dateSeed,
          style_spec: styleSpec,
          raw_content: contentSummary,
          required_tokens: REQUIRED_TEMPLATE_TOKENS,
          optional_tokens: [
            "{{INTRO_KICKER}}",
            "{{PROJECTS_HEADING}}",
            "{{FACTS_HEADING}}",
            "{{TALKS_HEADING}}",
            "{{FOOTER_NOTE}}"
          ],
          token_guide: tokenGuide,
          response_shape: {
            experience_mode: styleSpec.experience_mode,
            interaction_preset: styleSpec.interaction_preset,
            primary_font: styleSpec.primary_font,
            display_font: styleSpec.display_font,
            daily_label: "short line, max 60 chars",
            intro_kicker: "short line",
            projects_heading: "short heading",
            facts_heading: "short heading",
            talks_heading: "short heading",
            footer_note: "short note, max 80 chars",
            theme: {
              background: "#111111",
              surface: "#1d1d1d",
              text: "#f4f4f4",
              muted: "#b3b3b3",
              accent: "#5af2c6",
              accent_alt: "#ffb85c",
              border: "#303030"
            },
            body_html: "HTML string containing all required tokens",
            css: "A complete CSS string for the generated layout"
          }
        })
      }
    ]
  });

  return data;
}

async function callOpenRouterJson({
  apiKey,
  freeModels,
  numericSeed,
  temperature,
  maxTokens,
  messages
}) {
  try {
    return await requestOpenRouter({
      apiKey,
      freeModels,
      numericSeed,
      temperature,
      maxTokens,
      messages,
      useJsonMode: true
    });
  } catch (jsonModeError) {
    console.warn(`[generator] JSON mode failed, retrying without response_format: ${jsonModeError.message}`);
    return await requestOpenRouter({
      apiKey,
      freeModels,
      numericSeed,
      temperature,
      maxTokens,
      messages,
      useJsonMode: false
    });
  }
}

async function requestOpenRouter({
  apiKey,
  freeModels,
  numericSeed,
  temperature,
  maxTokens,
  messages,
  useJsonMode
}) {
  if (!freeModels.length) {
    throw new Error("No free models available for auto-router");
  }

  const body = {
    model: "openrouter/auto",
    messages,
    temperature,
    max_tokens: maxTokens,
    seed: numericSeed,
    plugins: [
      {
        id: "auto-router",
        allowed_models: freeModels.slice(0, 32)
      }
    ]
  };

  if (useJsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(OPENROUTER_CHAT_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": SITE_URL,
      "x-title": SITE_TITLE
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${errorText.slice(0, 400)}`);
  }

  const payload = await response.json();
  const content = extractMessageText(payload?.choices?.[0]?.message?.content);
  const data = parseLooseJson(content);

  if (!data || typeof data !== "object") {
    throw new Error("Model response was not valid JSON");
  }

  return { data, payload };
}

function extractMessageText(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item?.type === "text") {
          return item.text ?? "";
        }
        return "";
      })
      .join("\n");
  }

  return JSON.stringify(content ?? "");
}

function parseLooseJson(raw) {
  const text = String(raw ?? "").trim();
  const withoutFence = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? withoutFence.slice(start, end + 1) : withoutFence;
  return JSON.parse(candidate);
}

function generateLocalDesign({ content, dateSeed, numericSeed, ingredients }) {
  const styleSpec = buildLocalStyleSpec({
    content,
    dateSeed,
    numericSeed,
    ingredients
  });
  const { body_html, css, theme, labels } = buildFallbackTemplate({
    content,
    styleSpec,
    numericSeed
  });

  return {
    styleSpec,
    designPackage: {
      experience_mode: styleSpec.experience_mode,
      interaction_preset: styleSpec.interaction_preset,
      primary_font: styleSpec.primary_font,
      display_font: styleSpec.display_font,
      daily_label: labels.dailyLabel,
      intro_kicker: labels.introKicker,
      projects_heading: labels.projectsHeading,
      facts_heading: labels.factsHeading,
      talks_heading: labels.talksHeading,
      footer_note: labels.footerNote,
      theme,
      body_html,
      css
    }
  };
}

function buildLocalStyleSpec({ dateSeed, numericSeed, ingredients }) {
  const rng = mulberry32(numericSeed ^ 0xa5a5a5a5);
  const mode = pickOne(EXPERIENCE_MODES, rng, "website");
  const interaction = pickOne(MODE_INTERACTIONS[mode] ?? INTERACTION_PRESETS, rng, "spotlight");
  const [primaryFont, displayFont] = pickUnique(Object.keys(FONT_CATALOG), rng, 2);
  const prefixes = [
    "Signal",
    "Afterglow",
    "Playfield",
    "Northbound",
    "Chrome",
    "Wild",
    "Tape",
    "Studio",
    "Orbit",
    "Late Shift"
  ];
  const suffixes = [
    "Index",
    "Edition",
    "Cabinet",
    "Relay",
    "Signal",
    "Notebook",
    "Wave",
    "Grid",
    "Show",
    "Frame"
  ];

  return {
    theme_name: `${pickOne(prefixes, rng)} ${pickOne(suffixes, rng)}`,
    experience_mode: mode,
    interaction_preset: interaction,
    primary_font: primaryFont,
    display_font: displayFont,
    style_prompt: [
      `Build a ${mode} that feels like ${ingredients.mediums.join(" crossed with ")}.`,
      `Use ${ingredients.materials.join(" and ")} textures with ${ingredients.motion.join(" plus ")}.`,
      `The tone should feel ${ingredients.mood.join(" and ")}.`,
      `Feature ${ingredients.accents.join(" and ")} without becoming cluttered.`
    ].join(" "),
    palette_brief: `Lean into ${ingredients.materials[0]} finishes with a sharp accent and a surprising second accent.`,
    layout_brief: `Compose the page like a ${mode}, keep clear hierarchy, and let the interaction preset add the twist.`,
    microcopy_tone: pickOne(ingredients.mood, rng, "sharp and playful"),
    motifs: [...ingredients.mediums, ...ingredients.materials, ...ingredients.accents].slice(0, 5),
    avoid: ["generic saas hero", "template portfolio grid", "weak contrast"]
  };
}

function normalizeStyleSpec(raw, numericSeed, ingredients) {
  const fallback = buildLocalStyleSpec({
    dateSeed: "seed",
    numericSeed,
    ingredients
  });

  const experienceMode = EXPERIENCE_MODES.includes(raw?.experience_mode) ? raw.experience_mode : fallback.experience_mode;
  const interactionPreset = INTERACTION_PRESETS.includes(raw?.interaction_preset)
    ? raw.interaction_preset
    : fallback.interaction_preset;
  const primaryFont = normalizeFontName(raw?.primary_font) ?? fallback.primary_font;
  const displayFont = normalizeFontName(raw?.display_font) ?? fallback.display_font;
  const motifs = sanitizeStringArray(raw?.motifs, 6);
  const avoid = sanitizeStringArray(raw?.avoid, 5);

  return {
    theme_name: sanitizeInlineText(raw?.theme_name, 80) || fallback.theme_name,
    experience_mode: experienceMode,
    interaction_preset: interactionPreset,
    primary_font: primaryFont,
    display_font: displayFont === primaryFont ? fallback.display_font : displayFont,
    style_prompt: sanitizeParagraph(raw?.style_prompt, 600) || fallback.style_prompt,
    palette_brief: sanitizeParagraph(raw?.palette_brief, 180) || fallback.palette_brief,
    layout_brief: sanitizeParagraph(raw?.layout_brief, 180) || fallback.layout_brief,
    microcopy_tone: sanitizeInlineText(raw?.microcopy_tone, 80) || fallback.microcopy_tone,
    motifs: motifs.length ? motifs : fallback.motifs,
    avoid: avoid.length ? avoid : fallback.avoid
  };
}

function normalizeDesign({ styleSpec, designPackage, dateSeed, numericSeed }) {
  const fallback = buildFallbackTemplate({
    content: null,
    styleSpec,
    numericSeed
  });

  const experienceMode = EXPERIENCE_MODES.includes(designPackage?.experience_mode)
    ? designPackage.experience_mode
    : styleSpec.experience_mode;
  const interactionPreset = INTERACTION_PRESETS.includes(designPackage?.interaction_preset)
    ? designPackage.interaction_preset
    : styleSpec.interaction_preset;
  const primaryFont = normalizeFontName(designPackage?.primary_font ?? styleSpec.primary_font) ?? styleSpec.primary_font;
  const displayFontCandidate = normalizeFontName(designPackage?.display_font ?? styleSpec.display_font) ?? styleSpec.display_font;
  const displayFont = displayFontCandidate === primaryFont ? styleSpec.display_font : displayFontCandidate;
  const theme = normalizeTheme(designPackage?.theme, fallback.theme);
  const labels = {
    dailyLabel: sanitizeInlineText(designPackage?.daily_label, 60) || fallback.labels.dailyLabel,
    introKicker: sanitizeInlineText(designPackage?.intro_kicker, 80) || fallback.labels.introKicker,
    projectsHeading: sanitizeInlineText(designPackage?.projects_heading, 60) || fallback.labels.projectsHeading,
    factsHeading: sanitizeInlineText(designPackage?.facts_heading, 60) || fallback.labels.factsHeading,
    talksHeading: sanitizeInlineText(designPackage?.talks_heading, 60) || fallback.labels.talksHeading,
    footerNote: sanitizeInlineText(designPackage?.footer_note, 80) || fallback.labels.footerNote
  };
  const bodyTemplate = sanitizeBodyTemplate(designPackage?.body_html) || fallback.body_html;
  const css = sanitizeCss(designPackage?.css) || fallback.css;
  const hasAllTokens = REQUIRED_TEMPLATE_TOKENS.every((token) => bodyTemplate.includes(token));

  return {
    themeName: styleSpec.theme_name,
    experienceMode,
    interactionPreset,
    primaryFont,
    displayFont,
    stylePrompt: styleSpec.style_prompt,
    motifs: styleSpec.motifs,
    theme,
    bodyTemplate: hasAllTokens ? bodyTemplate : fallback.body_html,
    generatedCss: css,
    dailyLabel: labels.dailyLabel,
    introKicker: labels.introKicker,
    projectsHeading: labels.projectsHeading,
    factsHeading: labels.factsHeading,
    talksHeading: labels.talksHeading,
    footerNote: labels.footerNote,
    formattedDate: formatHumanDate(dateSeed)
  };
}

function normalizeFontName(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return Object.keys(FONT_CATALOG).find((font) => font.toLowerCase() === normalized) ?? null;
}

function sanitizeStringArray(value, limit) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => sanitizeInlineText(item, 80))
    .filter(Boolean)
    .slice(0, limit);
}

function sanitizeParagraph(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.slice(0, maxLength);
}

function sanitizeInlineText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeBodyTemplate(value) {
  if (typeof value !== "string") {
    return "";
  }

  const clean = value.trim();
  const bannedPatterns = [/<\/?(script|style|iframe|form|object|embed|link|meta|head|body)/i, /\son[a-z]+\s*=/i, /javascript:/i];

  if (!clean || clean.length > 40000 || bannedPatterns.some((pattern) => pattern.test(clean))) {
    return "";
  }

  return clean;
}

function sanitizeCss(value) {
  if (typeof value !== "string") {
    return "";
  }

  const clean = value.trim();
  const bannedPatterns = [/@import/i, /expression\s*\(/i, /javascript:/i, /<\/style/i];

  if (!clean || clean.length > 50000 || bannedPatterns.some((pattern) => pattern.test(clean))) {
    return "";
  }

  return clean;
}

function normalizeTheme(candidate, fallbackTheme) {
  const theme = {};
  const keys = ["background", "surface", "text", "muted", "accent", "accent_alt", "border"];

  for (const key of keys) {
    const value = candidate?.[key];
    theme[key] = isHexColor(value) ? value : fallbackTheme[key];
  }

  return theme;
}

function isHexColor(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

function buildFallbackTemplate({ styleSpec, numericSeed }) {
  const mode = styleSpec.experience_mode;
  const theme = createPalette(numericSeed, mode);
  const labels = createFallbackLabels(styleSpec, numericSeed);
  const body_html = buildFallbackBodyTemplate(mode);
  const css = buildFallbackCss({
    mode,
    themeName: styleSpec.theme_name,
    interactionPreset: styleSpec.interaction_preset
  });

  return { body_html, css, theme, labels };
}

function createFallbackLabels(styleSpec, numericSeed) {
  const rng = mulberry32(numericSeed ^ 0x1b873593);
  const kickerOptions = {
    website: ["Current signal", "Daily edition", "Product frequency"],
    poster: ["Pinned for today", "Poster note", "Front page"],
    dashboard: ["Live board", "Current stack", "Active system"],
    game: ["Player one", "Today's questline", "Active run"],
    exhibit: ["Open gallery", "Displayed today", "Current room"],
    terminal: ["Current process", "Prompt ready", "System note"],
    studio: ["Studio desk", "Working print", "Bench status"]
  };
  const projectOptions = {
    website: "Working on",
    poster: "Current drops",
    dashboard: "Active products",
    game: "Unlocked builds",
    exhibit: "Featured works",
    terminal: "Processes",
    studio: "On the table"
  };
  const factsOptions = {
    website: "Other things",
    poster: "Side notes",
    dashboard: "Background data",
    game: "Traits",
    exhibit: "Wall text",
    terminal: "Flags",
    studio: "Marginalia"
  };
  const talksOptions = {
    website: "Design talks",
    poster: "Screenings",
    dashboard: "Broadcasts",
    game: "Bonus levels",
    exhibit: "Recorded talks",
    terminal: "Outputs",
    studio: "Talk reels"
  };

  return {
    dailyLabel: `${styleSpec.theme_name} · ${pickOne(["daily build", "edition", "live scene"], rng, "daily build")}`,
    introKicker: pickOne(kickerOptions[styleSpec.experience_mode], rng, "Daily edition"),
    projectsHeading: projectOptions[styleSpec.experience_mode],
    factsHeading: factsOptions[styleSpec.experience_mode],
    talksHeading: talksOptions[styleSpec.experience_mode],
    footerNote: pickOne(
      [
        "Generated from fixed facts, remixed presentation.",
        "Raw content, fresh shell.",
        "Daily redesign, same signal."
      ],
      rng,
      "Daily redesign, same signal."
    )
  };
}

function createPalette(seed, mode) {
  const rng = mulberry32(seed ^ 0x7f4a7c15);
  const hue = Math.floor(rng() * 360);
  const dark = mode === "game" || mode === "terminal" || rng() > 0.48;

  return {
    background: hslToHex(hue, dark ? 30 : 55, dark ? 8 : 96),
    surface: hslToHex((hue + 18) % 360, dark ? 22 : 45, dark ? 14 : 90),
    text: hslToHex((hue + 205) % 360, 20, dark ? 94 : 12),
    muted: hslToHex((hue + 205) % 360, 10, dark ? 74 : 44),
    accent: hslToHex((hue + 108) % 360, 80, dark ? 62 : 46),
    accent_alt: hslToHex((hue + 300) % 360, 78, dark ? 67 : 56),
    border: hslToHex(hue, 24, dark ? 24 : 78)
  };
}

function hslToHex(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (h < 60) {
    red = c;
    green = x;
  } else if (h < 120) {
    red = x;
    green = c;
  } else if (h < 180) {
    green = c;
    blue = x;
  } else if (h < 240) {
    green = x;
    blue = c;
  } else if (h < 300) {
    red = x;
    blue = c;
  } else {
    red = c;
    blue = x;
  }

  const toHex = (value) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function buildFallbackBodyTemplate(mode) {
  const templates = {
    website: `
      <main class="daily-layout daily-layout-website">
        <section class="hero-panel panel">
          <div class="panel-label">{{DAILY_NOTE}}</div>
          <div class="hero-stack">
            <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="hero-avatar">
            <div class="hero-copy">
              <p class="hero-kicker">{{INTRO_KICKER}}</p>
              <h1>{{NAME}}</h1>
              <p class="hero-bio">{{BIO}}</p>
              <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
            </div>
          </div>
        </section>
        <section class="panel section-panel">
          <div class="section-heading">
            <p class="section-kicker">Now</p>
            <h2>{{PROJECTS_HEADING}}</h2>
          </div>
          <div class="project-grid">{{PROJECT_ITEMS}}</div>
        </section>
        <div class="two-column">
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Context</p>
              <h2>{{FACTS_HEADING}}</h2>
            </div>
            <div class="fact-grid">{{FACT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Watch</p>
              <h2>{{TALKS_HEADING}}</h2>
            </div>
            <div class="talk-grid">{{TALK_ITEMS}}</div>
          </section>
        </div>
        <footer class="panel footer-panel">
          <p class="footer-note">{{FOOTER_NOTE}}</p>
          {{STATUS_PANELS}}
        </footer>
      </main>
    `,
    poster: `
      <main class="daily-layout daily-layout-poster">
        <section class="poster-banner">
          <div class="panel-label">{{DAILY_NOTE}}</div>
          <p class="hero-kicker">{{INTRO_KICKER}}</p>
          <h1>{{NAME}}</h1>
          <p class="hero-bio">{{BIO}}</p>
          <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="poster-avatar">
          <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
        </section>
        <section class="poster-rail">
          <div class="poster-column panel">
            <div class="section-heading">
              <p class="section-kicker">Builds</p>
              <h2>{{PROJECTS_HEADING}}</h2>
            </div>
            <div class="project-grid">{{PROJECT_ITEMS}}</div>
          </div>
          <div class="poster-column stack-column">
            <section class="panel section-panel">
              <div class="section-heading">
                <p class="section-kicker">Details</p>
                <h2>{{FACTS_HEADING}}</h2>
              </div>
              <div class="fact-grid">{{FACT_ITEMS}}</div>
            </section>
            <section class="panel section-panel">
              <div class="section-heading">
                <p class="section-kicker">Reel</p>
                <h2>{{TALKS_HEADING}}</h2>
              </div>
              <div class="talk-grid">{{TALK_ITEMS}}</div>
            </section>
            <section class="panel footer-panel compact-footer">
              <p class="footer-note">{{FOOTER_NOTE}}</p>
              {{STATUS_PANELS}}
            </section>
          </div>
        </section>
      </main>
    `,
    dashboard: `
      <main class="daily-layout daily-layout-dashboard">
        <section class="panel hero-panel board-hero">
          <div class="board-heading">
            <div>
              <p class="panel-label">{{DAILY_NOTE}}</p>
              <p class="hero-kicker">{{INTRO_KICKER}}</p>
              <h1>{{NAME}}</h1>
              <p class="hero-bio">{{BIO}}</p>
            </div>
            <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="hero-avatar">
          </div>
          <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
          {{STATUS_PANELS}}
        </section>
        <section class="dashboard-grid">
          <section class="panel section-panel dashboard-span-two">
            <div class="section-heading">
              <p class="section-kicker">Board</p>
              <h2>{{PROJECTS_HEADING}}</h2>
            </div>
            <div class="project-grid">{{PROJECT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Signals</p>
              <h2>{{FACTS_HEADING}}</h2>
            </div>
            <div class="fact-grid">{{FACT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Output</p>
              <h2>{{TALKS_HEADING}}</h2>
            </div>
            <div class="talk-grid">{{TALK_ITEMS}}</div>
          </section>
        </section>
        <footer class="footer-strip">{{FOOTER_NOTE}}</footer>
      </main>
    `,
    game: `
      <main class="daily-layout daily-layout-game">
        <section class="panel hero-panel game-hero">
          <div class="game-intro">
            <div>
              <p class="panel-label">{{DAILY_NOTE}}</p>
              <p class="hero-kicker">{{INTRO_KICKER}}</p>
              <h1>{{NAME}}</h1>
              <p class="hero-bio">{{BIO}}</p>
            </div>
            <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="hero-avatar pixel-avatar">
          </div>
          <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
          <div class="status-wrap">{{STATUS_PANELS}}</div>
        </section>
        <section class="game-board">
          <section class="panel section-panel arena">
            <div class="section-heading">
              <p class="section-kicker">Level 01</p>
              <h2>{{PROJECTS_HEADING}}</h2>
            </div>
            <div class="project-grid">{{PROJECT_ITEMS}}</div>
          </section>
          <aside class="game-sidebar">
            <section class="panel section-panel">
              <div class="section-heading">
                <p class="section-kicker">Traits</p>
                <h2>{{FACTS_HEADING}}</h2>
              </div>
              <div class="fact-grid">{{FACT_ITEMS}}</div>
            </section>
            <section class="panel section-panel">
              <div class="section-heading">
                <p class="section-kicker">Bonus</p>
                <h2>{{TALKS_HEADING}}</h2>
              </div>
              <div class="talk-grid">{{TALK_ITEMS}}</div>
            </section>
            <section class="panel footer-panel compact-footer">
              <p class="footer-note">{{FOOTER_NOTE}}</p>
            </section>
          </aside>
        </section>
      </main>
    `,
    exhibit: `
      <main class="daily-layout daily-layout-exhibit">
        <section class="panel hero-panel exhibit-hero">
          <div class="panel-label">{{DAILY_NOTE}}</div>
          <div class="exhibit-topline">
            <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="hero-avatar">
            <div>
              <p class="hero-kicker">{{INTRO_KICKER}}</p>
              <h1>{{NAME}}</h1>
              <p class="hero-bio">{{BIO}}</p>
            </div>
          </div>
          <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
        </section>
        <section class="gallery-grid">
          <section class="panel section-panel gallery-main">
            <div class="section-heading">
              <p class="section-kicker">Gallery</p>
              <h2>{{PROJECTS_HEADING}}</h2>
            </div>
            <div class="project-grid">{{PROJECT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Notes</p>
              <h2>{{FACTS_HEADING}}</h2>
            </div>
            <div class="fact-grid">{{FACT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Screen</p>
              <h2>{{TALKS_HEADING}}</h2>
            </div>
            <div class="talk-grid">{{TALK_ITEMS}}</div>
          </section>
          <section class="panel footer-panel">
            <p class="footer-note">{{FOOTER_NOTE}}</p>
            {{STATUS_PANELS}}
          </section>
        </section>
      </main>
    `,
    terminal: `
      <main class="daily-layout daily-layout-terminal">
        <section class="panel hero-panel terminal-window">
          <div class="window-bar">
            <span></span><span></span><span></span>
          </div>
          <div class="terminal-content">
            <p class="panel-label">{{DAILY_NOTE}}</p>
            <p class="hero-kicker">{{INTRO_KICKER}}</p>
            <h1>{{NAME}}</h1>
            <p class="hero-bio">{{BIO}}</p>
            <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="hero-avatar">
            <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
          </div>
        </section>
        <section class="terminal-grid">
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">$ ls</p>
              <h2>{{PROJECTS_HEADING}}</h2>
            </div>
            <div class="project-grid">{{PROJECT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">$ cat facts</p>
              <h2>{{FACTS_HEADING}}</h2>
            </div>
            <div class="fact-grid">{{FACT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">$ watch talks</p>
              <h2>{{TALKS_HEADING}}</h2>
            </div>
            <div class="talk-grid">{{TALK_ITEMS}}</div>
          </section>
          <section class="panel footer-panel">
            <p class="footer-note">{{FOOTER_NOTE}}</p>
            {{STATUS_PANELS}}
          </section>
        </section>
      </main>
    `,
    studio: `
      <main class="daily-layout daily-layout-studio">
        <section class="panel hero-panel studio-hero">
          <div class="panel-label">{{DAILY_NOTE}}</div>
          <div class="studio-grid">
            <div>
              <p class="hero-kicker">{{INTRO_KICKER}}</p>
              <h1>{{NAME}}</h1>
              <p class="hero-bio">{{BIO}}</p>
              <div class="social-row">{{SOCIAL_LINK_ITEMS}}</div>
            </div>
            <img src="{{PROFILE_IMAGE_URL}}" alt="{{NAME}}" class="hero-avatar">
          </div>
        </section>
        <section class="studio-grid boards">
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Workbench</p>
              <h2>{{PROJECTS_HEADING}}</h2>
            </div>
            <div class="project-grid">{{PROJECT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Pins</p>
              <h2>{{FACTS_HEADING}}</h2>
            </div>
            <div class="fact-grid">{{FACT_ITEMS}}</div>
          </section>
          <section class="panel section-panel">
            <div class="section-heading">
              <p class="section-kicker">Talkback</p>
              <h2>{{TALKS_HEADING}}</h2>
            </div>
            <div class="talk-grid">{{TALK_ITEMS}}</div>
          </section>
          <section class="panel footer-panel">
            <p class="footer-note">{{FOOTER_NOTE}}</p>
            {{STATUS_PANELS}}
          </section>
        </section>
      </main>
    `
  };

  return templates[mode] ?? templates.website;
}

function buildFallbackCss({ mode, interactionPreset }) {
  return `
    .daily-layout {
      width: min(1200px, 100%);
      margin: 0 auto;
      display: grid;
      gap: 1.25rem;
      position: relative;
      z-index: 1;
    }

    .panel {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 28px;
      background:
        linear-gradient(160deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
        var(--surface);
      box-shadow:
        0 24px 80px rgba(0, 0, 0, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
      padding: 1.5rem;
      backdrop-filter: blur(18px);
    }

    .panel::before {
      content: "";
      position: absolute;
      inset: auto -20% -55% auto;
      width: 18rem;
      height: 18rem;
      background: radial-gradient(circle, var(--accent-soft) 0%, transparent 70%);
      pointer-events: none;
      opacity: 0.9;
    }

    .panel-label,
    .section-kicker,
    .hero-kicker,
    .footer-note {
      font-family: var(--font-body);
      text-transform: uppercase;
      letter-spacing: 0.18em;
      font-size: 0.72rem;
      line-height: 1.35;
      color: var(--muted);
    }

    .hero-panel h1 {
      font-family: var(--font-display);
      font-size: clamp(3rem, 9vw, 6.2rem);
      line-height: 0.92;
      letter-spacing: -0.05em;
      margin-top: 0.5rem;
    }

    .hero-bio {
      max-width: 46rem;
      font-size: clamp(1.05rem, 2vw, 1.35rem);
      line-height: 1.45;
      color: var(--text);
      margin-top: 0.8rem;
    }

    .hero-avatar,
    .poster-avatar,
    .pixel-avatar {
      width: clamp(88px, 15vw, 144px);
      aspect-ratio: 1;
      border-radius: 24px;
      object-fit: cover;
      border: 1px solid var(--border);
      box-shadow: 0 24px 40px rgba(0, 0, 0, 0.22);
      background: rgba(255, 255, 255, 0.08);
    }

    .pixel-avatar {
      image-rendering: pixelated;
      border-radius: 18px;
    }

    .hero-stack,
    .exhibit-topline,
    .board-heading,
    .game-intro,
    .studio-grid {
      display: grid;
      gap: 1rem;
      align-items: start;
    }

    .section-heading {
      display: grid;
      gap: 0.35rem;
      margin-bottom: 1rem;
    }

    .section-heading h2 {
      font-family: var(--font-display);
      font-size: clamp(1.6rem, 4vw, 2.5rem);
      line-height: 0.95;
      letter-spacing: -0.04em;
    }

    .project-grid,
    .fact-grid,
    .talk-grid {
      display: grid;
      gap: 0.9rem;
    }

    .two-column,
    .gallery-grid,
    .terminal-grid,
    .dashboard-grid,
    .game-board,
    .boards {
      display: grid;
      gap: 1.25rem;
    }

    .dashboard-span-two {
      grid-column: span 2;
    }

    .social-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .content-social-link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 2.6rem;
      padding: 0.7rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
      text-decoration: none;
      transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
    }

    .content-social-link:hover {
      transform: translateY(-1px);
      border-color: var(--accent);
      background: rgba(255, 255, 255, 0.1);
    }

    .content-project-card,
    .content-talk-item,
    .content-fact-item {
      position: relative;
      display: grid;
      gap: 0.75rem;
      text-decoration: none;
      color: inherit;
      border-radius: 22px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.04);
      padding: 1rem;
      transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, box-shadow 180ms ease;
      will-change: transform;
    }

    .content-project-card:hover,
    .content-talk-item:hover,
    .content-fact-item:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--accent) 65%, var(--border));
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 18px 38px rgba(0, 0, 0, 0.16);
    }

    .content-project-card {
      grid-template-columns: auto 1fr;
      align-items: center;
    }

    .content-project-image {
      width: 4.1rem;
      height: 4.1rem;
      border-radius: 20px;
      object-fit: cover;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.08);
    }

    .content-project-name,
    .content-talk-title,
    .content-fact-label {
      font-size: 1rem;
      font-weight: 600;
      letter-spacing: -0.02em;
    }

    .content-fact-label {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      text-decoration: none;
      color: inherit;
    }

    .content-mini-icon {
      width: 1rem;
      height: 1rem;
      border-radius: 999px;
      object-fit: cover;
      flex: 0 0 auto;
    }

    .content-project-summary,
    .content-talk-meta,
    .content-status-value {
      color: var(--muted);
      line-height: 1.45;
    }

    .content-status-strip {
      display: grid;
      gap: 0.75rem;
      margin-top: 1rem;
    }

    .content-status-panel {
      display: grid;
      gap: 0.35rem;
      border-radius: 20px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.05);
      padding: 1rem 1.1rem;
    }

    .content-status-label {
      font-size: 0.74rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--muted);
    }

    .content-status-value {
      font-size: 1.05rem;
      font-weight: 600;
      color: var(--text);
    }

    .footer-strip {
      padding: 0.2rem 0.1rem 0;
      color: var(--muted);
      text-align: center;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      font-size: 0.72rem;
    }

    .window-bar {
      display: flex;
      gap: 0.35rem;
      margin-bottom: 1rem;
    }

    .window-bar span {
      width: 0.8rem;
      height: 0.8rem;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 65%, #ffffff);
      opacity: 0.75;
    }

    .compact-footer .content-status-strip {
      margin-top: 0.8rem;
    }

    .status-wrap .content-status-strip {
      margin-top: 1rem;
    }

    .daily-layout-poster .poster-banner,
    .daily-layout-terminal .terminal-window,
    .daily-layout-game .game-hero {
      min-height: min(70vh, 48rem);
    }

    .daily-layout-poster .poster-banner {
      display: grid;
      align-content: start;
      gap: 1rem;
      padding-block: 2rem;
    }

    .daily-layout-poster h1 {
      font-size: clamp(4rem, 14vw, 10rem);
      line-height: 0.82;
      max-width: 12ch;
    }

    .daily-layout-game .panel,
    .daily-layout-terminal .panel {
      border-radius: 16px;
    }

    .daily-layout-game .content-project-card,
    .daily-layout-terminal .content-project-card,
    .daily-layout-game .content-talk-item,
    .daily-layout-terminal .content-talk-item,
    .daily-layout-game .content-fact-item,
    .daily-layout-terminal .content-fact-item {
      border-radius: 14px;
    }

    .daily-layout-game .content-project-card::after,
    .daily-layout-terminal .content-project-card::after {
      content: "";
      position: absolute;
      inset: 0;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: inherit;
      pointer-events: none;
    }

    .daily-layout-dashboard .dashboard-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .daily-layout-exhibit .gallery-grid {
      grid-template-columns: 1.4fr 1fr;
      align-items: start;
    }

    .daily-layout-exhibit .gallery-main {
      grid-row: span 2;
    }

    .daily-layout-game .game-board {
      grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.95fr);
      align-items: start;
    }

    .daily-layout-poster .poster-rail,
    .daily-layout-terminal .terminal-grid,
    .daily-layout-studio .boards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }

    .daily-layout-dashboard .hero-avatar,
    .daily-layout-studio .hero-avatar,
    .daily-layout-website .hero-avatar,
    .daily-layout-exhibit .hero-avatar {
      justify-self: end;
    }

    .daily-layout-website .hero-stack,
    .daily-layout-dashboard .board-heading,
    .daily-layout-game .game-intro,
    .daily-layout-exhibit .exhibit-topline,
    .daily-layout-studio .studio-grid {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .daily-layout-terminal .terminal-content,
    .daily-layout-poster .poster-banner {
      max-width: 72rem;
    }

    body[data-interaction="ticker"] .panel-label,
    body[data-interaction="ticker"] .section-kicker {
      position: relative;
      overflow: hidden;
      white-space: nowrap;
    }

    body[data-interaction="ticker"] .panel-label::after,
    body[data-interaction="ticker"] .section-kicker::after {
      content: "  //  " attr(data-theme-name) "  //  " attr(data-theme-name) "  //  " attr(data-theme-name);
      display: inline-block;
      margin-left: 1rem;
      color: color-mix(in srgb, var(--accent) 55%, var(--muted));
      animation: marquee 16s linear infinite;
    }

    body[data-interaction="scanner"]::after {
      content: "";
      position: fixed;
      inset: 0;
      background:
        linear-gradient(
          to bottom,
          transparent 0%,
          rgba(255, 255, 255, 0.05) var(--scan-phase),
          transparent calc(var(--scan-phase) + 18%)
        );
      mix-blend-mode: screen;
      pointer-events: none;
      opacity: 0.45;
    }

    body[data-interaction="spotlight"]::before {
      background:
        radial-gradient(circle 18rem at var(--cursor-x, 50%) var(--cursor-y, 30%), rgba(255, 255, 255, 0.12), transparent 72%),
        radial-gradient(circle 26rem at 15% 20%, var(--accent-soft), transparent 70%),
        radial-gradient(circle 22rem at 88% 80%, var(--accent-alt-soft), transparent 72%);
    }

    .arcade-hud {
      position: fixed;
      top: 1rem;
      right: 1rem;
      z-index: 10;
      display: inline-flex;
      align-items: center;
      gap: 0.65rem;
      padding: 0.8rem 1rem;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(18px);
      color: var(--text);
      font-size: 0.8rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .arcade-hud strong {
      font-size: 1rem;
      color: var(--accent);
    }

    .arcade-hit {
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.12),
        0 0 0 8px rgba(255, 255, 255, 0.04),
        0 18px 45px rgba(0, 0, 0, 0.18);
      border-color: color-mix(in srgb, var(--accent) 68%, var(--border));
    }

    .constellation-layer {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 0;
      opacity: 0.55;
    }

    .is-pulsing {
      animation: pulse-hit 700ms ease;
    }

    @keyframes marquee {
      from {
        transform: translateX(0);
      }
      to {
        transform: translateX(-25%);
      }
    }

    @keyframes pulse-hit {
      0% {
        transform: scale(1);
      }
      35% {
        transform: scale(1.03);
      }
      100% {
        transform: scale(1);
      }
    }

    @media (max-width: 900px) {
      .daily-layout-poster .poster-rail,
      .daily-layout-dashboard .dashboard-grid,
      .daily-layout-exhibit .gallery-grid,
      .daily-layout-game .game-board,
      .daily-layout-terminal .terminal-grid,
      .daily-layout-studio .boards,
      .two-column {
        grid-template-columns: 1fr;
      }

      .dashboard-span-two,
      .daily-layout-exhibit .gallery-main {
        grid-column: auto;
        grid-row: auto;
      }

      .hero-stack,
      .board-heading,
      .game-intro,
      .exhibit-topline,
      .studio-grid {
        grid-template-columns: 1fr;
      }

      .hero-avatar,
      .poster-avatar {
        justify-self: start;
      }
    }

    @media (max-width: 640px) {
      .panel {
        padding: 1.05rem;
      }

      .content-project-card {
        grid-template-columns: 1fr;
      }

      .content-project-image {
        width: 3.5rem;
        height: 3.5rem;
      }
    }
  `;
}

function renderSite({ content, dateSeed, generationSource, design }) {
  const tokenMap = buildTokenMap({ content, dateSeed, design });
  const resolvedBody = replaceTokens(design.bodyTemplate, tokenMap);
  const fontsHref = buildGoogleFontsHref([design.primaryFont, design.displayFont]);
  const configJson = JSON.stringify({
    timezone: content.site.timezone,
    locationLabel: content.site.locationLabel,
    weather: content.site.weather,
    interactionPreset: design.interactionPreset,
    themeName: design.themeName,
    refreshScheduleUtc: DAILY_REFRESH_UTC
  }).replace(/</g, "\\u003c");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(content.site.title)}</title>
    <meta name="description" content="${escapeHtml(content.site.description)}">
    <meta property="og:type" content="website">
    <meta property="og:url" content="${escapeHtml(content.site.url)}">
    <meta property="og:title" content="${escapeHtml(content.site.title)}">
    <meta property="og:description" content="${escapeHtml(content.site.description)}">
    <meta property="og:image" content="${escapeHtml(content.site.images.og)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${escapeHtml(content.site.url)}">
    <meta name="twitter:title" content="${escapeHtml(content.site.title)}">
    <meta name="twitter:description" content="${escapeHtml(content.site.description)}">
    <meta name="twitter:image" content="${escapeHtml(content.site.images.og)}">
    <meta name="theme-color" content="${design.theme.background}">
    <link rel="icon" href="${escapeHtml(content.site.images.profile)}">
    <link rel="apple-touch-icon" href="${escapeHtml(content.site.images.profile)}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${fontsHref}" rel="stylesheet">
    <script>
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
    <style>
      :root {
        --bg: ${design.theme.background};
        --surface: ${design.theme.surface};
        --text: ${design.theme.text};
        --muted: ${design.theme.muted};
        --accent: ${design.theme.accent};
        --accent-alt: ${design.theme.accent_alt};
        --border: ${design.theme.border};
        --accent-soft: ${hexToRgba(design.theme.accent, 0.22)};
        --accent-alt-soft: ${hexToRgba(design.theme.accent_alt, 0.18)};
        --font-body: "${design.primaryFont}", sans-serif;
        --font-display: "${design.displayFont}", sans-serif;
        --scan-phase: 5%;
      }

      * {
        box-sizing: border-box;
      }

      html {
        min-height: 100%;
      }

      body {
        margin: 0;
        min-height: 100vh;
        color: var(--text);
        background:
          radial-gradient(circle at 15% 20%, var(--accent-soft) 0%, transparent 32%),
          radial-gradient(circle at 88% 78%, var(--accent-alt-soft) 0%, transparent 28%),
          var(--bg);
        font-family: var(--font-body);
        line-height: 1.5;
        overflow-x: hidden;
        position: relative;
      }

      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background:
          radial-gradient(circle 24rem at 15% 20%, var(--accent-soft), transparent 70%),
          radial-gradient(circle 20rem at 85% 85%, var(--accent-alt-soft), transparent 72%);
        pointer-events: none;
        z-index: 0;
      }

      img {
        max-width: 100%;
      }

      a {
        color: inherit;
      }

      .page-shell {
        width: 100%;
        min-height: 100vh;
        padding: clamp(1rem, 3vw, 2rem);
        display: grid;
        align-items: stretch;
      }

      .refresh-countdown-pill {
        position: fixed;
        right: max(1rem, env(safe-area-inset-right));
        bottom: max(1rem, env(safe-area-inset-bottom));
        z-index: 30;
        display: grid;
        gap: 0.18rem;
        min-width: 15rem;
        max-width: min(22rem, calc(100vw - 2rem));
        padding: 0.85rem 1rem;
        border: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
        border-radius: 999px;
        background: rgba(10, 10, 12, 0.7);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.22);
        backdrop-filter: blur(18px);
        pointer-events: none;
      }

      .refresh-countdown-label {
        font-size: 0.68rem;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--muted);
        white-space: nowrap;
      }

      .refresh-countdown-value {
        font-family: var(--font-display);
        font-size: clamp(0.95rem, 2.7vw, 1.15rem);
        letter-spacing: -0.03em;
        color: var(--text);
        white-space: nowrap;
      }

      .refresh-countdown-value span {
        color: color-mix(in srgb, var(--accent) 72%, var(--text));
      }

      @media (max-width: 640px) {
        .refresh-countdown-pill {
          min-width: auto;
          max-width: calc(100vw - 1.2rem);
          left: 0.6rem;
          right: 0.6rem;
          bottom: max(0.6rem, env(safe-area-inset-bottom));
          border-radius: 22px;
        }

        .refresh-countdown-label,
        .refresh-countdown-value {
          white-space: normal;
        }
      }

      ${design.generatedCss}
    </style>
  </head>
  <body data-mode="${design.experienceMode}" data-interaction="${design.interactionPreset}">
    <div class="page-shell">
      ${resolvedBody}
    </div>
    <div class="refresh-countdown-pill" aria-live="polite" title="Scheduled daily at 08:17 UTC">
      <div class="refresh-countdown-label">New design generates in</div>
      <div class="refresh-countdown-value" data-role="design-countdown">--</div>
    </div>
    <script id="daily-site-config" type="application/json">${configJson}</script>
    <script>
      ${buildClientScript()}
    </script>
    <!-- generated: ${escapeHtml(generationSource)} | ${escapeHtml(dateSeed)} -->
    <script src="https://book-sparky.com/widget.js" data-slug="blake-folgado-electrical-london"></script>
  </body>
</html>
`;
}

function buildTokenMap({ content, dateSeed, design }) {
  return {
    "{{PROFILE_IMAGE_URL}}": escapeHtml(content.site.images.profile),
    "{{NAME}}": escapeHtml(content.person.name),
    "{{BIO}}": escapeHtml(content.person.tagline),
    "{{SOCIAL_LINK_ITEMS}}": buildSocialLinksHtml(content.person.socials),
    "{{PROJECT_ITEMS}}": buildProjectItemsHtml(content.projects),
    "{{FACT_ITEMS}}": buildFactItemsHtml(content.facts),
    "{{TALK_ITEMS}}": buildTalkItemsHtml(content.talks),
    "{{DAILY_NOTE}}": escapeHtml(`${design.dailyLabel} · ${formatHumanDate(dateSeed)}`),
    "{{STATUS_PANELS}}": buildStatusPanelsHtml(content.site.locationLabel),
    "{{INTRO_KICKER}}": escapeHtml(design.introKicker),
    "{{PROJECTS_HEADING}}": escapeHtml(design.projectsHeading),
    "{{FACTS_HEADING}}": escapeHtml(design.factsHeading),
    "{{TALKS_HEADING}}": escapeHtml(design.talksHeading),
    "{{FOOTER_NOTE}}": escapeHtml(design.footerNote)
  };
}

function buildSocialLinksHtml(socials) {
  return socials
    .map(
      (social) =>
        `<a class="content-social-link" href="${escapeHtml(social.url)}" ${social.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(social.label)}</a>`
    )
    .join("");
}

function buildProjectItemsHtml(projects) {
  return projects
    .map(
      (project) => `
        <a class="content-project-card" data-card data-game-target="${escapeHtml(project.name)}" href="${escapeHtml(project.url)}" target="_blank" rel="noreferrer">
          <img class="content-project-image" src="${escapeHtml(project.image)}" alt="${escapeHtml(project.name)}" loading="lazy">
          <div class="content-project-copy">
            <div class="content-project-name">${escapeHtml(project.name)}</div>
            <div class="content-project-summary">${escapeHtml(project.subtitle)}</div>
          </div>
        </a>
      `
    )
    .join("");
}

function buildFactItemsHtml(facts) {
  return facts
    .map((fact) => {
      const body = fact.url
        ? `<a class="content-fact-label" href="${escapeHtml(fact.url)}" target="_blank" rel="noreferrer">${fact.icon ? `<img class="content-mini-icon" src="${escapeHtml(fact.icon)}" alt="" loading="lazy">` : ""}${escapeHtml(fact.label)}</a>`
        : `<div class="content-fact-label">${escapeHtml(fact.label)}</div>`;

      return `
        <article class="content-fact-item" data-card data-game-target="${escapeHtml(fact.label)}">
          ${body}
        </article>
      `;
    })
    .join("");
}

function buildTalkItemsHtml(talks) {
  return talks
    .map(
      (talk) => `
        <a class="content-talk-item" data-card data-game-target="${escapeHtml(talk.label)}" href="${escapeHtml(talk.url)}" target="_blank" rel="noreferrer">
          <div class="content-talk-title">${escapeHtml(talk.label)}</div>
          <div class="content-talk-meta">Watch the talk</div>
        </a>
      `
    )
    .join("");
}

function buildStatusPanelsHtml(locationLabel) {
  return `
    <div class="content-status-strip">
      <div class="content-status-panel">
        <div class="content-status-label">${escapeHtml(locationLabel)} time</div>
        <div class="content-status-value" data-role="local-time">--</div>
      </div>
      <div class="content-status-panel">
        <div class="content-status-label">${escapeHtml(locationLabel)} weather</div>
        <div class="content-status-value" data-role="local-weather">Loading...</div>
      </div>
    </div>
  `;
}

function replaceTokens(template, tokenMap) {
  let result = template;

  for (const [token, value] of Object.entries(tokenMap)) {
    result = result.split(token).join(value);
  }

  return result;
}

function buildGoogleFontsHref(fonts) {
  const families = [...new Set(fonts)]
    .map((font) => FONT_CATALOG[font])
    .filter(Boolean)
    .join("&family=");
  return `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildClientScript() {
  return `
    (() => {
      const configEl = document.getElementById("daily-site-config");
      if (!configEl) return;

      const config = JSON.parse(configEl.textContent);
      const root = document.documentElement;
      const cards = Array.from(document.querySelectorAll("[data-card]"));

      function getNextRefreshTime(now) {
        const next = new Date(Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          config.refreshScheduleUtc.hour,
          config.refreshScheduleUtc.minute,
          0,
          0
        ));

        if (next.getTime() <= now.getTime()) {
          next.setUTCDate(next.getUTCDate() + 1);
        }

        return next;
      }

      function updateDesignCountdown() {
        const now = new Date();
        const nextRefresh = getNextRefreshTime(now);
        const remainingSeconds = Math.max(0, Math.floor((nextRefresh.getTime() - now.getTime()) / 1000));
        const countdownText = remainingSeconds.toLocaleString("en-GB") + "s";

        document.querySelectorAll("[data-role='design-countdown']").forEach((node) => {
          node.innerHTML = "<span>" + countdownText + "</span>";
        });
      }

      function updateTime() {
        const time = new Intl.DateTimeFormat("en-GB", {
          timeZone: config.timezone,
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        }).format(new Date()).toLowerCase();

        document.querySelectorAll("[data-role='local-time']").forEach((node) => {
          node.textContent = time;
        });
      }

      async function updateWeather() {
        try {
          const params = new URLSearchParams({
            latitude: String(config.weather.latitude),
            longitude: String(config.weather.longitude),
            current_weather: "true"
          });
          const response = await fetch("https://api.open-meteo.com/v1/forecast?" + params.toString());
          if (!response.ok) {
            throw new Error(String(response.status));
          }
          const payload = await response.json();
          const temperature = Math.round(payload.current_weather.temperature);
          const code = payload.current_weather.weathercode;
          const iconMap = {
            0: "Clear",
            1: "Mostly clear",
            2: "Partly cloudy",
            3: "Cloudy",
            45: "Fog",
            48: "Fog",
            51: "Drizzle",
            53: "Drizzle",
            55: "Drizzle",
            61: "Rain",
            63: "Rain",
            65: "Rain",
            71: "Snow",
            73: "Snow",
            75: "Snow",
            80: "Showers",
            81: "Showers",
            82: "Showers",
            95: "Storm",
            96: "Storm",
            99: "Storm"
          };
          const label = iconMap[code] || "Weather";
          document.querySelectorAll("[data-role='local-weather']").forEach((node) => {
            node.textContent = label + " · " + temperature + "C";
          });
        } catch (error) {
          document.querySelectorAll("[data-role='local-weather']").forEach((node) => {
            node.textContent = "Unavailable";
          });
        }
      }

      function setupSpotlight() {
        window.addEventListener("pointermove", (event) => {
          root.style.setProperty("--cursor-x", event.clientX + "px");
          root.style.setProperty("--cursor-y", event.clientY + "px");
        });
      }

      function setupDrift() {
        cards.forEach((card) => {
          card.addEventListener("pointermove", (event) => {
            const rect = card.getBoundingClientRect();
            const x = (event.clientX - rect.left) / rect.width - 0.5;
            const y = (event.clientY - rect.top) / rect.height - 0.5;
            card.style.transform = "translateY(-2px) rotateX(" + (-y * 7).toFixed(2) + "deg) rotateY(" + (x * 7).toFixed(2) + "deg)";
          });

          card.addEventListener("pointerleave", () => {
            card.style.transform = "";
          });
        });
      }

      function setupPulse() {
        window.setInterval(() => {
          const card = cards[Math.floor(Math.random() * cards.length)];
          if (!card) return;
          card.classList.add("is-pulsing");
          window.setTimeout(() => card.classList.remove("is-pulsing"), 700);
        }, 1600);
      }

      function setupScanner() {
        let phase = 0;
        const loop = () => {
          phase = (phase + 0.35) % 100;
          root.style.setProperty("--scan-phase", phase.toFixed(2) + "%");
          window.requestAnimationFrame(loop);
        };
        window.requestAnimationFrame(loop);
      }

      function setupArcade() {
        let score = 0;
        const hitSet = new Set();
        const hud = document.createElement("div");
        hud.className = "arcade-hud";
        hud.innerHTML = '<span>daily score</span><strong>0</strong>';
        document.body.appendChild(hud);
        const scoreNode = hud.querySelector("strong");

        cards.forEach((card) => {
          card.addEventListener("click", () => {
            const key = card.getAttribute("data-game-target") || Math.random().toString(16).slice(2);
            if (hitSet.has(key)) return;
            hitSet.add(key);
            score += 100;
            scoreNode.textContent = String(score);
            card.classList.add("arcade-hit", "is-pulsing");
            window.setTimeout(() => card.classList.remove("is-pulsing"), 700);
          });
        });
      }

      function setupConstellation() {
        const canvas = document.createElement("canvas");
        canvas.className = "constellation-layer";
        document.body.appendChild(canvas);
        const context = canvas.getContext("2d");
        if (!context) return;

        const resize = () => {
          canvas.width = window.innerWidth * window.devicePixelRatio;
          canvas.height = window.innerHeight * window.devicePixelRatio;
          canvas.style.width = window.innerWidth + "px";
          canvas.style.height = window.innerHeight + "px";
          context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        };

        const draw = () => {
          context.clearRect(0, 0, window.innerWidth, window.innerHeight);
          const accent = getComputedStyle(root).getPropertyValue("--accent").trim() || "#ffffff";
          const points = cards.slice(0, 12).map((card) => {
            const rect = card.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            };
          });

          context.strokeStyle = accent + "55";
          context.lineWidth = 1;

          for (let i = 0; i < points.length; i += 1) {
            for (let j = i + 1; j < points.length; j += 1) {
              const dx = points[i].x - points[j].x;
              const dy = points[i].y - points[j].y;
              const distance = Math.hypot(dx, dy);
              if (distance > 280) continue;
              context.globalAlpha = Math.max(0, 1 - distance / 280) * 0.35;
              context.beginPath();
              context.moveTo(points[i].x, points[i].y);
              context.lineTo(points[j].x, points[j].y);
              context.stroke();
            }
          }

          context.globalAlpha = 1;
          points.forEach((point) => {
            context.fillStyle = accent;
            context.beginPath();
            context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
            context.fill();
          });

          window.requestAnimationFrame(draw);
        };

        resize();
        window.addEventListener("resize", resize);
        window.requestAnimationFrame(draw);
      }

      updateDesignCountdown();
      updateTime();
      updateWeather();
      window.setInterval(updateDesignCountdown, 1000);
      window.setInterval(updateTime, 1000);
      window.setInterval(updateWeather, 15 * 60 * 1000);

      if (config.interactionPreset === "spotlight") setupSpotlight();
      if (config.interactionPreset === "drift") setupDrift();
      if (config.interactionPreset === "pulse") setupPulse();
      if (config.interactionPreset === "scanner") setupScanner();
      if (config.interactionPreset === "arcade") setupArcade();
      if (config.interactionPreset === "constellation") setupConstellation();
      if (config.interactionPreset === "ticker") {
        document.querySelectorAll(".panel-label, .section-kicker").forEach((node) => {
          node.setAttribute("data-theme-name", config.themeName || document.title);
        });
      }
    })();
  `;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
