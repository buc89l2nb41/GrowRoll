import {
  PICKUP_RATIO,
  START_RADIUS,
  COLLIDER_GROWTH_BLEND,
  MAX_COLLIDER_RADIUS,
  PICKUP_GROWTH_VOLUME_SCALE,
  volumeFromRadius,
  radiusFromVolume,
} from "./constants.js";
import { MAP_SPAWN_SIZES, MODELING_TIER_COUNT } from "./props.js";
import { modelingTierIndexForClump } from "./tier.js";

/** Starting ball diameter — modeling tier sizes are expressed relative to this. */
export const START_DIAMETER = START_RADIUS * 2;

export function katamariDiameter(clumpRadius: number): number {
  return clumpRadius * 2;
}

/** True when the object fits on the katamari (modeling: smaller than the ball). */
export function canPickup(objectSize: number, clumpRadius: number): boolean {
  return objectSize <= katamariDiameter(clumpRadius) * PICKUP_RATIO;
}

export function minDiameterForPickup(objectSize: number): number {
  return objectSize / PICKUP_RATIO;
}

export function minRadiusForPickup(objectSize: number): number {
  return minDiameterForPickup(objectSize) / 2;
}

/** Physics sphere — tracks visible clump size (client passes visualClumpRadius). */
export function physicsColliderRadius(visualRadius: number): number {
  const extra = Math.max(0, visualRadius - START_RADIUS);
  const grown = START_RADIUS + extra * COLLIDER_GROWTH_BLEND;
  return Math.min(Math.max(START_RADIUS, grown), MAX_COLLIDER_RADIUS);
}

/** Hidden pickup growth — many small objects still raise the next-tier threshold. */
export function growPickupRadius(currentRadius: number, objectSize: number): number {
  const added = objectSize ** 3 * PICKUP_GROWTH_VOLUME_SCALE;
  return radiusFromVolume(volumeFromRadius(currentRadius) + added);
}

/** Pickup + HUD size: visual bounding sphere or accumulated growth, whichever is larger. */
export function effectivePickupRadius(visualRadius: number, growthRadius: number): number {
  return Math.max(visualRadius, growthRadius);
}

/** Modeling / tier progression — volume growth only (not visual shell protrusion). */
export function modelingClumpRadius(growthRadius: number): number {
  return growthRadius;
}

/** Sensor reach — must include attached props sticking out beyond the growth sphere. */
export function computePickupSensorRadius(visualRadius: number, growthRadius: number): number {
  return effectivePickupRadius(visualRadius, growthRadius);
}

/** Visible pickup diameter used for canPickup (modeling / player-facing). */
export function pickupDiameter(clumpRadius: number): number {
  return katamariDiameter(clumpRadius);
}

/** Next modeling tier size that requires a larger ball than `currentDiameter`. */
export function nextModelingTierSize(currentDiameter: number): number | null {
  for (const size of MAP_SPAWN_SIZES) {
    if (size > currentDiameter + 1e-4) return size;
  }
  return null;
}

export function growthHudText(clumpRadius: number): string {
  const currentTier = modelingTierIndexForClump(clumpRadius) + 1;
  const d = katamariDiameter(clumpRadius);
  const next = nextModelingTierSize(d);
  if (next === null) {
    return `티어 ${currentTier}/${MODELING_TIER_COUNT} · Ø ${d.toFixed(2)}m`;
  }
  const nextIdx = MAP_SPAWN_SIZES.indexOf(next as (typeof MAP_SPAWN_SIZES)[number]);
  const nextTierNum = nextIdx >= 0 ? nextIdx + 1 : currentTier + 1;
  return `티어 ${currentTier}/${MODELING_TIER_COUNT} · 다음 ${nextTierNum} (Ø${next.toFixed(2)}m) · Ø${d.toFixed(2)}m`;
}
