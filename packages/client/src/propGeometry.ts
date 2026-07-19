import * as THREE from "three";
import type { ColliderHalf } from "@growroll/shared";
import { colliderHalfFromSize } from "@growroll/shared";

/** Expand interleaved GLTF attributes so InstancedMesh shaders compile reliably. */
export function deinterleaveGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = geometry.clone();
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.attributes[name];
    if (!(attr instanceof THREE.InterleavedBufferAttribute)) continue;

    const itemSize = attr.itemSize;
    const arr = new Float32Array(attr.count * itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let j = 0; j < itemSize; j++) {
        arr[i * itemSize + j] = attr.getComponent(i, j);
      }
    }
    geo.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  return geo;
}

/**
 * Normalize to unit size (max axis = 1) and align bottom to y = -0.5,
 * matching BoxGeometry(1,1,1) placement with py = size / 2.
 */
export function prepareInstancedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = deinterleaveGeometry(geometry);
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  if (!box) return geo;

  const center = new THREE.Vector3();
  box.getCenter(center);
  geo.translate(-center.x, -center.y, -center.z);

  geo.computeBoundingBox();
  const sized = geo.boundingBox;
  if (!sized) return geo;

  const size = new THREE.Vector3();
  sized.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  geo.scale(1 / maxDim, 1 / maxDim, 1 / maxDim);

  geo.computeBoundingBox();
  if (geo.boundingBox) {
    geo.translate(0, -geo.boundingBox.min.y - 0.5, 0);
  }

  geo.deleteAttribute("normal");
  geo.deleteAttribute("tangent");
  geo.computeVertexNormals();
  geo.normalizeNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Suggested cuboid half extents after `prepareInstancedGeometry` (for props.ts). */
export function colliderHalfFromGeometry(geometry: THREE.BufferGeometry): ColliderHalf {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return [0.5, 0.5, 0.5];

  const size = new THREE.Vector3();
  box.getSize(size);
  return colliderHalfFromSize(size.x, size.y, size.z);
}
