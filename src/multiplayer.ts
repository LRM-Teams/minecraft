import type { BlockPosition, BlockType, WorldSnapshot } from "./world";

export type PlayerState = {
  id: string;
  name: string;
  position: [number, number, number];
  yaw: number;
  pitch: number;
};

export type WorldEdit = {
  action: "place" | "remove";
  position: BlockPosition;
  type?: BlockType;
};

type RoomEvent =
  | { kind: "hello"; player: PlayerState }
  | { kind: "leave"; playerId: string }
  | { kind: "player"; player: PlayerState }
  | { kind: "edit"; edit: WorldEdit }
  | { kind: "snapshot"; world: WorldSnapshot };

type Envelope = RoomEvent & { room: string; sender: string };

export type RoomTransport = {
  send: (payload: string) => void;
  subscribe: (listener: (payload: string) => void) => () => void;
  close: () => void;
};

export type MultiplayerCallbacks = {
  onHello?: (player: PlayerState) => void;
  onLeave?: (playerId: string) => void;
  onPlayer?: (player: PlayerState) => void;
  onEdit?: (edit: WorldEdit) => void;
  onSnapshot?: (world: WorldSnapshot) => void;
};

const ROOM_PATTERN = /^[a-z0-9-]{3,24}$/;

export const normalizeRoomCode = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 24);
export const isRoomCode = (value: string): boolean => ROOM_PATTERN.test(value);

const randomId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `player-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Same-origin room transport. BroadcastChannel gives instant cross-tab sync;
 * localStorage events preserve a usable fallback in browsers that lack it.
 * A relay/WebSocket transport can use the same RoomTransport interface later.
 */
export const browserRoomTransport = (room: string): RoomTransport => {
  const channelName = `voxel-atelier-room:${room}`;
  const storageKey = `${channelName}:event`;
  const listeners = new Set<(payload: string) => void>();
  const emit = (payload: string): void => listeners.forEach((listener) => listener(payload));
  const channel = typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel(channelName);
  channel?.addEventListener("message", (event: MessageEvent<string>) => {
    if (typeof event.data === "string") emit(event.data);
  });
  const storageListener = (event: StorageEvent): void => {
    if (event.key === storageKey && event.newValue) emit(event.newValue);
  };
  addEventListener("storage", storageListener);
  return {
    send: (payload) => {
      channel?.postMessage(payload);
      try { localStorage.setItem(storageKey, payload); } catch { /* private-mode fallback is still BroadcastChannel */ }
    },
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    close: () => { channel?.close(); removeEventListener("storage", storageListener); listeners.clear(); },
  };
};

export class MultiplayerRoom {
  readonly id: string;
  readonly playerId: string;
  private readonly transport: RoomTransport;
  private readonly callbacks: MultiplayerCallbacks;
  private unsubscribe: () => void;

  constructor(room: string, private player: PlayerState, callbacks: MultiplayerCallbacks = {}, transport = browserRoomTransport(room)) {
    if (!isRoomCode(room)) throw new Error("房间码须为 3–24 位小写字母、数字或连字符");
    this.id = room;
    this.playerId = player.id || randomId();
    this.player = { ...player, id: this.playerId };
    this.transport = transport;
    this.callbacks = callbacks;
    this.unsubscribe = transport.subscribe((payload) => this.receive(payload));
    this.send({ kind: "hello", player: this.player });
  }

  updateLocalPlayer(player: Omit<PlayerState, "id">): void { this.player = { ...player, id: this.playerId }; }
  announcePlayer(): void { this.send({ kind: "player", player: this.player }); }
  sendEdit(edit: WorldEdit): void { this.send({ kind: "edit", edit }); }
  sendSnapshot(world: WorldSnapshot): void { this.send({ kind: "snapshot", world }); }
  reconnect(): void { this.send({ kind: "hello", player: this.player }); }
  dispose(): void { this.send({ kind: "leave", playerId: this.playerId }); this.unsubscribe(); this.transport.close(); }

  private send(event: RoomEvent): void { this.transport.send(JSON.stringify({ ...event, room: this.id, sender: this.playerId })); }

  private receive(payload: string): void {
    let event: Envelope;
    try { event = JSON.parse(payload) as Envelope; } catch { return; }
    if (event.room !== this.id || event.sender === this.playerId || typeof event.kind !== "string") return;
    if (event.kind === "hello") this.callbacks.onHello?.(event.player);
    if (event.kind === "leave") this.callbacks.onLeave?.(event.playerId);
    if (event.kind === "player") this.callbacks.onPlayer?.(event.player);
    if (event.kind === "edit") this.callbacks.onEdit?.(event.edit);
    if (event.kind === "snapshot") this.callbacks.onSnapshot?.(event.world);
  }
}

export const newPlayer = (name: string, position: [number, number, number], yaw: number, pitch: number, id = randomId()): PlayerState => ({
  id,
  name: name.trim().slice(0, 18) || "探索者",
  position,
  yaw,
  pitch,
});
