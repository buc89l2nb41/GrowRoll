import {
  parseServerMessage,
  type ClientMessage,
  type ServerMessage,
} from "@growroll/shared";

export type NetStatus = "connecting" | "online" | "offline";

/**
 * Thin WebSocket client for the relay server. Fails gracefully: if the server
 * is unreachable the game keeps running single-player.
 */
export class Net {
  private ws: WebSocket | null = null;
  status: NetStatus = "offline";
  playerId: string | null = null;

  onMessage: ((msg: ServerMessage) => void) | null = null;
  onStatus: ((status: NetStatus) => void) | null = null;

  constructor(private url: string) {}

  connect(): void {
    this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.setStatus("offline");
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => this.setStatus("online"));
    ws.addEventListener("close", () => {
      this.setStatus("offline");
      this.ws = null;
    });
    ws.addEventListener("error", () => {
      // close handler will flip us offline
    });
    ws.addEventListener("message", (ev) => {
      const msg = parseServerMessage(String(ev.data));
      if (msg) this.onMessage?.(msg);
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  get isOnline(): boolean {
    return this.status === "online";
  }

  private setStatus(s: NetStatus): void {
    this.status = s;
    this.onStatus?.(s);
  }
}
