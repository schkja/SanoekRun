/**
 * Sound.
 *
 * Out of the box this synthesises short blips with the Web Audio API, so the
 * template ships with no audio files and still has feedback. When you want real
 * sounds, drop .mp3/.ogg files into `public/sounds/` and list them in
 * `SOUND_FILES` below — the file wins over the synthesised blip automatically.
 */

type SoundKey = 'coin' | 'gem' | 'jump' | 'stomp' | 'hurt' | 'power' | 'goal' | 'die';

/** Map a sound key to a file in public/sounds/. Leave blank to use the blip. */
const SOUND_FILES: Partial<Record<SoundKey, string>> = {
  // coin: 'coin.mp3',
};

/** Synthesised fallbacks: [start Hz, end Hz, seconds, waveform]. */
const BLIPS: Record<SoundKey, [number, number, number, OscillatorType]> = {
  coin: [880, 1320, 0.09, 'square'],
  gem: [660, 1760, 0.22, 'triangle'],
  jump: [320, 620, 0.12, 'sine'],
  stomp: [420, 120, 0.14, 'square'],
  hurt: [300, 90, 0.26, 'sawtooth'],
  power: [440, 1200, 0.3, 'triangle'],
  goal: [520, 1040, 0.4, 'sine'],
  die: [400, 60, 0.6, 'sawtooth'],
};

export class Audio {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private master: GainNode | null = null;
  muted = false;

  /**
   * Browsers block audio until the user interacts with the page, so this is
   * called from the first click/keypress rather than at start-up.
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
    this.master.gain.value = 0.25;
    this.master.connect(this.ctx.destination);
    void this.preload();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.25;
    return this.muted;
  }

  play(key: string | undefined): void {
    if (!key || !this.ctx || !this.master || this.muted) return;
    const sound = key as SoundKey;

    const buffer = this.buffers.get(sound);
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master);
      source.start();
      return;
    }

    const blip = BLIPS[sound];
    if (!blip) return;
    const [from, to, duration, type] = blip;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), now + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.01);
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
