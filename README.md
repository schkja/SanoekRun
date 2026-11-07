# SanökRun

An endless runner in the spirit of Temple Run, set high in the forest. Pick
who you play:

- **Lumberjack** — runs wooden boardwalks above the treetops, through autumn
  woods, the temple ruins and the lava cave, chased by a grumpy bear (and worse).
- **Squirrel** — runs along the branches of giant trees and through snowy pines,
  chased by a hawk and a runaway snowball, collecting acorns.

Swipe to turn at corners, jump gaps and logs, slide under branches, and stay
ahead of whatever is chasing you.

Built with **Three.js**, **Vite** and **TypeScript**. Runs in any phone or
desktop browser. Everything you see is built from simple shapes for now, so it
ships with zero asset files.

---

## Run it

```bash
npm install
npm run dev
```

That opens `http://localhost:5173`. On a phone on the same Wi-Fi, open the
`Network:` address Vite prints.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run build:single` | The whole game as one HTML file in `dist-single/` (easy to share) |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without building |

### Controls

| | Phone | Keyboard |
| --- | --- | --- |
| Turn at a corner / change lane | Swipe left or right | ← → or A D |
| Jump | Swipe up | ↑, W or Space |
| Slide (or slam down mid-air) | Swipe down | ↓ or S |
| Pause | Pause button | Esc or P |

A sideways swipe means **turn** when a corner is coming up and **change lane**
the rest of the time. A turn swiped slightly early is remembered and fires in
time.

---

## How it plays

- **The track** is a chain of straight segments joined by 90° corners. Miss a
  corner and you run off the edge.
- **Obstacles:** logs and rock ridges (jump), branches and fire jets (slide),
  statues and boulders blocking lanes (dodge), and gaps (jump).
- **The chaser** depends on the world: a jungle beast in the ruins, a flood of
  lava in the caves. Stumble once and it's right behind you for a few seconds;
  stumble again in that time and it catches you.
- **Worlds** change through a portal every 650 m and then loop, faster each time.
- **Rewards:** coins (rising pitch on streaks), *perfect turns* (swipe late,
  near the corner's centre) which raise the score multiplier up to x5, and
  *close calls* for last-moment dodges. The end screen shows how close you came
  to your best distance.
- The first two runs show hints just before each new kind of obstacle.
- **Power-ups** float in bubbles on open stretches: 🧲 magnet (pulls in coins
  for 10 s), 🛡️ shield (absorbs one stumble, 20 s) and ×2 (double coins, 10 s).
  Timers in `TUNING.powerup`.

## Progress: missions, levels, shop

Kept on the device (`src/game/progress.ts`, localStorage `sanoekrun.profile`).

- **Missions:** three at a time ("run 500 m", "jump 30 times", "3 perfect
  turns in one run"...). Each one pays coins into the bank. Finish all three
  and you level up, get a bonus and three harder missions.
- **Bank:** every coin or acorn you pick up is added to it after the run.
- **Shop:** outfits for each hero, bought with the bank. Nothing is sold for
  real money and there are no random boxes.

## Leaderboard

A tiny server (`server/index.mjs`, Node, no dependencies) keeps the top 500 of
all time and today's runs in `/data/scores.json`. When a run makes the board,
the game asks for a nickname (1 to 12 letters, rude words filtered in all five
languages). It rejects impossible runs (too far for the time taken, too many
coins) and limits how often one device or address can submit. When the server
can't be reached, the game simply doesn't show it.

API: `GET /api/scores?period=all|today&device=…`, `POST /api/scores`,
`GET /api/health`. In development, `npm run dev` proxies `/api` to
`localhost:8080`; start the server with `node server/index.mjs`.

## Install on a phone

The game is a web app (manifest + offline service worker), so it can sit on
the home screen like an app, with no store and no account. The title screen
has an **Install** button: on Android and Chrome it opens the real install
prompt, on iPhone it shows the three steps (Share → Add to Home Screen → Add).
Icons are in `public/icons/`, rendered from `src/ui/logo.ts` with
`node scripts/make-icons.mjs`.

---

## Where things live

```
content/
  worlds.json        every world: colours, chaser, scenery, obstacle mix

src/
  main.ts            entry point
  game/
    game.ts          the rules: swipes, turns, obstacles, coins, scoring, screens
    track.ts         endless track generation (segments, corners, gaps, coins)
    runner.ts        running, jumping, sliding, falling, character animation
    chaser.ts        the jungle beast and the lava flood
    visuals.ts       every mesh: path, scenery, obstacles, coins, portal, runner
    tuning.ts        every number that sets the feel and difficulty
    worlds.ts        loads worlds.json
  core/
    engine.ts        renderer, lights, the chase camera that swings at corners
    input.ts         swipes and keys → left / right / up / down
    audio.ts         synthesised sounds (drop in real files any time)
    assets.ts        .glb model loading with placeholder fallback (for later)
  ui/
    hud.ts           distance, coins, score, multiplier, chaser meter, hints
    menus.ts         title, pause and end-of-run screens
    style.css        all UI styling; CSS variables at the top
```

## Settings and effects

Players open **Settings** from the title screen or the pause menu:

- **Character:** Explorer (collects coins) or Squirrel (collects nuts)
- **Music:** Chase, Forest hop, Menu chill or Off — generated in code, and it adds layers as the run speeds up
- **Sound** on or off
- **Effects**, each on or off: coin sparkles, speed lines, slow-mo close calls, corner tilt, camera shake, screen flashes, speed zoom

Their choices are saved on their device. The defaults come from environment
variables at build time — copy `.env.example` to `.env` and change any line.
`VITE_FX=off` turns every effect off at once, which is handy for debugging.

## Look and languages

Everything is drawn in a cartoon style: three-tone cel shading and dark ink
outlines (`src/game/toon.ts`). The still scenery of each stretch of track is
merged into a few meshes so the outlines stay cheap on phones. Players can turn
the outlines off in Settings.

The game speaks English, German, Russian, Ukrainian and Spanish. It starts in
the phone or browser language and can be changed in Settings. Every text lives
in `src/i18n/strings.ts`; to add a language, copy the English block and
translate it.

## Share card

At the end of a run, **Share your run** makes a tall 1080×1920 picture sized
for TikTok and Stories: the last frame of the run, the logo, your distance in
huge outlined letters on a comic burst, your hero, the world reached, a "new
record" sticker and "Can you beat me?" with the link. It
opens the phone's share sheet for WhatsApp, Instagram or TikTok. On a desktop
it downloads the picture instead. The link printed on it is `VITE_SHARE_URL`.

## Deployment

Every push to `main` deploys itself:

1. GitHub Actions (`.github/workflows/deploy.yml`) type-checks, builds, and
   publishes a Docker image to `ghcr.io/schkja/sanoekrun:latest`.
2. On the server, Watchtower checks for a new image every minute and restarts
   the game container with it.

The server runs `deploy/docker-compose.yml`: the game image (nginx serving
the built game, `deploy/nginx.conf`) and the leaderboard image
(`ghcr.io/schkja/sanoekrun-api`, data in `./data`). Traefik sends `/api` to
the leaderboard and everything else to the game
(`deploy/traefik-sanoekrun.yaml`).

## Tuning the feel

Almost everything is in **`src/game/tuning.ts`**: running speed and how fast it
ramps up, jump height, slide length, how early a turn is accepted, the perfect
turn window, how long the chaser stays close after a stumble, obstacle spacing
(in seconds of running, so it stays fair at high speed), and the camera.

## Worlds

`content/worlds.json` holds every world and, under `routes`, the order each
character plays them in. A world picks:

- `decor` — the scenery and obstacles: `boardwalk`, `branch`, `snow`, `jungle` (temple) or `lava`
- `path.style` — the running surface: `planks`, `bark`, `snow` or `stone`
- `chaser` — `bear`, `hawk`, `snowball`, `monster` or `lava`
- `theme` — sky, fog, sun and the colours far below

Adding a world that reuses those needs no code: add it and put its id in a
route. Add `?world=snowy-pines` to the address to start a run in that world,
which is handy for testing.

## Real 3D models

All meshes are placeholders built in `src/game/visuals.ts` and
`src/game/chaser.ts`. Free CC0 packs that fit this style:
[Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com/) and
KayKit. Put `.glb` files in `public/models/`, load them with
`Assets.model('file.glb')` from `src/core/assets.ts`, and replace one builder at
a time (the runner first, then obstacles, then scenery). Keep a credits list of
every model and its licence.

## Next steps

See [ROADMAP.md](ROADMAP.md).

## License

All rights reserved. The licence is still to be decided.
