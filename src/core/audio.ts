/**
 * Sound.
 *
 * Out of the box this synthesises short blips with the Web Audio API, so the
 * game ships with no audio files and still has feedback. When you want real
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

/** Map a sound key to a file in public/sounds/. Leave blank to use the blip. */
const SOUND_FILES: Partial<Record<SoundKey, string>> = {
  // coin: 'coin.mp3',
};

/** Synthesised fallbacks: [start Hz, end Hz, seconds, waveform, volume]. */
const BLIPS: Record<SoundKey, [number, number, number, OscillatorType, number]> = {
  coin: [1046, 1568, 0.08, 'square', 0.35],
  jump: [300, 640, 0.13, 'sine', 0.7],
  slide: [500, 160, 0.16, 'triangle', 0.6],
  lane: [420, 520, 0.05, 'sine', 0.35],
  turn: [260, 780, 0.16, 'triangle', 0.6],
  perfect: [660, 1760, 0.26, 'triangle', 0.7],
  close: [880, 1320, 0.14, 'sawtooth', 0.3],
  stumble: [220, 70, 0.3, 'sawtooth', 0.8],
  portal: [300, 1400, 0.6, 'sine', 0.8],
  caught: [180, 40, 0.8, 'sawtooth', 0.9],
  fall: [600, 80, 0.9, 'sine', 0.8],
  start: [392, 784, 0.25, 'triangle', 0.6],
};

export class Audio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master: GainNode | null = null;
  muted = false;

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

    const [from, to, duration, type, volume] = BLIPS[key];
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to * pitch, 1), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
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
