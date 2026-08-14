import { describe, expect, it } from "vitest";
import { SOUND_EFFECTS, soundProfile } from "../src/sound";

describe("sound palette", () => {
  it("defines a short, audible profile for every game feedback event", () => {
    SOUND_EFFECTS.forEach((effect) => {
      const profile = soundProfile(effect);
      expect(profile.startFrequency).toBeGreaterThan(0);
      expect(profile.endFrequency).toBeGreaterThan(0);
      expect(profile.duration).toBeGreaterThan(0);
      expect(profile.duration).toBeLessThan(0.5);
      expect(profile.volume).toBeGreaterThan(0);
    });
  });

  it("uses distinguishable upward cues for crafting and pickups", () => {
    expect(soundProfile("craft").endFrequency).toBeGreaterThan(soundProfile("craft").startFrequency);
    expect(soundProfile("pickup").endFrequency).toBeGreaterThan(soundProfile("pickup").startFrequency);
  });
});
