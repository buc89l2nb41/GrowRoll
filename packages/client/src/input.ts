/** Keyboard + pointer input, normalized for the game loop. */
export class Input {
  private keys = new Set<string>();
  /** Camera yaw in radians, controlled by pointer drag. */
  yaw = 0;

  private dragging = false;
  private lastX = 0;

  constructor(target: HTMLElement) {
    window.addEventListener("keydown", (e) => {
      // Ignore OS key-repeat so a single tap does not keep "pressing".
      if (e.repeat) return;
      if (
        e.code === "ArrowUp" ||
        e.code === "ArrowDown" ||
        e.code === "ArrowLeft" ||
        e.code === "ArrowRight" ||
        e.code === "Space"
      ) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    target.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      target.setPointerCapture(e.pointerId);
    });
    target.addEventListener("pointerup", (e) => {
      this.dragging = false;
      target.releasePointerCapture(e.pointerId);
    });
    target.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      this.yaw -= dx * 0.005;
    });
  }

  /** Movement axes in [-1, 1]: x = strafe, y = forward. */
  get move(): [number, number] {
    let x = 0;
    let y = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y += 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y -= 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    // normalize diagonal
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return [x, y];
  }
}
