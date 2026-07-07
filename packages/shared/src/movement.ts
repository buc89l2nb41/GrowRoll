import { MOVE_SPEED } from "./constants.js";

export interface RollInput {
  move: [number, number];
  yaw: number;
}

/** Horizontal speed on the XZ plane (m/s). */
export function horizontalSpeed(vx: number, vz: number): number {
  return Math.hypot(vx, vz);
}

/**
 * Camera-relative horizontal move direction from input axes.
 * `move` is [strafe, forward] in [-1, 1] and already diagonal-normalized,
 * so the returned vector has magnitude <= 1 (direction-independent speed).
 */
export function computeMoveDir(
  input: RollInput,
): { x: number; z: number } {
  const [mx, my] = input.move;
  if (mx === 0 && my === 0) return { x: 0, z: 0 };

  const fx = Math.sin(input.yaw);
  const fz = Math.cos(input.yaw);
  // forward = (fx, fz), right = (-fz, fx)
  return {
    x: fx * my - fz * mx,
    z: fz * my + fx * mx,
  };
}

/**
 * Target horizontal velocity for constant-speed movement (no acceleration).
 * Preserves the caller's vertical velocity (gravity) via `vy`.
 */
export function computeMoveVelocity(
  input: RollInput,
  vy: number,
): { x: number; y: number; z: number } {
  const dir = computeMoveDir(input);
  return { x: dir.x * MOVE_SPEED, y: vy, z: dir.z * MOVE_SPEED };
}

/**
 * Angular velocity that makes a sphere of `radius` visually roll without
 * slipping for the given horizontal velocity. Purely cosmetic.
 */
export function computeRollAngvel(
  vx: number,
  vz: number,
  radius: number,
): { x: number; y: number; z: number } {
  if (radius <= 1e-4) return { x: 0, y: 0, z: 0 };
  return { x: vz / radius, y: 0, z: -vx / radius };
}
