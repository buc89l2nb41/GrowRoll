import { randomUUID } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import {
  SNAPSHOT_RATE,
  TICK_RATE,
  parseClientMessage,
  type ServerMessage,
} from "@growroll/shared";
import { Room } from "./room.js";

const PORT = Number(process.env.PORT ?? 8080);

const wss = new WebSocketServer({ port: PORT });

// Phase 2: single default room. Matchmaking arrives in Phase 4.
const room = new Room("default");

interface Client {
  id: string;
  socket: WebSocket;
  joined: boolean;
}
const clients = new Map<string, Client>();

function send(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function broadcast(msg: ServerMessage, exceptId?: string): void {
  for (const c of clients.values()) {
    if (c.id === exceptId) continue;
    if (!c.joined) continue;
    send(c.socket, msg);
  }
}

function broadcastAll(msg: ServerMessage): void {
  for (const c of clients.values()) {
    if (!c.joined) continue;
    send(c.socket, msg);
  }
}

wss.on("connection", (socket) => {
  const id = randomUUID();
  clients.set(id, { id, socket, joined: false });

  socket.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) return;
    const client = clients.get(id);
    if (!client) return;

    switch (msg.t) {
      case "join": {
        if (room.isFull) {
          socket.close(1013, "room full");
          return;
        }
        client.joined = true;
        const spawn = room.addPlayer(id, msg.name?.slice(0, 24) || "Player");
        send(socket, {
          t: "welcome",
          playerId: id,
          roomId: room.id,
          mapSeed: room.mapSeed,
          tickRate: TICK_RATE,
          spawn,
        });
        // Tell the joiner about objects already picked in this room.
        for (const objectId of room.pickedObjects) {
          send(socket, { t: "pickup", playerId: "", objectId, newRadius: 0 });
        }
        console.log(`[join] ${id} (${room.playerCount} players)`);
        break;
      }
      case "state":
        if (client.joined) {
          room.setState(id, msg.pos, msg.rot, msg.radius, msg.score ?? 0);
        }
        break;
      case "pickupReport":
        if (client.joined && room.reportPickup(msg.objectId)) {
          broadcastAll({
            t: "pickup",
            playerId: id,
            objectId: msg.objectId,
            newRadius: 0,
          });
        }
        break;
      case "ping":
        send(socket, { t: "pong", time: msg.time });
        break;
    }
  });

  socket.on("close", () => {
    const client = clients.get(id);
    clients.delete(id);
    if (client?.joined) {
      room.removePlayer(id);
      broadcast({ t: "playerLeft", playerId: id });
      console.log(`[leave] ${id} (${room.playerCount} players)`);
    }
  });

  socket.on("error", (err) => console.error("[ws error]", err));
});

// --- relay loop: broadcast each player's latest state to everyone else ------
const snapshotMs = 1000 / SNAPSHOT_RATE;
setInterval(() => {
  if (room.playerCount < 1) return;
  for (const c of clients.values()) {
    if (!c.joined) continue;
    send(c.socket, { t: "snapshot", players: room.othersOf(c.id) });
  }
}, snapshotMs);

console.log(`GrowRoll relay server listening on ws://0.0.0.0:${PORT} @ ${SNAPSHOT_RATE}Hz`);
