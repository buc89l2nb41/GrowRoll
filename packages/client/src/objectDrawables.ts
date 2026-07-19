import * as THREE from "three";
import { getPropDef, PROP_IDS, type PropId } from "@growroll/shared";
import { loadPropModel, prepareMaterial } from "./loadPropModel.js";

const boxGeo = new THREE.BoxGeometry(1, 1, 1);

export interface PropDrawable {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  usingGlb: boolean;
}

export type PropDrawables = Record<PropId, PropDrawable>;

async function loadDrawable(
  model: string,
  fallbackColor: number,
): Promise<PropDrawable> {
  const url = `/models/${model}`;
  const loaded = await loadPropModel(url);
  if (loaded) {
    return {
      geometry: loaded.geometry,
      material: prepareMaterial(loaded.material),
      usingGlb: true,
    };
  }
  return {
    geometry: boxGeo,
    material: new THREE.MeshStandardMaterial({
      color: fallbackColor,
      roughness: 0.7,
    }),
    usingGlb: false,
  };
}

export async function resolvePropDrawables(): Promise<PropDrawables> {
  const pickup = {} as PropDrawables;

  await Promise.all(
    PROP_IDS.map(async (propId) => {
      const def = getPropDef(propId);
      pickup[propId] = await loadDrawable(def.model, 0xc9a86c);
    }),
  );

  return pickup;
}

export function logPropDrawables(drawables: PropDrawables): void {
  for (const id of PROP_IDS) {
    const d = drawables[id];
    console.info(`[pickup] ${id}: ${d.usingGlb ? "GLB" : "box fallback"}`);
  }
}
