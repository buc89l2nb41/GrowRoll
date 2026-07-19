/**
 * Follow camera offset so the katamari subtends a target fraction of screen height.
 * `heightRatio` lifts the camera; we compensate so vertical screen size stays stable.
 */
export function cameraFollowOffset(
  ballRadius: number,
  verticalFovDeg: number,
  screenFraction: number,
  heightRatio: number,
): { dist: number; height: number } {
  const fovRad = (verticalFovDeg * Math.PI) / 180;
  const elevatedFactor = Math.sqrt(1 + heightRatio * heightRatio);
  const framingRadius = ballRadius * elevatedFactor;
  const lookDist = framingRadius / Math.tan((fovRad * screenFraction) / 2);
  const dist = lookDist / elevatedFactor;
  return { dist, height: dist * heightRatio };
}

/**
 * Camera framing uses only part of visual clump growth so late tiers do not
 * push the view to the horizon.
 */
export function cameraFramingRadius(
  visualRadius: number,
  coreRadius: number,
  growthBlend: number,
  maxRadius: number,
): number {
  const extra = Math.max(0, visualRadius - coreRadius);
  return Math.min(coreRadius + extra * growthBlend, maxRadius);
}

/**
 * Smooth framing radius toward the visual clump. Growth is rate-limited so a single
 * large-tier pickup does not yank the camera outward in one frame.
 */
export function smoothCameraFramingRadius(
  current: number,
  target: number,
  dt: number,
  smoothSpeed: number,
  maxGrowPerSec: number,
): number {
  if (dt <= 0) return current;
  const alpha = 1 - Math.exp(-smoothSpeed * dt);
  let next = current + (target - current) * alpha;
  if (target > current) {
    next = Math.min(next, current + maxGrowPerSec * dt);
  }
  if (target < current) return Math.max(target, next);
  return Math.min(target, next);
}
