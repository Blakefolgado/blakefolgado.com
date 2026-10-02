# Blake’s pixel world

A Three.js personal website with a different winding sky on each visit. The priority order stays Tradehand, ToolRouter, Outside, HumanLeap, SentryDock, bot.store, then MagicScreenshots. Each project has its actual app logo rendered as coarse pixel particles, with finer half-pixel lettering sampled at twice the resolution. Logos tilt gently, titles ripple under the cursor, and the particles scatter on contact and spring back together. The Neo character walks with momentum, looks towards the mouse and bends backwards on hover. The sky ends in mountains, hills and an interactive shoreline; writing, talks and previous work sit below.

## Develop

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm dev
```

Open http://localhost:4173. Rebuild after editing. The server serves `dist` plus `/api/tide`; a static file server alone cannot save bottles. Three.js and Geist Pixel Square are served locally. Credentials and server code never enter `dist`.

## Content and navigation

`index.html` owns the biography, project order, short hooks, writing and talk links. JavaScript reads its semantic project list, so the fallback and game share the same content. `src/physics.js` controls movement, bounded eye tracking, the seeded layout and the shared shoreline boundary. `src/world.js` draws the world; `src/scenery.js` supplies the landscape and sky sprites, and `src/ocean.js` supplies boats, fish and the surfer. Moving the mouse over project lettering or logos pushes the nearby pixels apart; they spring back when the cursor leaves. Hovering never activates a link. Clicking a project walks to an actual pixel in its label; character contact opens its website in a new tab. Travel to a chosen project does not activate unrelated projects along the way. Free walking still activates things on contact. Ctrl/Cmd-click retains ordinary browser link behavior. Mouse, touch, arrows and WASD are supported. Page scrolling explores the full world.

Tapping the sea opens the bottle composer immediately and cancels the current walk, so it cannot open a project crossed on the way to the water. Touch scrolling cancels the tap. Bottle buttons also open their dialogs directly. Mouse movement sends ripples through the water, fish dart away, and boats drift and bob. Hovering or tapping the surfer knocks the rider off the board with a splash; the rider recovers after a few seconds and a parked cursor cannot repeatedly topple them. Reduced motion keeps the ocean creatures still.

Scrolling confines Neo to the visible part of the world with room for the whole sprite. Scroll movement cancels the old journey so an edge correction cannot activate a project. After five seconds without movement controls, Neo takes slower short walks around nearby landmarks, pausing between them. Clicking, dragging or using the movement keys takes over immediately. Hovering Neo pauses the stroll for the dodge, and the bottle dialog pauses idle movement. Autonomous movement never opens websites or bottles, and never plays movement sounds. Reduced motion disables idle strolling. This behaviour runs in the browser with no model calls or added services.

Arrow keys and WASD work anywhere on the page without focusing the canvas. Both short taps and held keys move the character, including shifted uppercase WASD. Inputs, bottle dialogs, text composition and browser shortcuts keep normal keyboard behaviour. Losing window focus clears movement so held keys cannot get stuck.

When keyboard travel reaches the top or bottom of the visible world, the page follows Neo so he can continue through the map. This camera movement keeps held keys and momentum intact; manual scrolling still cancels the old journey. At the actual ends of the map, Up and Down return to normal page scrolling to reach the introduction or footer. Off-screen canvas controls do not intercept arrow scrolling.

Two suited Matrix agents on small screens, or three on larger screens, chase Neo and aim their pistols at his position when firing. Reinforcements arrive every 18 seconds of game time, capped at four agents on small screens and six on larger screens. Every agent, including later arrivals, smoothly retreats from a mouse within 110 pixels; exact overlaps have a stable escape direction. These are clearly game enemies, separate from actual visitor presence. The slimmer Neo sprite has black hair, narrow sunglasses, boots and a long black coat. Hold Space for bullet time, or tap it for a short slow-motion burst; enemy movement, firing, bullets and pixel impacts slow while Neo's movement controls remain responsive. Press Shift for a short backward dodge, or hover Neo to bend away from the cursor. Moving in bullet time or during a dodge leaves fading green afterimages. A shot that catches Neo prompts a brief defensive bend; there is no death, health bar or interruption to browsing.

Bullets travel as visible pixel streaks, with small muzzle flashes. Their swept paths strike actual logo and lettering pixels, producing a local burst that springs back together; one bullet can pass through more than one app. Bullets and enemies cannot activate links or bottles. The action stops outside the visible world and while a bottle dialog is open; reduced motion hides it. There are at most 24 bullets, 128 impact particles and three afterimages, with reused geometry and no backend traffic, model requests or extra services. Space retains its normal action on focused buttons and links.

The two talk links and previous roles come from the repository’s existing content. The former `content/site-content.json` remains historical source material and is not used at runtime. The photo favicon is preserved.

## Bottles, visitors and free AI

`server/tide.js` and `api/tide.js` expose a same-origin JSON endpoint. `src/tide.js` handles the bottle dialog and presence. Visitors get random anonymous IDs; real positions update every five seconds while active. Rendering interpolates their positions. Hidden tabs stop polling and idle tabs stop after two minutes. Presence expires after 20 seconds and is bounded to 24 visitors. No simulated visitors are added.

Notes preserve the visitor’s wording and use textContent when displayed. The shore keeps the latest 256 notes; readers receive the most recent 40. A note has a stable ID so retrying after an uncertain response cannot create a duplicate. Daily limits use a salted, rotating IP hash, never a stored or returned IP address. The global cap is 3,000 exchanges/day; an address can leave three notes/day.

OpenRouter requests use only `openrouter/free`, with a zero-price provider ceiling and no paid fallback or plugins. Visitor notes are never sent to the model. AI messages are labelled separately, cached, and capped at one attempted generation/hour and 20/day. Free models can be unavailable or slow; cached messages and visitor notes still work. The procedural sky remains different without any model request.

For cloud sharing, use a dedicated Upstash Redis **Free** database connected to this Vercel project. Set `autoUpgrade=false` and `prodPack=false`. The API accepts `KV_REST_API_URL` / `KV_REST_API_TOKEN` or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, plus the existing `OPENROUTER_API_KEY`. Compare-and-set writes prevent lost updates across Vercel instances. Missing cloud credentials explicitly select private browser bottles; production never silently uses server memory or a local file.

Without Redis in Vercel, the API explicitly returns private-bottle mode. The browser saves up to 256 notes in localStorage and reads the latest 40, labels them “Saved on this device”, stops presence polling, and makes no AI calls. It never invents visitors or claims these notes are public. Storage failures retain the draft and show an error. Locally, `pnpm dev` uses `.local/tide.json` when Redis credentials are absent. That file is ignored by Git and survives server restarts. Local sharing is real between clients of the local server, but is not evidence of cloud storage or public multiplayer.

## Current provisioning boundary

No database has been provisioned. Vercel’s CLI requires acceptance of Upstash’s marketplace terms through the existing Vercel account. The native Vercel Blob alternative was also attempted and rejected because the account’s free storage threshold has been reached. No paid upgrade, auto-upgrade or extra account was enabled. The intended project is `blakefolgados-projects/blakefolgado`, ID `prj_Up9hxMDpUM9h6RamdexUSfVk7Yu3`, currently on Hobby.

## Accessibility and deployment

The ordinary project list works without JavaScript or WebGL. Reduced-motion visitors get a still world and immediate travel. Quiet chimes begin only on interaction. There are no sound/list toggles, cards, arrows, borders or explanatory overlays. Bottle forms use a native keyboard-accessible dialog, clear save feedback and retain the draft on failure. Animation pauses when hidden; pixel ratio and particle counts are bounded, and old geometry is disposed on resize.

Vercel builds with `pnpm build` and serves `dist` plus the API. This branch removes the daily generation cron, refresh endpoint and generator. The main branch is the production release. `.vercelignore` excludes local notes, environment files and nested worktrees from deployment uploads.

## Checks

`pnpm test` covers momentum and bounds, priority-preserving random layouts, eye bounds, surfer recovery, agent pursuit, cursor avoidance for all arrivals, projectile bounds and limits, bullet time, swept pixel impacts and dodge reactions, note retention and idempotency, visitor expiration, shared abuse limits, concurrent local saves, private-bottle persistence and failures, explicit unconfigured production mode and the prohibition on paid model fallbacks. Browser checks cover mobile width, rendering, arrivals, new-tab navigation and the shoreline dialogs. A successful local free-model response has been observed. Cloud database behavior remains unverified until provisioning is complete.

Geist Pixel Square is pinned from `vercel/geist-pixel-font` commit `bd5f6cca54c0b179115d8a3fd89385db607034c2`; its SIL Open Font License is included in `assets/fonts/`.
