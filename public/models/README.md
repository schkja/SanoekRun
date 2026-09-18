# Models

Drop `.glb` (or `.gltf`) files here, then reference them by file name from any
content JSON:

```json
{ "id": "star", "label": "Star", "effect": "score", "value": 500,
  "color": "#ffe66d", "model": "star.glb" }
```

Works on items, enemies and platforms.

**Nothing breaks if a file is missing.** The loader logs a warning and draws a
coloured placeholder shape instead, so you can build a level entirely from
placeholders and swap in real art one file at a time.

Good free sources: kenney.nl/assets, quaternius.com, poly.pizza.
From Blender: File → Export → glTF 2.0 (.glb).

Tips:
- Keep models roughly 1 unit tall to match the placeholder scale; adjust with
  `"scale"` on items if needed.
- Model the front facing **+Z** so enemies and the player turn the right way.
- `.glb` (single binary file) is easier than `.gltf` + separate textures.
