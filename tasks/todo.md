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

- [x] Tighten the model prompt so it only returns valid body fragments with token-safe container usage.
- [x] Move generated layout CSS into the document head and validate fragments before accepting them.
- [x] Rebuild locally and confirm the artifact still renders correctly.
- [x] Commit the fix and push `main` to trigger the Vercel production deploy.
- [x] Verify the live site reflects the new deployment and no longer ships nested document markup.

## Production Push Review

- `SITE_OUTPUT_DIR=dist OPENROUTER_API_KEY=... node scripts/generate-site.mjs` succeeded locally with a real OpenRouter key sourced from `/Users/blakefolgado/Code/Humanleap/Humanleap/.env`, proving the stricter prompt and validator still accept real model output.
- The first direct Vercel deploy went to the wrong project (`humanleap/blakefolgado.com`) because the local repo was relinked there during recovery. That project had no env vars, so the build initially failed until `OPENROUTER_API_KEY` was added manually.
- After the user clarified the intended project name, the repo was relinked to `humanleap/blakefolgado`, which already had `OPENROUTER_API_KEY` configured for Development, Preview, and Production.
- A production deploy on `humanleap/blakefolgado` completed successfully at `2026-03-10 17:28:33 GMT`, and `vercel inspect https://www.blakefolgado.com` now resolves to deployment `dpl_DSHtJCNQfVFzSnFLc1ynkuAybUox`.
- Live verification against `https://www.blakefolgado.com/` now shows `nestedDoctype=false`, `bodyStartsWithMain=true`, `hasDocumentTagsInBody=false`, and a fresh `last-modified` timestamp of `Tue, 10 Mar 2026 17:31:00 GMT`.
- The mistaken `humanleap/blakefolgado.com` project still exists and now has `OPENROUTER_API_KEY` set in Production from the failed recovery path. I did not delete or modify that project further in this session.
- A follow-up regression check found the rendered document was still invalid because extracted model CSS was being reinserted as a nested `<style>` tag inside the head, which made the site look stale or inconsistently styled despite being on a new deployment.
- `scripts/generate-site.mjs` now extracts raw CSS instead of full `<style>` wrappers, retries generation up to three times when the model returns invalid token containers, and rejects nested `<style>` tags or unresolved `{{...}}` placeholders in the final rendered document.
- The corrected generator was deployed to `humanleap/blakefolgado` again at `2026-03-10 17:44:50 GMT`, and `vercel inspect https://www.blakefolgado.com` now resolves to deployment `dpl_93gbjD6BbUG321VH59WBXdDXNn8k`.
- Live verification against `https://www.blakefolgado.com/` now shows `nestedDoctype=false`, `nestedStyle=false`, `unresolvedTokens=false`, `hasBodyHtmlShell=false`, and `last-modified: Tue, 10 Mar 2026 17:47:25 GMT`.
