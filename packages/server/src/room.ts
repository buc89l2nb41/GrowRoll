import {
  MAX_PLAYERS_PER_ROOM,
  START_RADIUS,
  WORLD_SEED,
  type EntityId,
  type PlayerState,
  type Quat,
  type Vec3,
} from "@growroll/shared";

/**
 * Phase 2 relay room: holds the latest self-reported state of each player and
 * relays it to everyone else. Each client is authoritative for its own
 * katamari simulation; server-authoritative physics is a later migration.
 */
export class Room {
  readonly id: string;
  readonly mapSeed: number = WORLD_SEED;
  private players = new Map<EntityId, PlayerState>();
  /** Map objects already picked (by stable object index). */
  readonly pickedObjects = new Set<number>();

  constructor(id: string) {
    this.id = id;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size >= MAX_PLAYERS_PER_ROOM;
  }

  /** Spread players in a circle so they do not spawn on top of each other. */
  spawnFor(index: number): Vec3 {
    const angle = (index / MAX_PLAYERS_PER_ROOM) * Math.PI * 2;
    const dist = 4 + index * 2;
    return [
      Math.cos(angle) * dist,
      START_RADIUS,
      Math.sin(angle) * dist,
    ];
  }

  addPlayer(id: EntityId, name: string): Vec3 {
    const spawn = this.spawnFor(this.players.size);
    this.players.set(id, {
      id,
      name,
      pos: spawn,
      rot: [0, 0, 0, 1],
      radius: START_RADIUS,
      score: 0,
    });
    return spawn;
  }

  removePlayer(id: EntityId): void {
    this.players.delete(id);
  }

  /** Phase 2: reset shared map state when the room empties (per-player respawn later). */
  resetWorld(): void {
    const n = this.pickedObjects.size;
    this.pickedObjects.clear();
    if (n > 0) console.log(`[reset] room empty — cleared ${n} picked object(s)`);
  }

  setState(id: EntityId, pos: Vec3, rot: Quat, radius: number, score: number): void {
    const p = this.players.get(id);
    if (!p) return;
    p.pos = pos;
    p.rot = rot;
    p.radius = radius;
    p.score = score;
  }

  reportPickup(objectId: number): boolean {
    if (this.pickedObjects.has(objectId)) return false;
    this.pickedObjects.add(objectId);
    return true;
  }

  /** All players except the given id (what that client needs to render). */
  othersOf(id: EntityId): PlayerState[] {
    const out: PlayerState[] = [];
    for (const p of this.players.values()) {
      if (p.id !== id) out.push({ ...p });
    }
    return out;
  }
}
