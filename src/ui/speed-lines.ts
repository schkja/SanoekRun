/**
 * Speed lines: white streaks rushing outward from the middle of the screen,
 * stronger the faster you run. Drawn on a 2D canvas over the game, so they
 * cost almost nothing and never touch the 3D scene.
 */

interface Streak {
  angle: number;
  progress: number;
  speed: number;
}

export class SpeedLines {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly streaks: Streak[] = [];
  private width = 0;
  private height = 0;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'speed-lines';
    parent.prepend(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    for (let i = 0; i < 46; i++) {
      this.streaks.push({ angle: Math.random() * Math.PI * 2, progress: Math.random(), speed: 0.6 + Math.random() * 0.8 });
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** `intensity` 0..1. Pass 0 to clear and stop drawing. */
  update(dt: number, intensity: number): void {
    const g = this.g;
    if (intensity <= 0.01) {
      if (this.visible) g.clearRect(0, 0, this.width, this.height);
      this.visible = false;
      return;
    }
    this.visible = true;
    g.clearRect(0, 0, this.width, this.height);

    const cx = this.width / 2;
    const cy = this.height * 0.42;
    const reach = Math.hypot(this.width, this.height) * 0.6;
    // Keep the middle clear so the lines frame the runner instead of covering it.
    const inner = Math.min(this.width, this.height) * 0.38;
    g.lineCap = 'round';
    g.strokeStyle = '#ffffff';
    g.lineWidth = Math.max(1.5, this.width / 320);

    for (const s of this.streaks) {
      s.progress += dt * s.speed * (0.8 + intensity * 1.6);
      if (s.progress > 1) {
        s.progress -= 1;
        s.angle = Math.random() * Math.PI * 2;
      }
      const r0 = inner + s.progress * reach;
      const r1 = r0 + 30 + s.progress * 90 * intensity;
      g.globalAlpha = Math.min(1, s.progress * 1.5) * 0.55 * intensity;
      g.beginPath();
      g.moveTo(cx + Math.cos(s.angle) * r0, cy + Math.sin(s.angle) * r0);
      g.lineTo(cx + Math.cos(s.angle) * r1, cy + Math.sin(s.angle) * r1);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private resize(): void {
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.width = this.canvas.width = Math.round(window.innerWidth * ratio);
    this.height = this.canvas.height = Math.round(window.innerHeight * ratio);
  }
}
