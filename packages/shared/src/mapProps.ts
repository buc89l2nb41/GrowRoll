import type { PropDef } from "./propGeometry.js";

/**
 * Fixed map scenery — not pickable (docs/ART-PROMPTS-GARDEN.md §5).
 * Placed by `generateGardenLayout`; no Rapier colliders.
 */
export const MAP_PROP_DEFS = {
  tile_grass: {
    id: "tile_grass",
    model: "tile_grass.glb",
    size: 2,
    colliderHalf: [0.5, 0.05, 0.5],
  },
  tile_dirt: {
    id: "tile_dirt",
    model: "tile_dirt.glb",
    size: 2,
    colliderHalf: [0.5, 0.05, 0.5],
  },
  tile_stone: {
    id: "tile_stone",
    model: "tile_stone.glb",
    size: 2,
    colliderHalf: [0.5, 0.05, 0.5],
  },
  flower_bed: {
    id: "flower_bed",
    model: "flower_bed.glb",
    size: 2,
    colliderHalf: [0.5, 0.355, 0.397],
  },
  bush: {
    id: "bush",
    model: "bush.glb",
    size: 1.2,
    colliderHalf: [0.331, 0.5, 0.326],
  },
  pond: {
    id: "pond",
    model: "pond.glb",
    size: 4,
    colliderHalf: [0.424, 0.2, 0.5],
  },
} as const satisfies Record<string, PropDef>;

export type MapPropId = keyof typeof MAP_PROP_DEFS;

export const MAP_PROP_IDS = Object.keys(MAP_PROP_DEFS) as MapPropId[];

export function getMapPropDef(id: MapPropId): PropDef {
  return MAP_PROP_DEFS[id];
}
