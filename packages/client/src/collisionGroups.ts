/** Rapier collision membership / filter bit masks. */
export const COL = {
  WORLD: 0x0001,
  KATAMARI: 0x0002,
  PICKUP_PROP: 0x0004,
  BLOCK_PROP: 0x0008,
  PICKUP_SENSOR: 0x0010,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return (membership << 16) | filter;
}

const WORLD_FILTER = COL.WORLD | COL.KATAMARI | COL.PICKUP_PROP | COL.BLOCK_PROP;

/** Pre-built group filters for katamari pickup vs blocking. */
export const PHYS_GROUPS = {
  world: interactionGroups(COL.WORLD, WORLD_FILTER),
  katamari: interactionGroups(COL.KATAMARI, COL.WORLD | COL.BLOCK_PROP),
  pickupProp: interactionGroups(COL.PICKUP_PROP, COL.WORLD | COL.PICKUP_SENSOR),
  blockProp: interactionGroups(COL.BLOCK_PROP, COL.WORLD | COL.KATAMARI | COL.PICKUP_SENSOR),
  pickupSensor: interactionGroups(COL.PICKUP_SENSOR, COL.PICKUP_PROP | COL.BLOCK_PROP),
} as const;
