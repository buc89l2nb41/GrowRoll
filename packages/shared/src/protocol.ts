/**
 * Wire protocol shared between client and server.
 *
 * Phase 0/1 uses JSON for readability. Phase 4 will switch snapshots to a
 * binary/delta-compressed format (see docs/DESIGN.md) without changing these
 * logical shapes.
 */

export type EntityId = string;

/** 3D vector as a plain tuple for compact serialization. */
export type Vec3 = [number, number, number];
/** Quaternion (x, y, z, w). */
export type Quat = [number, number, number, number];

/** A pickup-able world object. */
export interface WorldObject {
  id: EntityId;
  /** Visual/prefab kind (e.g. "cone", "mushroom"). */
  kind: string;
  pos: Vec3;
  rot: Quat;
  /** Effective size used by the pickup rule. */
  size: number;
  /** True once attached to a katamari (removed from the free world). */
  attached: boolean;
}

/** Per-player katamari state in a snapshot. */
export interface PlayerState {
  id: EntityId;
  name: string;
  pos: Vec3;
  rot: Quat;
  radius: number;
  /** Number of objects picked up so far. */
  score: number;
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

export interface JoinMessage {
  t: "join";
  name: string;
  roomId?: string;
}

/** Client reports picking up a shared map object (relay sync). */
export interface PickupReportMessage {
  t: "pickupReport";
  /** Stable index into the deterministic map object list. */
  objectId: number;
}

/** Player input for a single client frame. */
export interface InputMessage {
  t: "input";
  /** Client input sequence number, echoed back for reconciliation. */
  seq: number;
  /** Normalized movement axes in [-1, 1] (camera-relative). */
  move: [number, number];
  /** Camera yaw (radians). */
  yaw: number;
}

/**
 * Client-authoritative self state (Phase 2 relay model). The client owns its
 * own katamari simulation and reports the result for others to render.
 */
export interface StateMessage {
  t: "state";
  seq: number;
  pos: Vec3;
  rot: Quat;
  radius: number;
  score?: number;
}

export interface PingMessage {
  t: "ping";
  time: number;
}

export type ClientMessage =
  | JoinMessage
  | PickupReportMessage
  | InputMessage
  | StateMessage
  | PingMessage;

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export interface WelcomeMessage {
  t: "welcome";
  playerId: EntityId;
  roomId: string;
  /** Seed for deterministic world generation. */
  mapSeed: number;
  tickRate: number;
  /** Assigned spawn position for this player. */
  spawn: Vec3;
}

export interface SnapshotMessage {
  t: "snapshot";
  players: PlayerState[];
  /** Server tick this snapshot represents (authoritative mode). */
  tick?: number;
  /** Last processed input seq for the receiving player (reconciliation). */
  ackSeq?: number;
  /** Only objects that changed (attached/spawned). Authoritative mode. */
  objectDelta?: WorldObject[];
}

export interface PlayerLeftMessage {
  t: "playerLeft";
  playerId: EntityId;
}

export interface PickupMessage {
  t: "pickup";
  playerId: EntityId;
  /** Stable map object index (same on every client). */
  objectId: number;
  newRadius: number;
}

export interface RoundEndMessage {
  t: "roundEnd";
  ranking: { playerId: EntityId; name: string; radius: number }[];
}

export interface PongMessage {
  t: "pong";
  time: number;
}

export type ServerMessage =
  | WelcomeMessage
  | SnapshotMessage
  | PlayerLeftMessage
  | PickupMessage
  | RoundEndMessage
  | PongMessage;

/** Safe JSON parse into a ClientMessage (server-side use). */
export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.t === "string") return obj as ClientMessage;
  } catch {
    /* ignore malformed input */
  }
  return null;
}

/** Safe JSON parse into a ServerMessage (client-side use). */
export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.t === "string") return obj as ServerMessage;
  } catch {
    /* ignore malformed input */
  }
  return null;
}
