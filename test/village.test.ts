import { describe, expect, it } from "vitest";
import { VoxelWorld } from "../src/world";

describe("villages", () => {
  it("generates the same plains settlement for the same seed", () => {
    const first = new VoxelWorld(2026, 48);
    const second = new VoxelWorld(2026, 48);
    expect(first.villages).toEqual(second.villages);
    expect(first.snapshot().blocks).toEqual(second.snapshot().blocks);
  });

  it("creates identifiable homes, roads and a plaza with enterable door anchors", () => {
    const world = new VoxelWorld(2026, 48);
    const village = world.villages[0];
    expect(village).toBeDefined();
    expect(village.houses).toHaveLength(4);
    expect(village.roads.length).toBeGreaterThan(10);
    expect(village.plaza.length).toBeGreaterThan(20);
    expect(village.plaza.every((position) => world.get(position.x, position.y, position.z) === "bricks")).toBe(true);
    village.houses.forEach((house) => {
      expect(world.get(house.door.x, house.door.y, house.door.z)).toBe("door");
      expect(world.isSolid(house.door.x, house.door.y, house.door.z)).toBe(false);
      expect(world.get(house.entrance.x, house.entrance.y + 1, house.entrance.z)).toBeUndefined();
      expect(world.get(house.interior.x, house.interior.y, house.interior.z)).toBeUndefined();
      const roadAtEntrance = village.roads.some((road) => road.x === house.entrance.x && road.z === house.entrance.z);
      expect(roadAtEntrance).toBe(true);
    });
  });

  it("keeps village blocks editable and exposes villager-ready house anchors", () => {
    const world = new VoxelWorld(2026, 48);
    const house = world.houseAnchors()[0];
    expect(house).toBeDefined();
    expect(world.remove(house.door)).toBe("door");
    world.set(house.door, "door");
    expect(world.get(house.door.x, house.door.y, house.door.z)).toBe("door");
  });

  it("does not add a village to compact worlds that cannot safely hold one", () => {
    expect(new VoxelWorld(2026, 12).villages).toEqual([]);
  });
});
