import { describe, expect, it } from "vitest";
import manifest from "../assets/viewmodel/manifest.json";
import { CRACK_STAGES, crackStageForProgress } from "../src/viewmodel";

const assetUrls = import.meta.glob("../assets/viewmodel/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const resolveAsset = (name: string): string | undefined => {
  const suffix = `/${name}`;
  return Object.entries(assetUrls).find(([path]) => path.endsWith(suffix))?.[1];
};

describe("LRM-1605 viewmodel assets", () => {
  it("ships hand, sleeve, and 10 destroy stages + manifest", () => {
    expect(manifest.crack_stages).toBe(CRACK_STAGES);
    expect(manifest.textures.hand_skin).toBe("hand_skin.png");
    expect(manifest.textures.sleeve).toBe("sleeve.png");
    expect(manifest.textures.destroy_stages).toHaveLength(CRACK_STAGES);
    expect(resolveAsset("hand_skin.png")).toBeTruthy();
    expect(resolveAsset("sleeve.png")).toBeTruthy();
    for (let i = 0; i < CRACK_STAGES; i += 1) {
      expect(resolveAsset(`destroy_stage_${i}.png`)).toBeTruthy();
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
