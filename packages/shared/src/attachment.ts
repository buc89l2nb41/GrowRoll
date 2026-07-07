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

/** Recompute attach positions after the katamari grows. */
export function repositionAttachment(
  normal: [number, number, number],
  radius: number,
  objectHalfSize: number,
  sinkRatio = 0.12,
): [number, number, number] {
  return surfaceAttachPosition(normal, radius, objectHalfSize, sinkRatio);
}
