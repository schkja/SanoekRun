/**
 * Input: swipes and keys, flattened into four actions.
 *
 *   left / right  turn at a corner, otherwise change lane
 *   up            jump
 *   down          slide (or slam down from a jump)
 *
 * Swipes fire the moment the finger has travelled far enough — not on lift —
 * so the game reacts instantly. Keeping a finger down and swiping again in a
 * new direction fires another action, so fast combos work. A mouse drag on
 * desktop counts as a swipe too.
 */

export type Action = 'left' | 'right' | 'up' | 'down';

export const KEY_BINDINGS: Record<Action | 'pause', string[]> = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW', 'Space'],
  down: ['ArrowDown', 'KeyS'],
  pause: ['Escape', 'KeyP'],
};

/** Finger travel, in CSS pixels, before a drag counts as a swipe. */
const SWIPE_DISTANCE = 26;

export class Input {
  private queue: Action[] = [];
  private onPause?: () => void;
  private pointer: { id: number; x: number; y: number; last: Action | null } | null = null;

  constructor(surface: HTMLElement) {
    window.addEventListener('keydown', this.handleKey);
    surface.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove, { passive: false });
    window.addEventListener('pointerup', this.handleUp);
    window.addEventListener('pointercancel', this.handleUp);
    // Stop the page from scrolling or zooming while swiping.
    surface.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  setPauseHandler(fn: () => void): void {
    this.onPause = fn;
  }

  /** Every action since the last call, in order. */
  drain(): Action[] {
    if (this.queue.length === 0) return this.queue;
    const actions = this.queue;
    this.queue = [];
    return actions;
  }

  clear(): void {
    this.queue = [];
    this.pointer = null;
  }

  private handleKey = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    // Typing a nickname shouldn't make the runner jump.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    for (const [action, codes] of Object.entries(KEY_BINDINGS) as Array<[Action | 'pause', string[]]>) {
      if (!codes.includes(e.code)) continue;
      e.preventDefault();
      if (action === 'pause') this.onPause?.();
      else this.queue.push(action);
      return;
    }
  };

  private handleDown = (e: PointerEvent): void => {
    this.pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, last: null };
  };

  private handleMove = (e: PointerEvent): void => {
    const p = this.pointer;
    if (!p || p.id !== e.pointerId) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < SWIPE_DISTANCE) return;

    const action: Action = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    // Carrying on in the same direction shouldn't fire again and again.
    if (action === p.last && dist < SWIPE_DISTANCE * 3) return;

    this.queue.push(action);
    p.x = e.clientX;
    p.y = e.clientY;
    p.last = action;
  };

  private handleUp = (e: PointerEvent): void => {
    if (this.pointer?.id === e.pointerId) this.pointer = null;
  };
}
