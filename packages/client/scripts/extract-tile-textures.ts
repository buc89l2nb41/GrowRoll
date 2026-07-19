/**
 * Extract embedded WebP textures from tile GLBs for visual review.
 *
 * Usage:
 *   pnpm extract-tile-textures
 *
 * Output: packages/client/public/textures/extracted/
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelsDir = join(__dirname, "../public/models");
const outDir = join(__dirname, "../public/textures/extracted");

const TILE_GLBS = ["tile_grass.glb", "tile_dirt.glb", "tile_stone.glb"] as const;

const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

interface GltfJson {
  images?: { bufferView?: number; mimeType?: string; name?: string }[];
  textures?: {
    name?: string;
    source?: number;
    extensions?: { EXT_texture_webp?: { source: number } };
  }[];
  materials?: {
    name?: string;
    pbrMetallicRoughness?: {
      baseColorTexture?: { index?: number };
      metallicRoughnessTexture?: { index?: number };
    };
  }[];
  bufferViews?: { buffer: number; byteOffset: number; byteLength: number }[];
}

function parseGlb(filePath: string): { json: GltfJson; bin: Buffer } {
  const buf = readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) throw new Error(`Not a GLB: ${filePath}`);

  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Buffer | null = null;

  while (offset < buf.length) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === CHUNK_JSON) {
      json = JSON.parse(chunkData.toString("utf8")) as GltfJson;
    } else if (chunkType === CHUNK_BIN) {
      bin = chunkData;
    }
    offset += 8 + chunkLength;
  }

  if (!json || !bin) throw new Error(`Invalid GLB chunks: ${filePath}`);
  return { json, bin };
}

function imageBytes(gltf: GltfJson, bin: Buffer, imageIndex: number): Buffer {
  const image = gltf.images?.[imageIndex];
  if (!image?.bufferView && image?.bufferView !== 0) {
    throw new Error(`Image ${imageIndex} has no bufferView`);
  }
  const view = gltf.bufferViews?.[image.bufferView];
  if (!view) throw new Error(`Missing bufferView for image ${imageIndex}`);
  return bin.subarray(view.byteOffset, view.byteOffset + view.byteLength);
}

function textureImageIndex(gltf: GltfJson, textureIndex: number): number {
  const tex = gltf.textures?.[textureIndex];
  if (!tex) throw new Error(`Missing texture ${textureIndex}`);
  const webp = tex.extensions?.EXT_texture_webp?.source;
  if (webp !== undefined) return webp;
  if (tex.source !== undefined) return tex.source;
  throw new Error(`Texture ${textureIndex} has no image source`);
}

function extForMime(mime?: string): string {
  switch (mime) {
    case "image/webp":
      return ".webp";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    default:
      return ".bin";
  }
}

function extractTileGlb(glbPath: string): void {
  const { json, bin } = parseGlb(glbPath);
  const baseName = glbPath.split(/[/\\]/).pop()!.replace(/\.glb$/i, "");
  const mat = json.materials?.[0];
  const baseTexIdx = mat?.pbrMetallicRoughness?.baseColorTexture?.index;
  const mrTexIdx = mat?.pbrMetallicRoughness?.metallicRoughnessTexture?.index;

  const slots: { label: string; textureIndex: number }[] = [];
  if (baseTexIdx !== undefined) slots.push({ label: "basecolor", textureIndex: baseTexIdx });
  if (mrTexIdx !== undefined && mrTexIdx !== baseTexIdx) {
    slots.push({ label: "metallicRoughness", textureIndex: mrTexIdx });
  }

  const written = new Set<number>();
  for (const slot of slots) {
    const imageIndex = textureImageIndex(json, slot.textureIndex);
    if (written.has(imageIndex)) continue;
    written.add(imageIndex);

    const image = json.images![imageIndex]!;
    const bytes = imageBytes(json, bin, imageIndex);
    const ext = extForMime(image.mimeType);
    const outName = `${baseName}_${slot.label}${ext}`;
    const outPath = join(outDir, outName);
    writeFileSync(outPath, bytes);
    console.log(`  wrote ${outName} (${bytes.length} bytes)`);
  }

  for (let i = 0; i < (json.images?.length ?? 0); i++) {
    if (written.has(i)) continue;
    const image = json.images![i]!;
    const bytes = imageBytes(json, bin, i);
    const ext = extForMime(image.mimeType);
    const outName = `${baseName}_image${i}${ext}`;
    writeFileSync(join(outDir, outName), bytes);
    console.log(`  wrote ${outName} (${bytes.length} bytes)`);
  }
}

function main(): void {
  mkdirSync(outDir, { recursive: true });
  console.log(`# Extracting tile textures → ${outDir}\n`);

  for (const file of TILE_GLBS) {
    const path = join(modelsDir, file);
    console.log(file);
    extractTileGlb(path);
    console.log("");
  }

  console.log("Done. Open public/textures/extracted/ to preview.");
}

main();
