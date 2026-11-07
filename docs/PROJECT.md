# SanökRun: project handbook

Everything a new chat (or a new developer) needs to keep building SanökRun.
Read this first, then the code. Keep it up to date when architecture changes.

- **Repo:** `github.com/schkja/SanoekRun` (branch `main`, PRs from feature branches)
- **Live:** https://sanoekrun.sascha.iodatalabs.dev
- **Owner:** schkja (Sascha). Owns the license and all commits.
- **State (Nov 2026):** v1 playable and deployed. PR #6 `leaderboard-and-progress`
  adds leaderboard, missions, shop, power-ups, PWA install, logo and the 9:16
  share picture. Server steps for it are in §9.

---

## 1. Working agreement (read before touching git)

| Rule | Detail |
| --- | --- |
| Commits only as the owner | `git -c user.name=schkja -c user.email=148076556+schkja@users.noreply.github.com commit ...` |
| No AI attribution | Never write Claude, AI, "Co-Authored-By" or "Generated with" in commits, PR titles or PR bodies. The owner holds the license. |
| Branch + PR | Never push to `main`. Branch, push, open a PR. |
| Opening PRs | `gh pr create` / GraphQL are blocked in the agent sandbox. Use REST: `gh api repos/schkja/SanoekRun/pulls --input pr.json` with `{title, head, base:"main", body}`. |
| Shallow clone | After creating a branch, add a fetch refspec for it if `git push`/`fetch` complain. |
| Mockups first | For big visual redesigns show 2–3 mockups and let the owner pick. |
| Communication | Owner writes in Russian. Answer in Russian, TLDR style: short bullets, no walls of text. |
| Texts in game | No long dashes (—) in player-facing strings. Every string in all 5 languages. |
| Ethics | Game is played by kids. No real-money purchases, no loot boxes, no dark patterns, no pressure timers. |
| Server | The owner runs server commands himself. Give exact copy-paste commands. Merge before server changes (a 502 happened once when the server was updated before merge). |

---

## 2. The game in one screen

Endless 3D runner in the browser, Temple Run style, cartoon look (cel shading +
thick outlines), bright forest. Portrait phone first, works on desktop.

- **Two heroes, each with its own route of worlds** (`content/worlds.json` → `routes`):
  - **Lumberjack** (cut one tree too many and woke the bear): `boardwalk` → `autumn-boardwalk` → `temple` → `lava`. Collects **coins**. Chased by a **bear** (monster/lava in later worlds).
  - **Squirrel** (white legs, teal scarf, big leaning S-tail, tufted ears): `forest-trail` → `treetops` → `autumn-canopy` → `snowy-pines`. Collects **acorns**. Chased by a **hawk**, later a **snowball**.
- Each world is 650 m, then a portal to the next; the route loops faster.
- **Controls:** swipe left/right = turn at a corner or change lane; up = jump; down = slide (or slam mid-air). Keyboard: arrows/WASD, Space = jump, **Esc or P = pause**.
- **Fail:** miss a corner (fall), or stumble twice within the danger window (the chaser catches you). One stumble puts the chaser on your heels for a few seconds.
- **Scoring:** distance, coins (rising pitch on streaks), *perfect turns* (late swipe near the corner centre) raise the multiplier up to x5, *close calls* for last-moment dodges.
- **Meta loop (PR #6):** bank of all collected coins/acorns → outfit shop; 3 missions at a time → levels; online leaderboard; power-ups; share picture; install to home screen.

---

## 3. Tech stack

| Layer | Choice |
| --- | --- |
| Rendering | Three.js 0.186, `MeshToonMaterial` with a 3-step gradient, inverted-hull outlines |
| Language / build | TypeScript 5.9 strict, Vite 8. `vite-plugin-singlefile` for a one-file build (`--mode single`) |
| UI | Plain DOM overlay over the canvas (`#ui`), one CSS file. No framework. |
| Fonts | Bundled via fontsource (works offline): Lilita One (display, Latin), Rubik 800 (display, Cyrillic), Nunito 700/800 (body) |
| Audio | WebAudio, synthesized SFX + layered music (`src/core/audio.ts`, `music.ts`) |
| Backend | Zero-dependency Node 22 HTTP server (`server/index.mjs`), JSON file storage |
| Hosting | Docker on a Hetzner box: nginx (game) + node (API) behind Traefik; Watchtower auto-updates |
| CI | GitHub Actions builds and pushes images to GHCR on every push to `main` |

No runtime dependencies besides `three` and fonts. Keep it that way unless there is a strong reason.

---

## 4. Source map

```
index.html                 #game (canvas) + #ui (overlay); icons, manifest, PWA meta
content/worlds.json        worlds (theme, decor, path style, chaser, length) + per-hero routes
public/                    icons/, manifest.webmanifest, sw.js, models/, sounds/
scripts/make-icons.mjs     renders ICON_SVG (src/ui/logo.ts) to PNG icons via Playwright
server/                    leaderboard API (index.mjs) + Dockerfile
deploy/                    docker-compose.yml, nginx.conf, traefik-sanoekrun.yaml (reference)
.github/workflows/deploy.yml  typecheck, build, push ghcr.io/schkja/sanoekrun and sanoekrun-api

src/main.ts                fonts, creates Game, registers the service worker (prod + https only)
src/core/
  engine.ts                renderer, scene, camera, resize, render loop hooks
  input.ts                 swipes + keyboard → actions (ignores keys while typing in inputs)
  audio.ts, music.ts       SFX and layered music
  assets.ts                loader for future .glb models
src/game/
  game.ts                  THE ORCHESTRATOR: state machine, rules, menus, HUD, meta progression
  track.ts                 segment generation, obstacles, coins, power-up placement, floor queries
  runner.ts                hero physics + animation in track coordinates
  chaser.ts                bear/hawk/snowball/monster/lava models and chase behaviour
  visuals.ts               ALL procedural meshes: scenery kits, obstacles, heroes, outfits, power-ups, bake()
  toon.ts                  toon materials + shared outline material (inverted hull)
  worlds.ts                loads worlds.json, theme application, route per hero
  tuning.ts                every gameplay number (speeds, jump, windows, spacing, power-up times)
  settings.ts              VITE_* env defaults + user settings (localStorage)
  progress.ts              profile: bank, level, missions, outfits (localStorage)
  leaderboard.ts           fetch/submit to /api/scores, fails quietly
  sparkles.ts              coin sparkle particles
src/ui/
  menus.ts                 one renderer for every overlay screen, from a MenuScreen object
  hud.ts                   distance, coins, score, multiplier, danger meter, toasts, power badges, flash
  share-card.ts            async 1080×1920 share picture + Web Share / download
  logo.ts                  ICON_SVG (S + acorn), ACORN_SVG (umlaut dots), svgImage()
  outfit-icons.ts          cartoon SVG icons for shop items
  portraits.ts             SVG portraits of the heroes (title cards, share picture)
  speed-lines.ts           speed-lines effect
  style.css                all UI styling (design tokens at the top)
src/i18n/
  index.ts                 t(key, vars), language detection, formatNumber (toLocaleString)
  strings.ts               en, de, ru, uk, es string tables (en is the source of keys)
```

---

## 5. Core architecture

### 5.1 Game state machine (`game.ts`)
`Phase = 'title' | 'playing' | 'paused' | 'dying' | 'over'`.
- `showTitle()` → chips (level, bank, best), hero cards, Run, toolbar (Records, Missions, Shop, Settings, Install).
- `start()` → `prepareTrack()`, runner reset, chaser intro.
- `tick(dt)` runs **fixed 1/120 s substeps** of `step()` (physics, collisions, pickups), then cosmetic animation once per frame. Substeps make landings and collisions frame-rate independent (it failed at 20 fps before).
- `showRunOver()` → bank coins, report missions, level up, snapshot frame, build share card (async), maybe `askName()` → `showRunOverMenu()`.
- `window.game` is exposed for debugging/tests (`phase`, `distance`, `shareCard`...).

### 5.2 Track model (`track.ts`)
- Chain of straight **segments** joined by 90° corners. Headings only **N, E, W** (never back toward the camera), so the path can't cross itself.
- Positions are **track coordinates**: `(seg, s, x)` = segment, distance along it, lateral offset. `track.position(seg, s, x, out)` converts to world space. This is what makes turns trivial: a turn = `runner.turnOnto(next)`.
- Segments are generated ahead and dropped behind (`dropMesh` disposes meshes, coins, power-ups).
- **Obstacle spacing is in seconds of running**, not metres, so it stays fair at high speed; extra room after jumps (`afterJump`).
- Obstacle kinds: jump (logs, ridges, gaps), slide (branches, fire jets), dodge (statues, boulders, toadstools, snowmen, log stacks). Decor is per world (`kit.decor`: boardwalk, branch, snow, jungle, lava).
- `hasFloor(seg, s, x)` is the single source of truth for falling.
- Power-ups: `placePowerup()` from segment 2, chance `TUNING.powerupChance`, only on open stretches, removes coins at that spot.

### 5.3 Runner (`runner.ts`)
Lanes −1/0/1 (`laneOffset`), smooth lane change, jump/slide/fast-fall, stumble timer.
Landing uses a `wasAbove` check plus a small tolerance. **Buffered turns**: a swipe slightly before a corner is remembered (`turnBuffer`). Visual position is smoothed through turns so early turns don't teleport.

### 5.4 Chaser (`chaser.ts`)
Gap model: normally out of view. On stumble → danger mode (visible behind, HUD meter). Second stumble inside the window → caught. Camera lifts while the chaser is visible so it never blocks the view (models are scaled down for the same reason).

### 5.5 Rendering and look (`visuals.ts`, `toon.ts`)
- Everything is procedural primitives (no external models yet), toon-shaded.
- **Outlines:** inverted hull. One shared `MeshBasicMaterial` (BackSide) whose vertex shader (`onBeforeCompile`) pushes vertices along view-space normals. Toggle globally with `outlineMaterial.visible` (setting `outlines`).
- **`bake()`** merges each segment's static meshes per material (`mergeGeometries`) to keep draw calls low; outline hulls are cached via `mergeVertices`. Meshes with `userData.keep` (coins, power-ups, animated parts) are not merged.
- Scenery rules learned the hard way:
  - Every tree trunk ends in a visible crown (bare poles looked like sticks).
  - Obstacle "faces" point to +z (toward the runner).
  - Nothing big near the camera line (leaf blobs blocked the view).
  - Things must be attached to something: toadstool families (`toadstool()`: stem, cream gills, red dome cap, white spots) sit on the branch shoulder; twigs grow out of the branch edge. Shelf mushrooms on trunks were removed (looked like plates).
- The hawk is a big bird of prey (owner: 'big, fierce, scary'; a chubby/cute one and a camera-facing one were rejected as 'a chick' and 'backwards'). It flies the same way as the runner, ~2 m behind and at y 5.3, nose up 0.4 rad so the camera sees dark wing tops: two-joint wings (shoulder + wrist) with fingered dark-tipped primaries, barred tail fan, hooked beak, brows, talons forward, scale 0.4. Its shadow on the path is part of the threat.
- The squirrel tail is one smooth `TubeGeometry` along an S-curve (`squirrelTailGeometry()`), fat in the middle with a ruffled edge, cream tuft at the tip, leaning out 0.5 rad and scaled (0.82, 0.68, 0.82) to about head height on an inner `plume` group (a friend found the full-size tail blocked the view) (the runner animates the outer `tail` group). Haunches make the back view read as squirrel. The squirrel is a quadruped (owner: 'squirrels run on four legs'; a two-legged hop was rejected): long low body, haunches on the hind-leg pivots (`legL/legR`), front legs are `armL/armR`, head group on a neck (`RunnerModel.head`), `gait: 'quad'`. `Runner.animateQuad()`: gallop (pairs half a stride apart, each pair slightly out of step, spine rocks, head counter-rocks), jump = stretched out, slide = belly flat with legs splayed (body y −0.42, never below the path). Check it from the side too (rotate `model.root` in a test) since the game camera is behind.
- Story props: `lumberjackCamp` (axe, stump, cut logs) and `squirrelHome` (hollow, acorn stash).
- Heroes: `makeCharacterModel(character, outfit)` returns `{root, body, legL, legR, armL, armR, tail?}`. Outfits are built in `hat()` (lumberjack) and squirrel accessories; shared `crown()`.

### 5.6 UI (`menus.ts`, `hud.ts`, `style.css`)
- **Every overlay is data:** `menus.show(MenuScreen)` with optional `eyebrow, title, hero, badge, body, chips, stats, choices (cards with art), sections (rows: value / toggle / selected / hint, onClick optional = read-only), input, buttons, toolbar, note, variant`.
  Variants: `is-title, is-settings, is-shop, is-over, is-intro`. To add a screen, call `show()`; don't write new DOM code.
- Title `SanökRun` is rendered by `titleHtml()` with **acorns as the umlaut dots** (only for the game name, not German ö's).
- Focus uses `preventScroll` (settings used to jump to the bottom). Enter in the input presses the primary button.
- HUD: `update(state)`, `toast()`, `hint()`, `flash('white'|'red')`, `setPowers()`, `setCollectible('coin'|'acorn')`, `relabel()` after language change.
- Design language: white rounded cards, ink `#1f2a44` 3–4 px borders with offset shadow, yellow `#ffc93c` display titles with ink stroke, green `#4fd07a` primary buttons, sky `#4fb8ff`. Lilita One for display, Nunito for body.

### 5.7 i18n (`src/i18n`)
- Languages: **en, de, ru, uk, es**. Auto-detect from `navigator.languages`, override in Settings (list picker).
- `t(key, {vars})` with `{name}` placeholders; `StringKey` type is derived from the English table, so a missing key is a compile error in `en` and falls back to English elsewhere.
- Cyrillic display text falls back to Rubik (Lilita One has no Cyrillic).
- Adding a language: copy the `en` block, translate, add to `LANGUAGE_CHOICES`.

### 5.8 Settings (`settings.ts`)
Defaults from `VITE_*` env at build time (see `.env.example`), overridden per user in localStorage `sanoekrun.settings`.
`VITE_LANGUAGE, VITE_CHARACTER, VITE_MUSIC (chase|hop|menu|off), VITE_SOUND, VITE_SHARE_URL`, effects `VITE_FX_COIN_SPARKLE, _SPEED_LINES, _SLOW_MOTION, _TURN_TILT, _CAMERA_SHAKE, _SCREEN_FLASH, _SPEED_ZOOM, _OUTLINES`; `VITE_FX=off` disables all. Debug: `?world=<id>` starts in that world.

---

## 6. Meta progression (PR #6)

### 6.1 Profile (`progress.ts`, localStorage `sanoekrun.profile`)
`{ bank, level, missions[3], owned[], equipped{lumberjack, squirrel}, totals{}, name, device }`
- `device` = random id, used by the leaderboard (one entry per device+name+day, rate limits).
- Best distance is separate: `sanoekrun.best`.

### 6.2 Missions and levels
- Stats: run-scoped `runDistance, runCoins, runWorlds, runNoHit`; lifetime `jumps, slides, perfects, closeCalls, powerups, runs`.
- `TARGETS` has 5 difficulty tiers; tier grows with level.
- `report(stat, value)` → returns newly completed missions, pays `missionReward = 50 × min(5, level)`. Toasts appear during the run.
- `tryLevelUp()` when all 3 are done: pays `levelBonus = 100 × level`, deals 3 new missions.

### 6.2b Start worlds
Every world a hero reaches is saved in `profile.reached[character]` (`markReached`, toast "New start point unlocked"). When more than one is unlocked, the title shows a "Start in" row that opens a picker; the choice is `profile.startWorld[character]`. `prepareTrack()` starts the track at that world (`?world=` still overrides for testing). The `runWorlds` mission counts portals passed in this run, so a later start doesn't complete it for free.

### 6.3 Shop
`OUTFITS` (id, character, price, icon). Lumberjack: beanie-orange 0, beanie-blue 150, cap-green 300, viking 600, crown 1200. Squirrel: scarf-teal 0, scarf-red 150, sunglasses 300, flower 500, crown 1200.
`buyOrEquip(id)` → `'equipped' | 'bought' | 'too-expensive'`. Icons in `outfit-icons.ts` (SVG), 3D in `visuals.ts`. To add an outfit: entry in `OUTFITS`, icon in `ICONS`, mesh in `hat()`/squirrel accessories, `outfit.<id>` string in 5 languages.

### 6.4 Power-ups
`'magnet' | 'shield' | 'double'`, tuned in `TUNING.powerup` (magnet 10 s, reach 7; double 10 s; shield 20 s). Bubble mesh `buildPowerup(kind)`, spins and bobs. Shield absorbs one stumble (shows a transparent sphere). Magnet pulls coins ahead within reach. HUD badges with a draining conic ring.

### 6.5 Leaderboard
- Client `leaderboard.ts`: `fetchBoard(period, device)`, `submitRun(run)`. Base `./api/scores`, 6 s timeout, **all failures are silent** (game works offline / in previews).
- Name prompt opens automatically for runs ≥ 50 m (and ≥ board cutoff); every run ≥ 20 m gets a "🏆 Add to the records" button on the end screen until saved. If the API can't be reached, the prompt says so (`records.down`) instead of failing silently.
- Server `server/index.mjs`:
  - `GET /api/scores?period=all|today&device=` → `{period, total, entries[{rank,name,character,distance,mine}], cutoff}` (top 100).
  - `POST /api/scores {name, character, device, distance, coins, durationMs}` → `{ok, rank, rankToday}`; 400 `name|character|device`, 422 `run`, 429 rate limit.
  - `GET /api/health` → `{ok:true}`.
  - Storage `DATA_FILE` (default `/data/scores.json`), atomic write via tmp + rename. Keeps top 500 all-time + today's runs (day = Europe/Berlin).
  - Anti-cheat (plausibility, not security): `distance ≤ seconds × 24 × 1.08 + 30`, `coins ≤ distance × 0.5 + 20`. Rate limit: 8 s between submits, 40/hour per device and per IP.
  - Names: any pseudonym, 1–16 code points (any script, emoji, symbols). Refused: control/private/unassigned chars, bidi overrides, zero-width space, `<` `>`, and the bad-word list in 5 languages (matched on letters only).
  - Known limitation: a determined cheater can forge requests. Next step if needed: signed run tokens issued at run start + server-side duration check.

### 6.6 Share picture (`share-card.ts`)
`drawShareCard(run, snapshot|null): Promise<canvas>` builds 1080×1920 (TikTok/Stories): last run frame as background with shading, icon + wordmark, yellow comic burst with headline (`share.headline.<character>`) and huge outlined distance, world + collected line, hero portrait in a circle, "new record" sticker, green "Can you beat me?" pill, URL.
`shareRun()` uses Web Share with the PNG file on phones, else downloads it.

### 6.7 PWA / install
- `public/manifest.webmanifest` (fullscreen, portrait, sky-blue theme, icons incl. maskable).
- `public/sw.js`: network-first, cache fallback, skips `/api` and non-GET. Cache name `sanoekrun-v1` (bump to force cleanup). Registered only in production on https/localhost.
- Install screen: uses the captured `beforeinstallprompt` when available, otherwise shows Android and iPhone steps. Hidden when already installed (`display-mode: standalone/fullscreen` or `navigator.standalone`).
- Icons: change `ICON_SVG` in `src/ui/logo.ts`, then `node scripts/make-icons.mjs` (needs Playwright), and regenerate `public/favicon.ico` (16/32/48 from `icon-512.png`, e.g. with Pillow). The tab favicon is linked as .ico first, then PNG 32/16, then SVG (Safari ignores SVG favicons). nginx returns 404 for missing static files instead of the game page.
- Why it matters: kids often can't install store apps; home-screen web app needs no account.

---

## 6.8 Info screen, version, legal
- `src/about.ts`: `APP_VERSION` (from `package.json`, injected by Vite `define`), `BUILD_DATE`, `AUTHOR` (Sascha Belon, saschabelon@gmail.com, https://saschabelon.vercel.app/), `LEGAL_URL`.
- `content/changelog.json`: one entry per version with notes in all 5 languages. **On every release:** bump `package.json` version and add a changelog entry.
- Title toolbar → ℹ️ Info: version, author (opens site), bug report (mailto), website, privacy/imprint, last 4 changelog entries.
- `public/legal.html` (static, linkable from forums): Impressum (§ 5 DDG), Datenschutzerklärung (DE, binding) + English summary, licences (three.js MIT, fonts OFL). **The postal address in the Impressum must be filled in.**
- Privacy by design, keep it that way: no cookies, no analytics, no third-party requests, fonts bundled; nginx `access_log off`; API keeps IPs only as a salted in-memory hash for rate limiting (cleared hourly); Docker logs capped (5 MB × 2); name prompt warns to use a nickname. Any new data flow (accounts, analytics, ads, external fonts/CDNs) requires updating `legal.html` first.

### 6.9 Ground worlds (forest trail)
`theme.ground: true` raises the engine's "abyss" plane to y −0.06 and colours it as grass, so the path lies on the forest floor. Decor `trail` + path style `trail`: sandy path, grass verge, bushes (some with berries), flower bunches, ferns, stones, toadstools, rooted trees, hedge at every corner. No gaps (`obstacles.gap: 0`). Missing a corner = "ran into the bushes" (instant death in `step()`, no falling).

### 6.10 iPhone home-screen height
`apple-mobile-web-app-status-bar-style` is `default`, NOT `black-translucent`: with translucent, iOS standalone apps get a viewport short by the status bar and a strip of page background shows at the bottom (CSS/JS height hacks did not fix it on the owner's iPhone). iOS reads this meta only when the icon is added, so after changing it the app must be re-added to the home screen.

### 6.11 Visual QA checklist (run after scenery changes)
Playwright autopilot (`window.game.step` + `handleAction`, see §8) through every world, screenshots every ~2 s and right after each turn. Known traps:
- Anything decorative must stand on something: the squirrel hollow needs the giant corner trunk (trail and branch worlds both build one).
- At corners the previous segment's floor lies crosswise under the new path: no along-the-edge texture details (painted grass) and no outlined edge strips (verges, moss curbs use `userData.noOutline`), or they draw stripes across the path.
- Nothing wide at camera height (≈3.5–5 m) within ~3 m of the path: pine layers start above it, trees beside the path keep crowns high.

## 7. Content: adding a world

Edit `content/worlds.json` only (no code) if you reuse existing parts:
`decor` (boardwalk | branch | snow | jungle | lava), `path.style` (planks | bark | snow | stone), `chaser` (bear | hawk | snowball | monster | lava), `theme` (sky, fog, sun, hemi light, abyss colour, accent), `length`, `name` and `caughtBy` (add i18n keys). Put the id into a hero's `routes` list. New decor/chaser types need code in `visuals.ts` / `chaser.ts`.

---

## 8. Local development and testing

```
npm install
npm run dev              # http://localhost:5173, proxies /api → localhost:8080
node server/index.mjs    # leaderboard (set DATA_FILE=./data/scores.json locally)
npm run typecheck        # must be clean before every commit
npm run build            # dist/
npm run preview          # http://localhost:4173, also proxies /api
npm run build:single     # dist-single/index.html, one self-contained file (used for previews)
```

**Test approach used so far** (Playwright + Chrome with SwiftShader WebGL, phone viewport 390×844, `is_mobile`, `has_touch`, locale per language):
- Screenshot every menu (title, shop, missions, records, install, settings, language list) in several locales: catches overflow and missing translations.
- Start a run, read `window.game.phase` until `'over'`, check the name prompt, export `window.game.shareCard.toDataURL()` to inspect the share picture.
- World check: `?world=<id>` for every world, screenshot normal and with chaser visible.
- Autopilot sim (reads track state and swipes) to check that high speed stays fair.
- Click menu buttons by `button.menu-button` (text selectors also match titles).
- Swiftshader runs at low fps: give runs 30–60 s.

---

## 9. Deployment and operations

**Pipeline:** push to `main` → GitHub Actions (`deploy.yml`): `npm ci`, typecheck, build, `node --check server/index.mjs`, build and push
`ghcr.io/schkja/sanoekrun:latest` (nginx + dist) and `ghcr.io/schkja/sanoekrun-api:latest` (server/). Watchtower on the server (label-enabled, 60 s poll) pulls and restarts. Verified: live ~20 s after the image is pushed.

**Server (Hetzner):**
- App dir `/srv/sanoekrun.sascha.iodatalabs.dev` (git checkout); `docker-compose.yml` there is a symlink to `deploy/docker-compose.yml`.
- Services: `sanoekrun` (nginx :80) and `sanoekrun-api` (node :8080, volume `./data:/data`), both on external network `proxy`, both with the Watchtower label.
- Traefik file provider in `/srv/traefik/conf.d/`: `sanoekrun.sascha.iodatalabs.dev.yaml` (site) and `sanoekrun-api.yaml` (`Host(...) && PathPrefix(/api)` → `http://sanoekrun-api:8080`, higher priority because the rule is longer).
- nginx: `/assets/` immutable for 1 year; `/`, `/sw.js` and the manifest no-cache so updates show immediately. Never add a server-level `types {}` block (it replaces all MIME types and breaks JS).

**One-time steps for PR #6 (after merge):**
1. GitHub → Packages → `sanoekrun-api` → make public (or `docker login ghcr.io` on the server).
2. Create the API route from the existing site file:
   ```
   cd /srv/traefik/conf.d && sed -e 's/sanoekrun:/sanoekrun-api:/g' -e 's/service: sanoekrun$/service: sanoekrun-api/' -e 's/Host(`sanoekrun.sascha.iodatalabs.dev`)/Host(`sanoekrun.sascha.iodatalabs.dev`) \&\& PathPrefix(`\/api`)/' -e 's#http://sanoekrun:80#http://sanoekrun-api:8080#' sanoekrun.sascha.iodatalabs.dev.yaml > sanoekrun-api.yaml
   ```
3. `cd /srv/sanoekrun.sascha.iodatalabs.dev && git pull && docker compose pull && docker compose up -d`
4. Check `curl https://sanoekrun.sascha.iodatalabs.dev/api/health` → `{"ok":true}`.
- **Backup:** `./data/scores.json` is the only state on the server. Copy it in any server backup.
- **Player data** (bank, outfits, missions) lives only in the browser. Clearing site data resets it. A cloud save would need accounts; deliberately not done (kids, privacy).

---

## 10. Gotchas and decisions log

- Fixed timestep 1/120: don't move gameplay into the per-frame animate path.
- Obstacle spacing in seconds; if you raise `maxSpeed`, playtest the autopilot.
- Chaser and camera: anything near the runner must not block the view (scale down, lift camera).
- `bake()` merges by material: an object that must move or be removed needs `userData.keep = true`.
- Menus are re-rendered from scratch on each `show()`; keep state in `game.ts`, not in the DOM.
- Input ignores keys while focus is in an input (nickname field).
- `drawShareCard` is async (loads SVG portrait + icon as images, waits for the font).
- Previews on claude.ai: no service worker, no downloads, no `/api`; everything degrades silently.
- Old look: effects are individually switchable (settings + env), outlines included, so the earlier plain look is still available.

---

## 11. Roadmap (details in `ROADMAP.md`)

1. Daily gift with a 7-day streak calendar (missing a day restarts, nothing lost).
2. Sticker album (stickers for run moments, a full page unlocks a share-picture frame).
3. Funny details: squirrel cheeks puff with acorns, lumberjack shakes fist at the bear, bear sniffs a picnic basket, hawk loses a feather, idle animations on the title.
4. Pet companion: chipmunk (squirrel) or hedgehog (lumberjack), levels up, small ability.
5. Video replay share (last 6 s as a clip), weekly event world, friends board via link code.
6. Real low-poly models (CC0: Kenney, Quaternius, KayKit) via `Assets.model()`, replacing builders one at a time; keep a credits list.
7. App stores via Capacitor once there are players.
8. License decision: source-available for code (PolyForm Noncommercial or BSL), all rights reserved for name, logo, art.

---

## 12. Prompt to start a new chat

> Project SanökRun (repo schkja/SanoekRun, Three.js + Vite + TS endless runner, deployed at sanoekrun.sascha.iodatalabs.dev). Read `docs/PROJECT.md` in the repo first. Rules: commits only as schkja, no AI mention anywhere, branch + PR via `gh api .../pulls`, answer me in Russian TLDR. Task: ...
