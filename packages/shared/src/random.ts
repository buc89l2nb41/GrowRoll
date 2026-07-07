/**
 * Deterministic PRNG so every client generates the identical map layout.
 * mulberry32: fast, good-enough distribution for object scatter.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shared world seed — all clients build the same map from this. */
export const WORLD_SEED = 0x67726f77; // "grow"

/**
 * Deterministic unit vector from an integer seed. Used to place a remote
 * player's attachments on their sphere identically on every client, without
 * sending any per-object position data over the network.
 */
export function seededUnitVector(seed: number): [number, number, number] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  // uniform on sphere: z in [-1,1], theta in [0,2pi)
  const z = rand() * 2 - 1;
  const theta = rand() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return [r * Math.cos(theta), z, r * Math.sin(theta)];
}
