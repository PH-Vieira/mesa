"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AppNotification,
  FriendItem,
  FriendRequest,
  PublicUser,
  RoomAction,
  RoomState,
} from "@mesa/shared";
import { api } from "./api";
import { clearToken, getToken, setToken, wantsRemember } from "./storage";
import { MesaSocket, type ConnState } from "./ws";

type Screen = "auth" | "home" | "room";

type Toast = { id: number; level: "info" | "error" | "warn"; message: string };

type AppCtx = {
  screen: Screen;
  user: PublicUser | null;
  room: RoomState | null;
  friends: FriendItem[];
  requests: FriendRequest[];
  notifications: AppNotification[];
  conn: ConnState;
  toasts: Toast[];
  bootstrapping: boolean;
  actionBusy: boolean;
  login: (name: string, password: string, remember: boolean) => Promise<void>;
  register: (name: string, password: string, remember: boolean) => Promise<void>;
  logout: () => void;
  sendAction: (payload: RoomAction) => void;
  leaveRoom: () => void;
  goHome: () => void;
  enterRoom: (room: RoomState) => void;
  dismissToast: (id: number) => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const socket = useRef(new MesaSocket());
  const [screen, setScreen] = useState<Screen>("auth");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [conn, setConn] = useState<ConnState>("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const toastId = useRef(1);
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearBusy = useCallback(() => {
    if (busyTimer.current) {
      clearTimeout(busyTimer.current);
      busyTimer.current = null;
    }
    setActionBusy(false);
  }, []);

  const pushToast = useCallback((level: Toast["level"], message: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t, { id, level, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const attachSocket = useCallback((token: string) => {
    socket.current.connect(token);
  }, []);

  useEffect(() => {
    const s = socket.current;
    const offMsg = s.onMessage((msg) => {
      if (msg.type === "profile") setUser(msg.user);
      if (msg.type === "friends") {
        setFriends(msg.friends);
        setRequests(msg.requests);
      }
      if (msg.type === "notifications") setNotifications(msg.notifications);
      if (msg.type === "notify") {
        setNotifications((n) => [msg.notification, ...n.filter((x) => x.id !== msg.notification.id)]);
      }
      if (msg.type === "room") {
        clearBusy();
        // Sala morta = já saiu / encerrada — não prender o front na UI.
        if (msg.room.status === "dead") {
          setRoom(null);
          setScreen("home");
          return;
        }
        setRoom(msg.room);
        setScreen("room");
      }
      if (msg.type === "room_left") {
        clearBusy();
        setRoom(null);
        setScreen("home");
      }
      if (msg.type === "hello" && msg.currentRoomId) {
        s.send({ type: "subscribe_room", roomId: msg.currentRoomId });
      }
      if (msg.type === "toast") {
        if (msg.level === "error") clearBusy();
        pushToast(msg.level, msg.message);
      }
      if (msg.type === "error") {
        clearBusy();
        pushToast("error", msg.message);
      }
    });
    const offState = s.onState(setConn);
    const onOnline = () => s.resumeOnline();
    const onOffline = () => setConn("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      offMsg();
      offState();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [pushToast, clearBusy]);

  useEffect(() => {
    const s = socket.current;
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBootstrapping(false);
      return;
    }
    api
      .me()
      .then((data) => {
        setUser(data.user);
        setScreen(data.currentRoomId ? "room" : "home");
        attachSocket(token);
      })
      .catch(() => {
        clearToken();
        setScreen("auth");
      })
      .finally(() => setBootstrapping(false));
  }, [attachSocket]);

  const login = useCallback(
    async (name: string, password: string, remember: boolean) => {
      const data = await api.login(name, password);
      setToken(data.token, remember);
      setUser(data.user);
      setScreen("home");
      attachSocket(data.token);
    },
    [attachSocket],
  );

  const register = useCallback(
    async (name: string, password: string, remember: boolean) => {
      await api.register(name, password);
      await login(name, password, remember);
    },
    [login],
  );

  const logout = useCallback(() => {
    socket.current.disconnect();
    clearToken();
    setUser(null);
    setRoom(null);
    setFriends([]);
    setRequests([]);
    setNotifications([]);
    setScreen("auth");
  }, []);

  const sendAction = useCallback(
    (payload: RoomAction) => {
      if (actionBusy) return;
      setActionBusy(true);
      if (busyTimer.current) clearTimeout(busyTimer.current);
      // Segurança: se o back não responder, libera o botão.
      busyTimer.current = setTimeout(() => setActionBusy(false), 8000);
      socket.current.send({ type: "room_action", payload });
    },
    [actionBusy],
  );

  /** Sai na hora na UI; o back confirma (ou sincroniza se já estava fora). */
  const leaveRoom = useCallback(() => {
    setRoom(null);
    setScreen("home");
    clearBusy();
    setActionBusy(true);
    if (busyTimer.current) clearTimeout(busyTimer.current);
    busyTimer.current = setTimeout(() => setActionBusy(false), 8000);
    socket.current.send({ type: "room_action", payload: { action: "leave" } });
  }, [clearBusy]);

  const value = useMemo<AppCtx>(
    () => ({
      screen,
      user,
      room,
      friends,
      requests,
      notifications,
      conn,
      toasts,
      bootstrapping,
      actionBusy,
      login,
      register,
      logout,
      sendAction,
      leaveRoom,
      goHome: () => setScreen("home"),
      enterRoom: (next) => {
        setRoom(next);
        setScreen("room");
      },
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    }),
    [
      screen,
      user,
      room,
      friends,
      requests,
      notifications,
      conn,
      toasts,
      bootstrapping,
      actionBusy,
      login,
      register,
      logout,
      sendAction,
      leaveRoom,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp fora do provider");
  return ctx;
}

export function rememberDefault(): boolean {
  return wantsRemember();
}
