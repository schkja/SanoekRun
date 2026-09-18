/**
 * The Game: the state machine and the frame loop.
 *
 * It owns the run (score, lives, which level), listens to the event bus, and
 * decides which screen is on top. It deliberately knows nothing about *how*
 * a coin or an enemy works — only that a 'collect' or a 'defeat' happened.
 */

import { Engine } from './engine';
import { Input, isTouchDevice } from './input';
import { Assets } from './assets';
import { Audio } from './audio';
import { EventBus } from './events';
import { World } from '../systems/world';
import { loadLevel, type LoadedLevel } from '../systems/level-loader';
import { Hud } from '../ui/hud';
import { Menus } from '../ui/menus';
import { LEVELS } from '../../content/levels/index';
import type { GamePhase, GameState } from './types';

/** Starting values for a new run. Tweak to make the game easier or harder. */
const RUN_DEFAULTS = {
  lives: 3,
  /** Points awarded per second still on the clock when a level is finished. */
  timeBonusPerSecond: 5,
  /** Points for finishing a level at all. */
  levelBonus: 250,
};

export class Game {
  private readonly engine: Engine;
  private readonly input: Input;
  private readonly assets = new Assets();
  private readonly audio = new Audio();
  private readonly events = new EventBus();
  private readonly world: World;
  private readonly hud: Hud;
  private readonly menus: Menus;

  private phase: GamePhase = 'menu';
  private level: LoadedLevel | null = null;
  private state: GameState = blankState();
  private lastFrame = 0;
  private running = false;
  /**
   * When the pointer was last released. Pressing Escape makes the browser drop
   * pointer lock *and* fires a keydown, which would otherwise pause and then
   * immediately unpause. This timestamp lets the second one be ignored.
   */
  private unlockedAt = 0;

  constructor(canvasContainer: HTMLElement, uiContainer: HTMLElement) {
    this.engine = new Engine(canvasContainer);
    this.input = new Input(uiContainer, this.engine.renderer.domElement);
    this.world = new World(this.engine.scene, this.assets, this.audio, this.events);
    this.hud = new Hud(uiContainer);
    this.menus = new Menus(uiContainer);

    this.input.setPauseHandler(() => this.togglePause());
    // Losing the mouse (Esc, alt-tab, clicking away) pauses, as in most games.
    this.input.setPointerLockLostHandler(() => {
      this.unlockedAt = performance.now();
      if (this.phase === 'playing') this.togglePause();
    });

    // Clicking the game grabs the mouse again after it has been released.
    this.engine.renderer.domElement.addEventListener('click', () => {
      if (this.phase === 'playing') this.input.requestPointerLock();
    });

    this.wireEvents();

    // Browsers only allow sound after a user gesture.
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  start(): void {
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.frame);
    this.showTitle();
  }

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------

  private showTitle(): void {
    this.phase = 'menu';
    this.hud.setVisible(false);
    this.hud.setHint(null);
    this.input.releasePointerLock();
    this.menus.show({
      eyebrow: 'A 3D ARCADE TEMPLATE',
      title: 'Portal Dash',
      body: 'Move with WASD. Space jumps. Move the mouse to look around — the camera orbits all the way round you — and scroll to zoom in and out. Collect enough coins to open the portal, and stomp enemies from above.',
      buttons: [{ label: 'Start Game', primary: true, onClick: () => this.startRun() }],
    });
  }

  private startRun(): void {
    this.state = blankState();
    this.beginLevel(0);
  }

  private beginLevel(index: number): void {
    this.state.levelIndex = index;
    const def = LEVELS[index];

    this.engine.applyTheme(def.theme);
    this.level = loadLevel(this.world, def);
    this.engine.target = this.level.player.object;
    this.engine.resetOrbit(def.cameraYaw ?? 0);
    this.engine.snapToTarget(this.world.colliders);

    this.state.coins = 0;
    this.state.coinsRequired = this.level.requiredCoins;
    this.state.timeLeft = def.timeLimit ?? 0;

    this.input.releaseAll();
    // beginLevel always runs from a click on a menu button, which is the
    // gesture browsers require before they will capture the mouse.
    this.input.requestPointerLock();
    this.hud.setEffect(null);
    this.hud.setVisible(true);
    this.hud.update(this.state, this.level.totalCoins);

    this.phase = 'level-intro';
    this.menus.show({
      eyebrow: `LEVEL ${index + 1} OF ${LEVELS.length}`,
      title: def.name,
      body: def.subtitle,
      variant: 'is-intro',
      autoHideMs: 1800,
    });
    // Hand control back when the intro card fades.
    window.setTimeout(() => {
      if (this.phase !== 'level-intro') return;
      this.phase = 'playing';
      this.updateHint();
    }, 1800);
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.input.releaseAll();
      this.input.releasePointerLock();
      this.hud.setHint(null);
      this.showPauseMenu();
    } else if (this.phase === 'paused') {
      // Ignore the Escape keypress that released the pointer a moment ago;
      // the release has already paused the game.
      if (performance.now() - this.unlockedAt < 300) return;
      this.resume();
    }
  }

  private showPauseMenu(): void {
    this.menus.show({
      title: 'Paused',
      body: 'Take your time.',
      stats: [
        ['Score', String(this.state.score)],
        ['Coins', `${this.state.coins} / ${this.level?.totalCoins ?? 0}`],
      ],
      buttons: [
        { label: 'Resume', primary: true, onClick: () => this.resume() },
        {
          label: this.audio.muted ? 'Sound: Off' : 'Sound: On',
          onClick: () => {
            this.audio.toggleMute();
            this.showPauseMenu();
          },
        },
        { label: 'Restart Level', onClick: () => this.beginLevel(this.state.levelIndex) },
        { label: 'Quit to Title', onClick: () => this.showTitle() },
      ],
    });
  }

  private resume(): void {
    this.menus.hide();
    this.input.releaseAll();
    this.phase = 'playing';
    // This runs from a click on "Resume", which is the gesture the browser
    // needs before it will hand the mouse back.
    this.input.requestPointerLock();
    this.updateHint();
  }

  /** Show "click to look around" only when the mouse isn't captured. */
  private updateHint(): void {
    const needsClick = this.phase === 'playing' && !this.input.isPointerLocked && !isTouchDevice();
    this.hud.setHint(needsClick ? 'Click to look around' : null);
  }

  private completeLevel(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'level-complete';
    this.input.releasePointerLock();
    this.hud.setHint(null);

    const timeBonus = Math.floor(this.state.timeLeft) * RUN_DEFAULTS.timeBonusPerSecond;
    this.state.score += RUN_DEFAULTS.levelBonus + timeBonus;

    const isLast = this.state.levelIndex >= LEVELS.length - 1;
    const stats: Array<[string, string]> = [
      ['Coins', `${this.state.coins} / ${this.level?.totalCoins ?? 0}`],
      ['Level bonus', `+${RUN_DEFAULTS.levelBonus}`],
    ];
    if (timeBonus > 0) stats.push(['Time bonus', `+${timeBonus}`]);
    stats.push(['Total score', String(this.state.score)]);

    if (isLast) {
      this.phase = 'won';
      this.hud.setVisible(false);
      this.menus.show({
        eyebrow: 'RUN COMPLETE',
        title: 'You made it through!',
        body: 'That is the whole template. Now open content/levels/ and build your own.',
        stats,
        variant: 'is-win',
        buttons: [{ label: 'Play Again', primary: true, onClick: () => this.startRun() }],
      });
      return;
    }

    this.menus.show({
      eyebrow: `LEVEL ${this.state.levelIndex + 1} CLEAR`,
      title: LEVELS[this.state.levelIndex].name,
      stats,
      variant: 'is-win',
      buttons: [
        { label: 'Next Level', primary: true, onClick: () => this.beginLevel(this.state.levelIndex + 1) },
      ],
    });
  }

  private gameOver(): void {
    this.phase = 'game-over';
    this.input.releasePointerLock();
    this.hud.setVisible(false);
    this.hud.setHint(null);
    this.audio.play('die');
    this.menus.show({
      eyebrow: 'GAME OVER',
      title: 'Out of lives',
      stats: [
        ['Reached', `Level ${this.state.levelIndex + 1}`],
        ['Final score', String(this.state.score)],
      ],
      variant: 'is-gameover',
      buttons: [
        { label: 'Try Again', primary: true, onClick: () => this.beginLevel(this.state.levelIndex) },
        { label: 'Quit to Title', onClick: () => this.showTitle() },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Events from the world
  // -------------------------------------------------------------------------

  private wireEvents(): void {
    this.events.on('score', ({ amount }) => {
      this.state.score += amount;
    });

    this.events.on('collect', ({ label, points }) => {
      if (points > 0) {
        this.state.coins++;
        this.hud.toast(`${label} +${points}`);
        this.level?.goal.setCollected(this.state.coins);
      } else {
        this.hud.toast(label, '#8affc1');
      }
    });

    this.events.on('defeat', ({ points }) => {
      this.state.score += points;
      this.engine.addShake(0.25);
      this.hud.toast(`+${points}`, '#ff9f68');
    });

    this.events.on('life', ({ amount }) => {
      this.state.lives += amount;
    });

    this.events.on('time', ({ seconds }) => {
      if (this.state.timeLeft > 0) this.state.timeLeft += seconds;
    });

    this.events.on('effect', ({ name, active }) => {
      this.hud.setEffect(active ? name : null);
    });

    this.events.on('hurt', () => {
      this.state.lives -= 1;
      this.engine.addShake(0.7);
      this.hud.flashDamage();
      if (this.state.lives <= 0) {
        this.events.emit('dead', {});
      } else {
        this.world.player?.respawn();
        this.hud.setEffect(null);
        this.engine.snapToTarget(this.world.colliders);
      }
    });

    this.events.on('dead', () => this.gameOver());
    this.events.on('goal', () => this.completeLevel());
  }

  // -------------------------------------------------------------------------
  // The frame loop
  // -------------------------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.frame);

    // Clamp dt so that alt-tabbing away doesn't teleport the player through
    // the floor when the tab wakes up.
    const dt = Math.min((now - this.lastFrame) / 1000, 1 / 20);
    this.lastFrame = now;

    this.input.update(dt);

    if (this.phase === 'playing') {
      // Turn the camera first, then move relative to where it now points.
      this.engine.orbit(this.input.look.x, this.input.look.y);
      if (this.input.zoom !== 0) this.engine.zoom(this.input.zoom);

      const player = this.world.player;
      if (player) {
        this.engine.getCameraForward(player.cameraForward);
        player.handleInput(this.input, dt);
      }
      this.world.update(dt);
      this.tickTimer(dt);
      if (this.level) this.hud.update(this.state, this.level.totalCoins);
    }

    // The camera keeps easing even while paused, which looks better than a
    // hard freeze and costs nothing.
    this.engine.update(dt, this.world.colliders);
    this.engine.render();
  };

  private tickTimer(dt: number): void {
    if (this.state.timeLeft <= 0) return;
    this.state.timeLeft -= dt;
    if (this.state.timeLeft <= 0) {
      this.state.timeLeft = 0;
      this.events.emit('hurt', { cause: 'time' });
      // Give a fresh clock so the retry is playable.
      const limit = LEVELS[this.state.levelIndex].timeLimit ?? 0;
      this.state.timeLeft = limit;
    }
  }
}

function blankState(): GameState {
  return {
    score: 0,
    lives: RUN_DEFAULTS.lives,
    coins: 0,
    coinsRequired: 0,
    timeLeft: 0,
    levelIndex: 0,
  };
}
