import { describe, expect, it } from "vitest";
import { MultiplayerRoom, isRoomCode, newPlayer, normalizeRoomCode, type RoomTransport } from "../src/multiplayer";

const transports = (): RoomTransport[] => {
  const listeners = new Set<(payload: string) => void>();
  const makeTransport = (): RoomTransport => ({
    send: (payload) => listeners.forEach((listener) => listener(payload)),
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => undefined,
  });
  return [makeTransport(), makeTransport()];
};

describe("multiplayer rooms", () => {
  it("normalizes safe room codes", () => {
    expect(normalizeRoomCode("  My Room!  ")).toBe("my-room");
    expect(isRoomCode("my-room")).toBe(true);
    expect(isRoomCode("no")).toBe(false);
  });

  it("synchronizes player state and block edits without echoing to sender", () => {
    const [firstTransport, secondTransport] = transports();
    const players: string[] = [];
    const edits: string[] = [];
    const first = new MultiplayerRoom("test-room", newPlayer("甲", [0, 1, 2], 0, 0, "first"), {}, firstTransport);
    const second = new MultiplayerRoom("test-room", newPlayer("乙", [3, 4, 5], 0, 0, "second"), {
      onPlayer: (player) => players.push(player.id),
      onEdit: (edit) => edits.push(edit.action),
    }, secondTransport);
    first.announcePlayer();
    first.sendEdit({ action: "place", position: { x: 1, y: 2, z: 3 }, type: "wood" });
    expect(players).toEqual(["first"]);
    expect(edits).toEqual(["place"]);
    first.dispose();
    second.dispose();
  });
});
