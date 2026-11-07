# Sanoek Run

An endless runner in the spirit of Temple Run. The path twists through jungle
ruins and lava caves; swipe to turn at corners, jump gaps and logs, slide under
branches and fire jets, and stay ahead of whatever is chasing you.

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

## Tuning the feel

Almost everything is in **`src/game/tuning.ts`**: running speed and how fast it
ramps up, jump height, slide length, how early a turn is accepted, the perfect
turn window, how long the chaser stays close after a stumble, obstacle spacing
(in seconds of running, so it stays fair at high speed), and the camera.

## Adding a world

Add an entry to `content/worlds.json`. Reusing an existing `decor`
(`jungle` / `lava`) and `chaser` (`monster` / `lava`) needs no code. A new look
means a new case in `visuals.ts` (scenery and obstacles) and, for a new chaser,
in `chaser.ts`.

## Real 3D models

All meshes are placeholders built in `src/game/visuals.ts` and
`src/game/chaser.ts`. Free CC0 packs that fit this style:
[Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com/) and
KayKit. Put `.glb` files in `public/models/`, load them with
`Assets.model('file.glb')` from `src/core/assets.ts`, and replace one builder at
a time (the runner first, then obstacles, then scenery). Keep a credits list of
every model and its licence.

## Next steps

- Real models and a running animation for the character
- Music that adds layers as you speed up
- A third world (ice temple) with the boulder chaser
- Missions, daily rewards and unlockable characters
- iOS and Android builds by wrapping the web build with Capacitor

## License

MIT.
