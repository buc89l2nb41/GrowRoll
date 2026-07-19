/** Axis-aligned half extents (meters) after unit normalization (max axis = 1). */
export type ColliderHalf = readonly [number, number, number];

export interface PropDef {
  /** Stable id used in map generation and networking. */
  id: string;
  /** GLB filename under /models/. */
  model: string;
  /** Representative pickup size (meters); scales collider and visual uniformly. */
  size: number;
  /**
   * Normalized cuboid half extents (relative to `size`).
   * World half = colliderHalf[i] * size.
   */
  colliderHalf: ColliderHalf;
}

/** World-space Rapier cuboid half extents for a prop instance. */
export function worldColliderHalf(
  colliderHalf: ColliderHalf,
  size: number,
): [number, number, number] {
  return [colliderHalf[0] * size, colliderHalf[1] * size, colliderHalf[2] * size];
}

/** Half extents from an axis-aligned bounding box (full width per axis). */
export function colliderHalfFromSize(
  width: number,
  height: number,
  depth: number,
): ColliderHalf {
  return [width / 2, height / 2, depth / 2];
}
