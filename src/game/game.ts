/**
 * The Game: the run, the rules and the frame loop.
 *
 * It owns the score, decides what a swipe means (turn or lane change), checks
 * obstacles and coins, handles stumbling and being caught, swaps worlds at
 * portals, and decides which screen is on top.
 */

import * as THREE from 'three';
import { Engine } from '../core/engine';
import { Input, type Action } from '../core/input';
import { Audio } from '../core/audio';
import { Music } from '../core/music';
import { Hud } from '../ui/hud';
import { Menus } from '../ui/menus';
import { SpeedLines } from '../ui/speed-lines';
import { outfitIcon } from '../ui/outfit-icons';
import { APP_VERSION, AUTHOR, CHANGELOG, LEGAL_URL } from '../about';
import { drawShareCard, shareRun, type RunSummary } from '../ui/share-card';
import { Track, headingYaw, type Obstacle, type TurnDir } from './track';
import { Runner } from './runner';
import { Chaser } from './chaser';
import { TUNING, speedAt } from './tuning';
import { ROUTES, WORLDS, chaserFor, distanceOfWorld, route, type RouteId, type WorldDef } from './worlds';
import { animateSegment, setCollectible } from './visuals';
import { Sparkles } from './sparkles';
import { setOutlines } from './toon';
import { OUTFITS, buyOrEquip, levelBonus, missionReward, outfitFor, profile, report, saveProfile, markReached, tryLevelUp, type Mission, type Stat } from './progress';
import { fetchBoard, submitRun, type Period } from './leaderboard';
import type { PowerupKind } from './track';
import {
  CHARACTERS,
  DEFAULT_SETTINGS,
  EFFECT_KEYS,
  GAME_NAME,
  LANGUAGE_CHOICES,
  MUSIC_STYLES,
  settings,
  updateSettings,
  type Character,
} from './settings';
import { LANGUAGE_NAMES, formatNumber, language, setLanguage, t, type StringKey } from '../i18n';

/** A world's name in the current language. */
const worldName = (w: WorldDef) => t(`world.${w.id}` as StringKey);

type Phase = 'title' | 'playing' | 'paused' | 'dying' | 'over';

interface Best {
  distance: number;
  score: number;
  runs: number;
}

const STORAGE_KEY = 'sanoekrun.best';
/** Hints for jumping, sliding and turning are shown during this many first runs. */
const TUTORIAL_RUNS = 2;

const isTouch = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** True when the game was opened from its home-screen icon. */
/** Which install steps fit this device and browser. iPads report as Macs, so check touch. */
function detectPlatform(): 'ios' | 'android' | 'mac' | 'chrome' | 'firefox' {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  const chromium = /Chrome\/|Chromium|Edg\//.test(ua);
  if (/Macintosh/.test(ua) && !chromium) return 'mac';
  return 'chrome';
}

const isInstalled = () =>
  (window.matchMedia?.('(display-mode: standalone)').matches || window.matchMedia?.('(display-mode: fullscreen)').matches) ??
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const POWER_ICONS: Record<PowerupKind, string> = { magnet: '🧲', shield: '🛡️', double: '✖️2' };

export class Game {
  private readonly engine: Engine;
  private readonly input: Input;
  private readonly audio = new Audio();
  private readonly hud: Hud;
  private readonly menus: Menus;
  private readonly track = new Track();
  private readonly runner = new Runner();
  private readonly chaser = new Chaser();
  private readonly music: Music;
  private readonly speedLines: SpeedLines;
  private readonly sparkles = new Sparkles();
  private character: Character = 'lumberjack';
  /** Below 1 during a slow-motion close call. */
  private timeScale = 1;
  private slowTimer = 0;
  private lastRun: RunSummary | null = null;
  private shareCard: HTMLCanvasElement | null = null;
  private shareStatus = '';
  private readonly scratch = new THREE.Vector3();
  private outfit = '';
  /** Seconds left on each power-up (the shield counts down too, but mostly waits for a hit). */
  private powers: Record<PowerupKind, number> = { magnet: 0, shield: 0, double: 0 };
  private readonly shieldBubble: THREE.Mesh;
  private runTime = 0;
  /** Distance at the last stumble, for "run without stumbling" missions. */
  private cleanFrom = 0;
  /** What the leaderboard said last time: is it there, and what distance makes the board. */
  private board = { reachable: false, cutoff: 0 };
  private rankLine = '';
  private portalsThisRun = 0;
  private recordSaved = false;
  private installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;

  private phase: Phase = 'title';
  private distance = 0;
  private score = 0;
  private coins = 0;
  private multiplier = 1;
  /** Seconds left with the chaser on your heels. */
  private danger = 0;
  private intro = 0;
  private deathTimer = 0;
  private deathTitle = '';
  private world: WorldDef = WORLDS[0];
  private furthestWorld: WorldDef = WORLDS[0];
  private caught = false;
  private coinStreak = 0;
  private lastCoinTime = -10;
  private bufferedTurn: { dir: TurnDir; t: number } | null = null;
  private time = 0;
  private lastFrame = 0;
  private hintTimer = 0;
  private hintedKinds = new Set<string>();
  private turnHints = 0;
  private best: Best = loadBest();

  constructor(canvasContainer: HTMLElement, uiContainer: HTMLElement) {
    this.engine = new Engine(canvasContainer);
    this.input = new Input(this.engine.renderer.domElement);
    this.speedLines = new SpeedLines(uiContainer);
    this.hud = new Hud(uiContainer, () => this.togglePause());
    this.menus = new Menus(uiContainer);
    this.music = new Music(this.audio);
    this.audio.setMuted(!settings.sound);
    setLanguage(settings.language);
    setOutlines(settings.effects.outlines);

    this.shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(1.25, 20, 14),
      new THREE.MeshBasicMaterial({ color: '#7cc8ff', transparent: true, opacity: 0.28, depthWrite: false }),
    );
    this.shieldBubble.visible = false;
    this.engine.scene.add(this.track.root, this.runner.model.root, this.chaser.root, this.sparkles.root, this.shieldBubble);

    // Android and desktop Chrome offer a real "Install" prompt; keep it for our button.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installPrompt = e as Event & { prompt: () => Promise<void> };
    });
    void this.refreshBoard();
    this.input.setPauseHandler(() => this.togglePause());

    // Pause when the phone locks or the tab is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.togglePause();
    });

    // Browsers only allow sound after a user gesture.
    const unlock = () => {
      this.audio.unlock();
      if (!this.music.playing) this.music.play(settings.music);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  start(): void {
    this.lastFrame = performance.now();
    this.prepareTrack();
    this.showTitle();
    requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------

  private showTitle(): void {
    this.phase = 'title';
    this.hud.setVisible(false);
    // The chaser only shows up once you start running.
    this.chaser.root.visible = false;
    const toTitle = () => this.showTitle();
    const switchHero = (step: number) => {
      const i = CHARACTERS.indexOf(settings.character);
      const next = CHARACTERS[(i + step + CHARACTERS.length) % CHARACTERS.length];
      updateSettings((s) => (s.character = next));
      this.prepareTrack();
      this.showTitle();
    };
    this.menus.show({
      eyebrow: t('title.eyebrow'),
      title: GAME_NAME,
      chips: [
        t('chip.level', { n: profile.level }),
        t('chip.bank', { n: profile.bank }),
        ...(this.best.distance > 0 ? [t('title.best', { m: this.best.distance })] : []),
      ],
      picker: {
        label: t(`character.${settings.character}`),
        caption: t(`story.${settings.character}`),
        onPrev: () => switchHero(-1),
        onNext: () => switchHero(1),
      },
      sections: [
        {
          rows: [
            { label: t('title.world'), value: t(`route.${settings.world}`), onClick: () => this.showRoutePicker(toTitle) },
            ...(this.unlockedWorlds().length > 1 ? [{ label: t('start.label'), value: worldName(this.startWorld()), onClick: () => this.showWorldPicker(toTitle) }] : []),
          ],
        },
      ],
      buttons: [{ label: t('button.run'), primary: true, onClick: () => this.newRun() }],
      toolbar: [
        { label: t('tool.records'), onClick: () => void this.showRecords('all', toTitle) },
        { label: t('tool.missions'), onClick: () => this.showMissions(toTitle) },
        { label: t('tool.shop'), onClick: () => this.showShop(toTitle) },
        { label: t('tool.settings'), onClick: () => this.showSettings(toTitle) },
        ...(isInstalled() ? [] : [{ label: t('tool.install'), onClick: () => this.install(toTitle) }]),
        { label: t('tool.info'), onClick: () => this.showInfo(toTitle) },
      ],
      note: isTouch() ? undefined : t('title.keys'),
      variant: 'is-title',
    });
  }

  /** Pick the world to run in: the forest (default), the boardwalk or the honey meadows. */
  private showRoutePicker(back: () => void): void {
    this.menus.show({
      title: t('title.world'),
      variant: 'is-settings',
      sections: [
        {
          rows: ROUTES.map((id: RouteId) => ({
            label: t(`route.${id}`),
            hint: t(`route.${id}.hint`),
            selected: settings.world === id,
            onClick: () => {
              updateSettings((s) => (s.world = id));
              this.prepareTrack();
              back();
            },
          })),
        },
      ],
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  // ---------------------------------------------------------------------------
  // Info: version, what's new, who made it, how to report a bug, legal page.

  private showInfo(back: () => void): void {
    const lang = language();
    const open = (url: string) => () => {
      window.open(url, '_blank', 'noopener');
    };
    const date = (iso: string) => {
      try {
        return new Date(`${iso}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
      } catch {
        return iso;
      }
    };
    this.menus.show({
      eyebrow: t('info.version', { v: APP_VERSION }),
      title: t('info.title'),
      body: t('info.body'),
      variant: 'is-settings',
      sections: [
        {
          title: t('info.about'),
          rows: [
            { label: t('info.madeBy'), value: AUTHOR.name },
            { label: t('info.bug'), hint: AUTHOR.email, value: '✉️', onClick: () => (location.href = `mailto:${AUTHOR.email}?subject=${encodeURIComponent(`${GAME_NAME} ${APP_VERSION}`)}`) },
            { label: t('info.legal'), value: '', onClick: open(LEGAL_URL) },
          ],
        },
        ...CHANGELOG.slice(0, 4).map((entry, i) => ({
          title: `${i === 0 ? `${t('info.news')} · ` : ''}${entry.version} · ${date(entry.date)}`,
          rows: (entry.notes[lang] ?? entry.notes.en).map((note) => ({ label: `• ${note}` })),
        })),
      ],
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  // ---------------------------------------------------------------------------
  // Start world: once a hero reaches a world, runs can start there.

  private unlockedWorlds(): WorldDef[] {
    const worlds = route(settings.world);
    const reached = (profile.reached[settings.world] ?? []);
    return worlds.filter((w, i) => i === 0 || reached.includes(w.id));
  }

  private startWorld(): WorldDef {
    const id = profile.startWorld[settings.world];
    return this.unlockedWorlds().find((w) => w.id === id) ?? route(settings.world)[0];
  }

  /** The world id to start in, or null for the start of the route. */
  private startWorldId(): string | null {
    const world = this.startWorld();
    return world === route(settings.world)[0] ? null : world.id;
  }

  private showWorldPicker(back: () => void): void {
    const unlocked = this.unlockedWorlds();
    const current = this.startWorld();
    this.menus.show({
      title: t('start.title'),
      body: t('start.body'),
      variant: 'is-settings',
      sections: [
        {
          rows: route(settings.world).map((w, i) => {
            const open = unlocked.includes(w);
            return {
              label: `${i + 1}. ${open ? worldName(w) : '????????'}`,
              blurred: !open,
              hint: open ? undefined : t('start.locked'),
              selected: w === current,
              value: open ? undefined : '🔒',
              onClick: open
                ? () => {
                    profile.startWorld[settings.world] = w.id;
                    saveProfile();
                    this.prepareTrack();
                    back();
                  }
                : undefined,
            };
          }),
        },
      ],
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  // ---------------------------------------------------------------------------
  // Records, missions, shop, install
  // ---------------------------------------------------------------------------

  private async refreshBoard(): Promise<void> {
    const board = await fetchBoard('all', profile.device);
    this.board = board ? { reachable: true, cutoff: board.cutoff } : { reachable: false, cutoff: 0 };
  }

  private async showRecords(period: Period, back: () => void): Promise<void> {
    const tabs = [
      { label: `${period === 'all' ? '● ' : ''}${t('records.all')}`, onClick: () => void this.showRecords('all', back) },
      { label: `${period === 'today' ? '● ' : ''}${t('records.today')}`, onClick: () => void this.showRecords('today', back) },
    ];
    const frame = (body: string | undefined, rows: Array<{ label: string; value: string; selected: boolean }>) =>
      this.menus.show({
        title: t('records.title'),
        variant: 'is-settings',
        toolbar: tabs,
        body,
        sections: rows.length ? [{ rows: rows.map((r) => ({ ...r, onClick: () => undefined })) }] : undefined,
        buttons: [{ label: t('button.back'), primary: true, onClick: back }],
      });
    frame(t('records.loading'), []);
    const board = await fetchBoard(period, profile.device);
    if (!board) return frame(t('records.offline'), []);
    this.board = period === 'all' ? { reachable: true, cutoff: board.cutoff } : { ...this.board, reachable: true };
    if (!board.entries.length) return frame(t('records.empty'), []);
    const medal = (rank: number) => ['🥇', '🥈', '🥉'][rank - 1] ?? `${rank}.`;
    frame(
      undefined,
      board.entries.map((e) => ({
        label: `${medal(e.rank)} ${e.character === 'squirrel' ? '🐿️' : e.character === 'bear' ? '🐻' : e.character === 'hare' ? '🐰' : '🪓'} ${e.name}`,
        value: `${formatNumber(e.distance)} ${t('hud.unit')}`,
        selected: e.mine,
      })),
    );
  }

  private missionRows(): Array<{ label: string; value?: string; selected: boolean }> {
    return profile.missions.map((m: Mission) => ({
      label: t(`mission.${m.stat}` as StringKey, { n: m.target }),
      value: m.done ? undefined : `${formatNumber(m.progress)} / ${formatNumber(m.target)}`,
      selected: m.done,
    }));
  }

  private showMissions(back: () => void): void {
    this.menus.show({
      title: t('missions.title'),
      chips: [t('chip.level', { n: profile.level }), t('chip.bank', { n: profile.bank })],
      variant: 'is-settings',
      sections: [{ rows: this.missionRows() }],
      note: t('missions.reward', { n: missionReward(profile.level), b: levelBonus(profile.level) }),
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  private showShop(back: () => void, message?: string): void {
    const c = settings.character;
    this.menus.show({
      title: t('shop.title'),
      chips: [t('shop.bank', { n: profile.bank })],
      body: message ?? t('shop.hint'),
      variant: 'is-shop',
      choices: OUTFITS.filter((o) => o.character === c).map((o) => {
        const owned = profile.owned.includes(o.id);
        const wearing = profile.equipped[c] === o.id;
        return {
          label: t(`outfit.${o.id}` as StringKey),
          caption: wearing ? t('shop.wearing') : owned ? t('shop.wear') : t('shop.price', { n: o.price }),
          art: outfitIcon(o.id),
          selected: wearing,
          onClick: () => {
            const result = buyOrEquip(o);
            if (result === 'too-expensive') return this.showShop(back, t('shop.tooExpensive'));
            if (result === 'bought') this.audio.play('perfect');
            this.prepareTrack();
            this.showShop(back, result === 'bought' ? t('shop.bought') : undefined);
          },
        };
      }),
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  /** Install to the home screen: the browser's own prompt where there is one, otherwise how-to steps. */
  /**
   * How to put the game on this device, with this device's steps first.
   * Where the browser offers its own install prompt (Chrome, Edge, Android),
   * there's an "Install now" button for it.
   */
  private install(back: () => void): void {
    const platform = detectPlatform();
    const step = (label: string) => ({ label });
    const guides = {
      ios: { title: t('install.iosTitle'), rows: [step(t('install.ios1')), step(t('install.ios2')), step(t('install.ios3'))] },
      android: { title: t('install.androidTitle'), rows: [step(t('install.android1')), step(t('install.android2'))] },
      mac: { title: t('install.macTitle'), rows: [step(t('install.mac1')), step(t('install.mac2')), step(t('install.mac3'))] },
      chrome: { title: t('install.chromeTitle'), rows: [step(t('install.chrome1')), step(t('install.chrome2'))] },
      firefox: { title: t('install.firefoxTitle'), rows: [step(t('install.firefox1'))] },
    };
    const order: Array<keyof typeof guides> =
      platform === 'ios' ? ['ios', 'android', 'mac', 'chrome']
      : platform === 'android' ? ['android', 'ios', 'chrome', 'mac']
      : platform === 'mac' ? ['mac', 'chrome', 'ios', 'android']
      : platform === 'firefox' ? ['firefox', 'chrome', 'mac', 'ios', 'android']
      : ['chrome', 'mac', 'ios', 'android'];
    const [mine, ...rest] = order.map((key) => guides[key]);
    const desktop = platform === 'mac' || platform === 'chrome' || platform === 'firefox';
    const prompt = this.installPrompt;
    this.menus.show({
      title: desktop ? t('install.titleDesktop') : t('install.title'),
      body: isInstalled() ? t('install.done') : desktop ? t('install.bodyDesktop') : t('install.body'),
      variant: 'is-settings',
      sections: [mine, ...rest.map((g, i) => ({ ...g, title: i === 0 ? `${t('install.other')}: ${g.title}` : g.title }))],
      buttons: [
        ...(prompt
          ? [{
              label: t('install.now'),
              primary: true,
              onClick: async () => {
                await prompt.prompt();
                this.installPrompt = null;
                back();
              },
            }]
          : []),
        { label: t('button.back'), primary: !prompt, onClick: back },
      ],
    });
  }

  /** Swap in the chosen character (and what it collects) before a track is built. */
  private applyCharacter(): void {
    const pickup = settings.character === 'squirrel' ? 'acorn' : settings.character === 'bear' ? 'honey' : settings.character === 'hare' ? 'carrot' : 'coin';
    setCollectible(pickup);
    this.hud.setCollectible(pickup);
    this.audio.collect = pickup;
    const outfit = outfitFor(settings.character);
    if (this.character === settings.character && this.outfit === outfit) return;
    this.engine.scene.remove(this.runner.model.root);
    this.runner.setCharacter(settings.character, outfit);
    this.engine.scene.add(this.runner.model.root);
    this.character = settings.character;
    this.outfit = outfit;
  }

  /** "Coins" or "Nuts" in the current language, for stat rows. */
  private get collectibleLabel(): string {
    return settings.character === 'squirrel' ? t('stat.nuts') : settings.character === 'bear' ? t('stat.honey') : settings.character === 'hare' ? t('stat.carrots') : t('stat.coins');
  }

  /** Build a fresh track with the runner standing at the start. */
  private prepareTrack(): void {
    this.applyCharacter();
    this.sparkles.clear();
    this.slowTimer = 0;
    this.timeScale = 1;
    // Each character runs its own route of worlds. `?world=snowy-pines` in the
    // address starts the run in a given world — handy for testing.
    const worlds = route(settings.world);
    const startAt = new URLSearchParams(location.search).get('world') ?? this.startWorldId();
    this.track.reset(worlds, startAt ? distanceOfWorld(worlds, startAt) : 0);
    this.runner.reset(this.track, this.track.first);
    this.runner.frozen = true;
    this.setWorld(this.track.first.world);
    this.chaser.gap = TUNING.chaser.introGap;
    this.chaser.place(this.track, this.runner.seg, this.runner.s);
    this.engine.snap(this.runner.visual, this.runner.yaw);
  }

  private newRun(): void {
    this.prepareTrack();
    this.runner.frozen = false;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.multiplier = 1;
    this.danger = 0;
    this.intro = TUNING.chaser.introTime;
    this.bufferedTurn = null;
    this.coinStreak = 0;
    this.hintedKinds.clear();
    this.turnHints = 0;
    this.furthestWorld = this.world;
    this.portalsThisRun = 0;
    this.caught = false;
    this.powers = { magnet: 0, shield: 0, double: 0 };
    this.runTime = 0;
    this.cleanFrom = 0;
    this.rankLine = '';

    this.input.clear();
    this.hud.reset();
    this.hud.setVisible(true);
    this.phase = 'playing';
    this.audio.play('start');
    this.menus.show({
      eyebrow: t('intro.world', { n: this.track.first.worldNumber }),
      title: worldName(this.world),
      body: t('intro.run'),
      variant: 'is-intro',
      autoHideMs: 1600,
    });
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.input.clear();
      this.showPauseMenu();
    } else if (this.phase === 'paused') {
      this.resume();
    }
  }

  private showPauseMenu(): void {
    this.menus.show({
      title: t('pause.title'),
      body: window.matchMedia('(pointer: fine)').matches ? t('pause.keys') : undefined,
      stats: [
        [t('stat.distance'), `${formatNumber(this.distance)} ${t('hud.unit')}`],
        [this.collectibleLabel, formatNumber(this.coins)],
      ],
      buttons: [
        { label: t('button.resume'), primary: true, onClick: () => this.resume() },
        { label: t('button.settings'), onClick: () => this.showSettings(() => this.showPauseMenu()) },
        { label: t('button.quit'), onClick: () => { this.prepareTrack(); this.showTitle(); } },
      ],
    });
  }

  /**
   * The Settings screen, in three groups: game (language, character), sound
   * and effects. Switches flip in place; language opens its own list.
   */
  private showSettings(back: () => void): void {
    const inRun = this.phase === 'paused';
    const redraw = () => this.showSettings(back);
    const languageValue = settings.language === 'auto' ? t('settings.auto') : LANGUAGE_NAMES[settings.language];

    this.menus.show({
      title: t('settings.title'),
      body: inRun && settings.character !== this.character ? t('settings.nextRun') : undefined,
      variant: 'is-settings',
      sections: [
        {
          title: t('settings.game'),
          rows: [
            // A globe, so anyone can find the language row whatever it says.
            { label: `🌐 ${t('settings.language')}`, value: languageValue, onClick: () => this.showLanguages(redraw) },
            {
              label: t('settings.character'),
              value: t(`character.${settings.character}`),
              onClick: () => {
                updateSettings((s) => (s.character = next(CHARACTERS, s.character)));
                if (!inRun) this.prepareTrack();
                redraw();
              },
            },
          ],
        },
        {
          title: t('settings.audio'),
          rows: [
            {
              label: t('settings.music'),
              value: t(`music.${settings.music}`),
              onClick: () => {
                updateSettings((s) => (s.music = next(MUSIC_STYLES, s.music)));
                this.audio.unlock();
                this.music.play(settings.music);
                redraw();
              },
            },
            {
              label: t('settings.sound'),
              toggle: settings.sound,
              onClick: () => {
                updateSettings((s) => (s.sound = !s.sound));
                this.audio.setMuted(!settings.sound);
                redraw();
              },
            },
          ],
        },
        {
          title: t('settings.effects'),
          rows: EFFECT_KEYS.map((key) => ({
            label: t(`effect.${key}`),
            toggle: settings.effects[key],
            onClick: () => {
              updateSettings((s) => (s.effects[key] = !s.effects[key]));
              setOutlines(settings.effects.outlines);
              redraw();
            },
          })),
        },
        {
          rows: [
            {
              label: t('button.reset'),
              onClick: () => {
                updateSettings((s) => Object.assign(s, structuredClone(DEFAULT_SETTINGS)));
                this.audio.setMuted(!settings.sound);
                this.music.play(settings.music);
                setLanguage(settings.language);
                setOutlines(settings.effects.outlines);
                this.hud.relabel();
                if (!inRun) this.prepareTrack();
                redraw();
              },
            },
          ],
        },
      ],
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  /** Every language listed in its own name, so a player can always find theirs. */
  private showLanguages(back: () => void): void {
    const pick = (choice: (typeof LANGUAGE_CHOICES)[number]) => {
      updateSettings((s) => (s.language = choice));
      setLanguage(choice);
      this.hud.relabel();
      back();
    };
    this.menus.show({
      title: `🌐 ${t('settings.language')}`,
      variant: 'is-settings',
      sections: [
        {
          rows: LANGUAGE_CHOICES.map((choice) => ({
            label: choice === 'auto' ? t('settings.auto') : LANGUAGE_NAMES[choice],
            hint: choice === 'auto' ? t('settings.autoHint') : undefined,
            selected: settings.language === choice,
            onClick: () => pick(choice),
          })),
        },
      ],
      buttons: [{ label: t('button.back'), primary: true, onClick: back }],
    });
  }

  private resume(): void {
    this.menus.hide();
    this.input.clear();
    this.lastFrame = performance.now();
    this.phase = 'playing';
  }

  private showRunOver(): void {
    this.phase = 'over';
    this.hud.setVisible(false);
    this.hud.hint(null);
    this.hud.setPowers([]);
    this.shieldBubble.visible = false;

    const distance = Math.floor(this.distance);
    const previousBest = Math.floor(this.best.distance);
    const newBest = distance > previousBest;
    this.best.runs += 1;
    if (newBest) this.best.distance = distance;
    this.best.score = Math.max(this.best.score, Math.floor(this.score));
    saveBest(this.best);

    // Progress: the coins go in the bank, run missions are checked, maybe a level up.
    profile.bank += this.coins;
    this.reportMissions('runDistance', distance);
    this.reportMissions('runCoins', this.coins);
    this.reportMissions('runNoHit', Math.floor(this.distance - this.cleanFrom));
    this.reportMissions('runs', 1);
    const level = tryLevelUp();
    saveProfile();

    let badge: string;
    if (level) badge = t('level.up', { n: level, b: levelBonus(level - 1) });
    else if (newBest && previousBest > 0) badge = t('over.newBest');
    else if (newBest) badge = t('over.firstRun');
    else if (previousBest - distance <= 150) badge = t('over.near', { m: previousBest - distance });
    else badge = t('over.best', { m: previousBest });

    // Snapshot the final frame for the share card while it's still on screen.
    const run: RunSummary = {
      distance,
      coins: this.coins,
      collectible: settings.character === 'squirrel' ? 'nuts' : settings.character === 'bear' ? 'honey' : settings.character === 'hare' ? 'carrots' : 'coins',
      character: settings.character,
      world: worldName(this.furthestWorld),
      newBest: newBest && previousBest > 0,
    };
    this.lastRun = run;
    this.engine.render();
    const snapshot = document.createElement('canvas');
    const source = this.engine.renderer.domElement;
    snapshot.width = source.width;
    snapshot.height = source.height;
    snapshot.getContext('2d')?.drawImage(source, 0, 0);
    this.shareCard = null;
    void drawShareCard(run, snapshot).then((card) => (this.shareCard = card));
    this.shareStatus = '';

    // A good run goes straight to the name prompt. Every other run (20 m+)
    // can still be added with a button on the end screen.
    this.recordSaved = false;
    if (distance >= 50 && distance >= this.board.cutoff) this.askName(badge);
    else this.showRunOverMenu(badge);
  }

  private askName(badge: string, error?: string): void {
    const run = { distance: Math.floor(this.distance), coins: this.coins, durationMs: Math.round(this.runTime * 1000) };
    this.menus.show({
      eyebrow: `${formatNumber(run.distance)} ${t('hud.unit')}`,
      title: t('name.title'),
      body: t('name.body'),
      input: { placeholder: t('name.placeholder'), value: profile.name, maxLength: 32, error },
      note: t('name.privacy'),
      buttons: [
        {
          label: t('name.save'),
          primary: true,
          onClick: async () => {
            const name = this.menus.inputValue.trim();
            if (!name || [...name].length > 16) return this.askName(badge, t('name.invalid'));
            const result = await submitRun({ ...run, name, character: settings.character, device: profile.device });
            if (!result.ok && result.error === 'name') return this.askName(badge, t('name.invalid'));
            if (!result.ok && (!result.error || result.error === 'offline')) return this.askName(badge, t('records.down'));
            if (!result.ok) return this.askName(badge, t('name.failed'));
            this.recordSaved = true;
            profile.name = name;
            saveProfile();
            this.rankLine = t('over.rank', { all: result.rank ?? 0, today: result.rankToday ?? 0 });
            void this.refreshBoard();
            this.audio.play('perfect');
            this.showRunOverMenu(badge);
          },
        },
        { label: t('name.skip'), onClick: () => this.showRunOverMenu(badge) },
      ],
    });
  }

  private showRunOverMenu(badge: string): void {
    const distance = Math.floor(this.distance);
    this.menus.show({
      eyebrow: t('over.eyebrow'),
      title: this.deathTitle,
      hero: `${formatNumber(distance)} ${t('hud.unit')}`,
      badge,
      chips: this.rankLine ? [`🏆 ${this.rankLine}`] : undefined,
      stats: [
        [t('stat.score'), formatNumber(this.score)],
        [this.collectibleLabel, `${formatNumber(this.coins)} → 🪙 ${formatNumber(profile.bank)}`],
        [t('stat.furthest'), worldName(this.furthestWorld)],
      ],
      sections: [{ title: t('missions.title'), rows: this.missionRows() }],
      body: this.shareStatus || undefined,
      variant: 'is-over',
      buttons: [
        { label: t('button.playAgain'), primary: true, onClick: () => this.newRun() },
        ...(!this.recordSaved && distance >= 20 ? [{ label: t('button.saveRecord'), onClick: () => this.askName(badge) }] : []),
        { label: t('button.share'), onClick: () => void this.share(badge) },
        { label: t('button.mainMenu'), onClick: () => { this.prepareTrack(); this.showTitle(); } },
      ],
    });
  }

  private async share(badge: string): Promise<void> {
    if (!this.lastRun) return;
    const card = this.shareCard ?? (await drawShareCard(this.lastRun, null));
    const result = await shareRun(card, this.lastRun);
    this.shareStatus = {
      shared: t('over.sharedLink'),
      downloaded: t('over.saved'),
      cancelled: '',
      failed: t('over.shareFailed'),
    }[result];
    if (this.phase === 'over') this.showRunOverMenu(badge);
  }

  /** Count progress towards missions, and celebrate any that just finished. */
  private reportMissions(stat: Stat, value: number): void {
    for (const _ of report(stat, value)) {
      if (this.phase === 'playing') this.hud.toast(t('mission.done', { n: missionReward(profile.level) }), 'gold');
      this.audio.play('perfect');
    }
  }

  // ---------------------------------------------------------------------------
  // The frame loop
  // ---------------------------------------------------------------------------

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    // Clamp dt so a hiccup or a backgrounded tab can't teleport the runner.
    const dt = Math.min((now - this.lastFrame) / 1000, 1 / 20);
    this.lastFrame = now;
    this.time += dt;

    // Slow motion: the world runs slower for a moment, the controls don't.
    this.slowTimer = Math.max(0, this.slowTimer - dt);
    const wantScale = this.slowTimer > 0 ? 0.3 : 1;
    this.timeScale += (wantScale - this.timeScale) * Math.min(1, dt * (this.slowTimer > 0 ? 30 : 6));
    const gameDt = dt * this.timeScale;
    const speed01 = Math.max(0, (this.runner.speed - TUNING.startSpeed) / (TUNING.maxSpeed - TUNING.startSpeed));

    const actions = this.input.drain();
    if (this.phase === 'playing') {
      for (const action of actions) this.handleAction(action);
      this.step(gameDt);
      // The music builds as the run speeds up, and goes all-out when you're in danger.
      this.music.setLayers(this.danger > 0 ? 4 : 2 + speed01 * 2.4);
    } else if (this.phase === 'dying') {
      this.stepDying(gameDt);
    } else {
      this.music.setLayers(this.phase === 'paused' ? 1 : 2);
    }

    this.speedLines.update(dt, this.phase === 'playing' && settings.effects.speedLines ? 0.15 + speed01 * 0.85 : 0);
    this.sparkles.update(gameDt);

    if (this.phase === 'title') {
      // The hero stands in the scene facing you.
      this.runner.idle(dt);
      for (let i = Math.max(0, this.runner.seg.index - 1); i < this.track.segments.length; i++) {
        const group = this.track.segments[i].group;
        if (group) animateSegment(group, this.time);
      }
      this.engine.showcase(this.runner.visual, this.runner.yaw, dt);
    } else if (this.phase !== 'paused') {
      this.runner.animate(gameDt);
      for (let i = Math.max(0, this.runner.seg.index - 1); i < this.track.segments.length; i++) {
        const group = this.track.segments[i].group;
        if (group) animateSegment(group, this.time);
      }
      const chaseView = this.chaser.root.visible ? 1 : 0;
      const zoom = settings.effects.speedZoom ? speed01 : 0;
      this.engine.follow(this.runner.visual, headingYaw(this.runner.seg.heading), dt, zoom, this.runner.falling, chaseView);
    }
    this.engine.render();
  };

  /**
   * Advance the run. Long frames (a slow phone at 20 fps) are split into small
   * fixed steps so fast running can never skip through an obstacle or a landing.
   */
  private step(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let i = 0; i < steps && this.phase === 'playing'; i++) this.tick(dt / steps);

    this.hud.update({
      distance: this.distance,
      coins: this.coins,
      score: this.score,
      multiplier: this.multiplier,
      danger: this.danger / TUNING.chaser.dangerTime,
    });
    this.showPowers();
  }

  private tick(dt: number): void {
    const r = this.runner;
    r.update(dt, speedAt(this.distance), this.track);
    const moved = r.speed * dt;
    this.distance += moved;
    this.score += moved * this.multiplier;
    this.track.maintain(r.seg, r.s);

    if (this.bufferedTurn) {
      this.bufferedTurn.t -= dt;
      if (this.tryTurn(this.bufferedTurn.dir) || this.bufferedTurn.t <= 0) this.bufferedTurn = null;
    }

    this.runTime += dt;
    for (const kind of Object.keys(this.powers) as PowerupKind[]) this.powers[kind] = Math.max(0, this.powers[kind] - dt);

    this.checkObstacles();
    this.checkCoins();
    this.checkPowerups();
    this.checkPortal();
    this.updateChaser(dt);
    this.updateHints(dt);

    // On the forest floor there is nothing to fall from: missing a corner
    // means running straight into the bushes.
    if (this.world.theme.ground && r.y <= 0.01 && !this.track.hasFloor(r.seg, r.s, r.x)) {
      r.frozen = true;
      if (settings.effects.cameraShake) this.engine.addShake(0.6);
      this.die(t('death.bushes'), false);
      return;
    }

    if (r.falling && r.y < -1) {
      const decor = this.world.decor;
      this.die(t(decor === 'lava' ? 'death.lava' : decor === 'jungle' ? 'death.abyss' : decor === 'brook' ? 'death.splash' : 'death.trees'), false);
    }
  }

  private stepDying(dt: number): void {
    this.deathTimer -= dt;
    this.runner.update(dt, this.runner.speed, this.track);
    if (this.caught) this.chaser.gap += (0.6 - this.chaser.gap) * Math.min(1, dt * 10);
    this.chaser.update(dt, this.track, this.runner.seg, this.runner.s, this.runner.speed);
    if (this.deathTimer <= 0) this.showRunOver();
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  private handleAction(action: Action): void {
    const r = this.runner;
    if (action === 'left' || action === 'right') {
      const dir: TurnDir = action === 'left' ? -1 : 1;
      if (this.nearTurn() && r.seg.turn === dir) {
        if (!this.tryTurn(dir)) this.bufferedTurn = { dir, t: TUNING.turnBuffer };
        return;
      }
      const fromLane = r.lane;
      if (r.changeLane(dir)) {
        this.markCloseCall('lane', fromLane);
        this.audio.play('lane');
      }
    } else if (action === 'up') {
      if (r.jump()) {
        this.reportMissions('jumps', 1);
        this.markCloseCall('jump', r.lane);
        this.audio.play('jump');
      }
    } else if (r.slide()) {
      this.reportMissions('slides', 1);
      this.markCloseCall('slide', r.lane);
      this.audio.play('slide');
    }
  }

  /** True when a corner is close enough that a sideways swipe means "turn". */
  private nearTurn(): boolean {
    const r = this.runner;
    const W2 = TUNING.pathWidth / 2;
    const windowStart = r.seg.length - W2 - TUNING.turnEarly;
    return r.s >= windowStart - r.speed * TUNING.turnBuffer && r.s <= r.seg.length + W2;
  }

  private tryTurn(dir: TurnDir): boolean {
    const r = this.runner;
    const seg = r.seg;
    const W2 = TUNING.pathWidth / 2;
    if (seg.turn !== dir || r.falling) return false;
    if (r.s < seg.length - W2 - TUNING.turnEarly || r.s > seg.length + W2 - 0.1) return false;

    const lateness = r.s - seg.length;
    r.turnOnto(this.track, this.track.next(seg));
    this.hud.hint(null);
    const perfect = lateness >= -TUNING.perfectTurnWindow;
    if (settings.effects.turnTilt) this.engine.tilt(dir, perfect ? 0.12 : 0.08);

    if (perfect) {
      this.reportMissions('perfects', 1);
      this.multiplier = Math.min(TUNING.score.maxMultiplier, this.multiplier + 1);
      const points = TUNING.score.perfectTurn * this.multiplier;
      this.score += points;
      this.hud.toast(t('toast.perfect', { p: points }), 'green');
      this.audio.play('perfect');
    } else {
      this.score += TUNING.score.goodTurn * this.multiplier;
      this.audio.play('turn');
    }
    return true;
  }

  /**
   * Dodging something at the very last moment is a close call — worth points,
   * and it feels like skill. The bonus is paid once you're safely past it.
   */
  private markCloseCall(action: 'lane' | 'jump' | 'slide', fromLane: number): void {
    const r = this.runner;
    for (const o of r.seg.obstacles) {
      if (o.passed || o.hit) continue;
      const ahead = o.s0 - r.s;
      if (ahead < -0.3) continue;
      if (ahead > TUNING.closeCallDistance) break;
      const dodges =
        action === 'jump'
          ? o.kind === 'low' || o.kind === 'gap'
          : action === 'slide'
            ? o.kind === 'high'
            : o.kind === 'block' && o.lanes[fromLane + 1];
      if (dodges) o.closeCall = true;
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // Rules
  // ---------------------------------------------------------------------------

  private checkObstacles(): void {
    const r = this.runner;
    for (const o of r.seg.obstacles) {
      if (o.passed) continue;
      if (r.s < o.s0 - 0.3) break;
      if (r.s > o.s1 + 0.3) {
        o.passed = true;
        if (o.closeCall && !o.hit && !r.falling) {
          const points = TUNING.score.closeCall * this.multiplier;
          this.score += points;
          this.hud.toast(t('toast.close', { p: points }), 'gold');
          this.audio.play('close');
          if (settings.effects.slowMotion) this.slowTimer = 0.32;
          this.reportMissions('closeCalls', 1);
          if (settings.effects.screenFlash) this.hud.flash('white', 0.35);
        }
        continue;
      }
      if (!o.hit && this.collides(o)) this.stumble(o);
    }
  }

  private collides(o: Obstacle): boolean {
    const r = this.runner;
    switch (o.kind) {
      case 'gap':
        return false; // falling is handled by the floor check
      case 'low':
        return r.y < 0.78;
      case 'high':
        return !r.sliding && r.y < 1.8;
      case 'block':
        return o.lanes.some(
          (blocked, i) => blocked && Math.abs(r.x - (i - 1) * TUNING.laneOffset) < 0.62 + TUNING.runnerHalfWidth,
        );
    }
  }

  private stumble(o: Obstacle): void {
    o.hit = true;
    if (o.object) o.object.visible = false;
    if (this.powers.shield > 0) {
      // The shield takes the hit instead of you.
      this.powers.shield = 0;
      this.hud.toast(t('power.saved'), 'white');
      if (settings.effects.screenFlash) this.hud.flash('white', 0.5);
      this.audio.play('close');
      return;
    }
    this.cleanFrom = this.distance;
    if (settings.effects.cameraShake) this.engine.addShake(0.6);
    if (settings.effects.screenFlash) this.hud.flash('red');
    vibrate(this.danger > 0 ? 300 : 120);

    if (this.danger > 0) {
      this.caught = true;
      this.die(t(`caught.${chaserFor(this.world, settings.character)}`), true);
      return;
    }
    this.danger = TUNING.chaser.dangerTime;
    this.multiplier = 1;
    this.runner.stumble();
    this.audio.play('stumble');
    this.hud.toast(t('toast.watchOut'), 'red');
  }

  private die(title: string, caught: boolean): void {
    if (this.phase !== 'playing') return;
    this.phase = 'dying';
    this.deathTitle = title;
    this.hud.hint(null);
    if (caught) {
      this.runner.frozen = true;
      this.deathTimer = 1.1;
      this.audio.play('caught');
      if (settings.effects.cameraShake) this.engine.addShake(1);
    } else {
      this.deathTimer = 0.9;
      this.audio.play('fall');
    }
  }

  private checkCoins(): void {
    const r = this.runner;
    const centre = r.y + 0.9;
    const magnet = this.powers.magnet > 0;
    for (const c of r.seg.coins) {
      if (c.taken) continue;
      const touching = Math.abs(c.s - r.s) <= 0.9 && Math.abs(c.x - r.x) <= 0.85 && Math.abs(c.y - centre) <= 1.15;
      // The magnet pulls in everything just ahead, in every lane.
      const pulled = magnet && c.s - r.s > -1 && c.s - r.s < TUNING.powerup.magnetReach;
      if (!touching && !pulled) continue;
      c.taken = true;
      if (c.object) c.object.visible = false;
      if (settings.effects.coinSparkle) {
        const at = this.track.position(r.seg, c.s, c.x, this.scratch);
        at.y = c.y;
        this.sparkles.burst(at, settings.character === 'squirrel' ? '#d9a05b' : settings.character === 'bear' ? '#ffb21f' : settings.character === 'hare' ? '#ff8a1e' : '#ffd23f');
      }
      const worth = this.powers.double > 0 ? 2 : 1;
      this.coins += worth;
      this.score += TUNING.score.coin * this.multiplier * worth;

      // Coins collected in quick succession climb in pitch — a little reward loop.
      this.coinStreak = this.time - this.lastCoinTime < 0.45 ? this.coinStreak + 1 : 0;
      this.lastCoinTime = this.time;
      this.audio.play('coin', 1 + Math.min(this.coinStreak, 12) * 0.06);
    }
  }

  private checkPowerups(): void {
    const r = this.runner;
    for (const p of r.seg.powerups) {
      if (p.taken || Math.abs(p.s - r.s) > 1 || Math.abs(p.x - r.x) > 0.95 || r.y > 2.2) continue;
      p.taken = true;
      if (p.object) p.object.visible = false;
      const P = TUNING.powerup;
      this.powers[p.kind] = p.kind === 'magnet' ? P.magnetTime : p.kind === 'double' ? P.doubleTime : P.shieldTime;
      this.hud.toast(t(`power.${p.kind}`), 'white');
      this.audio.play('perfect');
      this.reportMissions('powerups', 1);
      if (settings.effects.coinSparkle) {
        const at = this.track.position(r.seg, p.s, p.x, this.scratch);
        at.y = 1.1;
        this.sparkles.burst(at, '#7cc8ff', 14);
      }
    }
  }

  /** Power-up badges in the HUD and the bubble around you while the shield is up. */
  private showPowers(): void {
    const P = TUNING.powerup;
    const full: Record<PowerupKind, number> = { magnet: P.magnetTime, shield: P.shieldTime, double: P.doubleTime };
    this.hud.setPowers(
      (Object.keys(this.powers) as PowerupKind[])
        .filter((k) => this.powers[k] > 0)
        .map((k) => ({ icon: POWER_ICONS[k], left: this.powers[k] / full[k] })),
    );
    this.shieldBubble.visible = this.powers.shield > 0 && this.phase === 'playing';
    if (this.shieldBubble.visible) {
      this.shieldBubble.position.copy(this.runner.visual);
      this.shieldBubble.position.y += 1;
      this.shieldBubble.scale.setScalar(1 + Math.sin(this.time * 6) * 0.04);
    }
  }

  private checkPortal(): void {
    const seg = this.runner.seg;
    if (seg.portalAt === null || seg.portalPassed || this.runner.s < seg.portalAt) return;
    seg.portalPassed = true;
    // "Reach world N in one run" counts worlds from where this run started.
    this.portalsThisRun++;
    this.reportMissions('runWorlds', this.portalsThisRun + 1);
    const unlocked = markReached(settings.world, seg.world.id);
    if (unlocked) window.setTimeout(() => this.hud.toast(t('toast.unlocked'), 'green'), 900);
    this.setWorld(seg.world);
    this.furthestWorld = seg.world;

    const bonus = 250 * this.multiplier;
    this.score += bonus;
    if (settings.effects.speedZoom) this.engine.kickFov(16);
    if (settings.effects.screenFlash) this.hud.flash('white');
    this.hud.toast(t('toast.newWorld', { p: bonus }), 'white');
    this.audio.play('portal');
    this.menus.show({
      eyebrow: t('intro.world', { n: seg.worldNumber }),
      title: worldName(seg.world),
      variant: 'is-intro',
      autoHideMs: 1600,
    });
  }

  private setWorld(world: WorldDef): void {
    this.world = world;
    this.engine.applyTheme(world.theme);
    this.chaser.setKind(chaserFor(world, settings.character));
  }

  private updateChaser(dt: number): void {
    const C = TUNING.chaser;
    let wanted: number = C.restGap;
    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - dt);
      const t = 1 - this.intro / C.introTime;
      wanted = C.introGap + (C.restGap - C.introGap) * t * t;
    } else if (this.danger > 0) {
      this.danger = Math.max(0, this.danger - dt);
      const t = 1 - this.danger / C.dangerTime;
      // Stays right on your heels for most of the time, then drops back.
      const fallBack = Math.max(0, (t - 0.65) / 0.35);
      wanted = C.stumbleGap + (C.restGap - C.stumbleGap) * fallBack * fallBack;
    }
    this.chaser.gap += (wanted - this.chaser.gap) * Math.min(1, dt * 4);
    this.chaser.update(dt, this.track, this.runner.seg, this.runner.s, this.runner.speed);
  }

  /** On the first couple of runs, say what to do just before you need to. */
  private updateHints(dt: number): void {
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hud.hint(null);
    }
    if (this.best.runs >= TUTORIAL_RUNS) return;
    const r = this.runner;
    const touch = isTouch();

    if (this.turnHints < 2 && this.nearTurn() && r.s < r.seg.length - TUNING.pathWidth / 2) {
      const right = r.seg.turn === 1;
      this.showHint(
        t(right ? (touch ? 'hint.turnRightTouch' : 'hint.turnRightKeys') : touch ? 'hint.turnLeftTouch' : 'hint.turnLeftKeys'),
      );
      this.turnHints++;
      return;
    }

    for (const o of r.seg.obstacles) {
      if (o.passed || o.hinted) continue;
      const ahead = o.s0 - r.s;
      if (ahead > r.speed * 0.9 + 2) break;
      o.hinted = true;
      if (this.hintedKinds.has(o.kind)) continue;
      this.hintedKinds.add(o.kind);
      const text = {
        low: t(touch ? 'hint.jumpTouch' : 'hint.jumpKeys'),
        gap: t(touch ? 'hint.gapTouch' : 'hint.gapKeys'),
        high: t(touch ? 'hint.slideTouch' : 'hint.slideKeys'),
        block: t(touch ? 'hint.dodgeTouch' : 'hint.dodgeKeys'),
      }[o.kind];
      this.showHint(text);
      break;
    }
  }

  private showHint(text: string): void {
    this.hud.hint(text);
    this.hintTimer = 1.4;
  }
}

function next<T>(list: T[], current: T): T {
  return list[(list.indexOf(current) + 1) % list.length];
}

function loadBest(): Best {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { distance: 0, score: 0, runs: 0, ...JSON.parse(raw) };
  } catch {
    // Storage can be unavailable (private mode, sandboxed previews). Play on.
  }
  return { distance: 0, score: 0, runs: 0 };
}

function saveBest(best: Best): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(best));
  } catch {
    // Not fatal — the best just won't survive a reload.
  }
}

function vibrate(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Not supported everywhere (iOS); harmless.
  }
}
