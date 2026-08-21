import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CRACK_STAGES, crackStageForProgress } from "../src/viewmodel";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const viewmodelDir = join(root, "assets", "viewmodel");

describe("LRM-1605 viewmodel assets", () => {
  it("ships hand, sleeve, and 10 destroy stages + manifest", () => {
    const manifest = JSON.parse(readFileSync(join(viewmodelDir, "manifest.json"), "utf8"));
    expect(manifest.crack_stages).toBe(CRACK_STAGES);
    expect(manifest.textures.hand_skin).toBe("hand_skin.png");
    expect(manifest.textures.sleeve).toBe("sleeve.png");
    expect(manifest.textures.destroy_stages).toHaveLength(CRACK_STAGES);
    expect(existsSync(join(viewmodelDir, "hand_skin.png"))).toBe(true);
    expect(existsSync(join(viewmodelDir, "sleeve.png"))).toBe(true);
    for (let i = 0; i < CRACK_STAGES; i += 1) {
      expect(existsSync(join(viewmodelDir, `destroy_stage_${i}.png`))).toBe(true);
    }
  });

  it("maps mining progress to destroy stages 0..9", () => {
    expect(crackStageForProgress(0)).toBe(-1);
    expect(crackStageForProgress(0.01)).toBe(0);
    expect(crackStageForProgress(0.5)).toBe(5);
    expect(crackStageForProgress(0.99)).toBe(9);
    expect(crackStageForProgress(1)).toBe(9);
  });
});
