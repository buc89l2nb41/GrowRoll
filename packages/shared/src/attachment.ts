import { ATTACH_TIER_LAYER_MAX, ATTACH_TIER_LAYER_STEP } from "./constants.js";
import { modelingTierIndexForClump } from "./tier.js";

/** Outward unit normal from ball center toward a world-space target. */
export function radialOutwardNormal(
  ballCenter: [number, number, number],
  target: [number, number, number],
): [number, number, number] | null {
  const dx = target[0] - ballCenter[0];
  const dy = target[1] - ballCenter[1];
  const dz = target[2] - ballCenter[2];
  const lenSq = dx * dx + dy * dy + dz * dz;
  if (lenSq < 1e-10) return null;
  const inv = 1 / Math.sqrt(lenSq);
  return [dx * inv, dy * inv, dz * inv];
}

/**
 * Extra outward distance beyond the orange core (player tier − object tier).
 * Same modeling tier → 0 (flush on orange core).
 */
export function tierOutwardOffset(
  playerClumpRadius: number,
  objectTierIndex: number,
  layerStep = ATTACH_TIER_LAYER_STEP,
  maxOutward = ATTACH_TIER_LAYER_MAX,
): number {
  const playerTier = modelingTierIndexForClump(playerClumpRadius);
  const tierGap = Math.max(0, playerTier - objectTierIndex);
  return Math.min(maxOutward, tierGap * layerStep);
}

export type AttachShellMode = "core" | "tierLayer";

export interface ResolvedAttachShell {
  shellRadius: number;
  mode: AttachShellMode;
  tierOutward: number;
}

/**
 * Pick attach shell for a new pickup:
 * - same modeling tier as the ball → orange core (tight)
 * - lower tier → core + tier gap offset
 */
export function resolveAttachShellRadius(
  coreRadius: number,
  playerClumpRadius: number,
  objectTierIndex: number,
): ResolvedAttachShell {
  const tierOutward = tierOutwardOffset(playerClumpRadius, objectTierIndex);
  if (tierOutward <= 0) {
    return { shellRadius: coreRadius, mode: "core", tierOutward: 0 };
  }
  return {
    shellRadius: coreRadius + tierOutward,
    mode: "tierLayer",
    tierOutward,
  };
}

/**
 * Place a picked-up object on the katamari surface along a contact normal.
 * Normal is in the ball's local space (unit length, pointing outward).
 */
export function surfaceAttachPosition(
  normal: [number, number, number],
  radius: number,
  objectHalfSize: number,
  sinkRatio = 0.12,
): [number, number, number] {
  const dist = radius + objectHalfSize * (1 - sinkRatio);
  return [normal[0] * dist, normal[1] * dist, normal[2] * dist];
}

/** Tier-aware shell pick + surface placement for a new pickup. */
export function tieredSurfaceAttachPosition(
  normal: [number, number, number],
  coreRadius: number,
  playerClumpRadius: number,
  objectTierIndex: number,
  objectSize: number,
  sinkRatio = 0.12,
): [number, number, number, ResolvedAttachShell] {
  const resolved = resolveAttachShellRadius(coreRadius, playerClumpRadius, objectTierIndex);
  const pos = surfaceAttachPosition(normal, resolved.shellRadius, objectSize / 2, sinkRatio);
  return [pos[0], pos[1], pos[2], resolved];
}

/** Recompute attach positions after the katamari grows. */
export function repositionAttachment(
  normal: [number, number, number],
  radius: number,
  objectHalfSize: number,
  sinkRatio = 0.12,
): [number, number, number] {
  return surfaceAttachPosition(normal, radius, objectHalfSize, sinkRatio);
}
