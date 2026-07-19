/**
 * Analyze GLB props for suggested colliderHalf values (same normalization as in-game).
 *
 * Usage:
 *   pnpm analyze-props
 *   pnpm analyze-props -- models/custom.glb
 */

/** Minimal DOM stubs so GLTFLoader (WebP textures) works in Node. */
if (typeof globalThis.Image === "undefined") {
  class NodeImage {
    width = 1;
    height = 1;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  (globalThis as unknown as { Image: typeof Image }).Image =
    NodeImage as unknown as typeof Image;
}
const g = globalThis as unknown as {
  self?: typeof globalThis;
  createImageBitmap?: (blob: Blob) => Promise<{ close: () => void }>;
};
g.self = globalThis;
g.createImageBitmap = async () => ({ close: () => {} });

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import {
  colliderHalfFromGeometry,
  prepareInstancedGeometry,
} from "../src/propGeometry.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, "../public/models");

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

async function analyzeGlb(filePath: string): Promise<{
  file: string;
  colliderHalf: [number, number, number];
  triCount: number;
}> {
  const buffer = readFileSync(filePath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );

  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(arrayBuffer, "");

  let mesh: THREE.Mesh | undefined;
  gltf.scene.traverse((child) => {
    if (!mesh && child instanceof THREE.Mesh) mesh = child;
  });
  if (!mesh) throw new Error(`no mesh in ${filePath}`);

  const geometry = prepareInstancedGeometry(mesh.geometry);
  const half = colliderHalfFromGeometry(geometry);
  const triCount = geometry.index
    ? geometry.index.count / 3
    : geometry.attributes.position.count / 3;

  return {
    file: filePath,
    colliderHalf: [round3(half[0]), round3(half[1]), round3(half[2])],
    triCount: Math.round(triCount),
  };
}

function formatPropSnippet(modelFile: string, half: [number, number, number], size: number): string {
  const id = modelFile.replace(/\.glb$/i, "").replace(/[^a-z0-9]+/gi, "_");
  return `  ${id}: {
    id: "${id}",
    model: "${modelFile}",
    size: ${size},
    colliderHalf: [${half.join(", ")}],
  },`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  let files: string[];

  if (args.length > 0) {
    files = args.map((f) => resolve(f));
  } else if (!existsSync(modelsDir)) {
    console.error(`Models directory not found: ${modelsDir}`);
    process.exit(1);
  } else {
    files = readdirSync(modelsDir)
      .filter((f) => f.toLowerCase().endsWith(".glb"))
      .map((f) => join(modelsDir, f));
  }

  if (files.length === 0) {
    console.log("No .glb files found.");
    return;
  }

  console.log("# GrowRoll prop collider analysis");
  console.log("# Paste into packages/shared/src/props.ts and tune by hand.\n");

  const snippets: string[] = [];
  for (const file of files) {
    try {
      const result = await analyzeGlb(file);
      const modelFile = file.split(/[/\\]/).pop()!;
      const sizeGuess = 0.3;
      console.log(`## ${modelFile}`);
      console.log(`  tris:         ${result.triCount}`);
      console.log(`  colliderHalf: [${result.colliderHalf.join(", ")}]`);
      console.log(`  snippet:\n${formatPropSnippet(modelFile, result.colliderHalf, sizeGuess)}\n`);
      snippets.push(formatPropSnippet(modelFile, result.colliderHalf, sizeGuess));
    } catch (err) {
      console.error(`Failed: ${file}`, err);
    }
  }

  if (snippets.length > 1) {
    console.log("# --- combined PROP_DEFS ---");
    console.log("export const PROP_DEFS = {");
    for (const s of snippets) console.log(s);
    console.log("} as const satisfies Record<string, PropDef>;");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
