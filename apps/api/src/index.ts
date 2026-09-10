import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  NAME_RE,
  PASSWORD_MAX,
  PASSWORD_MIN,
  SEARCH_LIMIT,
  SEARCH_MIN,
  ROOM_ID_RE,
  normalizeName,
  validateName,
  validatePassword,
  type SearchUser,
  type WsClientMessage,
} from "@mesa/shared";
import { config } from "./config.js";
import { db, getUserById, getUserByNameKey, getRoom } from "./db.js";
import { NameIndex } from "./names.js";
import { hashPassword, newSalt, signToken, verifyToken, bearerToken } from "./auth.js";
import { rateLimit, clientIp } from "./rateLimit.js";
import {
  addClient,
  removeClient,
  send,
  setClientRoom,
} from "./hub.js";
import {
  listFriends,
  listNotifications,
  listRequests,
  pushSocial,
  relationOf,
  requestFriend,
  respondFriend,
} from "./social.js";
import {
  createRoom,
  handleRoomAction,
  joinRoom,
  lookupRoomForJoin,
  toRoomState,
} from "./game.js";
import {
  deleteAdminUser,
  listAdminUsers,
  renameAdminUser,
  setAdminChips,
} from "./admin.js";
import { directClientIp, isPrivateOrTailscaleIp } from "./adminNet.js";
import { log } from "./log.js";

const app = Fastify({ logger: false });
// Admin DELETE sem body não pode falhar por Content-Type: application/json.
app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
  if (!body || body.length === 0) {
    done(null, {});
    return;
  }
  try {
    done(null, JSON.parse(body as string));
  } catch (err) {
    done(err as Error, undefined);
  }
});
const adminHtml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "admin.html"), "utf8");
const corsOrigins = config.corsOrigin.split(",").map((s) => s.trim()).filter(Boolean);

function isAllowedOrigin(origin: string) {
  if (corsOrigins.includes("*")) return true;
  if (corsOrigins.includes(origin)) return true;
  if (
    corsOrigins.includes("https://*.vercel.app") &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin)
  ) {
    return true;
  }
  return false;
}

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, isAllowedOrigin(origin));
  },
});
await app.register(websocket);

app.addHook("onResponse", (req, reply, done) => {
  if (req.url === "/health" || req.method === "OPTIONS") {
    done();
    return;
  }
  const path = req.url.split("?")[0] ?? req.url;
  if (path === "/ws") {
    done();
    return;
  }
  const ms = Math.round(reply.elapsedTime);
  const who = (req as { userName?: string }).userName;
  log.http(`${req.method} ${path}  ${reply.statusCode}  ${ms}ms${who ? `  ${who}` : ""}`);
  done();
});

const names = new NameIndex();
names.load(
  (db.prepare("SELECT name FROM users").all() as { name: string }[]).map((r) => r.name),
);

async function authUser(req: { headers: { authorization?: string | string[] }; userName?: string }) {
  const header = req.headers.authorization;
  const token = bearerToken(Array.isArray(header) ? header[0] : header);
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = getUserById(payload.userId);
  if (user) req.userName = user.name;
  return user ?? null;
}

app.get("/health", async () => ({ ok: true }));

function assertAdminNet(req: Parameters<typeof directClientIp>[0], reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const ip = directClientIp(req);
  if (!isPrivateOrTailscaleIp(ip)) {
    log.warn("admin", `bloqueado IP público ${ip}`);
    return { ok: false as const, ip, response: reply.code(403).send({ error: "Admin só na rede local ou Tailscale." }) };
  }
  return { ok: true as const, ip };
}

app.get("/admin", async (req, reply) => {
  const gate = assertAdminNet(req, reply);
  if (!gate.ok) return gate.response;
  reply.type("text/html; charset=utf-8");
  return adminHtml;
});

app.get("/admin/api/users", async (req, reply) => {
  const gate = assertAdminNet(req, reply);
  if (!gate.ok) return gate.response;
  return { users: listAdminUsers(), clientIp: gate.ip };
});

app.patch("/admin/api/users/:id", async (req, reply) => {
  const gate = assertAdminNet(req, reply);
  if (!gate.ok) return gate.response;
  const id = Number((req.params as { id: string }).id);
  if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "ID inválido." });
  const body = z
    .object({
      chips: z.number().int().optional(),
      name: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Dados inválidos." });
  if (body.data.chips === undefined && body.data.name === undefined) {
    return reply.code(400).send({ error: "Nada para alterar." });
  }
  if (body.data.name !== undefined) {
    const err = renameAdminUser(id, body.data.name, names);
    if (err) return reply.code(400).send({ error: err });
  }
  if (body.data.chips !== undefined) {
    const err = setAdminChips(id, body.data.chips);
    if (err) return reply.code(400).send({ error: err });
  }
  return { ok: true, user: listAdminUsers().find((u) => u.id === id) };
});

app.delete("/admin/api/users/:id", async (req, reply) => {
  const gate = assertAdminNet(req, reply);
  if (!gate.ok) return gate.response;
  const id = Number((req.params as { id: string }).id);
  if (!Number.isInteger(id) || id < 1) return reply.code(400).send({ error: "ID inválido." });
  const err = deleteAdminUser(id, names);
  if (err) return reply.code(400).send({ error: err });
  return { ok: true };
});

app.post("/auth/register", async (req, reply) => {
  const ip = clientIp(req.headers as Record<string, string | string[] | undefined>);
  if (!rateLimit(`reg:${ip}`, 5, 60_000)) {
    return reply.code(429).send({ error: "Muitas tentativas. Espere um pouco." });
  }
  const body = z.object({ name: z.string(), password: z.string() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Dados inválidos." });
  const nameErr = validateName(body.data.name);
  const passErr = validatePassword(body.data.password);
  if (nameErr) return reply.code(400).send({ error: nameErr });
  if (passErr) return reply.code(400).send({ error: passErr });
  if (names.has(body.data.name)) {
    return reply.code(409).send({ error: "Esse nome já está em uso." });
  }
  const salt = newSalt();
  const password_hash = hashPassword(body.data.password, salt);
  db.prepare(
    `INSERT INTO users (name, name_key, password_hash, password_salt, chips)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(body.data.name, normalizeName(body.data.name), password_hash, salt, config.startingChips);
  names.add(body.data.name);
  log.ok("auth", `cadastro  ${body.data.name}`);
  return { ok: true };
});

app.post("/auth/login", async (req, reply) => {
  const ip = clientIp(req.headers as Record<string, string | string[] | undefined>);
  if (!rateLimit(`login:${ip}`, 12, 60_000)) {
    return reply.code(429).send({ error: "Muitas tentativas. Espere um pouco." });
  }
  const body = z.object({ name: z.string(), password: z.string() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Dados inválidos." });
  if (!NAME_RE.test(body.data.name) || body.data.password.length < PASSWORD_MIN || body.data.password.length > PASSWORD_MAX) {
    return reply.code(401).send({ error: "Nome ou senha incorretos." });
  }
  const user = getUserByNameKey(normalizeName(body.data.name));
  if (!user || user.password_hash !== hashPassword(body.data.password, user.password_salt)) {
    return reply.code(401).send({ error: "Nome ou senha incorretos." });
  }
  const token = await signToken(user.id, user.name);
  log.ok("auth", `login  ${user.name}`);
  return { token, user: { name: user.name, chips: user.chips } };
});

app.get("/auth/me", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  return { user: { name: user.name, chips: user.chips }, currentRoomId: user.current_room_id };
});

app.get("/users/search", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  if (!rateLimit(`search:${user.id}`, 20, 60_000)) {
    return reply.code(429).send({ error: "Pesquisa rápida demais. Espere um instante." });
  }
  const q = String((req.query as { q?: string }).q ?? "").trim();
  if (q.length < SEARCH_MIN) return { users: [] as SearchUser[] };
  const rows = db
    .prepare(
      `SELECT id, name FROM users
       WHERE name_key LIKE ? AND id != ?
       ORDER BY name COLLATE NOCASE
       LIMIT ?`,
    )
    .all(`${normalizeName(q)}%`, user.id, SEARCH_LIMIT) as { id: number; name: string }[];
  const users: SearchUser[] = rows.map((r) => ({
    name: r.name,
    relation: relationOf(user.id, r.id),
  }));
  return { users };
});

app.get("/friends", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  return { friends: listFriends(user.id), requests: listRequests(user.id) };
});

app.post("/friends/request", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  const body = z.object({ name: z.string() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Dados inválidos." });
  const error = requestFriend(user.id, body.data.name);
  if (error) return reply.code(400).send({ error });
  return { ok: true };
});

app.post("/friends/respond", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  const body = z.object({ id: z.number(), accept: z.boolean() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Dados inválidos." });
  const error = respondFriend(user.id, body.data.id, body.data.accept);
  if (error) return reply.code(400).send({ error });
  return { ok: true };
});

app.post("/rooms", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  const body = z
    .object({
      minBet: z.number().int().positive().default(10),
      maxBet: z.number().int().positive().default(200),
    })
    .safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Dados inválidos." });
  const result = createRoom(user.id, body.data.minBet, body.data.maxBet);
  if ("error" in result) return reply.code(400).send({ error: result.error });
  return { roomId: result.roomId };
});

app.post("/rooms/lookup", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  if (!rateLimit(`lookup:${user.id}`, 10, 60_000)) {
    return reply.code(429).send({ error: "Muitas buscas. Espere um pouco." });
  }
  const body = z.object({ id: z.string() }).safeParse(req.body);
  if (!body.success || !ROOM_ID_RE.test(body.data.id.toUpperCase())) {
    return reply.code(404).send({ error: "Sala não encontrada." });
  }
  const room = lookupRoomForJoin(body.data.id.toUpperCase());
  if (!room) return reply.code(404).send({ error: "Sala não encontrada." });
  return { roomId: room.id, minBet: room.min_bet, maxBet: room.max_bet };
});

app.post("/rooms/:id/join", async (req, reply) => {
  const user = await authUser(req);
  if (!user) return reply.code(401).send({ error: "Não autenticado." });
  if (!rateLimit(`join:${user.id}`, 10, 60_000)) {
    return reply.code(429).send({ error: "Muitas tentativas. Espere um pouco." });
  }
  const id = String((req.params as { id: string }).id).toUpperCase();
  if (!ROOM_ID_RE.test(id)) return reply.code(404).send({ error: "Sala não encontrada." });
  const body = z.object({ buyIn: z.number().int().positive() }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ error: "Buy-in inválido." });
  const result = joinRoom(user.id, id, body.data.buyIn);
  if (result.error) {
    const code = result.error === "Sala não encontrada." ? 404 : 400;
    return reply.code(code).send({ error: result.error });
  }
  return { ok: true, roomId: id };
});

app.get("/ws", { websocket: true }, (socket, req) => {
  void (async () => {
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const payload = await verifyToken(token);
    const user = payload ? getUserById(payload.userId) : null;
    if (!user) {
      send(socket, { type: "error", message: "Sessão inválida." });
      socket.close();
      return;
    }
    const client = addClient(user.id, socket);
    log.ws(`${user.name} conectou${user.current_room_id ? `  sala ${user.current_room_id}` : ""}`);
    send(socket, { type: "hello", currentRoomId: user.current_room_id });
    send(socket, { type: "profile", user: { name: user.name, chips: user.chips } });
    send(socket, {
      type: "friends",
      friends: listFriends(user.id),
      requests: listRequests(user.id),
    });
    send(socket, { type: "notifications", notifications: listNotifications(user.id) });
    if (user.current_room_id) {
      const room = getRoom(user.current_room_id);
      if (room && room.status !== "dead") {
        setClientRoom(client, room.id);
        send(socket, { type: "room", room: toRoomState(room, user.name) });
      } else {
        db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(user.id);
        send(socket, { type: "room_left", roomId: user.current_room_id });
      }
    }

    socket.on("message", (raw) => {
      let msg: WsClientMessage;
      try {
        msg = JSON.parse(String(raw)) as WsClientMessage;
      } catch {
        send(socket, { type: "error", message: "Mensagem inválida." });
        return;
      }
      if (msg.type === "ping") {
        send(socket, { type: "pong" });
        return;
      }
      if (msg.type === "subscribe_room") {
        const fresh = getUserById(user.id);
        if (fresh?.current_room_id === msg.roomId) {
          const room = getRoom(msg.roomId);
          if (room && room.status !== "dead") {
            setClientRoom(client, msg.roomId);
            send(socket, { type: "room", room: toRoomState(room, user.name) });
          } else {
            db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(user.id);
            setClientRoom(client, null);
            send(socket, { type: "room_left", roomId: msg.roomId });
          }
        }
        return;
      }
      if (msg.type === "unsubscribe_room") {
        setClientRoom(client, null);
        return;
      }
      if (msg.type === "room_action") {
        const error = handleRoomAction(user.id, msg.payload);
        if (error) send(socket, { type: "toast", level: "error", message: error });
        if (msg.payload.action === "leave") {
          setClientRoom(client, null);
        }
        pushSocial(user.id);
      }
    });

    socket.on("close", () => {
      removeClient(client);
      log.ws(`${user.name} desconectou`);
    });
  })();
});

app.listen({ port: config.port, host: "0.0.0.0" }).then(() => {
  log.ok("api", `ouvindo em :${config.port}`);
}).catch((err) => {
  log.err("api", String(err));
  process.exit(1);
});
