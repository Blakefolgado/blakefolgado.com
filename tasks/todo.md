# Daily Site Generator

- [x] Extract the current homepage content into a structured data file.
- [x] Build a two-stage OpenRouter generator that creates a daily style prompt and a fresh homepage design.
- [x] Render the generated design into `index.html` with validation and safe fallbacks.
- [x] Add local run scripts and a daily GitHub Actions workflow.
- [x] Verify the generator locally and review the generated output.

## Review

- `npm run generate:site` works locally and falls back safely when `OPENROUTER_API_KEY` is absent.
- `npm run build` now emits a Vercel-ready `dist/` artifact and copies `og.png` into the deploy output.
- `node scripts/generate-site.mjs --mock --date=2026-03-06` and `--date=2026-03-07` produced different themes and interaction presets, confirming daily variation.
- Browser verification against the built `dist/` output confirmed the generated homepage renders, links are present, and the London weather/time panels update.
- The Vercel cron endpoint returns `401` without the expected bearer token, confirming the `CRON_SECRET` gate works.
- Real OpenRouter generation was not exercised in this environment because `OPENROUTER_API_KEY` is not set locally.

## CSS Investigation

- [x] Inspect the live site response and browser rendering to confirm how CSS is breaking.
- [x] Trace the generator output path and deployment flow to identify the root cause.
- [x] Implement the minimal fix so generated body content cannot inject a nested document shell.
- [x] Rebuild locally and verify the generated HTML structure is valid and styles apply as expected.

## Investigation Review

- The live response at `https://www.blakefolgado.com/` contains a second `<!DOCTYPE html><html><head><body>` block inside the outer page body, so the generator is currently accepting full-document model output and injecting it directly.
- The injected token markup (`content-project-card`, `content-talk-item`, `content-fact-label`, `content-status-panel`) had no guaranteed baseline styles, so the live shell rendered while the generated cards and lists degraded into mostly unstyled anchors and images.
- `scripts/generate-site.mjs` now requires fragment-style `body_html`, normalizes any stray full-document model output into a fragment while preserving `<style>` blocks, and adds fallback CSS for all tokenized content components.
- `SITE_OUTPUT_DIR=dist node scripts/generate-site.mjs --mock --date=2026-03-10` now emits a single-document `dist/index.html` with fallback component styles and no nested doctype.
- Browser verification against `http://127.0.0.1:4173/` confirmed the rebuilt local artifact renders styled project, fact, talk, and status cards. The only local console error was the expected missing `/_vercel/insights/script.js` on the ad hoc static server.

## Production Push

- [ ] Tighten the model prompt so it only returns valid body fragments with token-safe container usage.
- [ ] Move generated layout CSS into the document head and validate fragments before accepting them.
- [ ] Rebuild locally and confirm the artifact still renders correctly.
- [ ] Commit the fix and push `main` to trigger the Vercel production deploy.
- [ ] Verify the live site reflects the new deployment and no longer ships nested document markup.

## Production Push Review

- Pending.
