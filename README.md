# Arcade Template — a 3D browser platformer you can build on

A small, complete arcade game: run, jump, collect, stomp enemies, reach the portal.
Three levels ship with it. It exists to be taken apart and turned into your game.

Built with **Three.js**, **Vite** and **TypeScript**. No game engine, no build
ceremony, no asset pipeline to learn.

---

## Run it

```bash
npm install
npm run dev
```

That opens `http://localhost:5173`. Edit any file and the browser updates instantly.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check without building |

To publish: run `npm run build` and upload the `dist/` folder anywhere static —
GitHub Pages, Netlify, itch.io. It's configured with a relative base path, so it
works from a subfolder too.

### Controls

Third-person camera: click the game once to capture the mouse, then look around
freely — the camera orbits a full 360° around your character and tilts up and down.

| | |
| --- | --- |
| Move | `WASD` or arrow keys (always relative to the camera) |
| Jump | `Space` (hold for a higher jump) |
| Look around | Move the mouse |
| Zoom in / out | Mouse wheel |
| Camera without a mouse | `Q` / `E` to turn, `R` / `F` to tilt |
| Pause | `Esc` or `P` |
| Mobile | Left stick moves, drag the right side of the screen to look, pinch to zoom |

Pressing `Esc` (or clicking away) releases the mouse and pauses, as in most games.
Click the game to pick up where you left off.

---

## The idea: content is data, not code

The thing that makes this scale is that **levels, items and enemies are JSON**.
Adding content does not mean touching game logic.

```
content/            ← what you edit most
  levels/
    level1.json     a level: platforms, pickups, enemies, goal
    level2.json
    level3.json
    index.ts        the level order — one line per level
  items.json        every collectable in the game
  enemies.json      every enemy type in the game
  registry.ts       the only code file here: effects and AI behaviours

src/                ← the machine that reads the above
  main.ts           entry point
  core/
    game.ts         state machine, scoring, the frame loop
    engine.ts       renderer, lights, follow camera
    input.ts        keyboard + touch, all in one place
    assets.ts       model loading, with placeholder fallback
    audio.ts        sound (synthesised until you add files)
    events.ts       the event bus entities talk through
    types.ts        the shape of every JSON file above
  entities/
    entity.ts       base class — extend this for new things
    player.ts       movement, jumping, stomping
    enemy.ts        runs whichever behaviour its JSON names
    pickup.ts       floats, spins, gets collected
    platform.ts     solid box, optionally moving
    goal.ts         the portal
  systems/
    physics.ts      gravity and box collision (~100 readable lines)
    world.ts        holds entities and colliders
    level-loader.ts turns level JSON into live entities
  ui/
    hud.ts          score, lives, coins, timer, toasts
    menus.ts        every full-screen overlay
    style.css       all UI styling; CSS variables at the top

public/
  models/           drop .glb files here
  sounds/           drop .mp3 / .ogg files here
```

---

## How to add things

### Add a level

1. Copy `content/levels/level3.json` to `level4.json`.
2. Edit the platforms, pickups and enemies.
3. Register it in `content/levels/index.ts`:

```ts
import level4 from './level4.json';
export const LEVELS: LevelDef[] = [level1, level2, level3, level4] as LevelDef[];
```

That's it. Menus, level numbering, progression and the win screen all follow.

**Two conventions that make placing things easy:**

- A platform's `position` is the centre of its **top face**. Write the height you
  want to stand on.
- An enemy's `position` y is the **surface it stands on** — use the same y as the
  platform underneath, and it will rest neatly on top.

A minimal level:

```json
{
  "name": "My Level",
  "subtitle": "Shown on the intro card.",
  "spawn": [0, 2, 0],
  "killY": -15,
  "cameraYaw": -1.5708,
  "timeLimit": 90,
  "theme": { "sky": "#8fd3f4", "fog": "#a8dcf7", "fogDistance": 70 },
  "platforms": [
    { "position": [0, 0, 0], "size": [16, 1, 16] },
    { "position": [12, 2, 0], "size": [6, 1, 6], "surface": "ice" },
    {
      "position": [20, 2, 0],
      "size": [4, 0.8, 4],
      "move": { "offset": [0, 0, 8], "duration": 5 }
    }
  ],
  "pickups": [
    { "item": "coin", "position": [-4, 2, 0], "repeat": { "count": 5, "to": [4, 2, 0] } },
    { "item": "gem", "position": [12, 4, 0] }
  ],
  "enemies": [
    { "enemy": "walker", "position": [3, 0, -4], "patrolTo": [-3, 0, -4] }
  ],
  "goal": { "position": [20, 2, 0], "requires": 4 }
}
```

`repeat` places a whole row of coins from three lines of JSON.
Platform `surface` can be `normal`, `ice` (slippery), `bounce` (trampoline) or
`hurt` (damages on touch).
`cameraYaw` is the direction the camera faces when the level opens, in radians —
`-1.5708` (−90°) looks along +X, which is the way all three shipped levels run.

### Add an item

Add an entry to `content/items.json`:

```json
{
  "id": "star",
  "label": "Star",
  "effect": "score",
  "value": 500,
  "color": "#ffe66d",
  "shape": "gem",
  "scale": 1.4
}
```

Use it in any level with `{ "item": "star", "position": [0, 3, 0] }`.

Existing effects: `score`, `life`, `time`, `speed`, `jump`.

### Add a model

1. Drop `hero.glb` into `public/models/`.
2. Reference it: `"model": "hero.glb"` on any item, enemy or platform.

Missing or broken models fall back to a coloured placeholder shape and log a
warning — the game never crashes over a missing asset. That means you can build
everything with placeholder boxes and swap in real art one file at a time.

Free GLTF/GLB models: [Kenney](https://kenney.nl/assets),
[Quaternius](https://quaternius.com/), [Poly Pizza](https://poly.pizza/).
Or export your own from Blender (File → Export → glTF 2.0).

### Add a sound

Drop the file into `public/sounds/` and list it in `SOUND_FILES` in
`src/core/audio.ts`. Until you do, the game synthesises blips with the Web Audio
API, so there is always feedback.

### Add new *behaviour* (the only place you write code)

`content/registry.ts` holds two lookup tables. A new enemy movement pattern:

```ts
// 1. In src/core/types.ts, add 'dasher' to EnemyBehaviorName.
// 2. In content/registry.ts:
export const enemyBehaviors: Record<EnemyBehaviorName, EnemyBehavior> = {
  // ...existing ones...
  dasher: (enemy, dt) => {
    const target = enemy.playerPosition;
    if (!target) return;
    // your movement here — set enemy.position
  },
};
// 3. In content/enemies.json, use "behavior": "dasher".
```

TypeScript fails the build if you add the name and forget the handler, so a level
can never reference a behaviour that doesn't exist.

New item effects work the same way via `itemEffects`.

### Add a whole new kind of thing

Extend `Entity` (see `src/entities/pickup.ts` for the shortest example), then
spawn it in `src/systems/level-loader.ts`. Updating, rendering and cleanup are
handled for you.

---

## Tuning how it feels

Almost all of the "game feel" lives in two places:

**`src/systems/physics.ts` → `PHYSICS`** — gravity, acceleration, friction,
coyote time (grace period for jumping after leaving a ledge), jump buffering
(a jump pressed just before landing still fires).

**`src/entities/player.ts` → `BASE`** — move speed, jump height, stomp bounce,
how long you're invulnerable after a hit.

**`src/core/game.ts` → `RUN_DEFAULTS`** — starting lives, level and time bonuses.

**`src/core/engine.ts` → `cameraRig`** — the third-person camera: default
distance and zoom limits, how far up and down it can tilt (`minPitch` /
`maxPitch`), follow smoothing, and how it pulls in when geometry gets between
the camera and the character.

**`src/core/input.ts` → `LOOK_SETTINGS`** — mouse sensitivity, touch drag
sensitivity, zoom speed, and `invertY` for anyone who prefers inverted look.

**`src/ui/style.css` → `:root`** — re-skin the entire UI from a handful of
CSS variables.

---

## Where to go next

- **Physics engine.** If you outgrow box collision (slopes, ragdolls, stacking),
  add [Rapier](https://rapier.rs/) (`npm i @dimforge/rapier3d-compat`). Only
  `Player` calls into `physics.ts`, so the swap is contained.
- **Save progress.** Write score and unlocked level to `localStorage` in
  `game.ts`.
- **A level editor.** Levels are JSON, so a simple editor that writes JSON is a
  realistic weekend project.
- **Different genre.** The data-driven structure is genre-agnostic. An endless
  runner or an arena shooter reuses the loader, entities and UI — mostly it means
  a different `Player` and camera rig.

## License

MIT — do whatever you like with it.
