import type { FriendItem, FriendRequest, SearchUser } from "@mesa/shared";
import { API_URL } from "./config";
import { getToken } from "./storage";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Falha na requisição.");
  return data;
}

export const api = {
  register: (name: string, password: string) =>
    request<{ ok: true }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    }),
  login: (name: string, password: string) =>
    request<{ token: string; user: { name: string; chips: number } }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    }),
  me: () =>
    request<{ user: { name: string; chips: number }; currentRoomId: string | null }>("/auth/me"),
  search: (q: string) => request<{ users: SearchUser[] }>(`/users/search?q=${encodeURIComponent(q)}`),
  friends: () => request<{ friends: FriendItem[]; requests: FriendRequest[] }>("/friends"),
  friendRequest: (name: string) =>
    request<{ ok: true }>("/friends/request", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  friendRespond: (id: number, accept: boolean) =>
    request<{ ok: true }>("/friends/respond", {
      method: "POST",
      body: JSON.stringify({ id, accept }),
    }),
  createRoom: (minBet: number, maxBet: number) =>
    request<{ roomId: string }>("/rooms", {
      method: "POST",
      body: JSON.stringify({ minBet, maxBet }),
    }),
  lookupRoom: (id: string) =>
    request<{ roomId: string; minBet: number; maxBet: number }>("/rooms/lookup", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),
  joinRoom: (id: string, buyIn: number) =>
    request<{ ok: true; roomId: string }>(`/rooms/${id}/join`, {
      method: "POST",
      body: JSON.stringify({ buyIn }),
    }),
};
