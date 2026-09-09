import type { AppNotification, FriendItem, FriendRequest } from "@mesa/shared";
import { db, getUserById, getUserByNameKey } from "./db.js";
import { sendToUser } from "./hub.js";
import { normalizeName } from "@mesa/shared";
import { log } from "./log.js";

export function listFriends(userId: number): FriendItem[] {
  return db
    .prepare(
      `SELECT u.name, u.chips
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.from_id = ? THEN f.to_id ELSE f.from_id END
       WHERE f.status = 'accepted' AND (f.from_id = ? OR f.to_id = ?)
       ORDER BY u.name COLLATE NOCASE`,
    )
    .all(userId, userId, userId) as unknown as FriendItem[];
}

export function listRequests(userId: number): FriendRequest[] {
  const incoming = db
    .prepare(
      `SELECT f.id, u.name
       FROM friendships f
       JOIN users u ON u.id = f.from_id
       WHERE f.to_id = ? AND f.status = 'pending'`,
    )
    .all(userId) as { id: number; name: string }[];
  const outgoing = db
    .prepare(
      `SELECT f.id, u.name
       FROM friendships f
       JOIN users u ON u.id = f.to_id
       WHERE f.from_id = ? AND f.status = 'pending'`,
    )
    .all(userId) as { id: number; name: string }[];
  return [
    ...incoming.map((r) => ({ ...r, direction: "incoming" as const })),
    ...outgoing.map((r) => ({ ...r, direction: "outgoing" as const })),
  ];
}

export function relationOf(
  me: number,
  other: number,
): "none" | "friends" | "outgoing" | "incoming" {
  const row = db
    .prepare(
      `SELECT from_id, to_id, status FROM friendships
       WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)`,
    )
    .get(me, other, other, me) as
    | { from_id: number; to_id: number; status: string }
    | undefined;
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  if (row.from_id === me) return "outgoing";
  return "incoming";
}

export function pushSocial(userId: number): void {
  sendToUser(userId, {
    type: "friends",
    friends: listFriends(userId),
    requests: listRequests(userId),
  });
  sendToUser(userId, { type: "notifications", notifications: listNotifications(userId) });
}

export function listNotifications(userId: number): AppNotification[] {
  return db
    .prepare(
      `SELECT id, type, from_name as fromName, room_id as roomId, created_at as createdAt
       FROM notifications
       WHERE user_id = ? AND read = 0
       ORDER BY id DESC
       LIMIT 40`,
    )
    .all(userId) as unknown as AppNotification[];
}

export function addNotification(
  userId: number,
  type: AppNotification["type"],
  fromName: string,
  roomId?: string,
): void {
  const info = db
    .prepare(
      "INSERT INTO notifications (user_id, type, from_name, room_id) VALUES (?, ?, ?, ?)",
    )
    .run(userId, type, fromName, roomId ?? null);
  const notification: AppNotification = {
    id: Number(info.lastInsertRowid),
    type,
    fromName,
    roomId,
    createdAt: new Date().toISOString(),
  };
  sendToUser(userId, { type: "notify", notification });
}

export function requestFriend(fromId: number, targetName: string): string | null {
  const target = getUserByNameKey(normalizeName(targetName));
  if (!target || target.id === fromId) return "Jogador não encontrado.";
  const current = relationOf(fromId, target.id);
  if (current === "friends") return "Vocês já são amigos.";
  if (current === "outgoing") return "Pedido já enviado.";
  if (current === "incoming") {
    db.prepare(
      `UPDATE friendships SET status = 'accepted'
       WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND status = 'pending'`,
    ).run(fromId, target.id, target.id, fromId);
    pushSocial(fromId);
    pushSocial(target.id);
    return null;
  }
  db.prepare("INSERT INTO friendships (from_id, to_id, status) VALUES (?, ?, 'pending')").run(
    fromId,
    target.id,
  );
  const me = getUserById(fromId)!;
  addNotification(target.id, "friend_request", me.name);
  log.info("social", `${me.name} pediu amizade a ${target.name}`);
  pushSocial(fromId);
  pushSocial(target.id);
  return null;
}

export function respondFriend(
  userId: number,
  requestId: number,
  accept: boolean,
): string | null {
  const row = db
    .prepare("SELECT * FROM friendships WHERE id = ? AND to_id = ? AND status = 'pending'")
    .get(requestId, userId) as { id: number; from_id: number; to_id: number } | undefined;
  if (!row) return "Pedido não encontrado.";
  if (accept) {
    db.prepare("UPDATE friendships SET status = 'accepted' WHERE id = ?").run(requestId);
  } else {
    db.prepare("DELETE FROM friendships WHERE id = ?").run(requestId);
  }
  db.prepare(
    "UPDATE notifications SET read = 1 WHERE user_id = ? AND type = 'friend_request' AND from_name = (SELECT name FROM users WHERE id = ?)",
  ).run(userId, row.from_id);
  const from = getUserById(row.from_id);
  const to = getUserById(userId);
  log.info("social", `${to?.name} ${accept ? "aceitou" : "recusou"} ${from?.name}`);
  pushSocial(row.from_id);
  pushSocial(userId);
  return null;
}

export function inviteFriendToRoom(
  fromId: number,
  roomId: string,
  friendName: string,
): string | null {
  const friend = getUserByNameKey(normalizeName(friendName));
  if (!friend) return "Jogador não encontrado.";
  if (relationOf(fromId, friend.id) !== "friends") return "Só é possível convidar amigos.";
  const me = getUserById(fromId)!;
  addNotification(friend.id, "game_invite", me.name, roomId);
  sendToUser(friend.id, {
    type: "toast",
    level: "info",
    message: `${me.name} te convidou para a sala ${roomId}`,
  });
  return null;
}
