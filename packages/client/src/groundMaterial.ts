import * as THREE from "three";
import { GROUND_TEXTURE_TILE_SIZE } from "@growroll/shared";

const BAKE_RESOLUTION = 2048;

export interface GroundZonePatch {
  cx: number;
  cz: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`[ground] failed to load ${url}`));
    img.src = url;
  });
}

type Rgb = [number, number, number];

function makeTileSampler(img: HTMLImageElement): (u: number, v: number) => Rgb {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[ground] canvas 2d unavailable");
  ctx.drawImage(img, 0, 0);
  const { data, width: w, height: h } = ctx.getImageData(0, 0, img.width, img.height);

  return (u: number, v: number): Rgb => {
    const fu = ((u % 1) + 1) % 1;
    const fv = ((v % 1) + 1) % 1;
    const x = Math.min(w - 1, Math.floor(fu * w));
    const y = Math.min(h - 1, Math.floor((1 - fv) * h));
    const i = (y * w + x) * 4;
    return [data[i]!, data[i + 1]!, data[i + 2]!];
  };
}

function stoneMask(xz: number, zz: number, pathHalfWidth: number): number {
  const mx = 1 - smoothstep(pathHalfWidth * 0.72, pathHalfWidth, Math.abs(xz));
  const mz = 1 - smoothstep(pathHalfWidth * 0.72, pathHalfWidth, Math.abs(zz));
  return Math.max(mx, mz);
}

function dirtMask(
  xz: number,
  zz: number,
  zones: readonly GroundZonePatch[],
  dirtRadius: number,
): number {
  let mask = 0;
  for (const zone of zones) {
    const dx = Math.abs(xz - zone.cx);
    const dz = Math.abs(zz - zone.cz);
    const patch = 1 - smoothstep(dirtRadius * 0.82, dirtRadius, Math.max(dx, dz));
    mask = Math.max(mask, patch);
  }
  return mask;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function bakeGroundMap(
  groundSize: number,
  zones: readonly GroundZonePatch[],
  sampleGrass: (u: number, v: number) => Rgb,
  sampleDirt: (u: number, v: number) => Rgb,
  sampleStone: (u: number, v: number) => Rgb,
): THREE.CanvasTexture {
  const pathHalfWidth = GROUND_TEXTURE_TILE_SIZE * 0.55;
  const dirtRadius = GROUND_TEXTURE_TILE_SIZE * 2.5;
  const half = groundSize / 2;

  const canvas = document.createElement("canvas");
  canvas.width = BAKE_RESOLUTION;
  canvas.height = BAKE_RESOLUTION;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[ground] canvas 2d unavailable");

  const image = ctx.createImageData(BAKE_RESOLUTION, BAKE_RESOLUTION);
  const out = image.data;

  for (let py = 0; py < BAKE_RESOLUTION; py++) {
    const wz = half - (py / (BAKE_RESOLUTION - 1)) * groundSize;
    for (let px = 0; px < BAKE_RESOLUTION; px++) {
      const wx = (px / (BAKE_RESOLUTION - 1)) * groundSize - half;
      const tu = wx / GROUND_TEXTURE_TILE_SIZE;
      const tv = wz / GROUND_TEXTURE_TILE_SIZE;

      const grass = sampleGrass(tu, tv);
      const dirt = sampleDirt(tu, tv);
      const stone = sampleStone(tu, tv);

      const stoneW = stoneMask(wx, wz, pathHalfWidth);
      const dirtW = dirtMask(wx, wz, zones, dirtRadius) * (1 - stoneW);

      let rgb = mixRgb(grass, dirt, dirtW);
      rgb = mixRgb(rgb, stone, stoneW);

      const i = (py * BAKE_RESOLUTION + px) * 4;
      out[i] = rgb[0];
      out[i + 1] = rgb[1];
      out[i + 2] = rgb[2];
      out[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;

  return tex;
}

/**
 * Bakes grass / stone paths / dirt patches into one map on the ground plane.
 * Avoids fragile MeshStandardMaterial shader patching (Three r171+).
 */
export async function createGroundMaterial(
  groundSize: number,
  zones: readonly GroundZonePatch[],
): Promise<THREE.MeshStandardMaterial> {
  const t0 = performance.now();
  const [grassImg, dirtImg, stoneImg] = await Promise.all([
    loadImage("/textures/tile_grass.png"),
    loadImage("/textures/tile_dirt.png"),
    loadImage("/textures/tile_stone.png"),
  ]);

  const map = bakeGroundMap(
    groundSize,
    zones,
    makeTileSampler(grassImg),
    makeTileSampler(dirtImg),
    makeTileSampler(stoneImg),
  );

  console.info(
    `[ground] baked texture ${BAKE_RESOLUTION}² in ${Math.round(performance.now() - t0)}ms`,
  );

  return new THREE.MeshStandardMaterial({
    map,
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
  });
}
