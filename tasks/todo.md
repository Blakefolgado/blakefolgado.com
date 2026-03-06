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
