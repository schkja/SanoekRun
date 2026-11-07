/**
 * The in-run HUD: distance, coins, score, the multiplier, the "it's right
 * behind you" meter, pop-up toasts and first-run hints.
 *
 * Plain DOM on top of the canvas — far easier to style than text in WebGL.
 */

export interface HudState {
  distance: number;
  coins: number;
  score: number;
  multiplier: number;
  /** 0 = safe, 1 = the chaser is on your heels. */
  danger: number;
}

export class Hud {
  private readonly root: HTMLElement;
  private readonly distanceEl: HTMLElement;
  private readonly coinsEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly multiplierEl: HTMLElement;
  private readonly dangerEl: HTMLElement;
  private readonly dangerFill: HTMLElement;
  private readonly toastsEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly flashEl: HTMLElement;
  private last = { coins: -1, multiplier: -1, score: -1, distance: -1 };

  constructor(parent: HTMLElement, onPause: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'hud is-hidden';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-chip hud-distance"><span class="hud-value" data-distance>0</span><span class="hud-unit">m</span></div>
        <div class="hud-right">
          <div class="hud-chip hud-coins"><span class="hud-coin" aria-hidden="true"></span><span class="hud-value" data-coins>0</span></div>
          <button class="hud-pause" aria-label="Pause"><span></span><span></span></button>
        </div>
      </div>
      <div class="hud-sub">
        <div class="hud-score"><span data-score>0</span></div>
        <div class="hud-multiplier" data-multiplier>x1</div>
      </div>
      <div class="hud-danger" data-danger>
        <span>It's right behind you</span>
        <div class="hud-danger-bar"><div data-danger-fill></div></div>
      </div>
      <div class="hud-hint" data-hint></div>
      <div class="hud-toasts" data-toasts></div>
      <div class="hud-vignette" data-vignette></div>
      <div class="hud-flash" data-flash></div>
    `;
    parent.appendChild(this.root);

    const q = (sel: string) => this.root.querySelector<HTMLElement>(sel)!;
    this.distanceEl = q('[data-distance]');
    this.coinsEl = q('[data-coins]');
    this.scoreEl = q('[data-score]');
    this.multiplierEl = q('[data-multiplier]');
    this.dangerEl = q('[data-danger]');
    this.dangerFill = q('[data-danger-fill]');
    this.toastsEl = q('[data-toasts]');
    this.hintEl = q('[data-hint]');
    this.flashEl = q('[data-flash]');
    q('.hud-pause').addEventListener('click', onPause);
    q('.hud-pause').addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('is-hidden', !visible);
  }

  update(state: HudState): void {
    const distance = Math.floor(state.distance);
    if (distance !== this.last.distance) {
      this.distanceEl.textContent = String(distance);
      this.last.distance = distance;
    }
    if (state.coins !== this.last.coins) {
      this.coinsEl.textContent = String(state.coins);
      if (this.last.coins >= 0) this.pop(this.coinsEl);
      this.last.coins = state.coins;
    }
    const score = Math.floor(state.score);
    if (score !== this.last.score) {
      this.scoreEl.textContent = score.toLocaleString('en-US');
      this.last.score = score;
    }
    if (state.multiplier !== this.last.multiplier) {
      this.multiplierEl.textContent = `x${state.multiplier}`;
      this.multiplierEl.classList.toggle('is-active', state.multiplier > 1);
      if (this.last.multiplier >= 0 && state.multiplier > this.last.multiplier) this.pop(this.multiplierEl);
      this.last.multiplier = state.multiplier;
    }
    this.dangerEl.classList.toggle('is-active', state.danger > 0);
    this.root.classList.toggle('is-danger', state.danger > 0);
    this.dangerFill.style.transform = `scaleX(${Math.max(0, state.danger)})`;
  }

  /** A message that pops up and floats away, e.g. "Perfect turn +50". */
  toast(text: string, tone: 'gold' | 'green' | 'red' | 'white' = 'gold'): void {
    const el = document.createElement('div');
    el.className = `hud-toast is-${tone}`;
    el.textContent = text;
    this.toastsEl.appendChild(el);
    window.setTimeout(() => el.remove(), 1100);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstElementChild?.remove();
  }

  hint(text: string | null): void {
    this.hintEl.textContent = text ?? '';
    this.hintEl.classList.toggle('is-active', Boolean(text));
  }

  /** A full-screen flash: white for a portal, red for a hit. */
  flash(color: 'white' | 'red'): void {
    this.flashEl.className = 'hud-flash';
    void this.flashEl.offsetWidth;
    this.flashEl.className = `hud-flash is-${color}`;
  }

  reset(): void {
    this.last = { coins: -1, multiplier: -1, score: -1, distance: -1 };
    this.toastsEl.innerHTML = '';
    this.hint(null);
  }

  private pop(el: HTMLElement): void {
    el.classList.remove('is-pop');
    void el.offsetWidth;
    el.classList.add('is-pop');
  }
}
