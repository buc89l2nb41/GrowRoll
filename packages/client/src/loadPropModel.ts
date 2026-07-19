import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { colliderHalfFromGeometry, prepareInstancedGeometry } from "./propGeometry.js";

export interface PropModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

/**
 * Trellis / 3D AI Studio exports may ship WebP atlases with odd UV transforms.
 * Use a visible fallback color so props read on the dark scene even if maps fail.
 */
export function prepareMaterial(material: THREE.Material): THREE.Material {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf5e6c8,
    roughness: 0.52,
    metalness: 0,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(0x2a2218),
    emissiveIntensity: 0.06,
  });

  const src =
    material instanceof THREE.MeshStandardMaterial ||
    material instanceof THREE.MeshPhysicalMaterial
      ? material
      : null;

  if (src) {
    const map = src.map;
    if (map?.image && "width" in map.image && map.image.width > 0) {
      mat.map = map;
      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.color.setHex(0xffffff);
      mat.emissiveIntensity = 0.04;
      if (src.color) mat.color.copy(src.color);
    }
  }

  return mat;
}

function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/**
 * Load a GLB prop for InstancedMesh rendering.
 * Returns null on failure (caller falls back to primitives).
 */
export async function loadPropModel(url: string): Promise<PropModel | null> {
  try {
    await MeshoptDecoder.ready;
    const gltf = await createGltfLoader().loadAsync(url);
    let mesh: THREE.Mesh | undefined;
    gltf.scene.traverse((child) => {
      if (!mesh && child instanceof THREE.Mesh) mesh = child;
    });
    if (!mesh) {
      console.warn(`[prop] no mesh in ${url}`);
      return null;
    }

    const geometry = prepareInstancedGeometry(mesh.geometry);
    const material = Array.isArray(mesh.material)
      ? prepareMaterial(mesh.material[0]!)
      : prepareMaterial(mesh.material);

    const pos = geometry.attributes.position;
    if (!pos || pos.count < 3) {
      console.warn(`[prop] invalid geometry in ${url}`);
      return null;
    }

    const triCount = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;
    const half = colliderHalfFromGeometry(geometry);
    console.info(
      `[prop] loaded ${url} (~${Math.round(triCount)} tris, colliderHalf [${half.map((v) => v.toFixed(3)).join(", ")}])`,
    );
    return { geometry, material };
  } catch (err) {
    console.warn(`[prop] failed to load ${url} — using box fallback`, err);
    return null;
  }
}

/** Default test prop path (served from packages/client/public/models/). */
export const DEFAULT_PROP_MODEL_URL = "/models/test_acorn.glb";
