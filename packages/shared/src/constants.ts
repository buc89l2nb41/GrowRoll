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
 * Max object size relative to katamari diameter for pickup.
 * 1.0 = objectSize <= diameter (objects larger than the ball cannot be picked).
 */
export const PICKUP_RATIO = 1.0;

/** Starting katamari radius (meters). */
export const START_RADIUS = 0.5;

/** Alias for the initial katamari / core size. */
export const CORE_RADIUS = START_RADIUS;

/** Visible core sphere — fixed size; the clump (attachments) defines the silhouette. */
export const VISUAL_CORE_RADIUS = START_RADIUS;

/** Fixed physics mass — collider may grow but mass stays constant for stable speed. */
export const KATAMARI_MASS = 2.5;

/** Constant roll speed (m/s). Same in every direction, no acceleration. */
export const MOVE_SPEED = 11;

/** World gravity (m/s²). Stronger than Earth for snappy falls. */
export const WORLD_GRAVITY = -32;

/** Ground cuboid half-height (meters) — thicker reduces tunneling. */
export const GROUND_COLLIDER_HALF_HEIGHT = 2;

/** Physics substeps per fixed tick (higher = less tunneling). */
export const PHYSICS_SUBSTEPS = 2;

/** Rapier CCD substeps for fast-moving bodies. */
export const PHYSICS_MAX_CCD_SUBSTEPS = 4;

/** Soft-CCD prediction distance = colliderRadius × this. */
export const SOFT_CCD_RADIUS_FACTOR = 2.5;

/** Raycast margin below ball center to detect ground contact. */
export const GROUND_PROBE_MARGIN = 0.14;

/** Horizontal steer while airborne (0 = none, 1 = full). */
export const AIR_CONTROL = 0.15;

/** Rigid-body damping applied at spawn. Velocity is set directly, so kept low. */
export const ANGULAR_DAMPING = 0;
export const LINEAR_DAMPING = 0;

/** Ground contact friction for the katamari collider. */
export const GROUND_FRICTION = 0.55;

/** Follow camera — ball diameter targets a fixed screen fraction (see camera.ts). */
export const CAMERA_FOV = 62;
/** Katamari diameter as fraction of vertical screen height. */
export const CAMERA_BALL_SCREEN_FRACTION = 1 / 4;

/** Camera height above ball center = horizontal follow distance × this. */
export const CAMERA_HEIGHT_RATIO = 0.5;

/**
 * How much visual clump growth pulls the camera back (0 = fixed, 1 = full linear).
 * Lower keeps the katamari readable when large-tier props attach.
 */
export const CAMERA_RADIUS_GROWTH_BLEND = 0.4;

/** Soft cap on camera framing radius (meters). */
export const CAMERA_MAX_FRAME_RADIUS = 5.5;

/** Framing-radius catch-up when the clump shrinks (1/s, exponential). */
export const CAMERA_RADIUS_SMOOTH_SPEED = 4;

/** Max framing-radius growth per second — eases tier pickup zoom-out spikes. */
export const CAMERA_RADIUS_MAX_GROW_PER_SEC = 1.8;

/** Square garden ground extent (meters). */
export const MAP_GROUND_SIZE = 240;

/** Horizontal inset from ground edge — matches garden spawn margin. */
export const MAP_PLAY_MARGIN = 6;

/** Recover ball to spawn when Y drops below this (tunnel / fall-through). */
export const MAP_RECOVER_MIN_Y = -4;

/** Recover ball to spawn when launched above this height. */
export const MAP_RECOVER_MAX_Y = 64;

/** Default pickup count for seeded garden layout (lower = less cramped clusters). */
export const MAP_PICKUP_BUDGET = 1000;

/** Tier-1 (modeling index 0) pickups in a ring around player spawn. */
export const STARTER_TIER_SCATTER_COUNT = 52;

/** Inner / outer radius (m) for starter tier-1 ring around spawn. */
export const STARTER_TIER_SCATTER_MIN = 5;
export const STARTER_TIER_SCATTER_MAX = 38;

/** Extra tier-1 pickups scattered across the whole map. */
export const TIER1_MAP_SCATTER_COUNT = 80;

/** World streaming cell size (meters). */
export const STREAM_CHUNK_SIZE = 20;

/** Chunk radius with Rapier colliders (each cell = STREAM_CHUNK_SIZE). */
export const STREAM_PHYSICS_RADIUS = 2;

/** Extra chunk ring rendered without colliders — reduces pop-in. */
export const STREAM_VISUAL_RADIUS = 3;

/** Keep visuals until this many chunks away (hysteresis). */
export const STREAM_VISUAL_RELEASE_RADIUS = 4;

/** Pickup prop scale-in speed when entering the visual ring (1/seconds). */
export const STREAM_FADE_IN_SPEED = 5;

/**
 * Full GLB tile grid on the ground (grass + stone paths + dirt patches).
 * Toggle off to restore the green plane + sparse path tiles.
 */
export const TILE_FLOOR_ENABLED = false;

/** Repeat spacing for ground texture tiles (meters); matches map tile GLB size. */
export const GROUND_TEXTURE_TILE_SIZE = 2;

/** Texture-blended ground plane (grass / stone paths / dirt patches). */
export const GROUND_TEXTURE_ENABLED = true;

/**
 * Physics collider tracks visible clump size (client passes visualClumpRadius).
 * Pickup sensor uses pickupClumpRadius() separately.
 */
export const COLLIDER_GROWTH_BLEND = 0.7;

/** Attachments with the largest outward extent get solid cuboid colliders on the katamari body. */
export const ATTACH_PHYSICS_COUNT = 4;

/** Absolute safety cap on rolling sphere radius (meters). */
export const MAX_COLLIDER_RADIUS = 24;

/** How far picked objects sink into the ball surface (0 = flush, 1 = center on surface). */
export const ATTACH_SINK_RATIO = 0.12;

/** Outward meters per (player tier − object tier) when layering a new pickup on the shell. */
export const ATTACH_TIER_LAYER_STEP = 0.15;

/** Cap tier-layer outward push so visuals do not float too far above the natural clump. */
export const ATTACH_TIER_LAYER_MAX = 0.6;

/**
 * Multiplier on picked object volume (size³). Reserved for future stat curves.
 */
export const GROWTH_VOLUME_SCALE = 2.0;

/**
 * Pickup eligibility radius grows with absorbed volume (visual clump may lag).
 * Lower = more small pickups needed to reach the next modeling tier.
 */
export const PICKUP_GROWTH_VOLUME_SCALE = 0.42;

/** Spawn weight uses size^(-SPAWN_SIZE_EXPONENT). Lower = high tiers spawn more often. */
export const SPAWN_SIZE_EXPONENT = 1.72;

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
