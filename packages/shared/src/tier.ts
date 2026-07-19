import { canPickup } from "./growth.js";
import { getPropDef, MAP_SPAWN_SIZES, type PropId } from "./props.js";

/** Nearest modeling tier index for a spawn size (exact or jittered). */
export function tierIndexForSize(size: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MAP_SPAWN_SIZES.length; i++) {
    const dist = Math.abs(size - MAP_SPAWN_SIZES[i]!);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

/** Highest modeling tier the clump can currently pick up (not nearest spawn size). */
export function modelingTierIndexForClump(clumpRadius: number): number {
  let tier = 0;
  for (let i = 0; i < MAP_SPAWN_SIZES.length; i++) {
    if (canPickup(MAP_SPAWN_SIZES[i]!, clumpRadius)) tier = i;
    else break;
  }
  return tier;
}

/** Modeling tier from catalog prop size (exact MAP_SPAWN_SIZES match). */
export function tierIndexForProp(propId: PropId): number {
  return tierIndexForSize(getPropDef(propId).size);
}

export function modelingTierSize(tierIndex: number): number {
  const idx = Math.min(Math.max(0, tierIndex), MAP_SPAWN_SIZES.length - 1);
  return MAP_SPAWN_SIZES[idx]!;
}
