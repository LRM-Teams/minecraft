import { describe, expect, it } from "vitest";
import {
  PERF_PRESETS,
  chunkIdOf,
  nextPerfPreset,
  parseChunkId,
  persistPerfPreset,
  resolvePerfPreset,
} from "../src/perf";

describe("perf presets (LRM-1613)", () => {
  it("defaults to balanced with shadows off and capped torch lights", () => {
    const store = { getItem: () => null };
    const cfg = resolvePerfPreset("", store);
    expect(cfg.id).toBe("balanced");
    expect(cfg.shadowsEnabled).toBe(false);
    expect(cfg.maxTorchLights).toBeLessThanOrEqual(8);
    expect(cfg.maxChunkBuildsPerFrame).toBeGreaterThan(0);
    expect(cfg.maxChunkGensPerFrame).toBeGreaterThan(0);
    expect(cfg.meshChunkRadius).toBeLessThanOrEqual(cfg.streamChunkRadius);
    expect(cfg.meshChunkRadius).toBeLessThanOrEqual(1);
    expect(cfg.torchSyncEveryMs).toBeGreaterThan(0);
  });

  it("honors ?perf= query over storage", () => {
    const store = {
      getItem: () => "quality",
      setItem: () => undefined,
    };
    expect(resolvePerfPreset("?perf=performance", store).id).toBe("performance");
    expect(PERF_PRESETS.performance.shadowsEnabled).toBe(false);
    expect(PERF_PRESETS.quality.shadowsEnabled).toBe(true);
    expect(PERF_PRESETS.quality.maxTorchLights).toBe(14);
  });

  it("cycles presets and persists", () => {
    expect(nextPerfPreset("performance")).toBe("balanced");
    expect(nextPerfPreset("balanced")).toBe("quality");
    expect(nextPerfPreset("quality")).toBe("performance");
    const mem: Record<string, string> = {};
    persistPerfPreset("performance", { setItem: (k, v) => { mem[k] = v; } });
    expect(mem["voxel-atelier-perf"]).toBe("performance");
  });

  it("round-trips chunk ids", () => {
    expect(chunkIdOf(-2, 3)).toBe("-2,3");
    expect(parseChunkId("-2,3")).toEqual({ cx: -2, cz: 3 });
  });
});
