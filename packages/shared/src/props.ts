import type { PropDef } from "./propGeometry.js";

/**
 * Pickup prop catalog — 12 dramatic modeling tiers (see docs/ART-PROMPTS-GARDEN.md).
 * Each tier is a big step from the previous (~1.35–1.7×).
 * Pickup rule: object.size <= visible katamari diameter.
 */
export const PROP_DEFS = {
  // T1 — 0.65m (65% of start ball)
  acorn: {
    id: "acorn",
    model: "acorn.glb",
    size: 0.65,
    colliderHalf: [0.236, 0.5, 0.238],
  },
  ladybug: {
    id: "ladybug",
    model: "ladybug.glb",
    size: 0.65,
    colliderHalf: [0.477, 0.5, 0.486],
  },
  clover: {
    id: "clover",
    model: "clover.glb",
    size: 0.65,
    colliderHalf: [0.267, 0.5, 0.276],
  },
  // T2 — 1.10m (110%)
  seed_packet: {
    id: "seed_packet",
    model: "seed_packet.glb",
    size: 1.1,
    colliderHalf: [0.154, 0.5, 0.246],
  },
  mushroom: {
    id: "mushroom",
    model: "mushroom.glb",
    size: 1.1,
    colliderHalf: [0.327, 0.5, 0.313],
  },
  tomato: {
    id: "tomato",
    model: "tomato.glb",
    size: 1.1,
    colliderHalf: [0.353, 0.5, 0.268],
  },
  // T3 — 1.60m (160%)
  moss_rock: {
    id: "moss_rock",
    model: "moss_rock.glb",
    size: 1.6,
    colliderHalf: [0.381, 0.5, 0.368],
  },
  pot_small: {
    id: "pot_small",
    model: "pot_small.glb",
    size: 1.6,
    colliderHalf: [0.22, 0.5, 0.21],
  },
  trowel: {
    id: "trowel",
    model: "trowel.glb",
    size: 1.6,
    colliderHalf: [0.187, 0.5, 0.192],
  },
  // T4 — 2.25m (225%)
  gnome: {
    id: "gnome",
    model: "gnome.glb",
    size: 2.25,
    colliderHalf: [0.171, 0.5, 0.193],
  },
  pot_medium: {
    id: "pot_medium",
    model: "pot_medium.glb",
    size: 2.25,
    colliderHalf: [0.252, 0.5, 0.215],
  },
  // T5 — 3.15m (315%)
  sunflower_small: {
    id: "sunflower_small",
    model: "sunflower_small.glb",
    size: 3.15,
    colliderHalf: [0.163, 0.5, 0.116],
  },
  watering_can: {
    id: "watering_can",
    model: "watering_can.glb",
    size: 3.15,
    colliderHalf: [0.318, 0.5, 0.477],
  },
  // T6 — 4.40m (440%)
  pumpkin: {
    id: "pumpkin",
    model: "pumpkin.glb",
    size: 4.4,
    colliderHalf: [0.301, 0.5, 0.296],
  },
  bird_bath: {
    id: "bird_bath",
    model: "bird_bath.glb",
    size: 4.4,
    colliderHalf: [0.254, 0.5, 0.256],
  },
  // T7 — 6.10m (610%)
  scarecrow: {
    id: "scarecrow",
    model: "scarecrow.glb",
    size: 6.1,
    colliderHalf: [0.221, 0.5, 0.125],
  },
  chair: {
    id: "chair",
    model: "chair.glb",
    size: 6.1,
    colliderHalf: [0.198, 0.5, 0.182],
  },
  // T8 — 8.50m (850%)
  stump: {
    id: "stump",
    model: "stump.glb",
    size: 8.5,
    colliderHalf: [0.231, 0.5, 0.229],
  },
  bush_pot: {
    id: "bush_pot",
    model: "bush_pot.glb",
    size: 8.5,
    colliderHalf: [0.178, 0.5, 0.186],
  },
  hay_bale: {
    id: "hay_bale",
    model: "hay_bale.glb",
    size: 8.5,
    colliderHalf: [0.429, 0.5, 0.292],
  },
  // T9 — 11.5m (1150%)
  picnic_table: {
    id: "picnic_table",
    model: "picnic_table.glb",
    size: 11.5,
    colliderHalf: [0.5, 0.493, 0.346],
  },
  well_low: {
    id: "well_low",
    model: "well_low.glb",
    size: 11.5,
    colliderHalf: [0.302, 0.5, 0.301],
  },
  lantern_post: {
    id: "lantern_post",
    model: "lantern_post.glb",
    size: 11.5,
    colliderHalf: [0.099, 0.5, 0.089],
  },
  // T10 — 14.5m (1450%)
  wheelbarrow: {
    id: "wheelbarrow",
    model: "wheelbarrow.glb",
    size: 14.5,
    colliderHalf: [0.232, 0.381, 0.5],
  },
  bench: {
    id: "bench",
    model: "bench.glb",
    size: 14.5,
    colliderHalf: [0.27, 0.498, 0.5],
  },
  // T11 — 18.0m (1800%)
  well_roof: {
    id: "well_roof",
    model: "well_roof.glb",
    size: 18.0,
    colliderHalf: [0.163, 0.5, 0.202],
  },
  pergola: {
    id: "pergola",
    model: "pergola.glb",
    size: 18.0,
    colliderHalf: [0.111, 0.5, 0.258],
  },
  sunflower_large: {
    id: "sunflower_large",
    model: "sunflower_large.glb",
    size: 18.0,
    colliderHalf: [0.191, 0.5, 0.157],
  },
  // T12 — 22.0m (2200%)
  tree: {
    id: "tree",
    model: "tree.glb",
    size: 22.0,
    colliderHalf: [0.256, 0.5, 0.236],
  },
  shed: {
    id: "shed",
    model: "shed.glb",
    size: 22.0,
    colliderHalf: [0.309, 0.5, 0.25],
  },
  fountain: {
    id: "fountain",
    model: "fountain.glb",
    size: 22.0,
    colliderHalf: [0.304, 0.5, 0.306],
  },
  fence_gate: {
    id: "fence_gate",
    model: "fence_gate.glb",
    size: 22.0,
    colliderHalf: [0.5, 0.388, 0.104],
  },
} as const satisfies Record<string, PropDef>;

export type PropId = keyof typeof PROP_DEFS;

export const PROP_IDS = Object.keys(PROP_DEFS) as PropId[];

/**
 * 12 modeling tiers — each step ~1.35–1.7× the previous (see docs).
 * T1 pickable at spawn (Ø1.0m); T2+ needs visible growth.
 */
export const MAP_SPAWN_SIZES = [
  0.65, 1.1, 1.6, 2.25, 3.15, 4.4, 6.1, 8.5, 11.5, 14.5, 18.0, 22.0,
] as const;

/** Tier-to-tier size multiplier (for docs / tooling). */
export const TIER_STEP_RATIOS = MAP_SPAWN_SIZES.map((size, i) =>
  i === 0 ? null : size / MAP_SPAWN_SIZES[i - 1]!,
);

export const MODELING_TIER_COUNT = MAP_SPAWN_SIZES.length;

export function getPropDef(id: PropId): PropDef {
  return PROP_DEFS[id];
}

/** Deterministic pickup pick — size always matches the prop definition. */
export function pickMapObject(rng: () => number): { propId: PropId; size: number } {
  const propId = PROP_IDS[Math.floor(rng() * PROP_IDS.length)]!;
  const size = getPropDef(propId).size;
  return { propId, size };
}
