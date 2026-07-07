import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  START_RADIUS,
  FIXED_DT,
  ANGULAR_DAMPING,
  LINEAR_DAMPING,
  GROUND_FRICTION,
  KATAMARI_MASS,
  ATTACH_SINK_RATIO,
  computeMoveVelocity,
  computeRollAngvel,
  surfaceAttachPosition,
  growKatamariRadius,
  canPickup,
  nextLockedTier,
  minDiameterForPickup,
  OBJECT_TIERS,
  mulberry32,
  seededUnitVector,
  WORLD_SEED,
} from "@growroll/shared";
import { Input } from "./input.js";
import { Net } from "./net.js";

/**
 * Phase 1 LOCAL prototype (optimized): Three.js + Rapier katamari.
 *
 * Performance strategy (see docs/DESIGN.md §7):
 *  - Map + attached objects rendered with InstancedMesh (per tier) => few draw calls.
 *  - Free objects are STATIC colliders (no rigid body, no per-tick sync).
 *  - Collision events only on the katamari sphere + a capped set of attach sensors.
 *  - The rolling sphere collider is rebuilt only when the radius grows >2%.
 */
async function main() {
  await RAPIER.init();

  const app = document.getElementById("app")!;
  const sizeLabel = document.getElementById("size")!;
  const countLabel = document.getElementById("count")!;
  const nextLabel = document.getElementById("next")!;

  // --- renderer / scene ----------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  scene.fog = new THREE.Fog(0x0b1020, 40, 120);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );

  const hemi = new THREE.HemisphereLight(0xbad7ff, 0x202840, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(20, 40, 20);
  sun.castShadow = true;
  // Smaller shadow map + tight frustum that follows the player = crisp + cheap.
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  const shadowExtent = 24;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  scene.add(sun);
  scene.add(sun.target);

  // --- physics world -------------------------------------------------------
  const world = new RAPIER.World({ x: 0, y: -20, z: 0 });

  // ground
  const groundSize = 240;
  const groundMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: 0x1b2a4a, roughness: 1 }),
  );
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);
  const grid = new THREE.GridHelper(groundSize, 48, 0x33507f, 0x22375c);
  scene.add(grid);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(groundSize / 2, 0.5, groundSize / 2).setTranslation(
      0,
      -0.5,
      0,
    ),
  );

  // --- katamari (player ball) ---------------------------------------------
  /** Logical size: grows on every pickup. Drives HUD, pickup gating, camera. */
  let katamariRadius = START_RADIUS;
  /** Physical/visual radius: trails katamariRadius, updated in >=2% steps. */
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
  ballMesh.scale.setScalar(colliderRadius);
  ballRoot.add(ballMesh);

  const ballBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, colliderRadius, 0)
      .setAngularDamping(ANGULAR_DAMPING)
      .setLinearDamping(LINEAR_DAMPING),
  );
  function makeKatamariCollider(r: number): RAPIER.Collider {
    return world.createCollider(
      RAPIER.ColliderDesc.ball(r)
        .setMass(KATAMARI_MASS)
        .setFriction(GROUND_FRICTION)
        .setRestitution(0.08)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ballBody,
    );
  }
  let ballCollider = makeKatamariCollider(colliderRadius);

  const eventQueue = new RAPIER.EventQueue(true);
  const ballQuat = new THREE.Quaternion();
  const invBallQuat = new THREE.Quaternion();
  const worldNormal = new THREE.Vector3();
  const localNormal = new THREE.Vector3();
  const toObject = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  // scratch objects reused for matrix composition (avoid per-frame allocs)
  const mat4 = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

  // --- instanced object pools + chunk streaming ---------------------------
  // Tier 3: the map can hold thousands of objects, but only objects in chunks
  // near the player get a physics collider + visible instance. This bounds the
  // active collider count regardless of total map size.
  const NUM_OBJECTS = 1500;
  const CHUNK_SIZE = 20; // meters per chunk cell
  const ACTIVE_RADIUS = 2; // Chebyshev radius of active cells (5x5 = 25 cells)
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  interface FreeObj {
    id: number; // stable index into freeObjs (shared across clients)
    tier: number;
    index: number; // instance slot in freeMesh[tier]
    size: number;
    px: number;
    py: number;
    pz: number;
    collider: RAPIER.Collider | null; // only set while active
    picked: boolean;
    active: boolean;
  }

  const cellKey = (cx: number, cz: number) => `${cx},${cz}`;
  const cellIndex = (v: number) => Math.floor((v + groundSize / 2) / CHUNK_SIZE);

  // Decide tiers/positions up-front so we can size instanced meshes exactly.
  // Seeded RNG => every client generates the identical map layout.
  const rng = mulberry32(WORLD_SEED);
  const perTier = OBJECT_TIERS.map(() => 0);
  const freeObjs: FreeObj[] = [];
  const chunks = new Map<string, FreeObj[]>();
  for (let i = 0; i < NUM_OBJECTS; i++) {
    const tier = Math.floor(rng() * OBJECT_TIERS.length);
    const size = OBJECT_TIERS[tier].size;
    const px = (rng() - 0.5) * (groundSize - 6);
    const pz = (rng() - 0.5) * (groundSize - 6);
    const obj: FreeObj = {
      id: i,
      tier,
      index: perTier[tier]++,
      size,
      px,
      py: size / 2,
      pz,
      collider: null,
      picked: false,
      active: false,
    };
    freeObjs.push(obj);
    const key = cellKey(cellIndex(px), cellIndex(pz));
    (chunks.get(key) ?? chunks.set(key, []).get(key)!).push(obj);
  }

  // Free (world) objects: one InstancedMesh per tier. All start hidden and are
  // revealed only when their chunk is active.
  const freeMesh = OBJECT_TIERS.map((t, ti) => {
    const m = new THREE.InstancedMesh(
      boxGeo,
      new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7 }),
      Math.max(1, perTier[ti]),
    );
    m.castShadow = false;
    m.receiveShadow = false;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let k = 0; k < m.count; k++) m.setMatrixAt(k, HIDDEN);
    m.instanceMatrix.needsUpdate = true;
    scene.add(m);
    return m;
  });

  // Attached objects: one InstancedMesh per tier, parented to the ball.
  const attachMesh = OBJECT_TIERS.map((t, ti) => {
    const m = new THREE.InstancedMesh(
      boxGeo,
      new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.7 }),
      Math.max(1, perTier[ti]),
    );
    m.castShadow = true;
    m.frustumCulled = false;
    m.count = 0;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    attachments.add(m);
    return m;
  });

  const freeByCollider = new Map<number, FreeObj>();
  const dirtyFreeTiers = new Set<number>();

  function setObjActive(obj: FreeObj, active: boolean): void {
    if (obj.picked || obj.active === active) return;
    obj.active = active;
    if (active) {
      const half = obj.size / 2;
      obj.collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(half, half, half)
          .setTranslation(obj.px, obj.py, obj.pz)
          .setFriction(0.6)
          .setRestitution(0.05),
        // no COLLISION_EVENTS — the katamari collider carries the flag
      );
      freeByCollider.set(obj.collider.handle, obj);
      mat4.compose(
        scratchPos.set(obj.px, obj.py, obj.pz),
        scratchQuat.identity(),
        scratchScale.set(obj.size, obj.size, obj.size),
      );
      freeMesh[obj.tier].setMatrixAt(obj.index, mat4);
    } else {
      if (obj.collider) {
        freeByCollider.delete(obj.collider.handle);
        world.removeCollider(obj.collider, false);
        obj.collider = null;
      }
      freeMesh[obj.tier].setMatrixAt(obj.index, HIDDEN);
    }
    dirtyFreeTiers.add(obj.tier);
  }

  let activeCells = new Set<string>();
  let currentCell = "";
  function updateStreaming(bx: number, bz: number): void {
    const cx = cellIndex(bx);
    const cz = cellIndex(bz);
    const key = cellKey(cx, cz);
    if (key === currentCell) return;
    currentCell = key;

    const wanted = new Set<string>();
    for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
      for (let dz = -ACTIVE_RADIUS; dz <= ACTIVE_RADIUS; dz++) {
        wanted.add(cellKey(cx + dx, cz + dz));
      }
    }
    for (const k of activeCells) {
      if (!wanted.has(k)) {
        const list = chunks.get(k);
        if (list) for (const o of list) setObjActive(o, false);
      }
    }
    for (const k of wanted) {
      if (!activeCells.has(k)) {
        const list = chunks.get(k);
        if (list) for (const o of list) setObjActive(o, true);
      }
    }
    activeCells = wanted;
    dirtyFreeTiers.forEach((ti) => (freeMesh[ti].instanceMatrix.needsUpdate = true));
    dirtyFreeTiers.clear();
  }
  updateStreaming(0, 0); // activate chunks around the spawn point

  // --- attached bookkeeping + sensor cap ----------------------------------
  interface Attached {
    tier: number;
    index: number;
    size: number;
    normal: THREE.Vector3; // outward normal in ball-local space
    rot: THREE.Quaternion; // orientation in ball-local space
    sensor?: RAPIER.Collider;
  }
  const attachedList: Attached[] = [];
  let attachedCount = 0;

  // Only the most recent sensors are kept as real colliders; older attachments
  // are approximated by the growing sphere. Bounds physics cost as we scale.
  const MAX_SENSORS = 24;
  const sensorHandles = new Set<number>();
  const sensorQueue: Attached[] = [];

  // --- input ---------------------------------------------------------------
  const input = new Input(renderer.domElement);

  // --- networking (Phase 2 relay) -----------------------------------------
  // A remote player is rendered as a core sphere + a single InstancedMesh that
  // holds their attached objects (per-instance color = tier). Attachments are
  // reconstructed from the SHARED deterministic map via broadcast `pickup`
  // events, so no per-object position data is ever sent over the network.
  const MAX_REMOTE_ATTACH = 80; // visual cap per remote (ring buffer)
  const tierColors = OBJECT_TIERS.map((t) => new THREE.Color(t.color));

  interface RemoteAttach {
    tier: number;
    size: number;
    normal: THREE.Vector3;
  }
  interface Remote {
    group: THREE.Object3D;
    core: THREE.Mesh;
    attachMesh: THREE.InstancedMesh;
    attach: (RemoteAttach | undefined)[];
    attachTotal: number;
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

    const attachMesh = new THREE.InstancedMesh(
      boxGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      MAX_REMOTE_ATTACH,
    );
    attachMesh.castShadow = true;
    attachMesh.frustumCulled = false;
    attachMesh.count = 0;
    attachMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(attachMesh);

    const r: Remote = {
      group,
      core,
      attachMesh,
      attach: new Array(MAX_REMOTE_ATTACH),
      attachTotal: 0,
      layoutRadius: 0,
      targetPos: new THREE.Vector3(pos[0], pos[1], pos[2]),
      targetQuat: new THREE.Quaternion(),
      radius: START_RADIUS,
    };
    remotes.set(id, r);
    return r;
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

  /** Place a single remote attachment instance on the sphere surface. */
  function layoutRemoteAttach(r: Remote, idx: number): void {
    const a = r.attach[idx];
    if (!a) return;
    const [x, y, z] = surfaceAttachPosition(
      [a.normal.x, a.normal.y, a.normal.z],
      r.radius,
      a.size / 2,
      ATTACH_SINK_RATIO,
    );
    scratchQuat.setFromUnitVectors(up, a.normal);
    mat4.compose(scratchPos.set(x, y, z), scratchQuat, scratchScale.set(a.size, a.size, a.size));
    r.attachMesh.setMatrixAt(idx, mat4);
    r.attachMesh.setColorAt(idx, tierColors[a.tier]);
  }

  /** Attribute a picked map object to the remote player who grabbed it. */
  function addRemoteAttachment(playerId: string, objectId: number): void {
    const obj = freeObjs[objectId];
    if (!obj) return;
    const r = remotes.get(playerId) ?? createRemote(playerId, [obj.px, obj.py, obj.pz]);

    const idx = r.attachTotal % MAX_REMOTE_ATTACH; // ring buffer
    r.attachTotal++;
    const [nx, ny, nz] = seededUnitVector(objectId);
    r.attach[idx] = { tier: obj.tier, size: obj.size, normal: new THREE.Vector3(nx, ny, nz) };
    r.attachMesh.count = Math.min(r.attachTotal, MAX_REMOTE_ATTACH);
    layoutRemoteAttach(r, idx);
    r.attachMesh.instanceMatrix.needsUpdate = true;
    if (r.attachMesh.instanceColor) r.attachMesh.instanceColor.needsUpdate = true;
  }

  function removeRemote(id: string): void {
    const r = remotes.get(id);
    if (!r) return;
    scene.remove(r.group);
    (r.core.material as THREE.Material).dispose();
    (r.attachMesh.material as THREE.Material).dispose();
    r.attachMesh.dispose();
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
        // Teleport to server-assigned spawn so players do not overlap.
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
        // Drop remotes that left or are no longer in the room.
        for (const id of remotes.keys()) {
          if (!seen.has(id)) removeRemote(id);
        }
        break;
      }
      case "pickup":
        removeMapObjectById(msg.objectId);
        // Attribute the object to the remote who grabbed it (empty id = late-join sync).
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
    obj.active = false;

    freeMesh[obj.tier].setMatrixAt(obj.index, HIDDEN);
    freeMesh[obj.tier].instanceMatrix.needsUpdate = true;

    if (obj.collider) {
      freeByCollider.delete(obj.collider.handle);
      world.removeCollider(obj.collider, false);
      obj.collider = null;
    }

    if (!fromNetwork && net.isOnline) {
      net.send({ t: "pickupReport", objectId: obj.id });
    }
  }

  function removeMapObjectById(objectId: number): void {
    const obj = freeObjs[objectId];
    if (obj) removeMapObject(obj, true);
  }

  function isKatamariCollider(handle: number): boolean {
    return handle === ballCollider.handle || sensorHandles.has(handle);
  }

  function placeAttachment(a: Attached): { x: number; y: number; z: number } {
    const [x, y, z] = surfaceAttachPosition(
      [a.normal.x, a.normal.y, a.normal.z],
      colliderRadius,
      a.size / 2,
      ATTACH_SINK_RATIO,
    );
    mat4.compose(scratchPos.set(x, y, z), a.rot, scratchScale.set(a.size, a.size, a.size));
    attachMesh[a.tier].setMatrixAt(a.index, mat4);
    return { x, y, z };
  }

  /** Rebuild rolling collider + reposition all attachments after growth. */
  function rebuildKatamari(): void {
    colliderRadius = katamariRadius;
    world.removeCollider(ballCollider, false);
    ballCollider = makeKatamariCollider(colliderRadius);
    ballMesh.scale.setScalar(colliderRadius);

    const t = ballBody.translation();
    ballBody.setTranslation({ x: t.x, y: colliderRadius, z: t.z }, true);

    const touched = new Set<number>();
    for (const a of attachedList) {
      const p = placeAttachment(a);
      a.sensor?.setTranslation({ x: p.x, y: p.y, z: p.z });
      touched.add(a.tier);
    }
    touched.forEach((ti) => (attachMesh[ti].instanceMatrix.needsUpdate = true));
  }

  function maybeRebuildKatamari(): void {
    if (katamariRadius >= colliderRadius * 1.02) rebuildKatamari();
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

  function attachPickup(free: FreeObj, normalWorld: THREE.Vector3): void {
    if (free.picked) return;
    if (!canPickup(free.size, katamariRadius)) return;

    removeMapObject(free, false);
    attachedCount++;

    // local normal + orientation (sit flat on the contacted face, random twist)
    const r = ballBody.rotation();
    ballQuat.set(r.x, r.y, r.z, r.w);
    invBallQuat.copy(ballQuat).invert();
    localNormal.copy(normalWorld).applyQuaternion(invBallQuat).normalize();
    const rot = new THREE.Quaternion().setFromUnitVectors(up, localNormal);
    rot.premultiply(
      scratchQuat.setFromAxisAngle(localNormal, Math.random() * Math.PI * 2),
    );

    const ti = free.tier;
    const index = attachMesh[ti].count;
    attachMesh[ti].count = index + 1;
    const a: Attached = { tier: ti, index, size: free.size, normal: localNormal.clone(), rot };
    attachedList.push(a);
    placeAttachment(a);
    attachMesh[ti].instanceMatrix.needsUpdate = true;

    // capped sensor so protruding faces stay "sticky" near the player
    const p = surfaceAttachPosition(
      [localNormal.x, localNormal.y, localNormal.z],
      colliderRadius,
      free.size / 2,
      ATTACH_SINK_RATIO,
    );
    const half = free.size / 2;
    const sensor = world.createCollider(
      RAPIER.ColliderDesc.cuboid(half, half, half)
        .setTranslation(p[0], p[1], p[2])
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      ballBody,
    );
    a.sensor = sensor;
    sensorHandles.add(sensor.handle);
    sensorQueue.push(a);
    if (sensorQueue.length > MAX_SENSORS) {
      const old = sensorQueue.shift();
      if (old?.sensor) {
        sensorHandles.delete(old.sensor.handle);
        world.removeCollider(old.sensor, false);
        old.sensor = undefined;
      }
    }

    katamariRadius = growKatamariRadius(katamariRadius, free.size);
    maybeRebuildKatamari();
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
      if (!canPickup(free.size, katamariRadius)) return;

      const katCollider = world.getCollider(katHandle);
      const normal = contactNormal(katCollider, free);
      if (normal) attachPickup(free, normal);
    });
  }

  function updateHud(): void {
    const diameter = katamariRadius * 2;
    sizeLabel.textContent = diameter.toFixed(2);
    countLabel.textContent = String(attachedCount);

    const next = nextLockedTier(katamariRadius);
    if (next) {
      const need = minDiameterForPickup(next.size);
      const remain = Math.max(0, need - diameter);
      nextLabel.textContent = `${next.name} (${need.toFixed(2)}m) · ${remain.toFixed(2)}m 남음`;
    } else {
      nextLabel.textContent = "모든 단계 해금";
    }

    if (netLabel && net.isOnline) {
      netLabel.textContent = `온라인 · ${remotes.size}명`;
    }
  }

  // --- resize --------------------------------------------------------------
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // --- loop ----------------------------------------------------------------
  let accumulator = 0;
  let last = performance.now();

  function applyMovement(): void {
    const [mx, my] = input.move;
    const lv = ballBody.linvel();

    // Constant-speed, direction-independent control: set velocity directly so
    // there is no acceleration, instant stop on release, instant reverse.
    const vel = computeMoveVelocity({ move: [mx, my], yaw: input.yaw }, lv.y);
    ballBody.setLinvel(vel, true);
    // Angular velocity only drives the visual roll (cosmetic).
    ballBody.setAngvel(computeRollAngvel(vel.x, vel.z, colliderRadius), true);
  }

  function frame(now: number) {
    const frameDt = Math.min((now - last) / 1000, 0.05);
    last = now;
    accumulator += frameDt;

    while (accumulator >= FIXED_DT) {
      applyMovement();
      world.timestep = FIXED_DT;
      world.step(eventQueue);
      handleCollisions();
      accumulator -= FIXED_DT;
    }

    // stream in/out map chunks around the player (cheap: early-outs per cell)
    const bp = ballBody.translation();
    updateStreaming(bp.x, bp.z);

    const yaw = input.yaw;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

    // sync ball root from physics
    const t = ballBody.translation();
    const rot = ballBody.rotation();
    ballRoot.position.set(t.x, t.y, t.z);
    ballQuat.set(rot.x, rot.y, rot.z, rot.w);
    ballRoot.quaternion.copy(ballQuat);

    // shadow frustum follows the player for crisp, cheap shadows
    sun.position.set(t.x + 20, t.y + 40, t.z + 20);
    sun.target.position.set(t.x, t.y, t.z);

    // camera follows behind based on yaw, distance scales with size
    const dist = 6 + katamariRadius * 4;
    const height = 3 + katamariRadius * 2.5;
    camera.position.set(t.x - forward.x * dist, t.y + height, t.z - forward.z * dist);
    camera.lookAt(t.x, t.y, t.z);

    // report own state to the relay server (~20Hz)
    stateAccum += frameDt;
    if (net.isOnline && stateAccum >= 0.05) {
      stateAccum = 0;
      net.send({
        t: "state",
        seq: stateSeq++,
        pos: [t.x, t.y, t.z],
        rot: [rot.x, rot.y, rot.z, rot.w],
        radius: katamariRadius,
        score: attachedCount,
      });
    }

    // interpolate remote players toward their latest snapshot
    const lerpA = 1 - Math.exp(-frameDt * 12);
    for (const r of remotes.values()) {
      r.group.position.lerp(r.targetPos, lerpA);
      r.group.quaternion.slerp(r.targetQuat, lerpA);
      r.core.scale.setScalar(r.radius);
      // Re-layout attachments only when the ball grew meaningfully (2%),
      // mirroring the local rebuild throttle.
      if (r.attachMesh.count > 0 && r.radius >= r.layoutRadius * 1.02) {
        r.layoutRadius = r.radius;
        for (let i = 0; i < r.attachMesh.count; i++) layoutRemoteAttach(r, i);
        r.attachMesh.instanceMatrix.needsUpdate = true;
        if (r.attachMesh.instanceColor) r.attachMesh.instanceColor.needsUpdate = true;
      }
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
