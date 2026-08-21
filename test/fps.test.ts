import { describe, expect, it } from "vitest";
import { FPS_SAMPLE_MS, createFpsSample, tickFps } from "../src/fps";

describe("LRM-1614 FPS sampler", () => {
  it("does not emit a label until the sample window elapses (avoids per-frame DOM writes)", () => {
    const sample = createFpsSample(0);
    expect(tickFps(sample, 100)).toBeNull();
    expect(tickFps(sample, 250)).toBeNull();
    expect(tickFps(sample, FPS_SAMPLE_MS - 1)).toBeNull();
    expect(sample.frames).toBe(3);
  });

  it("reports rounded FPS over the window and resets the counter", () => {
    const sample = createFpsSample(1000);
    for (let i = 0; i < 30; i += 1) tickFps(sample, 1000 + i);
    const label = tickFps(sample, 1000 + FPS_SAMPLE_MS);
    expect(label).toBe("62 FPS"); // 31 frames / 0.5s
    expect(sample.frames).toBe(0);
    expect(sample.windowStart).toBe(1000 + FPS_SAMPLE_MS);
  });

  it("keeps the default window at 500ms for low overhead", () => {
    expect(FPS_SAMPLE_MS).toBe(500);
  });
});
