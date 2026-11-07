/**
 * The Game: the run, the rules and the frame loop.
 *
 * It owns the score, decides what a swipe means (turn or lane change), checks
 * obstacles and coins, handles stumbling and being caught, swaps worlds at
 * portals, and decides which screen is on top.
 */

import { Engine } from '../core/engine';
import { Input, type Action } from '../core/input';
import { Audio } from '../core/audio';
import { Hud } from '../ui/hud';
import { Menus } from '../ui/menus';
import { Track, headingYaw, type Obstacle, type TurnDir } from './track';
import { Runner } from './runner';
import { Chaser } from './chaser';
import { TUNING, speedAt } from './tuning';
import { WORLDS, type WorldDef } from './worlds';
import { animateSegment } from './visuals';

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
  private furthestWorld = WORLDS[0].name;
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
    this.hud = new Hud(uiContainer, () => this.togglePause());
    this.menus = new Menus(uiContainer);

    this.engine.scene.add(this.track.root, this.runner.model.root, this.chaser.root);
    this.input.setPauseHandler(() => this.togglePause());

    // Pause when the phone locks or the tab is hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.phase === 'playing') this.togglePause();
    });

    // Browsers only allow sound after a user gesture.
    const unlock = () => this.audio.unlock();
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
    this.menus.show({
      eyebrow: 'An endless runner',
      title: 'Sanoek Run',
      body: isTouch()
        ? 'Swipe left or right to turn at corners and switch lanes. Swipe up to jump, down to slide. Don’t let it catch you.'
        : 'Arrow keys or WASD: left and right turn at corners and switch lanes, up jumps, down slides. You can also drag with the mouse. Don’t let it catch you.',
      badge: this.best.distance > 0 ? `Your best: ${Math.floor(this.best.distance)} m` : undefined,
      buttons: [{ label: 'Run', primary: true, onClick: () => this.newRun() }],
    });
  }

  /** Build a fresh track with the runner standing at the start. */
  private prepareTrack(): void {
    this.track.reset();
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
    this.furthestWorld = this.world.name;

    this.input.clear();
    this.hud.reset();
    this.hud.setVisible(true);
    this.phase = 'playing';
    this.audio.play('start');
    this.menus.show({
      eyebrow: 'World 1',
      title: this.world.name,
      body: 'Run!',
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
      title: 'Paused',
      stats: [
        ['Distance', `${Math.floor(this.distance)} m`],
        ['Coins', String(this.coins)],
      ],
      buttons: [
        { label: 'Resume', primary: true, onClick: () => this.resume() },
        {
          label: this.audio.muted ? 'Sound: off' : 'Sound: on',
          onClick: () => {
            this.audio.toggleMute();
            this.showPauseMenu();
          },
        },
        { label: 'Quit to title', onClick: () => { this.prepareTrack(); this.showTitle(); } },
      ],
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
    if (newBest && previousBest > 0) badge = 'New best distance';
    else if (newBest) badge = 'Your first run';
    else if (previousBest - distance <= 150) badge = `Only ${previousBest - distance} m from your best`;
    else badge = `Your best: ${previousBest} m`;

    this.menus.show({
      eyebrow: 'Run over',
      title: this.deathTitle,
      hero: `${distance} m`,
      badge,
      stats: [
        ['Score', Math.floor(this.score).toLocaleString('en-US')],
        ['Coins', String(this.coins)],
        ['Furthest world', this.furthestWorld],
      ],
      variant: 'is-over',
      buttons: [{ label: 'Play again', primary: true, onClick: () => this.newRun() }],
    });
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

    const actions = this.input.drain();
    if (this.phase === 'playing') {
      for (const action of actions) this.handleAction(action);
      this.step(dt);
    } else if (this.phase === 'dying') {
      this.stepDying(dt);
    }

    if (this.phase !== 'paused') {
      this.runner.animate(dt);
      for (let i = Math.max(0, this.runner.seg.index - 1); i < this.track.segments.length; i++) {
        const group = this.track.segments[i].group;
        if (group) animateSegment(group, this.time);
      }
      const speed01 = (this.runner.speed - TUNING.startSpeed) / (TUNING.maxSpeed - TUNING.startSpeed);
      const chaseView = this.chaser.root.visible ? 1 : 0;
      this.engine.follow(this.runner.visual, headingYaw(this.runner.seg.heading), dt, Math.max(0, speed01), this.runner.falling, chaseView);
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
      this.die(this.world.decor === 'lava' ? 'Into the lava' : 'Into the abyss', false);
    }
  }

  private stepDying(dt: number): void {
    this.deathTimer -= dt;
    this.runner.update(dt, this.runner.speed, this.track);
    if (this.deathTitle === this.world.caughtBy) this.chaser.gap += (0.6 - this.chaser.gap) * Math.min(1, dt * 10);
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

    if (lateness >= -TUNING.perfectTurnWindow) {
      this.multiplier = Math.min(TUNING.score.maxMultiplier, this.multiplier + 1);
      const points = TUNING.score.perfectTurn * this.multiplier;
      this.score += points;
      this.hud.toast(`Perfect turn +${points}`, 'green');
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
          this.hud.toast(`Close call +${points}`, 'gold');
          this.audio.play('close');
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
    this.engine.addShake(0.6);
    this.hud.flash('red');
    vibrate(this.danger > 0 ? 300 : 120);

    if (this.danger > 0) {
      this.die(this.world.caughtBy, true);
      return;
    }
    this.danger = TUNING.chaser.dangerTime;
    this.multiplier = 1;
    this.runner.stumble();
    this.audio.play('stumble');
    this.hud.toast('Watch out!', 'red');
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
      this.engine.addShake(1);
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
    this.furthestWorld = seg.world.name;

    const bonus = 250 * this.multiplier;
    this.score += bonus;
    this.engine.kickFov(16);
    this.hud.flash('white');
    this.hud.toast(`New world +${bonus}`, 'white');
    this.audio.play('portal');
    this.menus.show({
      eyebrow: `World ${seg.worldNumber}`,
      title: seg.world.name,
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
      const side = r.seg.turn === 1 ? 'right' : 'left';
      this.showHint(touch ? `Swipe ${side} to turn` : `Press ${side} to turn`);
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
        low: touch ? 'Swipe up to jump' : 'Press up to jump',
        gap: touch ? 'Swipe up to jump the gap' : 'Press up to jump the gap',
        high: touch ? 'Swipe down to slide' : 'Press down to slide',
        block: touch ? 'Swipe left or right to dodge' : 'Press left or right to dodge',
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
