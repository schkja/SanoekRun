/**
 * The in-game HUD: score, lives, coin counter, timer, and the little toasts
 * that pop up when you collect something.
 *
 * It is plain DOM on top of the canvas — far easier to style and iterate on
 * than drawing text in WebGL, and it costs nothing in frame time.
 */

import type { GameState } from '../core/types';

export class Hud {
  private readonly root: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly livesEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly toastsEl: HTMLElement;
  private readonly effectEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private lastScore = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-row">
        <div class="hud-chip" id="hud-score"><span class="hud-label">SCORE</span><span class="hud-value">0</span></div>
        <div class="hud-chip" id="hud-coins"><span class="hud-label">COINS</span><span class="hud-value">0 / 0</span></div>
        <div class="hud-chip" id="hud-lives"><span class="hud-label">LIVES</span><span class="hud-value">3</span></div>
        <div class="hud-chip hud-timer" id="hud-timer"><span class="hud-label">TIME</span><span class="hud-value">--</span></div>
      </div>
      <div class="hud-effect" id="hud-effect"></div>
      <div class="hud-hint" id="hud-hint"></div>
      <div class="hud-toasts" id="hud-toasts"></div>
    `;
    parent.appendChild(this.root);

    this.scoreEl = this.root.querySelector('#hud-score .hud-value')!;
    this.livesEl = this.root.querySelector('#hud-lives .hud-value')!;
    this.coinsEl = this.root.querySelector('#hud-coins .hud-value')!;
    this.timerEl = this.root.querySelector('#hud-timer')!;
    this.toastsEl = this.root.querySelector('#hud-toasts')!;
    this.effectEl = this.root.querySelector('#hud-effect')!;
    this.hintEl = this.root.querySelector('#hud-hint')!;
  }

  /** A quiet prompt at the bottom of the screen, e.g. "Click to look around". */
  setHint(text: string | null): void {
    this.hintEl.textContent = text ?? '';
    this.hintEl.classList.toggle('is-active', Boolean(text));
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-hidden', !visible);
  }

  update(state: GameState, totalCoins: number): void {
    if (state.score !== this.lastScore) {
      this.scoreEl.textContent = String(state.score);
      this.pop(this.scoreEl);
      this.lastScore = state.score;
    }

    // Show hearts while there are few, then switch to "♥ ×12" so a lucky run
    // can't push the rest of the HUD off screen.
    const lives = Math.max(0, state.lives);
    this.livesEl.textContent = lives === 0 ? '—' : lives <= 5 ? '♥'.repeat(lives) : `♥ ×${lives}`;
    this.coinsEl.textContent = `${state.coins} / ${totalCoins}`;
    this.coinsEl.parentElement?.classList.toggle(
      'is-complete',
      state.coinsRequired > 0 && state.coins >= state.coinsRequired,
    );

    if (state.timeLeft > 0) {
      this.timerEl.classList.remove('is-hidden');
      const seconds = Math.ceil(state.timeLeft);
      this.timerEl.querySelector('.hud-value')!.textContent =
        `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      this.timerEl.classList.toggle('is-urgent', seconds <= 15);
    } else {
      this.timerEl.classList.add('is-hidden');
    }
  }

  /** A short message that floats up and fades, e.g. "Gem +100". */
  toast(text: string, color = '#ffd23f'): void {
    const el = document.createElement('div');
    el.className = 'hud-toast';
    el.textContent = text;
    el.style.color = color;
    this.toastsEl.appendChild(el);
    // Remove after the CSS animation finishes so the DOM doesn't grow forever.
    window.setTimeout(() => el.remove(), 1200);
  }

  /** The persistent banner shown while a power-up is active. */
  setEffect(name: string | null): void {
    this.effectEl.textContent = name ?? '';
    this.effectEl.classList.toggle('is-active', Boolean(name));
  }

  /** Flash the screen red when the player is hit. */
  flashDamage(): void {
    this.root.classList.remove('is-hurt');
    // Force a reflow so the animation can be restarted immediately.
    void this.root.offsetWidth;
    this.root.classList.add('is-hurt');
  }

  private pop(el: HTMLElement): void {
    el.classList.remove('is-pop');
    void el.offsetWidth;
    el.classList.add('is-pop');
  }
}
