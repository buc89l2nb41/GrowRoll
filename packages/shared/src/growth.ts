import {
  GROWTH_VOLUME_SCALE,
  PICKUP_RATIO,
  radiusFromVolume,
  volumeFromRadius,
} from "./constants.js";

/** Object tiers on the map (size = box edge length in meters). */
export const OBJECT_TIERS = [
  { name: "초록", size: 0.3, color: 0x7ee787 },
  { name: "노랑", size: 0.6, color: 0xf2cc60 },
  { name: "파랑", size: 1.0, color: 0xa5d6ff },
  { name: "분홍", size: 1.6, color: 0xff9bce },
] as const;

/** Volume added to the katamari when an object is picked up. */
export function pickupVolumeContribution(objectSize: number): number {
  // Use box volume (size³) with a scale boost so small pickups feel meaningful.
  return objectSize ** 3 * GROWTH_VOLUME_SCALE;
}

/** New katamari radius after absorbing an object (whole clump grows). */
export function growKatamariRadius(currentRadius: number, objectSize: number): number {
  const newVol =
    volumeFromRadius(currentRadius) + pickupVolumeContribution(objectSize);
  return radiusFromVolume(newVol);
}

export function canPickup(objectSize: number, katamariRadius: number): boolean {
  return objectSize <= katamariRadius * PICKUP_RATIO;
}

/** Minimum katamari radius required to pick up an object of the given size. */
export function minRadiusForPickup(objectSize: number): number {
  return objectSize / PICKUP_RATIO;
}

export function minDiameterForPickup(objectSize: number): number {
  return minRadiusForPickup(objectSize) * 2;
}

/** Next object tier that is not yet pickable, or null if all tiers unlocked. */
export function nextLockedTier(katamariRadius: number): (typeof OBJECT_TIERS)[number] | null {
  for (const tier of OBJECT_TIERS) {
    if (!canPickup(tier.size, katamariRadius)) return tier;
  }
  return null;
}

/** Diameter growth from one pickup of the given object size. */
export function diameterGainFromPickup(
  currentRadius: number,
  objectSize: number,
): number {
  const next = growKatamariRadius(currentRadius, objectSize);
  return (next - currentRadius) * 2;
}
