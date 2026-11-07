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
import { PORTRAITS } from '../ui/portraits';
import { drawShareCard, shareRun, type RunSummary } from '../ui/share-card';
import { Track, headingYaw, type Obstacle, type TurnDir } from './track';
import { Runner } from './runner';
import { Chaser } from './chaser';
import { TUNING, speedAt } from './tuning';
import { WORLDS, distanceOfWorld, route, type WorldDef } from './worlds';
import { animateSegment, setCollectible } from './visuals';
import { Sparkles } from './sparkles';
import { setOutlines } from './toon';
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
import { LANGUAGE_NAMES, formatNumber, setLanguage, t, type StringKey } from '../i18n';

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

    this.engine.scene.add(this.track.root, this.runner.model.root, this.chaser.root, this.sparkles.root);
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
    this.menus.show({
      eyebrow: t('title.eyebrow'),
      title: GAME_NAME,
      body: t(`story.${settings.character}`),
      badge: this.best.distance > 0 ? t('title.best', { m: this.best.distance }) : undefined,
      choicesTitle: t('title.choose'),
      choices: CHARACTERS.map((c) => ({
        label: t(`character.${c}`),
        caption: t(`caption.${c}`),
        art: PORTRAITS[c],
        selected: settings.character === c,
        onClick: () => {
          if (settings.character === c) return;
          updateSettings((s) => (s.character = c));
          this.prepareTrack();
          this.showTitle();
        },
      })),
      buttons: [
        { label: t('button.run'), primary: true, onClick: () => this.newRun() },
        { label: t('button.settings'), onClick: () => this.showSettings(() => this.showTitle()) },
      ],
      note: isTouch() ? undefined : t('title.keys'),
      variant: 'is-title',
    });
  }

  /** Swap in the chosen character (and what it collects) before a track is built. */
  private applyCharacter(): void {
    setCollectible(settings.character === 'squirrel' ? 'acorn' : 'coin');
    this.hud.setCollectible(settings.character === 'squirrel' ? 'acorn' : 'coin');
    if (this.character === settings.character) return;
    this.engine.scene.remove(this.runner.model.root);
    this.runner.setCharacter(settings.character);
    this.engine.scene.add(this.runner.model.root);
    this.character = settings.character;
  }

  /** "Coins" or "Nuts" in the current language, for stat rows. */
  private get collectibleLabel(): string {
    return settings.character === 'squirrel' ? t('stat.nuts') : t('stat.coins');
  }

  /** Build a fresh track with the runner standing at the start. */
  private prepareTrack(): void {
    this.applyCharacter();
    this.sparkles.clear();
    this.slowTimer = 0;
    this.timeScale = 1;
    // Each character runs its own route of worlds. `?world=snowy-pines` in the
    // address starts the run in a given world — handy for testing.
    const worlds = route(settings.character);
    const startAt = new URLSearchParams(location.search).get('world');
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
    this.caught = false;

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

    const distance = Math.floor(this.distance);
    const previousBest = Math.floor(this.best.distance);
    const newBest = distance > previousBest;
    this.best.runs += 1;
    if (newBest) this.best.distance = distance;
    this.best.score = Math.max(this.best.score, Math.floor(this.score));
    saveBest(this.best);

    let badge: string;
    if (newBest && previousBest > 0) badge = t('over.newBest');
    else if (newBest) badge = t('over.firstRun');
    else if (previousBest - distance <= 150) badge = t('over.near', { m: previousBest - distance });
    else badge = t('over.best', { m: previousBest });

    // Snapshot the final frame for the share card while it's still on screen.
    this.lastRun = {
      distance,
      coins: this.coins,
      collectible: settings.character === 'squirrel' ? 'nuts' : 'coins',
      world: worldName(this.furthestWorld),
      newBest: newBest && previousBest > 0,
    };
    this.engine.render();
    this.shareCard = drawShareCard(this.lastRun, this.engine.renderer.domElement);
    this.shareStatus = '';
    this.showRunOverMenu(badge);
  }

  private showRunOverMenu(badge: string): void {
    const distance = Math.floor(this.distance);
    this.menus.show({
      eyebrow: t('over.eyebrow'),
      title: this.deathTitle,
      hero: `${formatNumber(distance)} ${t('hud.unit')}`,
      badge,
      stats: [
        [t('stat.score'), formatNumber(this.score)],
        [this.collectibleLabel, formatNumber(this.coins)],
        [t('stat.furthest'), worldName(this.furthestWorld)],
      ],
      body: this.shareStatus || undefined,
      variant: 'is-over',
      buttons: [
        { label: t('button.playAgain'), primary: true, onClick: () => this.newRun() },
        { label: t('button.share'), onClick: () => void this.share(badge) },
        { label: t('button.mainMenu'), onClick: () => { this.prepareTrack(); this.showTitle(); } },
      ],
    });
  }

  private async share(badge: string): Promise<void> {
    if (!this.shareCard || !this.lastRun) return;
    const result = await shareRun(this.shareCard, this.lastRun);
    this.shareStatus = {
      shared: t('over.shared'),
      downloaded: t('over.saved'),
      cancelled: '',
      failed: t('over.shareFailed'),
    }[result];
    if (this.phase === 'over') this.showRunOverMenu(badge);
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

    if (this.phase !== 'paused') {
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

    this.checkObstacles();
    this.checkCoins();
    this.checkPortal();
    this.updateChaser(dt);
    this.updateHints(dt);

    if (r.falling && r.y < -1) {
      const decor = this.world.decor;
      this.die(t(decor === 'lava' ? 'death.lava' : decor === 'jungle' ? 'death.abyss' : 'death.trees'), false);
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
        this.markCloseCall('jump', r.lane);
        this.audio.play('jump');
      }
    } else if (r.slide()) {
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
    if (settings.effects.cameraShake) this.engine.addShake(0.6);
    if (settings.effects.screenFlash) this.hud.flash('red');
    vibrate(this.danger > 0 ? 300 : 120);

    if (this.danger > 0) {
      this.caught = true;
      this.die(t(`caught.${this.world.chaser}`), true);
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
    for (const c of r.seg.coins) {
      if (c.taken) continue;
      if (Math.abs(c.s - r.s) > 0.9 || Math.abs(c.x - r.x) > 0.85 || Math.abs(c.y - centre) > 1.15) continue;
      c.taken = true;
      if (c.object) c.object.visible = false;
      if (settings.effects.coinSparkle) {
        const at = this.track.position(r.seg, c.s, c.x, this.scratch);
        at.y = c.y;
        this.sparkles.burst(at, settings.character === 'squirrel' ? '#d9a05b' : '#ffd23f');
      }
      this.coins += 1;
      this.score += TUNING.score.coin * this.multiplier;

      // Coins collected in quick succession climb in pitch — a little reward loop.
      this.coinStreak = this.time - this.lastCoinTime < 0.45 ? this.coinStreak + 1 : 0;
      this.lastCoinTime = this.time;
      this.audio.play('coin', 1 + Math.min(this.coinStreak, 12) * 0.06);
    }
  }

  private checkPortal(): void {
    const seg = this.runner.seg;
    if (seg.portalAt === null || seg.portalPassed || this.runner.s < seg.portalAt) return;
    seg.portalPassed = true;
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
    this.chaser.setKind(world.chaser);
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
