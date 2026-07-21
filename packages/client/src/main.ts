import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  START_RADIUS,
  VISUAL_CORE_RADIUS,
  FIXED_DT,
  ANGULAR_DAMPING,
  LINEAR_DAMPING,
  GROUND_FRICTION,
  KATAMARI_MASS,
  ATTACH_SINK_RATIO,
  CAMERA_FOV,
  CAMERA_BALL_SCREEN_FRACTION,
  CAMERA_HEIGHT_RATIO,
  CAMERA_RADIUS_SMOOTH_SPEED,
  CAMERA_RADIUS_MAX_GROW_PER_SEC,
  CAMERA_RADIUS_GROWTH_BLEND,
  CAMERA_MAX_FRAME_RADIUS,
  cameraFollowOffset,
  cameraFramingRadius,
  smoothCameraFramingRadius,
  MAP_PICKUP_BUDGET,
  MAP_GROUND_SIZE,
  MAP_PLAY_MARGIN,
  MAP_RECOVER_MIN_Y,
  MAP_RECOVER_MAX_Y,
  STREAM_CHUNK_SIZE,
  STREAM_PHYSICS_RADIUS,
  STREAM_VISUAL_RADIUS,
  STREAM_VISUAL_RELEASE_RADIUS,
  STREAM_FADE_IN_SPEED,
  TILE_FLOOR_ENABLED,
  GROUND_TEXTURE_ENABLED,
  ATTACH_PHYSICS_COUNT,
  WORLD_GRAVITY,
  GROUND_COLLIDER_HALF_HEIGHT,
  PHYSICS_SUBSTEPS,
  PHYSICS_MAX_CCD_SUBSTEPS,
  SOFT_CCD_RADIUS_FACTOR,
  GROUND_PROBE_MARGIN,
  AIR_CONTROL,
  MOVE_SPEED,
  computeMoveDir,
  computeMoveVelocity,
  computeRollAngvel,
  tieredSurfaceAttachPosition,
  radialOutwardNormal,
  canPickup,
  growPickupRadius,
  modelingClumpRadius,
  computePickupSensorRadius,
  physicsColliderRadius,
  growthHudText,
  PROP_IDS,
  mulberry32,
  seededUnitVector,
  WORLD_SEED,
  getPropDef,
  worldColliderHalf,
  generateGardenLayout,
  type PropId,
} from "@growroll/shared";
import { Input } from "./input.js";
import { Net } from "./net.js";
import { PHYS_GROUPS } from "./collisionGroups.js";
import { logPropDrawables, resolvePropDrawables } from "./objectDrawables.js";
import { createGroundMaterial } from "./groundMaterial.js";

/**
 * Phase 1 LOCAL prototype (optimized): Three.js + Rapier katamari.
 *
 * Performance strategy (see docs/DESIGN.md §7):
 *  - Map + attached objects rendered with InstancedMesh (per propId) => few draw calls.
 *  - Free objects are STATIC colliders (no rigid body, no per-tick sync).
 *  - Collision events on the katamari sphere + clump pickup sensor (overlap).
 *  - The rolling sphere collider is rebuilt only when the radius grows >2%.
 */
async function main() {
  await RAPIER.init();

  const debugCollidersEnabled = import.meta.env.VITE_DEBUG_COLLIDERS === "true";

  const app = document.getElementById("app")!;
  const sizeLabel = document.getElementById("size")!;
  const countLabel = document.getElementById("count")!;
  const nextLabel = document.getElementById("next")!;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.appendChild(renderer.domElement);

  const skyColor = new THREE.Color(0x9ecfff);
  const scene = new THREE.Scene();
  scene.background = skyColor.clone();

  const camera = new THREE.PerspectiveCamera(
    CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  const hemi = new THREE.HemisphereLight(0xf4f8ff, 0x8fb878, 1.45);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xfff6e8, 0.62);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff9ef, 2.1);
  sun.position.set(28, 52, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  const shadowExtent = 36;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0xc8ddff, 0.55);
  fill.position.set(-24, 28, -18);
  scene.add(fill);

  let colliderDebug: import("./debugColliders.js").ColliderDebug | null = null;
  if (debugCollidersEnabled) {
    const { ColliderDebug } = await import("./debugColliders.js");
    colliderDebug = new ColliderDebug(scene);
    console.info("[debug] collider wireframes enabled (VITE_DEBUG_COLLIDERS)");
  }

  const world = new RAPIER.World({ x: 0, y: WORLD_GRAVITY, z: 0 });
  world.integrationParameters.maxCcdSubsteps = PHYSICS_MAX_CCD_SUBSTEPS;

  const groundSize = MAP_GROUND_SIZE;
  const groundHalfY = GROUND_COLLIDER_HALF_HEIGHT;

  const rng = mulberry32(WORLD_SEED);
  const layout = generateGardenLayout(rng, groundSize, MAP_PICKUP_BUDGET);

  const groundMaterial = GROUND_TEXTURE_ENABLED
    ? await createGroundMaterial(groundSize, layout.groundZones)
    : new THREE.MeshStandardMaterial({
        color: 0x5a9c52,
        roughness: 0.88,
        metalness: 0,
      });

  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMaterial);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  groundMesh.visible = !TILE_FLOOR_ENABLED;
  scene.add(groundMesh);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(groundSize / 2, groundHalfY, groundSize / 2)
      .setTranslation(0, -groundHalfY, 0)
      .setCollisionGroups(PHYS_GROUPS.world),
  );
  colliderDebug?.setGround(groundSize / 2, groundHalfY, groundSize / 2);

  const wallHeight = 4;
  const wallThick = 1;
  const half = groundSize / 2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.88 });
  const hedgeMat = new THREE.MeshStandardMaterial({ color: 0x4d8a42, roughness: 0.92 });
  const walls = new THREE.Group();
  scene.add(walls);

  function addBoundaryWall(
    px: number,
    py: number,
    pz: number,
    hx: number,
    hy: number,
    hz: number,
  ): void {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hx, hy, hz)
        .setTranslation(px, py, pz)
        .setCollisionGroups(PHYS_GROUPS.world),
    );
    const fence = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2),
      wallMat,
    );
    fence.position.set(px, py, pz);
    fence.castShadow = true;
    fence.receiveShadow = true;
    walls.add(fence);
    const hedgeH = 1.2;
    const hedge = new THREE.Mesh(
      new THREE.BoxGeometry(hx * 2, hedgeH, hz * 2),
      hedgeMat,
    );
    hedge.position.set(px, py + hy + hedgeH / 2 - 0.05, pz);
    hedge.castShadow = true;
    walls.add(hedge);
  }

  addBoundaryWall(half + wallThick / 2, wallHeight / 2, 0, wallThick / 2, wallHeight / 2, half);
  addBoundaryWall(-half - wallThick / 2, wallHeight / 2, 0, wallThick / 2, wallHeight / 2, half);
  addBoundaryWall(0, wallHeight / 2, half + wallThick / 2, half, wallHeight / 2, wallThick / 2);
  addBoundaryWall(0, wallHeight / 2, -half - wallThick / 2, half, wallHeight / 2, wallThick / 2);

  /** Rolling physics sphere — grows slowly with the visible clump. */
  let colliderRadius = START_RADIUS;

  const ballRoot = new THREE.Object3D();
  scene.add(ballRoot);
  const attachments = new THREE.Group();
  ballRoot.add(attachments);

  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xff7043,
    roughness: 0.5,
    metalness: 0.1,
  });
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), ballMat);
  ballMesh.castShadow = true;
  ballMesh.scale.setScalar(VISUAL_CORE_RADIUS);
  ballRoot.add(ballMesh);

  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, colliderRadius, 0)
      .setAngularDamping(ANGULAR_DAMPING)
      .setLinearDamping(LINEAR_DAMPING)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(colliderRadius * SOFT_CCD_RADIUS_FACTOR),
  );
  function makeKatamariCollider(r: number): RAPIER.Collider {
    return world.createCollider(
      RAPIER.ColliderDesc.ball(r)
        .setMass(KATAMARI_MASS)
        .setFriction(GROUND_FRICTION)
        .setRestitution(0.02)
        .setCollisionGroups(PHYS_GROUPS.katamari)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ballBody,
    );
  }
  let ballCollider = makeKatamariCollider(colliderRadius);

  let respawnX = 0;
  let respawnZ = 0;

  /** Solid colliders for the newest attachments (rotate with the ball). */
  const attachColliders: RAPIER.Collider[] = [];

  /** Pickup-only sensor — matches visible clump so props touching attachments still stick. */
  let activePickupSensorRadius = VISUAL_CORE_RADIUS;
  function makePickupSensor(r: number): RAPIER.Collider {
    return world.createCollider(
      RAPIER.ColliderDesc.ball(r)
        .setSensor(true)
        .setCollisionGroups(PHYS_GROUPS.pickupSensor)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ballBody,
    );
  }
  let pickupSensor = makePickupSensor(activePickupSensorRadius);

  const eventQueue = new RAPIER.EventQueue(true);
  const ballQuat = new THREE.Quaternion();
  const invBallQuat = new THREE.Quaternion();
  const worldNormal = new THREE.Vector3();
  const localNormal = new THREE.Vector3();
  const toObject = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  const mat4 = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  const CHUNK_SIZE = STREAM_CHUNK_SIZE;

  interface FreeObj {
    id: number;
    propId: PropId;
    index: number;
    /** Per-instance visual + collider scale. */
    size: number;
    /** Spawn modeling tier — used for core vs layered attach. */
    tierIndex: number;
    px: number;
    py: number;
    pz: number;
    rotY: number;
    collider: RAPIER.Collider | null;
    colliderHalf: [number, number, number];
    picked: boolean;
    visual: boolean;
    physics: boolean;
    /** 0 = hidden, 1 = full scale (fade-in on spawn). */
    fade: number;
    /** Cached pickable vs blocking collision filter. */
    pickableFilter?: boolean;
  }

  const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
  const cellIndex = (v: number) => Math.floor((v + groundSize / 2) / CHUNK_SIZE);

  const drawables = await resolvePropDrawables();
  logPropDrawables(drawables);

  const perPropCount = Object.fromEntries(PROP_IDS.map((id) => [id, 0])) as Record<
    PropId,
    number
  >;
  for (const p of layout.pickups) perPropCount[p.propId]++;

  const perPropIdx = Object.fromEntries(PROP_IDS.map((id) => [id, 0])) as Record<
    PropId,
    number
  >;
  const freeObjs: FreeObj[] = [];
  const chunks = new Map<string, FreeObj[]>();
  for (let i = 0; i < layout.pickups.length; i++) {
    const p = layout.pickups[i]!;
    const def = getPropDef(p.propId);
    const obj: FreeObj = {
      id: i,
      propId: p.propId,
      index: perPropIdx[p.propId]++,
      size: p.size,
      tierIndex: p.tierIndex,
      px: p.px,
      py: p.size / 2,
      pz: p.pz,
      rotY: p.rotY,
      collider: null,
      colliderHalf: worldColliderHalf(def.colliderHalf, p.size),
      picked: false,
      visual: false,
      physics: false,
      fade: 0,
    };
    freeObjs.push(obj);
    const key = cellKey(cellIndex(p.px), cellIndex(p.pz));
    (chunks.get(key) ?? chunks.set(key, []).get(key)!).push(obj);
  }

  function propGeometry(propId: PropId): THREE.BufferGeometry {
    const d = drawables[propId];
    return d.usingGlb ? d.geometry.clone() : d.geometry;
  }

  function makeInstancedMesh(
    propId: PropId,
    count: number,
    castShadow: boolean,
  ): THREE.InstancedMesh {
    const d = drawables[propId];
    const m = new THREE.InstancedMesh(
      propGeometry(propId),
      d.material,
      Math.max(1, count),
    );
    m.castShadow = castShadow;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let k = 0; k < m.count; k++) m.setMatrixAt(k, HIDDEN);
    m.instanceMatrix.needsUpdate = true;
    return m;
  }

  const freeMesh = Object.fromEntries(
    PROP_IDS.map((id) => {
      const m = makeInstancedMesh(id, perPropCount[id], false);
      scene.add(m);
      return [id, m];
    }),
  ) as Record<PropId, THREE.InstancedMesh>;

  const attachMesh = Object.fromEntries(
    PROP_IDS.map((id) => {
      const m = makeInstancedMesh(id, perPropCount[id], true);
      m.count = 0;
      attachments.add(m);
      return [id, m];
    }),
  ) as Record<PropId, THREE.InstancedMesh>;

  if (GROUND_TEXTURE_ENABLED) {
    console.info("[ground] texture floor: grass + stone paths + dirt zones (1 draw call)");
  }

  const freeByCollider = new Map<number, FreeObj>();
  const dirtyFreeProps = new Set<PropId>();

  interface Attached {
    propId: PropId;
    index: number;
    size: number;
    normal: THREE.Vector3;
    rot: THREE.Quaternion;
    /** Ball-local position frozen at pickup (rolling sphere surface at attach time). */
    localPos: THREE.Vector3;
  }
  const attachedList: Attached[] = [];
  let attachedCount = 0;
  /** Pickup eligibility + tier progression (volume growth — not visual shell). */
  let pickupGrowthRadius = START_RADIUS;

  function pickupClumpRadius(): number {
    return modelingClumpRadius(pickupGrowthRadius);
  }

  function pickupSensorReach(): number {
    return computePickupSensorRadius(visualClumpRadius(), pickupGrowthRadius);
  }

  function composePickupMatrix(obj: FreeObj): void {
    if (!obj.visual || obj.picked || obj.fade <= 0) {
      freeMesh[obj.propId].setMatrixAt(obj.index, HIDDEN);
      return;
    }
    const s = obj.size * obj.fade;
    mat4.compose(
      scratchPos.set(obj.px, obj.py, obj.pz),
      scratchQuat.setFromAxisAngle(up, obj.rotY),
      scratchScale.set(s, s, s),
    );
    freeMesh[obj.propId].setMatrixAt(obj.index, mat4);
  }

  function setObjPhysics(obj: FreeObj, on: boolean): void {
    if (obj.picked || obj.physics === on) return;
    obj.physics = on;
    if (on) {
      const [hx, hy, hz] = obj.colliderHalf;
      scratchQuat.setFromAxisAngle(up, obj.rotY);
      obj.collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(obj.px, obj.py, obj.pz)
          .setRotation({ x: scratchQuat.x, y: scratchQuat.y, z: scratchQuat.z, w: scratchQuat.w })
          .setFriction(0.6)
          .setRestitution(0),
      );
      freeByCollider.set(obj.collider.handle, obj);
      obj.pickableFilter = undefined;
      syncPropCollisionGroups(obj, true);
      colliderDebug?.addProp(obj.id, obj.px, obj.py, obj.pz, hx, hy, hz);
    } else {
      if (obj.collider) {
        freeByCollider.delete(obj.collider.handle);
        world.removeCollider(obj.collider, false);
        obj.collider = null;
      }
      colliderDebug?.removeProp(obj.id);
    }
  }

  function setObjVisual(obj: FreeObj, on: boolean): void {
    if (obj.picked || obj.visual === on) return;
    obj.visual = on;
    if (on) {
      obj.fade = 0.001;
      composePickupMatrix(obj);
    } else {
      obj.fade = 0;
      freeMesh[obj.propId].setMatrixAt(obj.index, HIDDEN);
    }
    dirtyFreeProps.add(obj.propId);
  }

  function chunkDistChebyshev(key: string, cx: number, cz: number): number {
    const comma = key.indexOf(",");
    const kx = Number(key.slice(0, comma));
    const kz = Number(key.slice(comma + 1));
    return Math.max(Math.abs(kx - cx), Math.abs(kz - cz));
  }

  function collectChunkRing(cx: number, cz: number, radius: number): Set<string> {
    const out = new Set<string>();
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        out.add(cellKey(cx + dx, cz + dz));
      }
    }
    return out;
  }

  function tickPickupFades(dt: number): void {
    const dirty = new Set<PropId>();
    for (const obj of freeObjs) {
      if (!obj.visual || obj.picked || obj.fade >= 1) continue;
      obj.fade = Math.min(1, obj.fade + dt * STREAM_FADE_IN_SPEED);
      composePickupMatrix(obj);
      dirty.add(obj.propId);
    }
    for (const id of dirty) freeMesh[id].instanceMatrix.needsUpdate = true;
  }

  let activePhysicsCells = new Set<string>();
  let activeVisualCells = new Set<string>();
  let streamCellX = NaN;
  let streamCellZ = NaN;

  function updateStreaming(bx: number, bz: number): void {
    const cx = cellIndex(bx);
    const cz = cellIndex(bz);
    if (cx === streamCellX && cz === streamCellZ) return;
    streamCellX = cx;
    streamCellZ = cz;

    const physicsWanted = collectChunkRing(cx, cz, STREAM_PHYSICS_RADIUS);
    const visualWanted = collectChunkRing(cx, cz, STREAM_VISUAL_RADIUS);

    for (const k of activePhysicsCells) {
      if (!physicsWanted.has(k)) {
        const list = chunks.get(k);
        if (list) for (const o of list) setObjPhysics(o, false);
      }
    }
    for (const k of physicsWanted) {
      if (!activePhysicsCells.has(k)) {
        const list = chunks.get(k);
        if (list) for (const o of list) setObjPhysics(o, true);
      }
    }
    activePhysicsCells = physicsWanted;

    const nextVisual = new Set<string>();
    for (const k of activeVisualCells) {
      if (chunkDistChebyshev(k, cx, cz) <= STREAM_VISUAL_RELEASE_RADIUS) nextVisual.add(k);
    }
    for (const k of visualWanted) nextVisual.add(k);

    for (const k of activeVisualCells) {
      if (!nextVisual.has(k)) {
        const list = chunks.get(k);
        if (list) for (const o of list) setObjVisual(o, false);
      }
    }
    for (const k of nextVisual) {
      if (!activeVisualCells.has(k)) {
        const list = chunks.get(k);
        if (list) for (const o of list) setObjVisual(o, true);
      }
    }
    activeVisualCells = nextVisual;

    for (const id of dirtyFreeProps) freeMesh[id].instanceMatrix.needsUpdate = true;
    dirtyFreeProps.clear();
  }
  updateStreaming(0, 0);

  const input = new Input(renderer.domElement);

  const MAX_REMOTE_ATTACH = 80;

  interface RemoteAttach {
    propId: PropId;
    size: number;
    normal: THREE.Vector3;
    localPos: THREE.Vector3;
  }
  interface Remote {
    group: THREE.Object3D;
    core: THREE.Mesh;
    attachMeshes: Record<PropId, THREE.InstancedMesh>;
    attachList: RemoteAttach[];
    layoutRadius: number;
    targetPos: THREE.Vector3;
    targetQuat: THREE.Quaternion;
    radius: number;
  }
  const remotes = new Map<string, Remote>();
  const remoteGeo = new THREE.SphereGeometry(1, 24, 18);

  function colorForId(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return new THREE.Color().setHSL((h % 360) / 360, 0.6, 0.55).getHex();
  }

  function createRemote(id: string, pos: [number, number, number]): Remote {
    const group = new THREE.Object3D();
    group.position.set(pos[0], pos[1], pos[2]);
    scene.add(group);

    const core = new THREE.Mesh(
      remoteGeo,
      new THREE.MeshStandardMaterial({ color: colorForId(id), roughness: 0.5 }),
    );
    core.castShadow = true;
    group.add(core);

    const attachMeshes = Object.fromEntries(
      PROP_IDS.map((propId) => {
        const m = makeInstancedMesh(propId, MAX_REMOTE_ATTACH, true);
        m.count = 0;
        group.add(m);
        return [propId, m];
      }),
    ) as Record<PropId, THREE.InstancedMesh>;

    const r: Remote = {
      group,
      core,
      attachMeshes,
      attachList: [],
      layoutRadius: 0,
      targetPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
      targetQuat: new THREE.Quaternion(),
      radius: START_RADIUS,
    };
    remotes.set(id, r);
    return r;
  }

  function layoutRemoteAttach(
    a: RemoteAttach,
    meshIndex: number,
    mesh: THREE.InstancedMesh,
  ): void {
    scratchQuat.setFromUnitVectors(up, a.normal);
    mat4.compose(
      scratchPos.copy(a.localPos),
      scratchQuat,
      scratchScale.set(a.size, a.size, a.size),
    );
    mesh.setMatrixAt(meshIndex, mat4);
  }

  function rebuildRemoteAttaches(r: Remote): void {
    for (const id of PROP_IDS) {
      const mesh = r.attachMeshes[id];
      mesh.count = 0;
      for (let k = 0; k < MAX_REMOTE_ATTACH; k++) mesh.setMatrixAt(k, HIDDEN);
    }

    const start = Math.max(0, r.attachList.length - MAX_REMOTE_ATTACH);
    const perPropIdx = Object.fromEntries(PROP_IDS.map((id) => [id, 0])) as Record<
      PropId,
      number
    >;

    for (let i = start; i < r.attachList.length; i++) {
      const a = r.attachList[i]!;
      const mesh = r.attachMeshes[a.propId];
      const idx = perPropIdx[a.propId]++;
      layoutRemoteAttach(a, idx, mesh);
      mesh.count = idx + 1;
    }

    for (const id of PROP_IDS) {
      r.attachMeshes[id].instanceMatrix.needsUpdate = true;
    }
  }

  function upsertRemote(p: {
    id: string;
    pos: [number, number, number];
    rot: [number, number, number, number];
    radius: number;
  }): void {
    const r = remotes.get(p.id) ?? createRemote(p.id, p.pos);
    r.targetPos.set(p.pos[0], p.pos[1], p.pos[2]);
    r.targetQuat.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]);
    r.radius = p.radius;
  }

  function addRemoteAttachment(playerId: string, objectId: number): void {
    const obj = freeObjs[objectId];
    if (!obj) return;
    const r = remotes.get(playerId) ?? createRemote(playerId, [obj.px, obj.py, obj.pz]);

    const [nx, ny, nz] = seededUnitVector(objectId);
    const normal = new THREE.Vector3(nx, ny, nz);
    const [lx, ly, lz] = tieredSurfaceAttachPosition(
      [nx, ny, nz],
      VISUAL_CORE_RADIUS,
      r.radius,
      obj.tierIndex,
      obj.size,
      ATTACH_SINK_RATIO,
    );
    r.attachList.push({
      propId: obj.propId,
      size: obj.size,
      normal,
      localPos: new THREE.Vector3(lx, ly, lz),
    });
    rebuildRemoteAttaches(r);
  }

  function removeRemote(id: string): void {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.group);
    (r.core.material as THREE.Material).dispose();
    for (const id of PROP_IDS) {
      r.attachMeshes[id].dispose();
    }
    remotes.delete(id);
  }

  const playerName = `Player${Math.floor(Math.random() * 1000)}`;
  const serverUrl = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:8080";
  const net = new Net(serverUrl);
  const netLabel = document.getElementById("net");
  net.onStatus = (s) => {
    if (netLabel) {
      netLabel.textContent =
        s === "online"
          ? `온라인 · ${remotes.size}명`
          : s === "connecting"
            ? "연결 중…"
            : "오프라인 (싱글)";
    }
    if (s === "online") net.send({ t: "join", name: playerName });
  };
  net.onMessage = (msg) => {
    switch (msg.t) {
      case "welcome":
        net.playerId = msg.playerId;
        respawnX = msg.spawn[0];
        respawnZ = msg.spawn[2];
        // Sync map with server session (cleared picks after empty room, etc.).
        respawnAllMapObjects();
        ballBody.setTranslation(
          { x: msg.spawn[0], y: msg.spawn[1], z: msg.spawn[2] },
          true,
        );
        ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
        updateStreaming(msg.spawn[0], msg.spawn[2]);
        break;
      case "snapshot": {
        const seen = new Set<string>();
        for (const p of msg.players) {
          if (p.id !== net.playerId) {
            upsertRemote(p);
            seen.add(p.id);
          }
        }
        for (const id of remotes.keys()) {
          if (!seen.has(id)) removeRemote(id);
        }
        break;
      }
      case "pickup":
        removeMapObjectById(msg.objectId);
        if (msg.playerId && msg.playerId !== net.playerId) {
          addRemoteAttachment(msg.playerId, msg.objectId);
        }
        break;
      case "playerLeft":
        removeRemote(msg.playerId);
        break;
    }
  };
  net.connect();

  let stateAccum = 0;
  let stateSeq = 0;

  function removeMapObject(obj: FreeObj, fromNetwork = false): void {
    if (obj.picked) return;
    obj.picked = true;
    obj.visual = false;
    obj.physics = false;
    obj.fade = 0;

    freeMesh[obj.propId].setMatrixAt(obj.index, HIDDEN);
    freeMesh[obj.propId].instanceMatrix.needsUpdate = true;

    if (obj.collider) {
      freeByCollider.delete(obj.collider.handle);
      world.removeCollider(obj.collider, false);
      obj.collider = null;
    }
    colliderDebug?.removeProp(obj.id);

    if (!fromNetwork && net.isOnline) {
      net.send({ t: "pickupReport", objectId: obj.id });
    }
  }

  /** Restore a picked map object (streaming re-enables visual/physics when in range). */
  function respawnMapObject(obj: FreeObj): void {
    if (!obj.picked) return;
    obj.picked = false;
    obj.pickableFilter = undefined;
    obj.physics = false;
    obj.visual = false;
    obj.fade = 0;
    if (obj.collider) {
      freeByCollider.delete(obj.collider.handle);
      world.removeCollider(obj.collider, false);
      obj.collider = null;
    }
    colliderDebug?.removeProp(obj.id);
    freeMesh[obj.propId].setMatrixAt(obj.index, HIDDEN);
    dirtyFreeProps.add(obj.propId);
  }

  function respawnAllMapObjects(): void {
    for (const obj of freeObjs) respawnMapObject(obj);
    streamCellX = NaN;
    streamCellZ = NaN;
  }

  function removeMapObjectById(objectId: number): void {
    const obj = freeObjs[objectId];
    if (obj) removeMapObject(obj, true);
  }

  function isKatamariCollider(handle: number): boolean {
    if (handle === ballCollider.handle || handle === pickupSensor.handle) return true;
    for (const c of attachColliders) {
      if (c.handle === handle) return true;
    }
    return false;
  }

  function attachmentProtrusion(a: Attached): number {
    return Math.hypot(a.localPos.x, a.localPos.y, a.localPos.z) + a.size / 2;
  }

  function visualClumpRadius(): number {
    let maxR = VISUAL_CORE_RADIUS;
    for (const a of attachedList) {
      maxR = Math.max(maxR, attachmentProtrusion(a));
    }
    return maxR;
  }

  function placeAttachment(a: Attached): void {
    mat4.compose(a.localPos, a.rot, scratchScale.set(a.size, a.size, a.size));
    attachMesh[a.propId].setMatrixAt(a.index, mat4);
  }

  function syncPickupSensor(next: number): void {
    if (Math.abs(next - activePickupSensorRadius) < 1e-5) return;
    activePickupSensorRadius = next;
    world.removeCollider(pickupSensor, false);
    pickupSensor = makePickupSensor(activePickupSensorRadius);
  }

  function syncColliderRadius(next: number): void {
    if (Math.abs(next - colliderRadius) < 1e-5) return;
    const prev = colliderRadius;
    colliderRadius = next;
    world.removeCollider(ballCollider, false);
    ballCollider = makeKatamariCollider(colliderRadius);
    ballBody.setSoftCcdPrediction(colliderRadius * SOFT_CCD_RADIUS_FACTOR);

    const t = ballBody.translation();
    let y = t.y;
    if (next > prev && isBallGrounded()) {
      y += next - prev;
    }
    ballBody.setTranslation({ x: t.x, y, z: t.z }, true);
  }

  function syncAttachColliders(): void {
    for (const c of attachColliders) {
      world.removeCollider(c, false);
    }
    attachColliders.length = 0;

    const colliding = [...attachedList]
      .sort((a, b) => attachmentProtrusion(b) - attachmentProtrusion(a))
      .slice(0, ATTACH_PHYSICS_COUNT);
    for (const a of colliding) {
      const def = getPropDef(a.propId);
      const [hx, hy, hz] = worldColliderHalf(def.colliderHalf, a.size);
      const c = world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(a.localPos.x, a.localPos.y, a.localPos.z)
          .setRotation({ x: a.rot.x, y: a.rot.y, z: a.rot.z, w: a.rot.w })
          .setFriction(GROUND_FRICTION)
          .setRestitution(0.02)
          .setDensity(0)
          .setCollisionGroups(PHYS_GROUPS.katamari)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        ballBody,
      );
      attachColliders.push(c);
    }
  }

  function isBallGrounded(): boolean {
    const p = ballBody.translation();
    const ray = new RAPIER.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(
      ray,
      colliderRadius + GROUND_PROBE_MARGIN,
      true,
      undefined,
      undefined,
      ballCollider,
      ballBody,
    );
    return hit !== null;
  }

  function settleGroundContact(): void {
    if (!isBallGrounded()) return;
    const lv = ballBody.linvel();
    if (lv.y < 0) {
      ballBody.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
    }
  }

  const FLOOR_RECOVER_RAY_Y = 48;

  /** Safety net when discrete physics misses the ground collider. */
  function recoverGroundTunnel(): void {
    const p = ballBody.translation();
    const minCenterY = colliderRadius;
    if (p.y >= minCenterY - 0.2) return;

    const ray = new RAPIER.Ray(
      { x: p.x, y: FLOOR_RECOVER_RAY_Y, z: p.z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = world.castRay(
      ray,
      FLOOR_RECOVER_RAY_Y + 20,
      true,
      undefined,
      undefined,
      ballCollider,
      ballBody,
    );

    let targetY = minCenterY;
    if (hit) {
      const surfaceY = FLOOR_RECOVER_RAY_Y - hit.timeOfImpact;
      targetY = Math.max(minCenterY, surfaceY + colliderRadius);
    }

    ballBody.setTranslation({ x: p.x, y: targetY, z: p.z }, true);
    const lv = ballBody.linvel();
    if (lv.y < 0) {
      ballBody.setLinvel({ x: lv.x, y: 0, z: lv.z }, true);
    }
  }

  /** Return to spawn when physics bugs push the ball outside the playable map. */
  function recoverOutOfBounds(): void {
    const p = ballBody.translation();
    const horizLimit = MAP_GROUND_SIZE / 2 - MAP_PLAY_MARGIN;
    const outside =
      Math.abs(p.x) > horizLimit ||
      Math.abs(p.z) > horizLimit ||
      p.y < MAP_RECOVER_MIN_Y ||
      p.y > MAP_RECOVER_MAX_Y;
    if (!outside) return;

    ballBody.setTranslation({ x: respawnX, y: colliderRadius, z: respawnZ }, true);
    ballBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ballBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
    console.warn("[recover] ball returned to spawn (out of bounds)");
  }

  function contactNormal(
    katamariColliderObj: RAPIER.Collider,
    free: FreeObj,
  ): THREE.Vector3 | null {
    let found = false;
    worldNormal.set(0, 1, 0);
    if (free.collider) {
      world.contactPair(katamariColliderObj, free.collider, (manifold) => {
        if (manifold.numContacts() === 0) return;
        const n = manifold.normal();
        worldNormal.set(n.x, n.y, n.z);
        found = true;
      });
    }

    const bp = ballBody.translation();
    const op = { x: free.px, y: free.py, z: free.pz };
    toObject.set(op.x - bp.x, op.y - bp.y, op.z - bp.z);

    if (!found) {
      if (toObject.lengthSq() < 1e-6) return null;
      return toObject.normalize().clone();
    }
    if (toObject.lengthSq() > 1e-6 && worldNormal.dot(toObject) < 0) {
      worldNormal.negate();
    }
    return worldNormal.clone();
  }

  function canPickupNow(free: FreeObj): boolean {
    return canPickup(free.size, pickupClumpRadius());
  }

  function syncPropCollisionGroups(obj: FreeObj, force = false): void {
    if (!obj.collider || obj.picked) return;
    const pickable = canPickupNow(obj);
    if (!force && obj.pickableFilter === pickable) return;
    obj.pickableFilter = pickable;
    obj.collider.setCollisionGroups(
      pickable ? PHYS_GROUPS.pickupProp : PHYS_GROUPS.blockProp,
    );
  }

  function syncAllActivePropCollisionGroups(): void {
    for (const obj of freeObjs) {
      if (obj.physics && !obj.picked) syncPropCollisionGroups(obj, true);
    }
  }

  function tryPickupOverlaps(): void {
    const bp = ballBody.translation();
    const shape = new RAPIER.Ball(pickupSensorReach());
    const pending = new Set<FreeObj>();

    world.intersectionsWithShape(
      { x: bp.x, y: bp.y, z: bp.z },
      ballBody.rotation(),
      shape,
      (collider) => {
        const free = freeByCollider.get(collider.handle);
        if (free && !free.picked && canPickupNow(free)) pending.add(free);
        return true;
      },
      undefined,
      PHYS_GROUPS.pickupSensor,
      pickupSensor,
      ballBody,
    );

    for (const free of pending) {
      if (free.picked) continue;
      const radial = radialOutwardNormal(
        [bp.x, bp.y, bp.z],
        [free.px, free.py, free.pz],
      );
      if (!radial) continue;
      worldNormal.set(radial[0], radial[1], radial[2]);
      attachPickup(free, worldNormal);
    }
  }

  function attachPickup(free: FreeObj, normalWorld: THREE.Vector3): void {
    if (free.picked) return;
    if (!canPickupNow(free)) return;

    const bp = ballBody.translation();
    const r = ballBody.rotation();
    ballQuat.set(r.x, r.y, r.z, r.w);
    invBallQuat.copy(ballQuat).invert();

    if (normalWorld.lengthSq() > 1e-6) {
      localNormal.copy(normalWorld).applyQuaternion(invBallQuat).normalize();
    } else {
      const radial = radialOutwardNormal(
        [bp.x, bp.y, bp.z],
        [free.px, free.py, free.pz],
      );
      if (!radial) return;
      localNormal.set(radial[0], radial[1], radial[2]).applyQuaternion(invBallQuat).normalize();
    }
    const rot = new THREE.Quaternion().setFromUnitVectors(up, localNormal);
    rot.premultiply(
      scratchQuat.setFromAxisAngle(localNormal, Math.random() * Math.PI * 2),
    );

    removeMapObject(free, false);
    attachedCount++;

    const [lx, ly, lz] = tieredSurfaceAttachPosition(
      [localNormal.x, localNormal.y, localNormal.z],
      VISUAL_CORE_RADIUS,
      pickupClumpRadius(),
      free.tierIndex,
      free.size,
      ATTACH_SINK_RATIO,
    );
    const localPos = new THREE.Vector3(lx, ly, lz);

    const propId = free.propId;
    const index = attachMesh[propId].count;
    attachMesh[propId].count = index + 1;
    const a: Attached = {
      propId,
      index,
      size: free.size,
      normal: localNormal.clone(),
      rot,
      localPos,
    };
    attachedList.push(a);
    placeAttachment(a);
    attachMesh[propId].instanceMatrix.needsUpdate = true;

    pickupGrowthRadius = growPickupRadius(pickupGrowthRadius, free.size);
    syncPickupSensor(pickupSensorReach());
    syncColliderRadius(physicsColliderRadius(visualClumpRadius()));
    syncAttachColliders();
    syncAllActivePropCollisionGroups();
  }

  function handleCollisions(): void {
    eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;

      let katHandle: number;
      let otherHandle: number;
      if (isKatamariCollider(h1)) {
        katHandle = h1;
        otherHandle = h2;
      } else if (isKatamariCollider(h2)) {
        katHandle = h2;
        otherHandle = h1;
      } else {
        return;
      }

      const free = freeByCollider.get(otherHandle);
      if (!free || free.picked) return;
      if (!canPickupNow(free)) return;

      const katCollider = world.getCollider(katHandle);
      const normal = contactNormal(katCollider, free);
      if (normal) attachPickup(free, normal);
    });
  }

  function updateHud(): void {
    const clumpR = pickupClumpRadius();
    sizeLabel.textContent = (clumpR * 2).toFixed(2);
    countLabel.textContent = String(attachedCount);
    nextLabel.textContent = growthHudText(clumpR);

    if (netLabel && net.isOnline) {
      netLabel.textContent = `온라인 · ${remotes.size}명`;
    }
  }

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let accumulator = 0;
  let last = performance.now();
  let cameraFrameRadius = VISUAL_CORE_RADIUS;

  function applyMovement(): void {
    const [mx, my] = input.move;
    const lv = ballBody.linvel();
    const grounded = isBallGrounded();

    if (grounded) {
      const vel = computeMoveVelocity({ move: [mx, my], yaw: input.yaw }, lv.y);
      ballBody.setLinvel(vel, true);
      ballBody.setAngvel(computeRollAngvel(vel.x, vel.z, colliderRadius), true);
      return;
    }

    const dir = computeMoveDir({ move: [mx, my], yaw: input.yaw });
    const steer = AIR_CONTROL * MOVE_SPEED;
    ballBody.setLinvel(
      {
        x: lv.x + dir.x * steer * FIXED_DT,
        y: lv.y,
        z: lv.z + dir.z * steer * FIXED_DT,
      },
      true,
    );
    ballBody.setAngvel(computeRollAngvel(lv.x, lv.z, colliderRadius), true);
  }

  function frame(now: number) {
    const frameDt = Math.min((now - last) / 1000, 0.05);
    last = now;
    accumulator += frameDt;

    while (accumulator >= FIXED_DT) {
      applyMovement();
      const subDt = FIXED_DT / PHYSICS_SUBSTEPS;
      for (let s = 0; s < PHYSICS_SUBSTEPS; s++) {
        world.timestep = subDt;
        world.step(eventQueue);
      }
      settleGroundContact();
      recoverGroundTunnel();
      recoverOutOfBounds();
      handleCollisions();
      tryPickupOverlaps();
      accumulator -= FIXED_DT;
    }

    const bp = ballBody.translation();
    updateStreaming(bp.x, bp.z);
    tickPickupFades(frameDt);

    const yaw = input.yaw;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

    const t = ballBody.translation();
    const rot = ballBody.rotation();
    ballRoot.position.set(t.x, t.y, t.z);
    ballQuat.set(rot.x, rot.y, rot.z, rot.w);
    ballRoot.quaternion.copy(ballQuat);
    colliderDebug?.syncBall(t.x, t.y, t.z, colliderRadius, ballQuat);

    sun.position.set(t.x + 28, t.y + 52, t.z + 22);
    sun.target.position.set(t.x, t.y, t.z);
    fill.position.set(t.x - 24, t.y + 28, t.z - 18);

    const targetFrameR = cameraFramingRadius(
      visualClumpRadius(),
      VISUAL_CORE_RADIUS,
      CAMERA_RADIUS_GROWTH_BLEND,
      CAMERA_MAX_FRAME_RADIUS,
    );
    cameraFrameRadius = smoothCameraFramingRadius(
      cameraFrameRadius,
      targetFrameR,
      frameDt,
      CAMERA_RADIUS_SMOOTH_SPEED,
      CAMERA_RADIUS_MAX_GROW_PER_SEC,
    );
    const { dist, height } = cameraFollowOffset(
      cameraFrameRadius,
      CAMERA_FOV,
      CAMERA_BALL_SCREEN_FRACTION,
      CAMERA_HEIGHT_RATIO,
    );
    camera.position.set(t.x - forward.x * dist, t.y + height, t.z - forward.z * dist);
    camera.lookAt(t.x, t.y, t.z);

    stateAccum += frameDt;
    if (net.isOnline && stateAccum >= 0.05) {
      stateAccum = 0;
      net.send({
        t: "state",
        seq: stateSeq++,
        pos: [t.x, t.y, t.z],
        rot: [rot.x, rot.y, rot.z, rot.w],
        radius: pickupClumpRadius(),
        score: attachedCount,
      });
    }

    const lerpA = 1 - Math.exp(-frameDt * 12);
    for (const r of remotes.values()) {
      r.group.position.lerp(r.targetPos, lerpA);
      r.group.quaternion.slerp(r.targetQuat, lerpA);
      r.core.scale.setScalar(VISUAL_CORE_RADIUS);
    }

    updateHud();

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
  });
}

main().catch((err) => {
  console.error(err);
  document.body.innerHTML =
    '<pre style="color:#ff7b72;padding:24px">' + String(err) + "</pre>";
});
