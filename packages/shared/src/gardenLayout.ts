import { getPropDef, MAP_SPAWN_SIZES, PROP_IDS, type PropId } from "./props.js";
import {
  SPAWN_SIZE_EXPONENT,
  STARTER_TIER_SCATTER_COUNT,
  STARTER_TIER_SCATTER_MAX,
  STARTER_TIER_SCATTER_MIN,
  TIER1_MAP_SCATTER_COUNT,
} from "./constants.js";

export interface PickupPlacement {
  propId: PropId;
  /** Modeling tier this instance was spawned as (not inferred from jittered size). */
  tierIndex: number;
  /** Per-instance visual + collider scale (jittered around modeling tier). */
  size: number;
  px: number;
  pz: number;
  /** Y-axis yaw (radians) — spin on the ground plane. */
  rotY: number;
}

interface PlacedCircle {
  px: number;
  pz: number;
  size: number;
}

const ZONE_THEMES = [
  { tierIndex: 0, weight: 1.1, label: "micro_patch" },
  { tierIndex: 1, weight: 1.0, label: "seed_sprouts" },
  { tierIndex: 2, weight: 0.95, label: "pot_corner" },
  { tierIndex: 4, weight: 0.9, label: "tool_bench" },
  { tierIndex: 6, weight: 0.8, label: "scarecrow_field" },
  { tierIndex: 8, weight: 0.7, label: "picnic_lawn" },
  { tierIndex: 10, weight: 0.55, label: "well_grove" },
  { tierIndex: 11, weight: 0.45, label: "grand_landmarks" },
] as const;

/** Relative spread of per-instance size within a tier (0.2 = ±10%). */
const TIER_SIZE_JITTER = [
  0.16, 0.18, 0.18, 0.2, 0.2, 0.22, 0.22, 0.24, 0.24, 0.26, 0.28, 0.3,
] as const;

/** Larger props spawn less often — softened exponent + slight high-tier boost. */
function spawnWeightForSize(size: number, tierIndex = 0): number {
  const tierBoost = 1 + tierIndex * 0.055;
  return tierBoost / size ** SPAWN_SIZE_EXPONENT;
}

function weightedPick<T>(
  rng: () => number,
  items: readonly T[],
  weightOf: (item: T) => number,
): T {
  let total = 0;
  for (const item of items) total += weightOf(item);
  let roll = rng() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1]!;
}

function tierSpawnWeight(tierIndex: number, themeWeight: number): number {
  const tierSize = MAP_SPAWN_SIZES[tierIndex] ?? 1;
  return themeWeight * spawnWeightForSize(tierSize, tierIndex);
}

function minZoneCount(tierIndex: number): number {
  const tierSize = MAP_SPAWN_SIZES[tierIndex] ?? 1;
  return Math.max(3, Math.round((17 + tierIndex * 0.9) / tierSize));
}

function jitteredInstanceSize(tierIndex: number, tierSize: number, rng: () => number): number {
  const spread = TIER_SIZE_JITTER[tierIndex] ?? 0.24;
  const factor = 1 - spread / 2 + rng() * spread;
  return tierSize * factor;
}

function spacingRadius(aSize: number, bSize: number, pad: number): number {
  return aSize / 2 + bSize / 2 + pad;
}

function minSpacingPad(size: number): number {
  return 0.25 + size * 0.32;
}

function hasOverlap(
  px: number,
  pz: number,
  size: number,
  placed: readonly PlacedCircle[],
  pad: number,
): boolean {
  for (const p of placed) {
    const dx = px - p.px;
    const dz = pz - p.pz;
    const need = spacingRadius(size, p.size, pad);
    if (dx * dx + dz * dz < need * need) return true;
  }
  return false;
}

function withinSpan(px: number, pz: number, halfSpan: number): boolean {
  return Math.abs(px) <= halfSpan && Math.abs(pz) <= halfSpan;
}

function randomYaw(rng: () => number): number {
  return rng() * Math.PI * 2;
}

function tryPlacePickup(
  rng: () => number,
  propId: PropId,
  tierIndex: number,
  placed: readonly PlacedCircle[],
  halfSpan: number,
  center: { cx: number; cz: number; radius: number },
): PickupPlacement | null {
  const tierSize = getPropDef(propId).size;
  const size = jitteredInstanceSize(tierIndex, tierSize, rng);
  const pad = minSpacingPad(size);
  const attempts = 28 + Math.floor(size * 8);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = Math.sqrt(rng()) * center.radius;
    const px = center.cx + Math.cos(angle) * dist;
    const pz = center.cz + Math.sin(angle) * dist;
    if (!withinSpan(px, pz, halfSpan)) continue;
    if (hasOverlap(px, pz, size, placed, pad)) continue;
    return { propId, tierIndex, size, px, pz, rotY: randomYaw(rng) };
  }
  return null;
}

function tryPlaceScatter(
  rng: () => number,
  propId: PropId,
  tierIndex: number,
  placed: readonly PlacedCircle[],
  halfSpan: number,
): PickupPlacement | null {
  const tierSize = getPropDef(propId).size;
  const size = jitteredInstanceSize(tierIndex, tierSize, rng);
  const pad = minSpacingPad(size);
  const attempts = 36 + Math.floor(size * 10);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const px = (rng() - 0.5) * halfSpan * 2;
    const pz = (rng() - 0.5) * halfSpan * 2;
    if (!withinSpan(px, pz, halfSpan)) continue;
    if (hasOverlap(px, pz, size, placed, pad)) continue;
    return { propId, tierIndex, size, px, pz, rotY: randomYaw(rng) };
  }
  return null;
}

/** Place tier-1 starters in an annulus around a spawn point. */
function tryPlaceNearPoint(
  rng: () => number,
  propId: PropId,
  tierIndex: number,
  placed: readonly PlacedCircle[],
  halfSpan: number,
  cx: number,
  cz: number,
  minDist: number,
  maxDist: number,
): PickupPlacement | null {
  const tierSize = getPropDef(propId).size;
  const size = jitteredInstanceSize(tierIndex, tierSize, rng);
  const pad = minSpacingPad(size) * 0.85;
  const attempts = 40;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const angle = rng() * Math.PI * 2;
    const dist = minDist + rng() * Math.max(0.5, maxDist - minDist);
    const px = cx + Math.cos(angle) * dist;
    const pz = cz + Math.sin(angle) * dist;
    if (!withinSpan(px, pz, halfSpan)) continue;
    if (hasOverlap(px, pz, size, placed, pad)) continue;
    return { propId, tierIndex, size, px, pz, rotY: randomYaw(rng) };
  }
  return null;
}

function scatterTierPickups(
  rng: () => number,
  tierIndex: number,
  count: number,
  placed: PlacedCircle[],
  pickups: PickupPlacement[],
  halfSpan: number,
  near?: { cx: number; cz: number; minDist: number; maxDist: number },
): number {
  const pool = pickupPropsAtTier(tierIndex);
  if (pool.length === 0) return 0;
  let added = 0;
  for (let i = 0; i < count; i++) {
    const propId = pickWeightedPropId(rng, pool);
    const p = near
      ? tryPlaceNearPoint(
          rng,
          propId,
          tierIndex,
          placed,
          halfSpan,
          near.cx,
          near.cz,
          near.minDist,
          near.maxDist,
        )
      : tryPlaceScatter(rng, propId, tierIndex, placed, halfSpan);
    if (!p) continue;
    pickups.push(p);
    placed.push({ px: p.px, pz: p.pz, size: p.size });
    added++;
  }
  return added;
}

function pickWeightedPropId(rng: () => number, pool: readonly PropId[]): PropId {
  return weightedPick(rng, pool, (id) => spawnWeightForSize(getPropDef(id).size));
}

export function pickupPropsAtTier(tierIndex: number): PropId[] {
  const target = MAP_SPAWN_SIZES[tierIndex];
  if (target === undefined) return [];
  return PROP_IDS.filter((id) => Math.abs(getPropDef(id).size - target) < 1e-4);
}

function pickZoneCenter(
  rng: () => number,
  span: number,
  existing: readonly { cx: number; cz: number }[],
  minDist: number,
): { cx: number; cz: number } {
  for (let attempt = 0; attempt < 48; attempt++) {
    const cx = (rng() - 0.5) * span;
    const cz = (rng() - 0.5) * span;
    const ok = existing.every((z) => {
      const dx = cx - z.cx;
      const dz = cz - z.cz;
      return dx * dx + dz * dz >= minDist * minDist;
    });
    if (ok) return { cx, cz };
  }
  return { cx: (rng() - 0.5) * span, cz: (rng() - 0.5) * span };
}

/**
 * Seeded garden layout: tier-themed pickup clusters only (no fixed scenery).
 * Larger props spawn less often and keep size-aware spacing.
 */
export function generateGardenLayout(
  rng: () => number,
  groundSize: number,
  pickupBudget: number,
): {
  pickups: PickupPlacement[];
  groundZones: { cx: number; cz: number }[];
} {
  const margin = 6;
  const span = groundSize - margin * 2;
  const halfSpan = span / 2;
  const zoneBudget = Math.floor(pickupBudget * 0.85);
  const scatterCount = pickupBudget - zoneBudget;

  const zones: {
    tierIndex: number;
    cx: number;
    cz: number;
    radius: number;
    count: number;
    weight: number;
  }[] = [];

  const centers: { cx: number; cz: number }[] = [];
  for (const theme of ZONE_THEMES) {
    const center =
      theme.tierIndex === 0
        ? { cx: (rng() - 0.5) * 10, cz: (rng() - 0.5) * 10 }
        : pickZoneCenter(rng, span - 40, centers, 38);
    centers.push(center);
    const tierSize = MAP_SPAWN_SIZES[theme.tierIndex] ?? 1;
    zones.push({
      tierIndex: theme.tierIndex,
      cx: center.cx,
      cz: center.cz,
      radius: 18 + tierSize * 1.8 + rng() * 12,
      count: 0,
      weight: tierSpawnWeight(theme.tierIndex, theme.weight),
    });
  }

  const totalWeight = zones.reduce((sum, z) => sum + z.weight, 0);
  let allocated = 0;
  for (const zone of zones) {
    const minCount = minZoneCount(zone.tierIndex);
    zone.count = Math.max(minCount, Math.round((zoneBudget * zone.weight) / totalWeight));
    allocated += zone.count;
  }
  while (allocated > zoneBudget) {
    const zone = zones[Math.floor(rng() * zones.length)]!;
    const floor = minZoneCount(zone.tierIndex);
    if (zone.count > floor) {
      zone.count--;
      allocated--;
    }
  }
  while (allocated < zoneBudget) {
    const zone = weightedPick(rng, zones, (z) => z.weight);
    zone.count++;
    allocated++;
  }

  const pickups: PickupPlacement[] = [];
  const placed: PlacedCircle[] = [];

  for (const zone of zones) {
    const pool = pickupPropsAtTier(zone.tierIndex);
    if (pool.length === 0) continue;
    let placedInZone = 0;
    for (let i = 0; i < zone.count; i++) {
      const propId = pickWeightedPropId(rng, pool);
      const p = tryPlacePickup(rng, propId, zone.tierIndex, placed, halfSpan, {
        cx: zone.cx,
        cz: zone.cz,
        radius: zone.radius,
      });
      if (!p) continue;
      pickups.push(p);
      placed.push({ px: p.px, pz: p.pz, size: p.size });
      placedInZone++;
    }
    zone.count = placedInZone;
  }

  const scatterTiers = MAP_SPAWN_SIZES.map((size, tierIndex) => ({ tierIndex, size }));
  for (let i = 0; i < scatterCount; i++) {
    const tier = weightedPick(rng, scatterTiers, (t) => spawnWeightForSize(t.size, t.tierIndex));
    const pool = pickupPropsAtTier(tier.tierIndex);
    if (pool.length === 0) continue;
    const propId = pickWeightedPropId(rng, pool);
    const p = tryPlaceScatter(rng, propId, tier.tierIndex, placed, halfSpan);
    if (!p) continue;
    pickups.push(p);
    placed.push({ px: p.px, pz: p.pz, size: p.size });
  }

  const tier1Index = 0;
  scatterTierPickups(rng, tier1Index, STARTER_TIER_SCATTER_COUNT, placed, pickups, halfSpan, {
    cx: 0,
    cz: 0,
    minDist: STARTER_TIER_SCATTER_MIN,
    maxDist: STARTER_TIER_SCATTER_MAX,
  });
  scatterTierPickups(rng, tier1Index, TIER1_MAP_SCATTER_COUNT, placed, pickups, halfSpan);

  const groundZones = zones.map((z) => ({ cx: z.cx, cz: z.cz }));

  return { pickups, groundZones };
}
