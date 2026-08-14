export const SOUND_EFFECTS = ["break", "place", "craft", "hit", "hurt", "pickup", "respawn", "jump"] as const;
export type SoundEffect = (typeof SOUND_EFFECTS)[number];

type ToneProfile = {
  startFrequency: number;
  endFrequency: number;
  duration: number;
  volume: number;
  wave: OscillatorType;
};

const PROFILES: Record<SoundEffect, ToneProfile> = {
  break: { startFrequency: 135, endFrequency: 82, duration: 0.075, volume: 0.045, wave: "square" },
  place: { startFrequency: 180, endFrequency: 112, duration: 0.09, volume: 0.04, wave: "triangle" },
  craft: { startFrequency: 420, endFrequency: 680, duration: 0.16, volume: 0.04, wave: "triangle" },
  hit: { startFrequency: 175, endFrequency: 76, duration: 0.11, volume: 0.055, wave: "sawtooth" },
  hurt: { startFrequency: 108, endFrequency: 64, duration: 0.14, volume: 0.05, wave: "square" },
  pickup: { startFrequency: 510, endFrequency: 760, duration: 0.12, volume: 0.035, wave: "sine" },
  respawn: { startFrequency: 245, endFrequency: 520, duration: 0.28, volume: 0.04, wave: "sine" },
  jump: { startFrequency: 250, endFrequency: 170, duration: 0.075, volume: 0.03, wave: "triangle" },
};

/** Pure profile lookup so the sound palette remains testable without a browser. */
export const soundProfile = (effect: SoundEffect): Readonly<ToneProfile> => PROFILES[effect];

/**
 * Small, original synthesized feedback sounds. The context is created only
 * after a player gesture; unsupported or muted browsers silently do nothing.
 */
export class Soundscape {
  private context: AudioContext | undefined;
  private enabled = true;

  get isEnabled(): boolean { return this.enabled; }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  unlock(): void {
    if (!this.enabled) return;
    if (!this.context) {
      if (!window.AudioContext) return;
      this.context = new window.AudioContext();
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  play(effect: SoundEffect): void {
    if (!this.enabled) return;
    this.unlock();
    const context = this.context;
    if (!context || context.state !== "running") return;
    const profile = soundProfile(effect);
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = profile.wave;
    oscillator.frequency.setValueAtTime(profile.startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, profile.endFrequency), now + profile.duration);
    gain.gain.setValueAtTime(profile.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + profile.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + profile.duration);
  }
}
