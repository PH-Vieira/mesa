import { normalizeName, validateName } from "@mesa/shared";
import { db, getUserById, getUserByNameKey, getRoom, getRoomPlayers, tx } from "./db.js";
import type { NameIndex } from "./names.js";
import { pushProfile, broadcastRoom } from "./game.js";
import { sendToUser } from "./hub.js";
import { log } from "./log.js";

export type AdminUser = {
  id: number;
  name: string;
  chips: number;
  currentRoomId: string | null;
  createdAt: string;
};

export function listAdminUsers(): AdminUser[] {
  return db
    .prepare(
      `SELECT id, name, chips, current_room_id as currentRoomId, created_at as createdAt
       FROM users
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as unknown as AdminUser[];
}

function forceLeaveRoom(userId: number): void {
  const user = getUserById(userId);
  if (!user?.current_room_id) return;
  const room = getRoom(user.current_room_id);
  if (!room) {
    db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(userId);
    return;
  }

  if (room.dealer_id === userId) {
    const players = getRoomPlayers(room.id);
    for (const p of players) {
      if (p.user_id === userId) continue;
      const back = p.stack + p.committed;
      db.prepare("UPDATE users SET chips = chips + ?, current_room_id = NULL WHERE id = ?").run(
        back,
        p.user_id,
      );
      db.prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?").run(room.id, p.user_id);
      pushProfile(p.user_id);
      sendToUser(p.user_id, { type: "room_left", roomId: room.id });
      sendToUser(p.user_id, {
        type: "toast",
        level: "warn",
        message: "A sala foi encerrada pelo admin.",
      });
    }
    db.prepare("DELETE FROM room_players WHERE room_id = ?").run(room.id);
    db.prepare("UPDATE rooms SET status = 'dead', pot = 0, betting_open = 0, turn_user_id = NULL WHERE id = ?").run(
      room.id,
    );
    db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(userId);
    sendToUser(userId, { type: "room_left", roomId: room.id });
    return;
  }

  const me = getRoomPlayers(room.id).find((p) => p.user_id === userId);
  if (me) {
    const back = me.stack + me.committed;
    db.prepare("UPDATE users SET chips = chips + ?, current_room_id = NULL WHERE id = ?").run(
      back,
      userId,
    );
    if (me.committed > 0) {
      const nextPot = Math.max(0, room.pot - me.committed);
      db.prepare("UPDATE rooms SET pot = ? WHERE id = ?").run(nextPot, room.id);
    }
    db.prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?").run(room.id, userId);
    broadcastRoom(room.id);
  } else {
    db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(userId);
  }
  sendToUser(userId, { type: "room_left", roomId: room.id });
  pushProfile(userId);
}

export function setAdminChips(userId: number, chips: number): string | null {
  if (!Number.isInteger(chips) || chips < 0 || chips > 50_000_000) {
    return "Quantidade de fichas inválida.";
  }
  const user = getUserById(userId);
  if (!user) return "Usuário não encontrado.";
  db.prepare("UPDATE users SET chips = ? WHERE id = ?").run(chips, userId);
  pushProfile(userId);
  log.warn("admin", `fichas de ${user.name} → ${chips}`);
  return null;
}

export function renameAdminUser(
  userId: number,
  newName: string,
  names: NameIndex,
): string | null {
  const nameErr = validateName(newName);
  if (nameErr) return nameErr;
  const user = getUserById(userId);
  if (!user) return "Usuário não encontrado.";
  if (normalizeName(user.name) === normalizeName(newName)) {
    if (user.name === newName) return null;
  } else if (names.has(newName) || getUserByNameKey(normalizeName(newName))) {
    return "Esse nome já está em uso.";
  }

  const oldName = user.name;
  const key = normalizeName(newName);
  tx(() => {
    db.prepare("UPDATE users SET name = ?, name_key = ? WHERE id = ?").run(newName, key, userId);
    db.prepare("UPDATE notifications SET from_name = ? WHERE from_name = ?").run(newName, oldName);
  });
  names.remove(oldName);
  names.add(newName);
  pushProfile(userId);
  log.warn("admin", `renomeou ${oldName} → ${newName}`);
  return null;
}

export function deleteAdminUser(userId: number, names: NameIndex): string | null {
  const user = getUserById(userId);
  if (!user) return "Usuário não encontrado.";

  forceLeaveRoom(userId);

  // Salas antigas onde foi dealer (FK sem ON DELETE).
  const dealt = db
    .prepare("SELECT id FROM rooms WHERE dealer_id = ?")
    .all(userId) as { id: string }[];
  for (const r of dealt) {
    db.prepare("DELETE FROM room_players WHERE room_id = ?").run(r.id);
    db.prepare("DELETE FROM notifications WHERE room_id = ?").run(r.id);
    db.prepare("DELETE FROM rooms WHERE id = ?").run(r.id);
  }

  db.prepare("DELETE FROM room_players WHERE user_id = ?").run(userId);
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  names.remove(user.name);
  sendToUser(userId, {
    type: "toast",
    level: "warn",
    message: "Sua conta foi removida pelo admin.",
  });
  log.warn("admin", `apagou cadastro ${user.name} (#${userId})`);
  return null;
}
