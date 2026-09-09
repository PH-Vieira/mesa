export const NAME_MIN = 3;
export const NAME_MAX = 12;
export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 16;
export const SEARCH_MIN = 3;
export const SEARCH_LIMIT = 8;
export const ROOM_ID_LENGTH = 6;
export const STARTING_CHIPS = 5000;

export const NAME_RE = /^[A-Za-z0-9]{3,12}$/;
export const ROOM_ID_RE = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/;

export type RoomStatus = "dead" | "in_progress" | "on_hold";
export type PlayerStatus =
  | "seated"
  | "sitting_out"
  | "spectator"
  | "suspended"
  | "folded"
  | "busted";
export type FriendStatus = "pending" | "accepted";
export type NotifyType = "friend_request" | "game_invite";
export type BetKind = "fold" | "check" | "call" | "raise" | "all_in";

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function validateName(name: string): string | null {
  if (!NAME_RE.test(name)) {
    return `Nome deve ter ${NAME_MIN}–${NAME_MAX} caracteres e só letras ou números.`;
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `Senha deve ter ${PASSWORD_MIN}–${PASSWORD_MAX} caracteres.`;
  }
  return null;
}

export interface PublicUser {
  name: string;
  chips: number;
}

export interface SearchUser {
  name: string;
  relation: "none" | "friends" | "outgoing" | "incoming";
}

export interface FriendItem {
  name: string;
  chips: number;
}

export interface FriendRequest {
  id: number;
  name: string;
  direction: "incoming" | "outgoing";
}

export interface GameInvite {
  id: number;
  fromName: string;
  roomId: string;
  createdAt: string;
}

export interface AppNotification {
  id: number;
  type: NotifyType;
  fromName: string;
  roomId?: string;
  createdAt: string;
}

export interface RoomPlayer {
  name: string;
  seat: number;
  stack: number;
  bet: number;
  status: PlayerStatus;
  role: "sb" | "bb" | null;
  isOwner: boolean;
  hasButton: boolean;
  isTurn: boolean;
  acted: boolean;
  allIn: boolean;
}

export interface RoomState {
  id: string;
  status: RoomStatus;
  minBet: number;
  maxBet: number;
  pot: number;
  currentBet: number;
  roundNo: number;
  bettingOpen: boolean;
  players: RoomPlayer[];
  dealerName: string;
  you: string;
}

export type RoomAction =
  | { action: "set_status"; status: RoomStatus }
  | { action: "settings"; minBet: number; maxBet: number }
  | { action: "reorder"; order: string[] }
  | { action: "start_round" }
  | { action: "bet"; kind: BetKind; amount?: number }
  | { action: "award"; names: string[] }
  | { action: "kick"; name: string }
  | { action: "suspend"; name: string }
  | { action: "unsuspend"; name: string }
  | { action: "invite"; name: string }
  | { action: "sit_out" }
  | { action: "sit_in" }
  | { action: "leave" }
  | { action: "buy_in"; amount: number };

export type WsClientMessage =
  | { type: "ping" }
  | { type: "subscribe_room"; roomId: string }
  | { type: "unsubscribe_room" }
  | { type: "room_action"; payload: RoomAction };

export type WsServerMessage =
  | { type: "hello"; currentRoomId: string | null }
  | { type: "pong" }
  | { type: "room"; room: RoomState }
  | { type: "room_left"; roomId: string }
  | { type: "notify"; notification: AppNotification }
  | { type: "notifications"; notifications: AppNotification[] }
  | { type: "friends"; friends: FriendItem[]; requests: FriendRequest[] }
  | { type: "profile"; user: PublicUser }
  | { type: "toast"; level: "info" | "error" | "warn"; message: string }
  | { type: "error"; message: string };
