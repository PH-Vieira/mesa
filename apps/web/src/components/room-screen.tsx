"use client";

import { useEffect, useMemo, useState } from "react";
import type { RoomPlayer, RoomState } from "@mesa/shared";
import { useApp } from "@/lib/app-context";
import { requestWakeLock } from "@/lib/wake-lock";
import { Button, Field, Input, Sheet, StatusPill } from "./ui";
import { TurnAlert } from "./turn-alert";

export function RoomScreen() {
  const { room, user, friends, sendAction, leaveRoom, actionBusy } = useApp();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [rebuyOpen, setRebuyOpen] = useState(false);
  const [winners, setWinners] = useState<string[]>([]);
  const [raiseTo, setRaiseTo] = useState(0);
  const [rebuy, setRebuy] = useState(1000);
  const [minBet, setMinBet] = useState(room?.minBet ?? 10);
  const [maxBet, setMaxBet] = useState(room?.maxBet ?? 200);
  const raiseDefault = useMemo(
    () => Math.min(room?.maxBet ?? 200, Math.max((room?.currentBet ?? 0) + (room?.minBet ?? 10), room?.minBet ?? 10)),
    [room],
  );

  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    void requestWakeLock().then((s) => {
      if (dead) {
        void s?.release();
        return;
      }
      lock = s;
    });
    const onVis = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock().then((s) => {
          void lock?.release();
          lock = s;
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      dead = true;
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, []);

  if (!room || !user) return null;

  const me = room.players.find((p) => p.name === user.name || p.name === room.you);
  const isDealer = room.dealerName === user.name;
  const seatedCount = room.players.filter((p) => p.status === "seated").length;
  const canStart = seatedCount >= 2;
  const inPot = (me?.bet ?? 0) > 0 || (me?.allIn ?? false);
  const canSitOut = !inPot && me?.status === "seated";
  const myTurn = Boolean(me?.isTurn && room.bettingOpen);
  const toCall = Math.max(0, room.currentBet - (me?.bet ?? 0));
  const turnPlayer = room.players.find((p) => p.isTurn);
  const needsRebuy = Boolean(me && (me.status === "busted" || me.stack <= 0) && !me.allIn);
  const canAward = isDealer && room.status === "in_progress" && room.pot > 0 && !room.bettingOpen;
  const canNextRound = isDealer && room.status === "in_progress" && room.pot === 0 && !room.bettingOpen;
  const playing = room.status === "in_progress";
  const lastBanner = formatLastAction(room.lastAction);

  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/?sala=${room.id}` : room.id;

  async function share() {
    if (!room) return;
    const text = `Entra na minha mesa: ${room.id}`;
    if (navigator.share) {
      await navigator.share({ title: "Mesa", text, url: shareUrl }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(`${text} ${shareUrl}`);
  }

  function move(name: string, dir: -1 | 1) {
    if (!room || actionBusy) return;
    const order = [...room.players].sort((a, b) => a.seat - b.seat).map((p) => p.name);
    const i = order.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    sendAction({ action: "reorder", order });
  }

  function toggleWinner(name: string) {
    setWinners((w) => (w.includes(name) ? w.filter((n) => n !== name) : [...w, name]));
  }

  function onDragStart(e: React.DragEvent, name: string) {
    e.dataTransfer.setData("text/plain", name);
  }

  function onDrop(e: React.DragEvent, target: string) {
    e.preventDefault();
    if (!room || actionBusy) return;
    const source = e.dataTransfer.getData("text/plain");
    if (!source || source === target) return;
    const order = [...room.players].sort((a, b) => a.seat - b.seat).map((p) => p.name);
    const from = order.indexOf(source);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, source);
    sendAction({ action: "reorder", order });
  }

  return (
    <div className="felt-bg min-h-dvh px-4 pb-40 pt-5">
      <TurnAlert active={myTurn} />
      <header className="mx-auto flex max-w-md items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/40">Sala</p>
          <button
            className="font-display text-3xl tracking-wide text-gold"
            onClick={() => navigator.clipboard.writeText(room.id)}
          >
            {room.id}
          </button>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill status={room.status} />
            <span className="text-xs text-white/40">Dealer {room.dealerName}</span>
          </div>
        </div>
        <div className="flex gap-3">
          {isDealer && (
            <button className="text-sm text-gold/80" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
          )}
          <button className="text-sm text-white/45" onClick={() => setLeaveOpen(true)}>
            Sair
          </button>
        </div>
      </header>

      <section className="mx-auto mt-5 max-w-md rounded-[28px] border border-white/10 bg-black/25 p-5 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">Pote</p>
        <p className="font-display text-5xl text-gold">{room.pot}</p>
        <p className="mt-1 text-sm text-white/45">
          Aposta atual {room.currentBet} · min {room.minBet} / máx {room.maxBet}
        </p>
        {lastBanner && (
          <p className="mt-2 animate-pulse text-base font-semibold text-amber-200">{lastBanner}</p>
        )}
        {room.bettingOpen && turnPlayer && (
          <p className="mt-2 text-lg font-semibold text-emerald-200">Vez de {turnPlayer.name}</p>
        )}
        {canAward && (
          <p className="mt-2 text-sm text-gold">Toque nos vencedores e entregue o pote. Pode dividir.</p>
        )}
        {room.status === "on_hold" && (
          <p className="mt-2 text-sm text-white/45">
            {seatedCount < 2 ? `Aguardando jogadores (${seatedCount}/2)` : "Pronta para começar"}
          </p>
        )}
      </section>

      {isDealer && !playing && (
        <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-2">
          <Button variant="ghost" disabled={actionBusy} onClick={() => setInviteOpen(true)}>
            Convidar amigos
          </Button>
          <Button variant="ghost" disabled={actionBusy} onClick={share}>
            Link do convite
          </Button>
          <Button variant="felt" disabled={actionBusy} onClick={() => setSettingsOpen(true)}>
            Configurar mesa
          </Button>
          {room.status === "on_hold" && (
            <Button
              disabled={!canStart || actionBusy}
              onClick={() => sendAction({ action: "set_status", status: "in_progress" })}
            >
              {actionBusy ? "Aguarde…" : canStart ? "Começar jogo" : "Faltam jogadores"}
            </Button>
          )}
        </div>
      )}

      {isDealer && playing && (
        <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-2">
          {canAward && (
            <Button
              className="col-span-2"
              disabled={winners.length === 0 || actionBusy}
              onClick={() => {
                sendAction({ action: "award", names: winners });
                setWinners([]);
              }}
            >
              {actionBusy
                ? "Aguarde…"
                : winners.length > 1
                  ? `Dividir pote (${winners.length})`
                  : "Entregar pote"}
            </Button>
          )}
          {canNextRound && (
            <Button
              className="col-span-2"
              disabled={actionBusy}
              onClick={() => sendAction({ action: "start_round" })}
            >
              {actionBusy ? "Aguarde…" : "Próxima rodada"}
            </Button>
          )}
        </div>
      )}

      <section className="mx-auto mt-6 max-w-md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-[0.18em] text-white/40">Jogadores</h2>
          {isDealer && room.status === "on_hold" && (
            <p className="text-xs text-gold/70">Arraste para o lugar real</p>
          )}
        </div>
        <div className="space-y-2">
          {room.players
            .slice()
            .sort((a, b) => a.seat - b.seat)
            .map((p) => (
              <PlayerCard
                key={p.name}
                player={p}
                canReorder={isDealer && room.status === "on_hold" && !actionBusy}
                selectable={canAward && !actionBusy}
                selected={winners.includes(p.name)}
                onSelect={() => toggleWinner(p.name)}
                onUp={() => move(p.name, -1)}
                onDown={() => move(p.name, 1)}
                onDragStart={onDragStart}
                onDrop={onDrop}
              />
            ))}
        </div>
      </section>

      {!isDealer && me && (
        <div className="mx-auto mt-5 flex max-w-md gap-2">
          {needsRebuy ? (
            <Button className="flex-1" disabled={actionBusy} onClick={() => setRebuyOpen(true)}>
              Rebuy
            </Button>
          ) : me.status === "sitting_out" ? (
            <Button
              className="flex-1"
              disabled={actionBusy}
              onClick={() => sendAction({ action: "sit_in" })}
            >
              {actionBusy ? "Aguarde…" : "Sentar de novo"}
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="flex-1"
              disabled={!canSitOut || actionBusy}
              onClick={() => sendAction({ action: "sit_out" })}
            >
              Levantar
            </Button>
          )}
        </div>
      )}

      {playing && (myTurn || !isDealer) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-felt-deep/95 px-4 py-4 safe-bottom">
          <div className="mx-auto max-w-md space-y-3">
            {myTurn && me ? (
              <>
                <p className="text-center text-sm font-semibold text-gold">
                  Sua vez · stack {me.stack} · pagar {toCall}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="ghost"
                    disabled={actionBusy}
                    onClick={() => sendAction({ action: "bet", kind: "fold" })}
                  >
                    Fold
                  </Button>
                  {toCall === 0 ? (
                    <Button
                      variant="felt"
                      disabled={actionBusy}
                      onClick={() => sendAction({ action: "bet", kind: "check" })}
                    >
                      Check
                    </Button>
                  ) : (
                    <Button
                      variant="felt"
                      disabled={actionBusy}
                      onClick={() => sendAction({ action: "bet", kind: "call" })}
                    >
                      {toCall >= me.stack ? `All-in ${me.stack}` : `Call ${toCall}`}
                    </Button>
                  )}
                  <Button
                    disabled={me.stack <= toCall || actionBusy}
                    onClick={() =>
                      sendAction({
                        action: "bet",
                        kind: "raise",
                        amount: raiseTo || raiseDefault,
                      })
                    }
                  >
                    Raise
                  </Button>
                  <Button
                    variant="danger"
                    disabled={me.stack <= 0 || actionBusy}
                    onClick={() => sendAction({ action: "bet", kind: "all_in" })}
                  >
                    All-in {me.stack}
                  </Button>
                </div>
                <Input
                  type="number"
                  value={raiseTo || raiseDefault}
                  onChange={(e) => setRaiseTo(Number(e.target.value))}
                  disabled={actionBusy}
                />
              </>
            ) : (
              <p className="text-center text-sm text-gold-soft">
                {needsRebuy
                  ? "Você quebrou. Faça rebuy para a próxima mão."
                  : room.bettingOpen && turnPlayer
                    ? `Aguardando ${turnPlayer.name} apostar…`
                    : room.pot > 0
                      ? "Aguardando o dealer entregar o pote"
                      : "Aguardando o dealer iniciar a rodada"}
              </p>
            )}
          </div>
        </div>
      )}

      <Sheet open={menuOpen} title="Menu da mesa" onClose={() => setMenuOpen(false)}>
        <div className="grid gap-2">
          <Button variant="ghost" onClick={() => { setMenuOpen(false); setInviteOpen(true); }}>
            Convidar amigos
          </Button>
          <Button variant="ghost" onClick={() => { setMenuOpen(false); void share(); }}>
            Copiar link
          </Button>
          <Button variant="ghost" onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}>
            Apostas mín/máx
          </Button>
          <Button variant="ghost" onClick={() => { setMenuOpen(false); setManageOpen(true); }}>
            Suspender / expulsar
          </Button>
          {playing && (
            <Button
              variant="felt"
              disabled={actionBusy}
              onClick={() => {
                sendAction({ action: "set_status", status: "on_hold" });
                setMenuOpen(false);
              }}
            >
              Pausar mesa
            </Button>
          )}
          {room.status !== "dead" && (
            <Button
              variant="danger"
              disabled={actionBusy}
              onClick={() => {
                sendAction({ action: "set_status", status: "dead" });
                setMenuOpen(false);
              }}
            >
              Encerrar (devolve o pote)
            </Button>
          )}
        </div>
      </Sheet>

      <Sheet open={manageOpen} title="Gerenciar jogadores" onClose={() => setManageOpen(false)}>
        <div className="space-y-2">
          {room.players.map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-2 rounded-2xl bg-black/20 px-3 py-3">
              <p className="text-gold-soft">{p.name}</p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="min-h-10 px-3 py-2 text-xs"
                  disabled={actionBusy}
                  onClick={() =>
                    sendAction({
                      action: p.status === "suspended" ? "unsuspend" : "suspend",
                      name: p.name,
                    })
                  }
                >
                  {p.status === "suspended" ? "Liberar" : "Suspender"}
                </Button>
                <Button
                  variant="danger"
                  className="min-h-10 px-3 py-2 text-xs"
                  disabled={actionBusy}
                  onClick={() => sendAction({ action: "kick", name: p.name })}
                >
                  Expulsar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={inviteOpen} title="Convidar amigos" onClose={() => setInviteOpen(false)}>
        <div className="space-y-2">
          {friends.length === 0 && <p className="text-sm text-white/40">Nenhum amigo ainda.</p>}
          {friends.map((f) => (
            <div key={f.name} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
              <p className="text-gold-soft">{f.name}</p>
              <Button
                className="min-h-10 px-3 py-2 text-xs"
                disabled={actionBusy}
                onClick={() => sendAction({ action: "invite", name: f.name })}
              >
                Convidar
              </Button>
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={settingsOpen} title="Configurações" onClose={() => setSettingsOpen(false)}>
        <div className="space-y-3">
          <Field label="Aposta mínima">
            <Input type="number" value={minBet} onChange={(e) => setMinBet(Number(e.target.value))} />
          </Field>
          <Field label="Aposta máxima">
            <Input type="number" value={maxBet} onChange={(e) => setMaxBet(Number(e.target.value))} />
          </Field>
          <Button
            className="w-full"
            disabled={actionBusy}
            onClick={() => {
              sendAction({ action: "settings", minBet, maxBet });
              setSettingsOpen(false);
            }}
          >
            Salvar
          </Button>
        </div>
      </Sheet>

      <Sheet open={rebuyOpen} title="Rebuy" onClose={() => setRebuyOpen(false)}>
        <div className="space-y-3">
          <p className="text-sm text-white/60">
            Saldo da conta: {user.chips}. Entra na próxima mão, não nesta.
          </p>
          <Field label="Quantas fichas">
            <Input type="number" value={rebuy} onChange={(e) => setRebuy(Number(e.target.value))} />
          </Field>
          <Button
            className="w-full"
            disabled={actionBusy}
            onClick={() => {
              sendAction({ action: "buy_in", amount: rebuy });
              setRebuyOpen(false);
            }}
          >
            Comprar
          </Button>
        </div>
      </Sheet>

      <Sheet open={leaveOpen} title="Sair da mesa" onClose={() => setLeaveOpen(false)}>
        <p className="mb-4 text-sm leading-relaxed text-white/70">
          {isDealer
            ? "Se você sair, a sala é encerrada e o pote volta para quem apostou."
            : inPot
              ? "Você tem fichas no pote. Se sair agora, esse valor não será devolvido."
              : "Seu stack volta para o saldo da conta."}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" disabled={actionBusy} onClick={() => setLeaveOpen(false)}>
            Ficar
          </Button>
          <Button
            variant="danger"
            disabled={actionBusy}
            onClick={() => {
              setLeaveOpen(false);
              leaveRoom();
            }}
          >
            {actionBusy ? "Saindo…" : "Sair mesmo"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function formatLastAction(action: RoomState["lastAction"]): string | null {
  if (!action) return null;
  switch (action.kind) {
    case "fold":
      return `${action.name} deu fold`;
    case "check":
      return `${action.name} deu check`;
    case "call":
      return action.amount != null
        ? `${action.name} pagou ${action.amount}`
        : `${action.name} pagou`;
    case "raise":
      return action.amount != null
        ? `${action.name} subiu para ${action.amount}`
        : `${action.name} subiu`;
    case "all_in":
      return action.amount != null
        ? `${action.name} all-in (${action.amount})`
        : `${action.name} all-in`;
    default:
      return null;
  }
}

function PlayerCard({
  player,
  canReorder,
  selectable,
  selected,
  onSelect,
  onUp,
  onDown,
  onDragStart,
  onDrop,
}: {
  player: RoomPlayer;
  canReorder: boolean;
  selectable: boolean;
  selected: boolean;
  onSelect: () => void;
  onUp: () => void;
  onDown: () => void;
  onDragStart: (e: React.DragEvent, name: string) => void;
  onDrop: (e: React.DragEvent, name: string) => void;
}) {
  return (
    <article
      draggable={canReorder}
      onClick={selectable ? onSelect : undefined}
      onDragStart={(e) => onDragStart(e, player.name)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDrop(e, player.name)}
      className={`rounded-2xl border px-3 py-3 ${
        selected
          ? "border-gold bg-gold/20"
          : player.isTurn
            ? "border-gold bg-gold/10"
            : "border-white/10 bg-black/20"
      } ${selectable ? "cursor-pointer" : ""}`}
    >
      <div className="flex items-center gap-3">
        {canReorder && (
          <div className="flex flex-col">
            <button className="px-1 text-white/40" onClick={onUp} aria-label="Subir">
              ▲
            </button>
            <button className="px-1 text-white/40" onClick={onDown} aria-label="Descer">
              ▼
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-gold-soft">{player.name}</p>
            {player.hasButton && <Badge>BTN</Badge>}
            {player.role === "sb" && <Badge>SB</Badge>}
            {player.role === "bb" && <Badge>BB</Badge>}
            {player.allIn && <Badge>All-in</Badge>}
            {player.lastAction && <Badge>{player.lastAction}</Badge>}
            <StatusPill status={player.status} />
            {selected && <Badge>Vencedor</Badge>}
          </div>
          <p className="mt-1 text-sm text-white/55">
            Stack {player.stack} · aposta {player.bet}
          </p>
        </div>
      </div>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
      {children}
    </span>
  );
}
