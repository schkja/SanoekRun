/**
 * Music, generated in code: no audio files, no licences to worry about.
 *
 * A tiny studio in Web Audio: pumping pads, a punchy bass, a bright
 * supersaw or sparkly marimba lead (FM synthesis), driving drums, all through
 * a compressor, a short reverb and an echo, so it sounds energetic and modern
 * rather than like an 8-bit console. Each style is a 4-bar song: four chords,
 * a bass line and a 64-step hook.
 *
 * The game raises the number of layers as the run speeds up:
 *   1 pads and kick · 2 bass · 3 drums and arpeggio · 4 melody
 * so the music builds with the tension.
 *
 * To add a style: add an entry to SONGS and a label in settings.ts.
 */

import type { Audio } from './audio';
import type { MusicStyle } from '../game/settings';

type Drums = 'drive' | 'bounce' | 'soft';

interface Song {
  bpm: number;
  /** MIDI note of the key's root. */
  root: number;
  /** One chord per bar: intervals from the root (pads and arpeggio). */
  chords: number[][];
  /** One bass note per bar, semitones from the root. */
  bass: number[];
  /** Bass rhythm: which 16th steps of a bar the bass plays on. */
  bassSteps: number[];
  /** 64 steps (4 bars) of melody, semitones above the root; -1 is a rest. */
  melody: number[];
  drums: Drums;
  /** Lead sound: a bright detuned "supersaw" or a sparkly marimba pluck. */
  lead: 'saw' | 'pluck';
  /** Arpeggio speed in 16ths (1 = every 16th, 2 = every 8th). */
  arp: 1 | 2;
  /** Swing amount for off-beat 16ths, 0..0.3. */
  swing: number;
}

const _ = -1;

export const SONGS: Record<Exclude<MusicStyle, 'off'>, Song> = {
  // Driving chase, A minor: Am F C G at 150 bpm. Four-on-the-floor kick,
  // rolling bass, 16th arpeggio and a bright supersaw hook.
  chase: {
    bpm: 150,
    root: 57,
    chords: [[0, 3, 7, 12], [-4, 0, 3, 8], [-9, -5, -2, 3], [-2, 2, 5, 10]],
    bass: [0, -4, 3, -2],
    bassSteps: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
    melody: [
      12, _, 10, _, 7, _, 10, _, 12, _, 15, _, 12, _, 10, _,
      12, _, 8, _, 7, _, 8, _, 12, _, 15, _, 17, _, 15, _,
      15, _, 14, _, 10, _, 7, _, 10, _, 14, _, 15, _, 14, _,
      14, _, 12, _, 10, _, 7, _, 5, _, 7, _, 10, _, 14, _,
    ],
    drums: 'drive',
    lead: 'saw',
    arp: 1,
    swing: 0,
  },
  // Bouncy and cheerful, C major: C G Am F at 132 bpm, shuffled.
  hop: {
    bpm: 132,
    root: 60,
    chords: [[0, 4, 7, 12], [-5, -1, 2, 7], [-3, 0, 4, 9], [-7, -3, 0, 5]],
    bass: [0, -5, -3, -7],
    bassSteps: [0, 3, 6, 8, 11, 14],
    melody: [
      12, _, 7, _, 9, 12, _, 14, 16, _, 14, 12, _, 9, 7, _,
      11, _, 7, _, 14, _, 11, 14, 19, _, 17, _, 14, _, 11, _,
      12, _, 16, _, 21, _, 19, 16, _, 16, 12, _, 9, _, 11, 12,
      12, _, 9, _, 5, _, 9, 12, _, 14, 16, _, 19, _, 17, 16,
    ],
    drums: 'bounce',
    lead: 'pluck',
    arp: 2,
    swing: 0.14,
  },
  // Title screen: friendly and moving, but not hectic. Fmaj7 Em7 Dm7 Cmaj7.
  menu: {
    bpm: 104,
    root: 60,
    chords: [[5, 9, 12, 16], [4, 7, 11, 14], [2, 5, 9, 12], [0, 4, 7, 11]],
    bass: [5, 4, 2, 0],
    bassSteps: [0, 6, 8, 14],
    melody: [
      16, _, 14, _, 12, _, 9, _, 12, _, _, _, 16, _, _, _,
      14, _, 12, _, 11, _, 7, _, 11, _, _, _, 14, _, _, _,
      12, _, 14, _, 16, _, 17, _, 19, _, _, _, 16, _, _, _,
      16, _, 14, _, 12, _, 11, _, 12, _, _, _, _, _, _, _,
    ],
    drums: 'soft',
    lead: 'pluck',
    arp: 2,
    swing: 0.08,
  },
};

const hz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

export class Music {
  private style: Exclude<MusicStyle, 'off'> | null = null;
  private layers = 2;
  private step = 0;
  private next = 0;
  private timer = 0;
  private bus: GainNode | null = null;
  private reverb: GainNode | null = null;
  private echo: GainNode | null = null;
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

  /** 1..4: more layers as the run gets faster. */
  setLayers(layers: number): void {
    this.layers = Math.max(1, Math.min(4, Math.round(layers)));
  }

  /** The studio: a bus with a soft compressor, plus a reverb and an echo send. */
  private setup(ctx: AudioContext): void {
    if (this.bus) return;
    const out = this.audio.output!;
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    glue.connect(out);

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.7;
    this.bus.connect(glue);

    // Reverb: a convolver fed with two seconds of decaying stereo noise.
    const room = ctx.createConvolver();
    const length = Math.floor(ctx.sampleRate * 2.2);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const data = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
    }
    room.buffer = impulse;
    this.reverb = ctx.createGain();
    this.reverb.gain.value = 0.18;
    this.reverb.connect(room).connect(glue);

    // Echo: a dotted-eighth delay that feeds back softly, darker each repeat.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = (60 / 150) * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    this.echo = ctx.createGain();
    this.echo.gain.value = 0.22;
    this.echo.connect(delay).connect(tone).connect(feedback).connect(delay);
    tone.connect(glue);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  private schedule = (): void => {
    const ctx = this.audio.context;
    if (!ctx || !this.style) return;
    const song = SONGS[this.style];
    const sixteenth = 60 / song.bpm / 4;
    // Never fall behind after the tab was hidden: skip ahead instead of catching up.
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.15) {
      const swing = this.step % 2 === 1 ? song.swing * sixteenth : 0;
      this.playStep(ctx, song, this.next + swing, this.step, sixteenth);
      this.step = (this.step + 1) % 64;
      this.next += sixteenth;
    }
  };

  private playStep(ctx: AudioContext, s: Song, t: number, i: number, sixteenth: number): void {
    const L = this.layers;
    const bar = Math.floor(i / 16);
    const inBar = i % 16;
    const chord = s.chords[bar];
    const beat = sixteenth * 4;

    // 1: pads (pumping with the kick) and the kick.
    if (inBar === 0) for (const n of chord) this.pad(ctx, t, hz(s.root + n), beat * 4.02, beat, s.drums !== 'soft');
    if (s.drums === 'drive' && inBar % 4 === 0) this.kick(ctx, t, 0.95);
    if (s.drums === 'bounce' && (inBar === 0 || inBar === 6 || inBar === 8 || inBar === 14)) this.kick(ctx, t, inBar % 8 === 0 ? 0.9 : 0.55);
    if (s.drums === 'soft' && (inBar === 0 || inBar === 8)) this.kick(ctx, t, 0.6);

    // 2: bass, jumping an octave on the off-beats.
    if (L >= 2 && s.bassSteps.includes(inBar)) {
      const octave = inBar % 4 === 2 || inBar % 4 === 3 ? 12 : 0;
      this.bassNote(ctx, t, hz(s.root - 24 + s.bass[bar] + octave), sixteenth * 1.6);
    }

    // 3: drums and the arpeggio.
    if (L >= 3) {
      if (s.drums !== 'soft' && (inBar === 4 || inBar === 12)) this.clap(ctx, t, s.drums === 'drive' ? 0.9 : 0.7);
      if (s.drums === 'drive') this.hat(ctx, t, inBar % 4 === 2 ? 0.2 : inBar % 2 === 0 ? 0.06 : 0.1);
      else if (inBar % 2 === 1) this.hat(ctx, t, inBar % 4 === 3 ? 0.14 : 0.06);
      if (inBar % s.arp === 0) {
        const k = (inBar / s.arp) % 8;
        const n = chord[[0, 1, 2, 3, 2, 1, 2, 3][k] % chord.length] + 12;
        this.pluck(ctx, t, hz(s.root + n), s.arp === 1 ? 0.045 : 0.06, 1.4, sixteenth * 2.5);
      }
    }

    // 4: the hook.
    if (L >= 4) {
      const m = s.melody[i];
      if (m >= 0) {
        if (s.lead === 'saw') this.supersaw(ctx, t, hz(s.root + 12 + m), sixteenth * 1.8);
        else this.pluck(ctx, t, hz(s.root + 12 + m), 0.17, 2.2, 0.45, true);
      }
    }
  }

  /**
   * Bright lead: three detuned saws through a filter that opens on each
   * note, so it cuts through with energy. A touch of echo.
   */
  private supersaw(ctx: AudioContext, t: number, f: number, d: number): void {
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(5200, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.03, t + d * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.08);
    for (const cents of [-14, 0, 14]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(filter);
      o.start(t);
      o.stop(t + d + 0.12);
    }
    filter.connect(g);
    g.connect(this.bus!);
    g.connect(this.echo!);
    g.connect(this.reverb!);
  }

  /**
   * Warm pad: two slightly detuned saws through a soft low-pass. With `pump`
   * it ducks on every beat and swells back, the "breathing" of dance music.
   */
  private pad(ctx: AudioContext, t: number, f: number, d: number, beat: number, pump: boolean): void {
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    filter.Q.value = 0.5;
    const level = 0.02;
    g.gain.setValueAtTime(0.0001, t);
    if (pump) {
      for (let k = 0; k * beat < d - 0.01; k++) {
        const b = t + k * beat;
        g.gain.setValueAtTime(level * 0.15, b);
        g.gain.linearRampToValueAtTime(level, b + beat * 0.6);
      }
    } else {
      g.gain.linearRampToValueAtTime(level, t + 0.3);
    }
    g.gain.setValueAtTime(level, t + d - 0.08);
    g.gain.linearRampToValueAtTime(0.0001, t + d);
    for (const cents of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(filter);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    filter.connect(g);
    g.connect(this.bus!);
    g.connect(this.reverb!);
  }

  /** Round plucked bass: sine plus a little triangle, quick filter close. */
  private bassNote(ctx: AudioContext, t: number, f: number, d: number): void {
    const g = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    for (const [type, level] of [['sine', 1], ['triangle', 0.45]] as const) {
      const o = ctx.createOscillator();
      const lg = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      lg.gain.value = level;
      o.connect(lg).connect(filter);
      o.start(t);
      o.stop(t + d + 0.05);
    }
    filter.connect(g).connect(this.bus!);
  }

  /**
   * Marimba-like pluck with FM synthesis: a sine whose tone is shaped by a
   * second sine at 4× the pitch, fading fast, so the attack sparkles and the
   * tail is pure and round.
   */
  private pluck(ctx: AudioContext, t: number, f: number, v: number, shine: number, d: number, echo = false): void {
    const carrier = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const depth = ctx.createGain();
    const g = ctx.createGain();
    carrier.type = 'sine';
    carrier.frequency.value = f;
    mod.type = 'sine';
    mod.frequency.value = f * 4;
    depth.gain.setValueAtTime(f * shine, t);
    depth.gain.exponentialRampToValueAtTime(f * 0.01, t + 0.25);
    mod.connect(depth).connect(carrier.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    carrier.connect(g);
    g.connect(this.bus!);
    g.connect(this.reverb!);
    if (echo) g.connect(this.echo!);
    carrier.start(t);
    mod.start(t);
    carrier.stop(t + d + 0.05);
    mod.stop(t + d + 0.05);
  }

  /** Punchy kick: a sine dropping fast in pitch. */
  private kick(ctx: AudioContext, t: number, v: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.bus!);
    o.start(t);
    o.stop(t + 0.35);
  }

  /** Clap: a few quick bursts of band-passed noise, with some room. */
  private clap(ctx: AudioContext, t: number, v = 0.7): void {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    for (const k of [0, 0.012, 0.024]) {
      g.gain.setValueAtTime(v * 0.35, t + k);
      g.gain.exponentialRampToValueAtTime(0.02, t + k + 0.01);
    }
    g.gain.setValueAtTime(v * 0.3, t + 0.036);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    s.connect(f).connect(g);
    g.connect(this.bus!);
    g.connect(this.reverb!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.25);
  }

  /** Hi-hat: a short tick of high noise. */
  private hat(ctx: AudioContext, t: number, v: number): void {
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 8000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    s.connect(f).connect(g).connect(this.bus!);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }
}
