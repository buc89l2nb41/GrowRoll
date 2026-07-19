import * as THREE from "three";

const COL_BALL = 0x5cff7a;
const COL_PROP = 0xffe066;
const COL_SENSOR = 0x66d9ff;
const COL_GROUND = 0x5577aa;

function makeBoxWire(
  hx: number,
  hy: number,
  hz: number,
  color: number,
): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2));
  return new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
}

function makeSphereWire(radius: number, color: number): THREE.LineSegments {
  const edges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(radius, 2));
  return new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
}

interface SensorWire {
  mesh: THREE.LineSegments;
}

/**
 * Dev-only Rapier collider overlay (wireframe). Not loaded in production builds
 * when VITE_DEBUG_COLLIDERS is unset.
 *
 * Ball + attach sensors live in `ballFrame` (ball-local space) and follow the
 * katamari transform each frame. Map props stay in world space.
 */
export class ColliderDebug {
  private readonly root = new THREE.Group();
  /** Follows katamari position + rotation; children use ball-local coords. */
  private readonly ballFrame = new THREE.Group();
  private readonly ball = makeSphereWire(1, COL_BALL);
  private readonly props = new Map<number, THREE.LineSegments>();
  private readonly sensors = new Map<number, SensorWire>();
  private ground: THREE.LineSegments | null = null;

  constructor(scene: THREE.Scene) {
    this.root.name = "collider-debug";
    this.ballFrame.name = "collider-debug-ball";
    this.ballFrame.add(this.ball);
    this.root.add(this.ballFrame);
    scene.add(this.root);
  }

  setGround(hx: number, hy: number, hz: number): void {
    if (this.ground) this.root.remove(this.ground);
    this.ground = makeBoxWire(hx, hy, hz, COL_GROUND);
    this.ground.position.set(0, -hy, 0);
    this.root.add(this.ground);
  }

  syncBall(
    x: number,
    y: number,
    z: number,
    radius: number,
    quat: THREE.Quaternion,
  ): void {
    this.ballFrame.position.set(x, y, z);
    this.ballFrame.quaternion.copy(quat);
    this.ball.scale.setScalar(radius);
  }

  addProp(
    id: number,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
  ): void {
    this.removeProp(id);
    const wire = makeBoxWire(hx, hy, hz, COL_PROP);
    wire.position.set(x, y, z);
    this.props.set(id, wire);
    this.root.add(wire);
  }

  removeProp(id: number): void {
    const wire = this.props.get(id);
    if (!wire) return;
    this.root.remove(wire);
    wire.geometry.dispose();
    (wire.material as THREE.Material).dispose();
    this.props.delete(id);
  }

  /** Sensor pose is in ball-local space (matches Rapier collider on ballBody). */
  addSensor(
    handle: number,
    x: number,
    y: number,
    z: number,
    hx: number,
    hy: number,
    hz: number,
    rot?: THREE.Quaternion,
  ): void {
    this.removeSensor(handle);
    const mesh = makeBoxWire(hx, hy, hz, COL_SENSOR);
    mesh.position.set(x, y, z);
    if (rot) mesh.quaternion.copy(rot);
    this.sensors.set(handle, { mesh });
    this.ballFrame.add(mesh);
  }

  removeSensor(handle: number): void {
    const entry = this.sensors.get(handle);
    if (!entry) return;
    this.ballFrame.remove(entry.mesh);
    entry.mesh.geometry.dispose();
    (entry.mesh.material as THREE.Material).dispose();
    this.sensors.delete(handle);
  }

  dispose(): void {
    for (const id of [...this.props.keys()]) this.removeProp(id);
    for (const h of [...this.sensors.keys()]) this.removeSensor(h);
    if (this.ground) {
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
    }
    this.ball.geometry.dispose();
    (this.ball.material as THREE.Material).dispose();
    this.root.removeFromParent();
  }
}
