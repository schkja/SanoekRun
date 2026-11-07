/**
 * Sound.
 *
 * Out of the box this synthesises soft, musical sound effects with the Web
 * Audio API (chimes, wooden tocks, whooshes), so the game ships with no audio
 * files. When you want real
 * sounds, drop .mp3/.ogg files into `public/sounds/` and list them in
 * `SOUND_FILES` below — the file wins over the synthesised blip automatically.
 */

export type SoundKey =
  | 'coin'
  | 'jump'
  | 'slide'
  | 'lane'
  | 'turn'
  | 'perfect'
  | 'close'
  | 'stumble'
  | 'portal'
  | 'caught'
  | 'fall'
  | 'start';

/** Map a sound key to a file in public/sounds/. Leave blank to use the synthesised sound. */
const SOUND_FILES: Partial<Record<SoundKey, string>> = {
  // coin: 'coin.mp3',
};

/** Notes of a major pentatonic scale, for coin streaks that climb in tune. */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const semitone = (n: number) => Math.pow(2, n / 12);

export class Audio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  /** Which pick-up sound plays for 'coin': a coin chime or a wooden acorn "tok". */
  collect: 'coin' | 'acorn' | 'honey' = 'coin';

  /**
   * Browsers block audio until the user interacts with the page, so this is
   * called from the first tap/keypress rather than at start-up.
   */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.25;
    this.master.connect(this.ctx.destination);
    void this.preload();
  }

  /** The audio context and the main output, once sound is unlocked. Music plays through these. */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get output(): GainNode | null {
    return this.master;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.25;
  }

  /** `pitch` scales the blip's frequency — coin streaks climb with it. */
  play(key: SoundKey, pitch = 1): void {
    if (!this.ctx || !this.master || this.muted) return;

    const buffer = this.buffers.get(key);
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = pitch;
      source.connect(this.master);
      source.start();
      return;
    }

    this.synth(key, pitch, this.ctx.currentTime + 0.005);
  }

  /**
   * Soft, musical sound effects built from three ingredients: bell-like FM
   * tones, gentle sine tones, and filtered "whooshes" of noise. Everything is
   * in tune with the music's keys (C/A), so pick-ups sound like part of it.
   */
  private synth(key: SoundKey, pitch: number, t: number): void {
    const N = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);
    switch (key) {
      case 'coin': {
        // Climb a pentatonic scale with the streak instead of sliding pitch.
        const step = PENTATONIC[Math.min(PENTATONIC.length - 1, Math.max(0, Math.round((pitch - 1) / 0.06)))];
        const up = semitone(step);
        if (this.collect === 'honey') {
          // A sweet little "bloop": a round tone gliding up, then a soft bell.
          this.tone(t, N(72) * up, N(79) * up, 0.12, 0.2, 'sine');
          this.bell(t + 0.07, N(84) * up, 0.1, 0.25, 2, 0.6);
        } else if (this.collect === 'acorn') {
          // A wooden "tok-tok", like a nut dropping on a log.
          this.bell(t, N(76) * up, 0.22, 0.18, 4, 0.9);
          this.bell(t + 0.06, N(81) * up, 0.18, 0.22, 4, 0.7);
        } else {
          // A bright two-note chime.
          this.bell(t, N(88) * up, 0.12, 0.25, 3, 1.4);
          this.bell(t + 0.07, N(95) * up, 0.14, 0.35, 3, 1.2);
        }
        break;
      }
      case 'jump':
        this.whoosh(t, 600, 2600, 0.2, 0.2);
        this.tone(t, N(67), N(74), 0.14, 0.12, 'sine');
        break;
      case 'slide':
        this.whoosh(t, 2200, 380, 0.28, 0.28);
        break;
      case 'lane':
        this.whoosh(t, 1800, 3200, 0.08, 0.08);
        break;
      case 'turn':
        this.whoosh(t, 900, 2400, 0.16, 0.14);
        this.bell(t + 0.02, N(79), 0.08, 0.2, 2, 0.8);
        break;
      case 'perfect':
        [84, 88, 91, 96].forEach((n, i) => this.bell(t + i * 0.045, N(n), 0.11, 0.35, 3, 1.1));
        break;
      case 'close':
        this.whoosh(t, 3000, 900, 0.18, 0.16);
        this.bell(t + 0.05, N(93), 0.08, 0.25, 3, 1);
        break;
      case 'stumble':
        // A soft cartoon "bonk".
        this.tone(t, N(55), N(43), 0.16, 0.3, 'triangle');
        this.thud(t, 0.35);
        break;
      case 'portal':
        [72, 76, 79, 84, 88, 91].forEach((n, i) => this.bell(t + i * 0.06, N(n), 0.1, 0.6, 2, 0.9));
        this.whoosh(t, 400, 4000, 0.6, 0.12);
        break;
      case 'caught':
        // "Womp womp": two sad notes sliding down.
        this.tone(t, N(62), N(60), 0.28, 0.22, 'triangle', true);
        this.tone(t + 0.3, N(59), N(52), 0.5, 0.22, 'triangle', true);
        break;
      case 'fall':
        // A slide whistle down.
        this.tone(t, N(84), N(55), 0.8, 0.16, 'sine', true);
        break;
      case 'start':
        [72, 76, 79, 84].forEach((n, i) => this.bell(t + i * 0.08, N(n), 0.12, 0.5, 2, 0.9));
        break;
    }
  }

  /** FM bell/marimba: a sine coloured by a second sine (`ratio` × pitch) that fades fast. */
  private bell(t: number, f: number, v: number, d: number, ratio: number, shine: number): void {
    const ctx = this.ctx!;
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    carrier.frequency.value = f;
    mod.frequency.value = f * ratio;
    depth.gain.setValueAtTime(f * shine, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.01, t + d * 0.6);
    mod.connect(depth).connect(carrier.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    carrier.connect(g).connect(this.master!);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + d + 0.05);
    mod.stop(t + d + 0.05);
  }

  /** A plain tone gliding from one pitch to another, optionally with a wobble. */
  private tone(t: number, from: number, to: number, d: number, v: number, type: OscillatorType, wobble = false): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + d);
    if (wobble) {
      const lfo = ctx.createOscillator();
      const amount = ctx.createGain();
      lfo.frequency.value = 7;
      amount.gain.value = from * 0.02;
      lfo.connect(amount).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + d + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.015);
    g.gain.setValueAtTime(v, t + d * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + d + 0.05);
  }

  /** Air moving: noise through a band-pass that sweeps from one pitch to another. */
  private whoosh(t: number, from: number, to: number, d: number, v: number): void {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuffer();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + d);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + d * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(this.master!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + d + 0.05);
  }

  /** A soft low thump. */
  private thud(t: number, v: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + 0.25);
  }

  private noiseBuffer(): AudioBuffer {
    if (!this.noise) {
      const ctx = this.ctx!;
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noise;
  }

  private async preload(): Promise<void> {
    for (const [key, file] of Object.entries(SOUND_FILES)) {
      if (!file || !this.ctx) continue;
      try {
        const response = await fetch(`sounds/${file}`);
        const bytes = await response.arrayBuffer();
        this.buffers.set(key, await this.ctx.decodeAudioData(bytes));
      } catch {
        console.warn(`[audio] Could not load sounds/${file}. Falling back to a synth blip.`);
      }
    }
  }
}
