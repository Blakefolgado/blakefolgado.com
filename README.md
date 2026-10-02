# Blake’s pixel world

A Three.js personal website with a different winding sky on each visit. The priority order stays Tradehand, ToolRouter, Outside, SentryDock, bot.store, MagicScreenshots, then HumanLeap. Planets, spacecraft, project names and short hooks are drawn from individual pixels. They drift gently, scatter on contact and spring back together. The robot walks with momentum and its eyes follow the mouse. The sky ends in mountains, hills and an interactive shoreline; writing, talks and previous work sit below.

## Develop

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

Open http://localhost:4173. Rebuild after editing. The server serves `dist` plus `/api/tide`; a static file server alone cannot save bottles. Three.js and Geist Pixel Square are served locally. Credentials and server code never enter `dist`.

## Content and navigation

`index.html` owns the biography, project order, short hooks, writing and talk links. JavaScript reads its semantic project list, so the fallback and game share the same content. `src/physics.js` controls movement, bounded eye tracking and the seeded layout. `src/world.js` draws the sky, scenery, robot and sea. Clicking a project walks to an actual pixel in its label; touching it opens its website in a new tab. Travel to a chosen project or bottle does not activate unrelated projects along the way. Free walking still activates things on contact. Ctrl/Cmd-click retains ordinary browser link behavior. Mouse, touch, arrows and WASD are supported. Page scrolling explores the full world.

The article comes from HumanLeap’s published guide credited to Blake; the two talk links and previous roles come from the repository’s existing content. The former `content/site-content.json` remains historical source material and is not used at runtime. The photo favicon is preserved.

## Bottles, visitors and free AI

`server/tide.js` and `api/tide.js` expose a same-origin JSON endpoint. `src/tide.js` handles the bottle dialog and presence. Visitors get random anonymous IDs; real positions update every five seconds while active. Rendering interpolates their positions. Hidden tabs stop polling and idle tabs stop after two minutes. Presence expires after 20 seconds and is bounded to 24 visitors. No simulated visitors are added.

Notes preserve the visitor’s wording and use textContent when displayed. The shore keeps the latest 256 notes; readers receive the most recent 40. A note has a stable ID so retrying after an uncertain response cannot create a duplicate. Daily limits use a salted, rotating IP hash, never a stored or returned IP address. The global cap is 3,000 exchanges/day; an address can leave three notes/day.

OpenRouter requests use only `openrouter/free`, with a zero-price provider ceiling and no paid fallback or plugins. Visitor notes are never sent to the model. AI messages are labelled separately, cached, and capped at one attempted generation/hour and 20/day. Free models can be unavailable or slow; cached messages and visitor notes still work. The procedural sky remains different without any model request.

For cloud sharing, use a dedicated Upstash Redis **Free** database connected to this Vercel project. Set `autoUpgrade=false` and `prodPack=false`. The API accepts `KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, plus the existing `OPENROUTER_API_KEY`. Compare-and-set writes prevent lost updates across Vercel instances. Missing cloud credentials produce an explicit unavailable response; production never silently uses memory or a local file.

Locally, `pnpm dev` uses `.local/tide.json` when Redis credentials are absent. That file is ignored by Git and survives server restarts. Local sharing is real between clients of the local server, but is not evidence of cloud storage or public multiplayer.

## Current provisioning boundary

No database has been provisioned. Vercel’s CLI requires acceptance of Upstash’s marketplace terms through the existing Vercel account. The native Vercel Blob alternative was also attempted and rejected because the account’s free storage threshold has been reached. No paid upgrade, auto-upgrade or extra account was enabled. The intended project is `blakefolgados-projects/blakefolgado`, ID `prj_Up9hxMDpUM9h6RamdexUSfVk7Yu3`, currently on Hobby.

## Accessibility and deployment

The ordinary project list works without JavaScript or WebGL. Reduced-motion visitors get a still world and immediate travel. Quiet chimes begin only on interaction. There are no sound/list toggles, cards, arrows, borders or explanatory overlays. Bottle forms use a native keyboard-accessible dialog, clear save feedback and retain the draft on failure. Animation pauses when hidden; pixel ratio and particle counts are bounded, and old geometry is disposed on resize.

Vercel builds with `pnpm build` and serves `dist` plus the API. This branch removes the daily generation cron, refresh endpoint and generator. Production only changes when this branch is released; the current work is a localhost preview.

## Checks

`pnpm test` covers momentum and bounds, priority-preserving random layouts, eye bounds, note retention and idempotency, visitor expiration, shared abuse limits, concurrent local saves and the prohibition on paid model fallbacks. Browser checks cover mobile width, rendering, arrivals, new-tab navigation and the shoreline dialogs. A successful local free-model response has been observed. Cloud database behavior remains unverified until provisioning is complete.

Geist Pixel Square is pinned from `vercel/geist-pixel-font` commit `bd5f6cca54c0b179115d8a3fd89385db607034c2`; its SIL Open Font License is included in `assets/fonts/`.
