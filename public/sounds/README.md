# Sounds

Drop `.mp3` or `.ogg` files here, then list them in `SOUND_FILES` near the top of
`src/core/audio.ts`:

```ts
const SOUND_FILES: Partial<Record<SoundKey, string>> = {
  coin: 'coin.mp3',
  jump: 'jump.ogg',
};
```

Until you do, the game synthesises short blips with the Web Audio API, so there
is always audio feedback and the template ships with no binary assets.

Sound keys the game plays: `coin`, `gem`, `jump`, `stomp`, `hurt`, `power`,
`goal`, `die`. Items can pick one with `"sound": "gem"` in `items.json`.

Free sources: freesound.org, sfxr / jsfxr (generate retro arcade blips in a
browser), kenney.nl/assets (has a UI and impact sound pack).
