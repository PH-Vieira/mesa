import type { WebSocket } from "ws";
import type { WsServerMessage } from "@mesa/shared";

type Client = {
  userId: number;
  socket: WebSocket;
  roomId: string | null;
};

const clients = new Set<Client>();

export function addClient(userId: number, socket: WebSocket): Client {
  const client: Client = { userId, socket, roomId: null };
  clients.add(client);
  return client;
}

export function removeClient(client: Client): void {
  clients.delete(client);
}

export function setClientRoom(client: Client, roomId: string | null): void {
  client.roomId = roomId;
}

export function send(socket: WebSocket, msg: WsServerMessage): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

export function sendToUser(userId: number, msg: WsServerMessage): void {
  for (const c of clients) {
    if (c.userId === userId) send(c.socket, msg);
  }
}

export function sendToRoom(roomId: string, msg: WsServerMessage): void {
  for (const c of clients) {
    if (c.roomId === roomId) send(c.socket, msg);
  }
}

export function userSockets(userId: number): number {
  let n = 0;
  for (const c of clients) if (c.userId === userId) n += 1;
  return n;
}
