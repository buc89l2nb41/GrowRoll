/**
 * Shared gameplay + networking constants used by both client and server.
 * Keeping these in one place guarantees client prediction matches the
 * server-authoritative simulation.
 */

/** Server physics simulation frequency (Hz). */
export const TICK_RATE = 60;
/** Fixed timestep derived from the tick rate (seconds). */
export const FIXED_DT = 1 / TICK_RATE;

/** How often the server broadcasts world snapshots to clients (Hz). */
export const SNAPSHOT_RATE = 20;

/** Max players allowed per room. */
export const MAX_PLAYERS_PER_ROOM = 8;

/** Default round duration (seconds). */
export const ROUND_DURATION = 180;

/**
 * An object can be picked up if its "size" is at most this ratio of the
 * katamari's current radius. Tune for game feel.
 */
export const PICKUP_RATIO = 0.9;

/** Starting katamari radius (meters). */
export const START_RADIUS = 0.5;

/** Alias for the initial katamari / core size. */
export const CORE_RADIUS = START_RADIUS;

/** Fixed physics mass — collider may grow but mass stays constant for stable speed. */
export const KATAMARI_MASS = 2.5;

/** Constant roll speed (m/s). Same in every direction, no acceleration. */
export const MOVE_SPEED = 11;

/** Rigid-body damping applied at spawn. Velocity is set directly, so kept low. */
export const ANGULAR_DAMPING = 0;
export const LINEAR_DAMPING = 0;

/** Ground contact friction for the katamari collider. */
export const GROUND_FRICTION = 0.55;

/** How far picked objects sink into the ball surface (0 = flush, 1 = center on surface). */
export const ATTACH_SINK_RATIO = 0.12;

/**
 * Multiplier on picked object volume (size³). Higher = faster growth per pickup.
 * At 2.0, ~14 small (0.3m) objects unlock the next tier (0.6m).
 */
export const GROWTH_VOLUME_SCALE = 2.0;

/**
 * Compute the sphere radius that has the given volume.
 * r = (3V / 4pi)^(1/3)
 */
export function radiusFromVolume(volume: number): number {
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

/** Volume of a sphere with the given radius. */
export function volumeFromRadius(radius: number): number {
  return (4 / 3) * Math.PI * radius ** 3;
}
