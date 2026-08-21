import { describe, expect, it } from "vitest";
import { PERF } from "../src/perf";

describe("LRM-1613 perf budget", () => {
  it("caps lights, stream radius, and disables soft-shadow defaults", () => {
    expect(PERF.maxTorchLights).toBeLessThanOrEqual(8);
    expect(PERF.streamChunkRadius).toBeLessThanOrEqual(2);
    expect(PERF.visibleChunkRadius).toBeLessThanOrEqual(PERF.streamChunkRadius);
    expect(PERF.shadowMap).toBe(false);
    expect(PERF.sunCastShadow).toBe(false);
    expect(PERF.maxPixelRatio).toBeLessThanOrEqual(1.5);
  });
});
