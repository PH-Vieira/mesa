import { customAlphabet } from "nanoid";
import {
  ROOM_ID_LENGTH,
  type RoomAction,
  type RoomLastAction,
  type RoomState,
  type PlayerStatus,
} from "@mesa/shared";
import {
  db,
  getRoom,
  getRoomPlayers,
  getUserById,
  getUserByNameKey,
  touchRoom,
  tx,
  type RoomPlayerRow,
  type RoomRow,
} from "./db.js";
import { sendToUser } from "./hub.js";
import { inviteFriendToRoom, clearInvitesForRoom, markRoomInvitesRead, pushSocial } from "./social.js";
import { normalizeName } from "@mesa/shared";
import { log } from "./log.js";

const roomId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZ", ROOM_ID_LENGTH);

/** Última ação de aposta por sala (feedback visual; não precisa persistir). */
const lastActions = new Map<string, RoomLastAction>();

function setLastAction(roomIdValue: string, action: RoomLastAction | null): void {
  if (!action) lastActions.delete(roomIdValue);
  else lastActions.set(roomIdValue, action);
}

function formatPlayerAction(action: RoomLastAction | null, playerName: string): string | null {
  if (!action || action.name !== playerName) return null;
  switch (action.kind) {
    case "fold":
      return "Fold";
    case "check":
      return "Check";
    case "call":
      return action.amount != null ? `Call ${action.amount}` : "Call";
    case "raise":
      return action.amount != null ? `Raise ${action.amount}` : "Raise";
    case "all_in":
      return action.amount != null ? `All-in ${action.amount}` : "All-in";
    default:
      return null;
  }
}

function nextClockwise(
  players: RoomPlayerRow[],
  fromUserId: number | null,
  pred: (p: RoomPlayerRow) => boolean,
): RoomPlayerRow | undefined {
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  if (!ordered.length) return undefined;
  let start = 0;
  if (fromUserId != null) {
    const idx = ordered.findIndex((p) => p.user_id === fromUserId);
    start = idx >= 0 ? idx + 1 : 0;
  }
  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[(start + i) % ordered.length]!;
    if (pred(p)) return p;
  }
  return undefined;
}

export function toRoomState(room: RoomRow, viewerName: string): RoomState {
  const players = getRoomPlayers(room.id).filter((p) => p.user_id !== room.dealer_id);
  const dealer = getUserById(room.dealer_id);
  const lastAction = lastActions.get(room.id) ?? null;
  return {
    id: room.id,
    status: room.status,
    minBet: room.min_bet,
    maxBet: room.max_bet,
    pot: room.pot,
    currentBet: room.current_bet,
    roundNo: room.round_no,
    bettingOpen: Boolean(room.betting_open),
    dealerName: dealer?.name ?? "",
    you: viewerName,
    lastAction,
    players: players.map((p) => {
      let role: "sb" | "bb" | null = null;
      if (room.betting_open || room.round_no > 0) {
        const alive = players.filter((x) => x.status === "seated" || x.status === "folded");
        const button = room.button_user_id;
        if (button) {
          if (alive.length === 2) {
            role = p.user_id === button ? "sb" : "bb";
          } else {
            const sb = nextClockwise(alive, button, (x) => x.status === "seated" || x.status === "folded");
            const bb = sb
              ? nextClockwise(alive, sb.user_id, (x) => x.status === "seated" || x.status === "folded")
              : undefined;
            if (sb?.user_id === p.user_id) role = "sb";
            if (bb?.user_id === p.user_id) role = "bb";
          }
        }
      }
      return {
        name: p.name,
        seat: p.seat,
        stack: p.stack,
        bet: p.bet,
        status: p.status as PlayerStatus,
        role,
        isOwner: p.user_id === room.dealer_id,
        hasButton: p.user_id === room.button_user_id,
        isTurn: p.user_id === room.turn_user_id && Boolean(room.betting_open),
        acted: Boolean(p.acted),
        allIn: p.stack === 0 && (p.bet > 0 || p.committed > 0) && p.status !== "busted",
        lastAction: formatPlayerAction(lastAction, p.name),
      };
    }),
  };
}

function detachDealerSeat(room: RoomRow): void {
  const seated = getRoomPlayers(room.id).find((p) => p.user_id === room.dealer_id);
  if (!seated) return;
  const back = seated.stack + seated.committed;
  db.prepare("UPDATE users SET chips = chips + ? WHERE id = ?").run(back, room.dealer_id);
  if (seated.committed > 0) {
    updateRoom(room.id, { pot: Math.max(0, room.pot - seated.committed) });
  }
  db.prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?").run(
    room.id,
    room.dealer_id,
  );
  log.info("sala", `dealer ${getUserById(room.dealer_id)?.name} saiu do assento em ${room.id}  +${back} fichas`);
}

export function broadcastRoom(roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  const players = getRoomPlayers(roomId);
  const viewers = new Set(
    players.filter((p) => p.user_id !== room.dealer_id).map((p) => p.user_id),
  );
  const dealer = getUserById(room.dealer_id);
  // Só quem ainda está na sala — evita reabrir a tela após leave/room_left.
  if (dealer?.current_room_id === room.id) viewers.add(room.dealer_id);
  const snapshot = toRoomState(room, "");
  for (const userId of viewers) {
    const user = getUserById(userId);
    if (!user || user.current_room_id !== room.id) continue;
    sendToUser(userId, { type: "room", room: { ...snapshot, you: user.name } });
  }
}

export function pushProfile(userId: number): void {
  const user = getUserById(userId);
  if (!user) return;
  sendToUser(userId, { type: "profile", user: { name: user.name, chips: user.chips } });
}

function updatePlayer(
  roomId: string,
  userId: number,
  patch: Partial<Pick<RoomPlayerRow, "seat" | "stack" | "bet" | "committed" | "status" | "acted">>,
): void {
  const current = db
    .prepare("SELECT * FROM room_players WHERE room_id = ? AND user_id = ?")
    .get(roomId, userId) as RoomPlayerRow | undefined;
  if (!current) return;
  db.prepare(
    `UPDATE room_players
     SET seat = ?, stack = ?, bet = ?, committed = ?, status = ?, acted = ?
     WHERE room_id = ? AND user_id = ?`,
  ).run(
    patch.seat ?? current.seat,
    patch.stack ?? current.stack,
    patch.bet ?? current.bet,
    patch.committed ?? current.committed,
    patch.status ?? current.status,
    patch.acted ?? current.acted,
    roomId,
    userId,
  );
}

function updateRoom(id: string, patch: Partial<RoomRow>): void {
  const current = getRoom(id);
  if (!current) return;
  db.prepare(
    `UPDATE rooms SET
      status = ?, min_bet = ?, max_bet = ?, pot = ?, current_bet = ?,
      button_user_id = ?, turn_user_id = ?, round_no = ?, betting_open = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    patch.status ?? current.status,
    patch.min_bet ?? current.min_bet,
    patch.max_bet ?? current.max_bet,
    patch.pot ?? current.pot,
    patch.current_bet ?? current.current_bet,
    patch.button_user_id === undefined ? current.button_user_id : patch.button_user_id,
    patch.turn_user_id === undefined ? current.turn_user_id : patch.turn_user_id,
    patch.round_no ?? current.round_no,
    patch.betting_open === undefined ? current.betting_open : patch.betting_open,
    id,
  );
}

function returnPotToPlayers(room: RoomRow): void {
  const players = getRoomPlayers(room.id);
  const runTx = tx(() => {
    for (const p of players) {
      if (p.committed > 0) {
        updatePlayer(room.id, p.user_id, {
          stack: p.stack + p.committed,
          bet: 0,
          committed: 0,
          acted: 0,
        });
      } else {
        updatePlayer(room.id, p.user_id, { bet: 0, acted: 0 });
      }
    }
    updateRoom(room.id, { pot: 0, current_bet: 0, betting_open: 0, turn_user_id: null });
  });
}

function cashOut(roomId: string, userId: number, forfeitCommitted: boolean): void {
  const p = getRoomPlayers(roomId).find((x) => x.user_id === userId);
  const user = getUserById(userId);
  if (!p || !user) return;
  const back = forfeitCommitted ? p.stack : p.stack + p.committed;
  db.prepare("UPDATE users SET chips = chips + ?, current_room_id = NULL WHERE id = ?").run(
    back,
    userId,
  );
  if (!forfeitCommitted) {
    const room = getRoom(roomId)!;
    updateRoom(roomId, { pot: Math.max(0, room.pot - p.committed) });
  }
  db.prepare("DELETE FROM room_players WHERE room_id = ? AND user_id = ?").run(roomId, userId);
  pushProfile(userId);
}

export function createRoom(
  dealerId: number,
  minBet: number,
  maxBet: number,
): { roomId: string } | { error: string } {
  const user = getUserById(dealerId);
  if (!user) return { error: "Usuário inválido." };
  if (user.current_room_id) return { error: "Você já está em uma sala." };
  if (minBet < 1 || maxBet < minBet) return { error: "Apostas mín/máx inválidas." };
  let id = roomId();
  while (getRoom(id)) id = roomId();
  tx(() => {
    db.prepare(
      `INSERT INTO rooms (id, dealer_id, status, min_bet, max_bet)
       VALUES (?, ?, 'on_hold', ?, ?)`,
    ).run(id, dealerId, minBet, maxBet);
    db.prepare("UPDATE users SET current_room_id = ? WHERE id = ?").run(id, dealerId);
  });
  log.ok("sala", `${user.name} abriu ${id}  min=${minBet} máx=${maxBet}  (dealer, sem buy-in)`);
  pushProfile(dealerId);
  broadcastRoom(id);
  return { roomId: id };
}

export function joinRoom(
  userId: number,
  roomIdValue: string,
  buyIn: number,
): { error?: string } {
  const room = getRoom(roomIdValue);
  if (!room || room.status === "dead") return { error: "Sala não encontrada." };
  const user = getUserById(userId);
  if (!user) return { error: "Usuário inválido." };
  if (user.current_room_id && user.current_room_id !== room.id) {
    return { error: "Você já está em outra sala." };
  }
  const existing = getRoomPlayers(room.id).find((p) => p.user_id === userId);
  if (existing || user.id === room.dealer_id) {
    markRoomInvitesRead(userId, room.id);
    pushSocial(userId);
    return {};
  }
  if (buyIn < room.min_bet || buyIn > user.chips) {
    return { error: "Buy-in inválido para o seu saldo." };
  }
  const seats = getRoomPlayers(room.id).map((p) => p.seat);
  const seat = seats.length ? Math.max(...seats) + 1 : 0;
  const runTx = tx(() => {
    db.prepare(
      `INSERT INTO room_players (room_id, user_id, seat, stack, status)
       VALUES (?, ?, ?, ?, 'seated')`,
    ).run(room.id, userId, seat, buyIn);
    db.prepare("UPDATE users SET chips = chips - ?, current_room_id = ? WHERE id = ?").run(
      buyIn,
      room.id,
      userId,
    );
  });
  log.ok("sala", `${user.name} entrou em ${room.id}  buy-in=${buyIn}`);
  markRoomInvitesRead(userId, room.id);
  pushProfile(userId);
  pushSocial(userId);
  broadcastRoom(room.id);
  return {};
}

function assertDealer(room: RoomRow, userId: number): string | null {
  if (room.dealer_id !== userId) return "Só o dealer pode fazer isso.";
  return null;
}

function seatedForPlay(room: RoomRow): RoomPlayerRow[] {
  return getRoomPlayers(room.id).filter(
    (p) => p.status === "seated" && p.stack > 0 && p.user_id !== room.dealer_id,
  );
}

function startRound(room: RoomRow): string | null {
  if (room.status !== "in_progress") return "A sala precisa estar em andamento.";
  const players = getRoomPlayers(room.id);
  for (const p of players) {
    if (p.status === "folded") updatePlayer(room.id, p.user_id, { status: "seated" });
  }
  const seated = getRoomPlayers(room.id).filter(
    (p) => p.status === "seated" && p.stack > 0 && p.user_id !== room.dealer_id,
  );
  if (seated.length < 2) return "É preciso pelo menos 2 jogadores sentados com fichas.";

  const ordered = [...seated].sort((a, b) => a.seat - b.seat);
  let button = room.button_user_id
    ? nextClockwise(ordered, room.button_user_id, (p) => p.status === "seated" && p.stack > 0)
    : ordered[0];
  if (!button) button = ordered[0]!;

  const sb =
    ordered.length === 2
      ? button
      : nextClockwise(ordered, button.user_id, (p) => p.status === "seated")!;
  const bb = nextClockwise(ordered, sb.user_id, (p) => p.status === "seated" && p.user_id !== sb.user_id)!;

  const sbAmt = Math.max(1, Math.floor(room.min_bet / 2));
  const bbAmt = room.min_bet;

  const post = (p: RoomPlayerRow, amount: number) => {
    const put = Math.min(amount, p.stack);
    updatePlayer(room.id, p.user_id, {
      stack: p.stack - put,
      bet: put,
      committed: p.committed + put,
      acted: 0,
    });
    return put;
  };

  const runTx = tx(() => {
    for (const p of getRoomPlayers(room.id)) {
      updatePlayer(room.id, p.user_id, { bet: 0, acted: 0 });
    }
    const fresh = getRoomPlayers(room.id);
    const sbP = fresh.find((p) => p.user_id === sb.user_id)!;
    const bbP = fresh.find((p) => p.user_id === bb.user_id)!;
    const sbPut = post(sbP, sbAmt);
    const bbNow = getRoomPlayers(room.id).find((p) => p.user_id === bb.user_id)!;
    const bbPut = post(bbNow, bbAmt);
    const first = nextClockwise(getRoomPlayers(room.id), bb.user_id, canAct);
    updateRoom(room.id, {
      pot: room.pot + sbPut + bbPut,
      current_bet: bbPut,
      button_user_id: button.user_id,
      turn_user_id: first?.user_id ?? null,
      round_no: room.round_no + 1,
      betting_open: 1,
    });
  });
  setLastAction(room.id, null);
  const started = getRoom(room.id);
  const firstName = started
    ? getRoomPlayers(room.id).find((p) => p.user_id === started.turn_user_id)?.name
    : undefined;
  log.ok("sala", `${room.id} rodada ${started?.round_no ?? "?"}  SB=${sbAmt} BB=${bbAmt}  vez=${firstName ?? "?"}`);
  return null;
}

function canAct(p: RoomPlayerRow): boolean {
  return p.status === "seated" && p.stack > 0;
}

function bettingDone(room: RoomRow): boolean {
  const seated = getRoomPlayers(room.id).filter((p) => p.status === "seated");
  const withChips = seated.filter((p) => p.stack > 0);
  if (seated.length <= 1 || withChips.length === 0) return true;
  return withChips.every((p) => p.acted && p.bet === room.current_bet);
}

function advanceTurn(roomId: string): void {
  const room = getRoom(roomId);
  if (!room) return;
  const seated = getRoomPlayers(roomId).filter((p) => p.status === "seated");
  if (seated.length <= 1 || bettingDone(room)) {
    updateRoom(roomId, { betting_open: 0, turn_user_id: null });
    if (seated.length === 1) {
      awardPot(getRoom(roomId)!, [seated[0]!.user_id]);
    }
    return;
  }
  const next = nextClockwise(getRoomPlayers(roomId), room.turn_user_id, canAct);
  updateRoom(roomId, { turn_user_id: next?.user_id ?? null });
}

function awardPot(room: RoomRow, winnerIds: number[]): string | null {
  const unique = [...new Set(winnerIds)];
  if (!unique.length) return "Escolha pelo menos um vencedor.";
  const players = getRoomPlayers(room.id);
  if (unique.some((id) => !players.some((p) => p.user_id === id))) {
    return "Jogador não está na sala.";
  }
  const pot = room.pot;
  const share = Math.floor(pot / unique.length);
  const leftover = pot - share * unique.length;
  tx(() => {
    unique.forEach((id, i) => {
      const p = getRoomPlayers(room.id).find((x) => x.user_id === id);
      if (!p) return;
      updatePlayer(room.id, id, { stack: p.stack + share + (i === 0 ? leftover : 0) });
    });
    for (const p of getRoomPlayers(room.id)) {
      const broke = p.stack <= 0;
      updatePlayer(room.id, p.user_id, {
        bet: 0,
        committed: 0,
        acted: 0,
        status: broke
          ? "busted"
          : p.status === "folded" || p.status === "seated"
            ? "seated"
            : p.status,
      });
    }
    updateRoom(room.id, {
      pot: 0,
      current_bet: 0,
      betting_open: 0,
      turn_user_id: null,
    });
  });
  log.ok("sala", `${room.id} pote ${pot} dividido por ${unique.length}`);
  return null;
}

function applyBet(room: RoomRow, userId: number, kind: string, amount?: number): string | null {
  if (room.status !== "in_progress" || !room.betting_open) {
    return "Não há rodada de aposta aberta.";
  }
  if (room.turn_user_id !== userId) return "Não é a sua vez.";
  const p = getRoomPlayers(room.id).find((x) => x.user_id === userId);
  if (!p || p.status !== "seated") return "Você não está sentado nesta mão.";
  const actor = getUserById(userId);
  const actorName = actor?.name ?? p.name;

  if (kind === "fold") {
    updatePlayer(room.id, userId, { status: "folded", acted: 1 });
    setLastAction(room.id, { name: actorName, kind: "fold" });
    advanceTurn(room.id);
    return null;
  }

  if (kind === "check") {
    if (p.bet !== room.current_bet) return "Não é possível dar check. Pague ou aumente.";
    updatePlayer(room.id, userId, { acted: 1 });
    setLastAction(room.id, { name: actorName, kind: "check" });
    advanceTurn(room.id);
    return null;
  }

  if (kind === "call") {
    const need = Math.max(0, room.current_bet - p.bet);
    const put = Math.min(need, p.stack);
    updatePlayer(room.id, userId, {
      stack: p.stack - put,
      bet: p.bet + put,
      committed: p.committed + put,
      acted: 1,
    });
    updateRoom(room.id, { pot: room.pot + put });
    setLastAction(room.id, { name: actorName, kind: "call", amount: put });
    advanceTurn(room.id);
    return null;
  }

  if (kind === "raise") {
    const raiseTo = Number(amount);
    if (!Number.isInteger(raiseTo)) return "Valor de raise inválido.";
    if (raiseTo < room.current_bet + room.min_bet) {
      return `O raise mínimo vai para ${room.current_bet + room.min_bet}.`;
    }
    if (raiseTo > room.max_bet) return `A aposta máxima é ${room.max_bet}.`;
    const need = raiseTo - p.bet;
    if (need <= 0) return "Raise precisa ser maior que a aposta atual.";
    if (need > p.stack) return "Fichas insuficientes.";
    if (need > room.max_bet) return `A aposta máxima por ação é ${room.max_bet}.`;
    updatePlayer(room.id, userId, {
      stack: p.stack - need,
      bet: raiseTo,
      committed: p.committed + need,
      acted: 1,
    });
    for (const other of getRoomPlayers(room.id)) {
      if (other.user_id !== userId && other.status === "seated") {
        updatePlayer(room.id, other.user_id, { acted: 0 });
      }
    }
    updateRoom(room.id, { pot: room.pot + need, current_bet: raiseTo });
    setLastAction(room.id, { name: actorName, kind: "raise", amount: raiseTo });
    advanceTurn(room.id);
    return null;
  }

  if (kind === "all_in") {
    const put = p.stack;
    if (put <= 0) return "Sem fichas para all-in.";
    const newBet = p.bet + put;
    updatePlayer(room.id, userId, {
      stack: 0,
      bet: newBet,
      committed: p.committed + put,
      acted: 1,
    });
    if (newBet > room.current_bet) {
      for (const other of getRoomPlayers(room.id)) {
        if (other.user_id !== userId && other.status === "seated" && other.stack > 0) {
          updatePlayer(room.id, other.user_id, { acted: 0 });
        }
      }
      updateRoom(room.id, { pot: room.pot + put, current_bet: newBet });
    } else {
      updateRoom(room.id, { pot: room.pot + put });
    }
    setLastAction(room.id, { name: actorName, kind: "all_in", amount: put });
    advanceTurn(room.id);
    return null;
  }

  return "Ação inválida.";
}

export function handleRoomAction(userId: number, payload: RoomAction): string | null {
  const user = getUserById(userId);
  if (!user?.current_room_id) {
    // Front pode estar preso na UI da sala — sincroniza a saída.
    if (payload.action === "leave") {
      sendToUser(userId, { type: "room_left", roomId: "" });
      return null;
    }
    return "Você não está em uma sala.";
  }
  const room = getRoom(user.current_room_id);
  if (!room) {
    db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(userId);
    if (payload.action === "leave") {
      sendToUser(userId, { type: "room_left", roomId: "" });
      return null;
    }
    return "Sala não encontrada.";
  }
  const me = getRoomPlayers(room.id).find((p) => p.user_id === userId);

  let err: string | null = null;

  switch (payload.action) {
    case "set_status": {
      err = assertDealer(room, userId);
      if (err) break;
      if (room.status === "dead") {
        err = "Uma sala encerrada não pode mudar de status.";
        break;
      }
      if (payload.status === "dead") {
        returnPotToPlayers(room);
        updateRoom(room.id, { status: "dead", betting_open: 0, turn_user_id: null });
        clearInvitesForRoom(room.id);
        break;
      }
      if (payload.status === "in_progress") {
        if (seatedForPlay(room).length < 2) {
          err = "É preciso pelo menos 2 jogadores sentados para começar.";
          break;
        }
        updateRoom(room.id, {
          status: "in_progress",
          betting_open: 0,
          turn_user_id: null,
        });
        err = startRound(getRoom(room.id)!);
        break;
      }
      if (payload.status === "on_hold") {
        if (room.pot > 0) returnPotToPlayers(getRoom(room.id)!);
        updateRoom(room.id, {
          status: "on_hold",
          betting_open: 0,
          turn_user_id: null,
        });
        break;
      }
      err = "Transição de status inválida.";
      break;
    }
    case "settings": {
      err = assertDealer(room, userId);
      if (err) break;
      if (room.status !== "on_hold") {
        err = "Só é possível alterar apostas com a sala em espera.";
        break;
      }
      if (payload.minBet < 1 || payload.maxBet < payload.minBet) {
        err = "Valores de aposta inválidos.";
        break;
      }
      updateRoom(room.id, { min_bet: payload.minBet, max_bet: payload.maxBet });
      break;
    }
    case "reorder": {
      err = assertDealer(room, userId);
      if (err) break;
      if (room.status === "dead") {
        err = "Sala encerrada.";
        break;
      }
      const players = getRoomPlayers(room.id);
      const names = new Set(players.map((p) => normalizeName(p.name)));
      const order = payload.order.map(normalizeName);
      if (order.length !== players.length || order.some((n) => !names.has(n))) {
        err = "Ordem de assentos inválida.";
        break;
      }
      const runTx = tx(() => {
        order.forEach((name, seat) => {
          const p = players.find((x) => normalizeName(x.name) === name)!;
          updatePlayer(room.id, p.user_id, { seat });
        });
      });
      break;
    }
    case "start_round": {
      err = assertDealer(room, userId) ?? startRound(getRoom(room.id)!);
      break;
    }
    case "bet": {
      err = applyBet(getRoom(room.id)!, userId, payload.kind, payload.amount);
      break;
    }
    case "award": {
      err = assertDealer(room, userId);
      if (err) break;
      const ids = payload.names
        .map((n) => getUserByNameKey(normalizeName(n))?.id)
        .filter((id): id is number => typeof id === "number");
      if (ids.length !== payload.names.length) {
        err = "Jogador não encontrado.";
        break;
      }
      err = awardPot(getRoom(room.id)!, ids);
      break;
    }
    case "kick":
    case "suspend":
    case "unsuspend": {
      err = assertDealer(room, userId);
      if (err) break;
      const target = getUserByNameKey(normalizeName(payload.name));
      if (!target) {
        err = "Jogador não encontrado.";
        break;
      }
      if (target.id === room.dealer_id) {
        err = "O dealer não pode ser alvo dessa ação.";
        break;
      }
      const tp = getRoomPlayers(room.id).find((p) => p.user_id === target.id);
      if (!tp) {
        err = "Jogador não está na sala.";
        break;
      }
      if (payload.action === "kick") {
        cashOut(room.id, target.id, tp.committed > 0);
        sendToUser(target.id, { type: "room_left", roomId: room.id });
        sendToUser(target.id, {
          type: "toast",
          level: "warn",
          message: "Você foi expulso da sala.",
        });
      } else if (payload.action === "suspend") {
        updatePlayer(room.id, target.id, { status: "suspended" });
        if (getRoom(room.id)?.turn_user_id === target.id) advanceTurn(room.id);
      } else {
        updatePlayer(room.id, target.id, { status: "seated" });
      }
      break;
    }
    case "invite": {
      err = inviteFriendToRoom(userId, room.id, payload.name);
      break;
    }
    case "sit_out": {
      if (!me) {
        err = "Você não está na sala.";
        break;
      }
      if (me.committed > 0) {
        err = "Não é possível levantar enquanto houver fichas no pote. Você pode sair, mas perde o que apostou.";
        break;
      }
      updatePlayer(room.id, userId, { status: "sitting_out", bet: 0, acted: 0 });
      if (room.turn_user_id === userId) advanceTurn(room.id);
      break;
    }
    case "sit_in": {
      if (!me) {
        err = "Você não está na sala.";
        break;
      }
      if (me.status === "suspended") {
        err = "Você está suspenso pelo dealer.";
        break;
      }
      if (me.stack <= 0 || me.status === "busted") {
        err = "Sem fichas para sentar. Faça um rebuy.";
        break;
      }
      updatePlayer(room.id, userId, { status: "seated" });
      break;
    }
    case "leave": {
      if (userId === room.dealer_id) {
        if (room.status !== "dead") {
          returnPotToPlayers(room);
          updateRoom(room.id, { status: "dead", betting_open: 0, turn_user_id: null });
        }
        setLastAction(room.id, null);
        clearInvitesForRoom(room.id);
        const others = getRoomPlayers(room.id).filter((p) => p.user_id !== userId);
        for (const p of others) {
          cashOut(room.id, p.user_id, false);
          sendToUser(p.user_id, { type: "room_left", roomId: room.id });
          sendToUser(p.user_id, {
            type: "toast",
            level: "warn",
            message: "O dealer encerrou a sala.",
          });
        }
        db.prepare("UPDATE users SET current_room_id = NULL WHERE id = ?").run(userId);
        sendToUser(userId, { type: "room_left", roomId: room.id });
        log.warn("sala", `${user.name} (dealer) saiu de ${room.id} — sala encerrada`);
        break;
      }
      if (!me) {
        err = "Você não está na sala.";
        break;
      }
      const forfeit = me.committed > 0;
      cashOut(room.id, userId, forfeit);
      sendToUser(userId, { type: "room_left", roomId: room.id });
      log.info("sala", `${user.name} saiu de ${room.id}${forfeit ? " (perdeu o pote)" : ""}`);
      break;
    }
    case "buy_in": {
      if (!me) {
        err = "Você não está na sala.";
        break;
      }
      const fresh = getUserById(userId)!;
      if (payload.amount < room.min_bet || payload.amount > fresh.chips) {
        err = "Rebuy inválido para o seu saldo.";
        break;
      }
      db.prepare("UPDATE users SET chips = chips - ? WHERE id = ?").run(payload.amount, userId);
      updatePlayer(room.id, userId, {
        stack: me.stack + payload.amount,
        status: room.betting_open ? "folded" : "seated",
      });
      pushProfile(userId);
      log.ok("sala", `${user.name} rebuy ${payload.amount} em ${room.id}`);
      break;
    }
    default:
      err = "Ação desconhecida.";
  }

  touchRoom(room.id);
  broadcastRoom(room.id);
  if (err) log.warn("sala", `${user.name} @ ${room.id}  ${payload.action}  → ${err}`);
  else log.info("sala", `${user.name} @ ${room.id}  ${describeAction(payload)}`);
  return err;
}

function describeAction(payload: RoomAction): string {
  switch (payload.action) {
    case "set_status":
      return `status → ${payload.status}`;
    case "settings":
      return `apostas min=${payload.minBet} máx=${payload.maxBet}`;
    case "start_round":
      return "iniciou rodada";
    case "bet":
      return `${payload.kind}${payload.amount ? ` ${payload.amount}` : ""}`;
    case "award":
      return `pote para ${payload.names.join(", ")}`;
    case "kick":
      return `expulsou ${payload.name}`;
    case "suspend":
      return `suspendeu ${payload.name}`;
    case "unsuspend":
      return `liberou ${payload.name}`;
    case "invite":
      return `convidou ${payload.name}`;
    case "reorder":
      return `assentos: ${payload.order.join(" → ")}`;
    case "sit_out":
      return "levantou";
    case "sit_in":
      return "sentou";
    case "leave":
      return "saiu";
    case "buy_in":
      return `buy-in ${payload.amount}`;
    default:
      return "ação";
  }
}

export function lookupRoomForJoin(id: string): RoomRow | undefined {
  const room = getRoom(id);
  if (!room || room.status === "dead") return undefined;
  return room;
}
