/**
 * Input: keyboard, mouse-look, wheel zoom and touch, all flattened into one
 * simple shape the rest of the game reads:
 *
 *   input.move.x    -1 .. 1   strafe
 *   input.move.y    -1 .. 1   forward / back
 *   input.look.x              camera turn this frame, in radians
 *   input.look.y              camera pitch this frame, in radians
 *   input.zoom                camera distance change this frame
 *   input.jump                held this frame
 *   input.jumpPressed         became held this frame (edge)
 *
 * Nothing else in the game touches DOM events, so remapping controls or adding
 * a gamepad means editing only this file.
 */

export const KEY_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  forward: ['ArrowUp', 'KeyW'],
  back: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyK'],
  pause: ['Escape', 'KeyP'],
  /** Keyboard camera, for anyone not using a mouse. */
  cameraLeft: ['KeyQ'],
  cameraRight: ['KeyE'],
  cameraUp: ['KeyR'],
  cameraDown: ['KeyF'],
} as const;

/** Camera feel. Tune these if the mouse is too fast, too slow or inverted. */
export const LOOK_SETTINGS = {
  /** Radians of turn per pixel of mouse movement. */
  mouseSensitivity: 0.0026,
  /** Radians of turn per pixel of touch drag. */
  touchSensitivity: 0.006,
  /** Radians per second while holding Q / E / R / F. */
  keyboardSpeed: 2.0,
  /** Units of camera distance per wheel notch. */
  zoomSpeed: 1.6,
  /** Flip vertical look, as some people prefer. */
  invertY: false,
};

type Binding = keyof typeof KEY_BINDINGS;

export class Input {
  readonly move = { x: 0, y: 0 };
  /** Camera rotation requested this frame, in radians. */
  readonly look = { x: 0, y: 0 };
  /** Camera distance change requested this frame. */
  zoom = 0;
  jump = false;
  jumpPressed = false;

  private held = new Set<string>();
  private jumpWasHeld = false;
  private touchVector = { x: 0, y: 0 };
  private touchJump = false;
  /** Look input accumulated between frames, in radians. */
  private lookAccum = { x: 0, y: 0 };
  private zoomAccum = 0;
  private onPause?: () => void;
  private onPointerLockLost?: () => void;
  private knobEl?: HTMLElement;
  private pointerLockIntended = false;

  constructor(
    private readonly root: HTMLElement,
    /** The canvas. Pointer lock and the wheel are bound to this. */
    private readonly surface: HTMLElement,
  ) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAll);

    this.surface.addEventListener('wheel', this.handleWheel, { passive: false });
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);

    if (isTouchDevice()) this.buildTouchControls();
  }

  /** Called when the pause key is pressed. */
  setPauseHandler(fn: () => void): void {
    this.onPause = fn;
  }

  /**
   * Called when the pointer escapes the game (Esc, alt-tab, clicking away).
   * Real games pause here, and so does this one.
   */
  setPointerLockLostHandler(fn: () => void): void {
    this.onPointerLockLost = fn;
  }

  get isPointerLocked(): boolean {
    return document.pointerLockElement === this.surface;
  }

  /**
   * Ask the browser to capture the mouse. Must be called from a user gesture
   * (a click), or browsers reject it — which is why the game asks on the menu
   * button and on any click on the canvas rather than automatically.
   */
  requestPointerLock(): void {
    if (this.isPointerLocked) return;
    this.pointerLockIntended = true;
    const result = this.surface.requestPointerLock?.() as unknown;
    // Chrome returns a promise that rejects if the gesture wasn't accepted.
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch(() => {
        this.pointerLockIntended = false;
      });
    }
  }

  releasePointerLock(): void {
    this.pointerLockIntended = false;
    if (this.isPointerLocked) document.exitPointerLock();
  }

  /** Call once per frame, before reading the values. */
  update(dt: number): void {
    const axis = (neg: Binding, pos: Binding) =>
      (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);

    let x = axis('left', 'right') + this.touchVector.x;
    let y = axis('back', 'forward') + this.touchVector.y;

    // Normalise so diagonal movement isn't faster than straight movement.
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    this.move.x = x;
    this.move.y = y;

    // Look = accumulated pointer/touch movement plus any keyboard camera keys.
    const keyboardLook = LOOK_SETTINGS.keyboardSpeed * dt;
    this.look.x = this.lookAccum.x + axis('cameraLeft', 'cameraRight') * keyboardLook;
    this.look.y = this.lookAccum.y + axis('cameraUp', 'cameraDown') * keyboardLook;
    this.lookAccum.x = 0;
    this.lookAccum.y = 0;

    this.zoom = this.zoomAccum;
    this.zoomAccum = 0;

    const jumpNow = this.isDown('jump') || this.touchJump;
    this.jumpPressed = jumpNow && !this.jumpWasHeld;
    this.jump = jumpNow;
    this.jumpWasHeld = jumpNow;
  }

  /** Forget everything — used when the game is paused or reset. */
  releaseAll = (): void => {
    this.held.clear();
    this.touchVector.x = 0;
    this.touchVector.y = 0;
    this.touchJump = false;
    this.jumpWasHeld = false;
    this.lookAccum.x = 0;
    this.lookAccum.y = 0;
    this.zoomAccum = 0;
    if (this.knobEl) this.knobEl.style.transform = 'translate(-50%, -50%)';
  };

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    this.surface.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
  }

  private isDown(binding: Binding): boolean {
    return KEY_BINDINGS[binding].some((code) => this.held.has(code));
  }

  // -------------------------------------------------------------------------
  // Keyboard
  // -------------------------------------------------------------------------

  private handleKeyDown = (e: KeyboardEvent): void => {
    if ((KEY_BINDINGS.pause as readonly string[]).includes(e.code)) {
      e.preventDefault();
      this.onPause?.();
      return;
    }
    // Stop the page scrolling when arrows or space are used to play.
    if (Object.values(KEY_BINDINGS).some((codes) => (codes as readonly string[]).includes(e.code))) {
      e.preventDefault();
    }
    this.held.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  // -------------------------------------------------------------------------
  // Mouse look
  // -------------------------------------------------------------------------

  private handleMouseMove = (e: MouseEvent): void => {
    if (!this.isPointerLocked) return;
    // movementX/Y are raw deltas — they keep working past the edge of the
    // screen, which is the whole point of locking the pointer.
    this.lookAccum.x += e.movementX * LOOK_SETTINGS.mouseSensitivity;
    this.lookAccum.y +=
      e.movementY * LOOK_SETTINGS.mouseSensitivity * (LOOK_SETTINGS.invertY ? -1 : 1);
  };

  private handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.zoomAccum += Math.sign(e.deltaY) * LOOK_SETTINGS.zoomSpeed;
  };

  private handlePointerLockChange = (): void => {
    if (this.isPointerLocked) return;
    // We lost the pointer. If the game meant to hold it, something interrupted
    // play (Esc, alt-tab, a click elsewhere) and the game should pause.
    if (this.pointerLockIntended) {
      this.pointerLockIntended = false;
      this.releaseAll();
      this.onPointerLockLost?.();
    }
  };

  // -------------------------------------------------------------------------
  // Touch: a virtual stick on the left, drag the right side to look,
  // and a jump button in the corner.
  // -------------------------------------------------------------------------

  private buildTouchControls(): void {
    // The look area sits behind everything else and covers the right half.
    const lookArea = document.createElement('div');
    lookArea.className = 'touch-look';
    this.root.appendChild(lookArea);

    const pad = document.createElement('div');
    pad.className = 'touch-controls';
    pad.innerHTML = `
      <div class="touch-stick" id="touch-stick"><div class="touch-stick-knob" id="touch-knob"></div></div>
      <button class="touch-jump" id="touch-jump" aria-label="Jump">JUMP</button>
    `;
    this.root.appendChild(pad);

    const base = pad.querySelector<HTMLElement>('#touch-stick')!;
    const knob = pad.querySelector<HTMLElement>('#touch-knob')!;
    const jumpBtn = pad.querySelector<HTMLElement>('#touch-jump')!;
    this.knobEl = knob;

    // --- Movement stick ----------------------------------------------------
    const RADIUS = 52;
    let stickId: number | null = null;

    const moveStick = (touch: Touch) => {
      const rect = base.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = touch.clientX - cx;
      let dy = touch.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > RADIUS) {
        dx = (dx / dist) * RADIUS;
        dy = (dy / dist) * RADIUS;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.touchVector.x = dx / RADIUS;
      this.touchVector.y = -dy / RADIUS; // screen down is world back
    };

    base.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        stickId = t.identifier;
        moveStick(t);
      },
      { passive: false },
    );

    // --- Look drag ---------------------------------------------------------
    let lookId: number | null = null;
    let lookLast = { x: 0, y: 0 };

    lookArea.addEventListener(
      'touchstart',
      (e) => {
        if (lookId !== null) return;
        const t = e.changedTouches[0];
        lookId = t.identifier;
        lookLast = { x: t.clientX, y: t.clientY };
      },
      { passive: true },
    );

    // --- Shared move / end handling for both fingers ------------------------
    window.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (t.identifier === stickId) {
            e.preventDefault();
            moveStick(t);
          } else if (t.identifier === lookId) {
            this.lookAccum.x += (t.clientX - lookLast.x) * LOOK_SETTINGS.touchSensitivity;
            this.lookAccum.y +=
              (t.clientY - lookLast.y) *
              LOOK_SETTINGS.touchSensitivity *
              (LOOK_SETTINGS.invertY ? -1 : 1);
            lookLast = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: false },
    );

    const endTouch = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === stickId) {
          stickId = null;
          this.touchVector.x = 0;
          this.touchVector.y = 0;
          knob.style.transform = 'translate(-50%, -50%)';
        } else if (t.identifier === lookId) {
          lookId = null;
        }
      }
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    // --- Jump --------------------------------------------------------------
    jumpBtn.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.touchJump = true;
      },
      { passive: false },
    );
    const releaseJump = (e: Event) => {
      e.preventDefault();
      this.touchJump = false;
    };
    jumpBtn.addEventListener('touchend', releaseJump);
    jumpBtn.addEventListener('touchcancel', releaseJump);

    // Pinch to zoom the camera.
    let pinchStart = 0;
    window.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length !== 2) {
          pinchStart = 0;
          return;
        }
        const [a, b] = [e.touches[0], e.touches[1]];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinchStart === 0) pinchStart = distance;
        this.zoomAccum += (pinchStart - distance) * 0.03;
        pinchStart = distance;
      },
      { passive: true },
    );
  }
}

export function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}
