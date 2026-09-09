import type { WsClientMessage, WsServerMessage } from "@mesa/shared";
import { WS_URL } from "./config";

type Handler = (msg: WsServerMessage) => void;

export type ConnState = "idle" | "connecting" | "open" | "reconnecting" | "offline";

export class MesaSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private stateHandlers = new Set<(s: ConnState) => void>();
  private token = "";
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private delay = 800;
  private wanted = false;
  private gen = 0;
  state: ConnState = "idle";

  onMessage(fn: Handler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onState(fn: (s: ConnState) => void): () => void {
    this.stateHandlers.add(fn);
    return () => this.stateHandlers.delete(fn);
  }

  private setState(s: ConnState) {
    if (this.state === s) return;
    this.state = s;
    for (const fn of this.stateHandlers) fn(s);
  }

  connect(token: string) {
    const already = this.wanted && this.token === token && this.isActive();
    this.token = token;
    this.wanted = true;
    if (already) return;
    if (this.isActive()) this.dropSocket();
    this.open();
  }

  disconnect() {
    this.wanted = false;
    this.gen += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopPing();
    this.dropSocket();
    this.setState("idle");
  }

  send(msg: WsClientMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  resumeOnline() {
    if (!this.wanted) return;
    if (this.isActive()) return;
    this.delay = 400;
    this.open();
  }

  private isActive() {
    const ready = this.ws?.readyState;
    return ready === WebSocket.OPEN || ready === WebSocket.CONNECTING;
  }

  private stopPing() {
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
  }

  private dropSocket() {
    const current = this.ws;
    this.ws = null;
    if (!current) return;
    current.onopen = null;
    current.onclose = null;
    current.onerror = null;
    current.onmessage = null;
    if (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING) {
      current.close();
    }
  }

  private open() {
    if (!this.wanted) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setState("offline");
      return;
    }
    if (this.isActive()) return;

    const gen = ++this.gen;
    this.setState(this.state === "open" || this.state === "reconnecting" ? "reconnecting" : "connecting");
    this.dropSocket();

    const socket = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.ws = socket;

    socket.onopen = () => {
      if (gen !== this.gen) return;
      this.delay = 800;
      this.setState("open");
      this.stopPing();
      this.ping = setInterval(() => this.send({ type: "ping" }), 15000);
    };

    socket.onmessage = (ev) => {
      if (gen !== this.gen) return;
      try {
        const msg = JSON.parse(String(ev.data)) as WsServerMessage;
        for (const fn of this.handlers) fn(msg);
      } catch {
        /* ignore */
      }
    };

    socket.onerror = () => undefined;

    socket.onclose = () => {
      if (gen !== this.gen) return;
      this.stopPing();
      this.ws = null;
      if (!this.wanted) return;
      this.schedule();
    };
  }

  private schedule() {
    if (!this.wanted || this.timer) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      this.setState("offline");
      return;
    }
    this.setState("reconnecting");
    this.timer = setTimeout(() => {
      this.timer = null;
      this.delay = Math.min(this.delay * 1.6, 8000);
      this.open();
    }, this.delay);
  }
}
