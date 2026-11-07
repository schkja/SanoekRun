/**
 * Music, generated in code — no audio files, no licences to worry about.
 *
 * Each style is a short looping pattern played by a tiny step sequencer.
 * The game raises the number of layers as the run speeds up:
 *   1 drums · 2 bass · 3 hi-hats · 4 melody
 * so the music literally builds with the tension.
 *
 * To add a style: add an entry to STYLES and a label in settings.ts.
 */

import type { Audio } from './audio';
import type { MusicStyle } from '../game/settings';

interface Pattern {
  bpm: number;
  /** MIDI note of the key's root. */
  root: number;
  /** Bass notes (semitones from the root), one per beat, looping. */
  bass: number[];
  /** 16 steps of melody, semitones from the root; -1 is a rest. */
  melody: number[];
  lead: OscillatorType;
  bassWave: OscillatorType;
  snare: boolean;
  /** Long soft chords instead of a busy groove. */
  pads: boolean;
}

const STYLES: Record<Exclude<MusicStyle, 'off'>, Pattern> = {
  chase: {
    bpm: 150,
    root: 57,
    bass: [0, 0, 3, 5],
    melody: [12, 10, 7, 10, 12, 15, 12, 10, 7, 5, 7, 10, 7, 5, 3, 5],
    lead: 'square',
    bassWave: 'sawtooth',
    snare: true,
    pads: false,
  },
  hop: {
    bpm: 118,
    root: 60,
    bass: [0, 0, 7, 5],
    melody: [0, 2, 4, 7, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 2],
    lead: 'triangle',
    bassWave: 'triangle',
    snare: false,
    pads: false,
  },
  menu: {
    bpm: 88,
    root: 62,
    bass: [0, 5, 7, 3],
    melody: [7, -1, 4, -1, 9, -1, 7, -1, 4, -1, 2, -1, 4, -1, -1, -1],
    lead: 'sine',
    bassWave: 'triangle',
    snare: false,
    pads: true,
  },
};

const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export class Music {
  private style: Exclude<MusicStyle, 'off'> | null = null;
  private layers = 2;
  private step = 0;
  private next = 0;
  private timer = 0;
  private gain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private readonly audio: Audio) {}

  /** Start (or switch to) a style. 'off' stops the music. */
  play(style: MusicStyle): void {
    if (style === 'off') {
      this.stop();
      return;
    }
    const ctx = this.audio.context;
    if (!ctx) return;
    if (this.style === style && this.timer) return;
    this.setup(ctx);
    this.style = style;
    this.step = 0;
    this.next = ctx.currentTime + 0.06;
    if (!this.timer) this.timer = window.setInterval(this.schedule, 25);
  }

  stop(): void {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.style = null;
  }

  get playing(): boolean {
    return this.timer !== 0;
  }

  /** 1..4 — more layers as the run gets faster. */
  setLayers(layers: number): void {
    this.layers = Math.max(1, Math.min(4, Math.round(layers)));
  }

  private setup(ctx: AudioContext): void {
    if (this.gain) return;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.55;
    this.gain.connect(this.audio.output!);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  private schedule = (): void => {
    const ctx = this.audio.context;
    if (!ctx || !this.style) return;
    const pattern = STYLES[this.style];
    const sixteenth = 60 / pattern.bpm / 4;
    // Never fall behind after the tab was hidden: skip ahead instead of catching up.
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.12) {
      this.playStep(ctx, pattern, this.next, this.step);
      this.step = (this.step + 1) % 64;
      this.next += sixteenth;
    }
  };

  private playStep(ctx: AudioContext, p: Pattern, t: number, i: number): void {
    const L = this.layers;
    if (L >= 1) {
      if (i % 4 === 0) this.tone(ctx, t, 150, 0.18, 'sine', 0.9, 45);
      if (p.snare && i % 8 === 4) this.hiss(ctx, t, 0.12, 0.5, 1500);
    }
    if (L >= 2 && i % 2 === 0) {
      const b = p.bass[Math.floor(i / 4) % p.bass.length];
      this.tone(ctx, t, hz(p.root - 24 + b), p.pads ? 0.5 : 0.16, p.bassWave, p.pads ? 0.25 : 0.33);
    }
    if (L >= 2 && p.pads && i % 16 === 0) {
      const b = p.bass[Math.floor(i / 16) % p.bass.length];
      for (const n of [0, 4, 7]) this.tone(ctx, t, hz(p.root - 12 + n + b), 2.2, 'sine', 0.08);
    }
    if (L >= 3 && (!p.pads || i % 4 === 2)) this.hiss(ctx, t, 0.04, i % 4 === 2 ? 0.28 : 0.11, 7000);
    if (L >= 4) {
      const m = p.melody[i % 16];
      if (m >= 0) this.tone(ctx, t, hz(p.root + m), p.pads ? 0.6 : 0.14, p.lead, p.lead === 'square' ? 0.11 : 0.2);
    }
  }

  private tone(ctx: AudioContext, t: number, f: number, d: number, type: OscillatorType, v: number, slide?: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + d + 0.02);
  }

  private hiss(ctx: AudioContext, t: number, d: number, v: number, highpass: number): void {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = highpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(this.gain!);
    s.start(t);
    s.stop(t + d + 0.02);
  }
}
