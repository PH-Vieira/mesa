import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

mkdirSync(dirname(config.databasePath) === "." ? "data" : dirname(config.databasePath), {
  recursive: true,
});

export const db = new DatabaseSync(config.databasePath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA synchronous = NORMAL");
db.exec("PRAGMA temp_store = MEMORY");
db.exec("PRAGMA busy_timeout = 2000");
db.exec("PRAGMA foreign_keys = ON");

export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  chips INTEGER NOT NULL,
  current_room_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (from_id, to_id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  dealer_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('dead', 'in_progress', 'on_hold')),
  min_bet INTEGER NOT NULL,
  max_bet INTEGER NOT NULL,
  pot INTEGER NOT NULL DEFAULT 0,
  current_bet INTEGER NOT NULL DEFAULT 0,
  button_user_id INTEGER,
  turn_user_id INTEGER,
  round_no INTEGER NOT NULL DEFAULT 0,
  betting_open INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS room_players (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  seat INTEGER NOT NULL,
  stack INTEGER NOT NULL,
  bet INTEGER NOT NULL DEFAULT 0,
  committed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  acted INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (room_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  from_name TEXT NOT NULL,
  room_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_name_key ON users(name_key);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
`);

export type UserRow = {
  id: number;
  name: string;
  name_key: string;
  password_hash: string;
  password_salt: string;
  chips: number;
  current_room_id: string | null;
};

export type RoomRow = {
  id: string;
  dealer_id: number;
  status: "dead" | "in_progress" | "on_hold";
  min_bet: number;
  max_bet: number;
  pot: number;
  current_bet: number;
  button_user_id: number | null;
  turn_user_id: number | null;
  round_no: number;
  betting_open: number;
};

export type RoomPlayerRow = {
  room_id: string;
  user_id: number;
  seat: number;
  stack: number;
  bet: number;
  committed: number;
  status: string;
  acted: number;
  name: string;
};

const qUserByNameKey = db.prepare("SELECT * FROM users WHERE name_key = ?");
const qUserById = db.prepare("SELECT * FROM users WHERE id = ?");
const qRoom = db.prepare("SELECT * FROM rooms WHERE id = ?");
const qRoomPlayers = db.prepare(
  `SELECT rp.*, u.name
   FROM room_players rp
   JOIN users u ON u.id = rp.user_id
   WHERE rp.room_id = ?
   ORDER BY rp.seat ASC`,
);
const qTouchRoom = db.prepare("UPDATE rooms SET updated_at = datetime('now') WHERE id = ?");

export function getUserByNameKey(nameKey: string): UserRow | undefined {
  return qUserByNameKey.get(nameKey) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return qUserById.get(id) as UserRow | undefined;
}

export function getRoom(id: string): RoomRow | undefined {
  return qRoom.get(id) as RoomRow | undefined;
}

export function getRoomPlayers(roomId: string): RoomPlayerRow[] {
  return qRoomPlayers.all(roomId) as RoomPlayerRow[];
}

export function touchRoom(id: string): void {
  qTouchRoom.run(id);
}
