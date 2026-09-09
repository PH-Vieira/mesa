"use client";

import { useEffect, useMemo, useState } from "react";
import { SEARCH_MIN } from "@mesa/shared";
import type { SearchUser } from "@mesa/shared";
import { api } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { Button, Field, Input, Sheet } from "./ui";

export function HomeScreen() {
  const { user, friends, requests, notifications, logout } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(200);
  const [buyIn, setBuyIn] = useState(Math.min(1000, user?.chips ?? 1000));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const incoming = requests.filter((r) => r.direction === "incoming");
  const invites = notifications.filter((n) => n.type === "game_invite");

  useEffect(() => {
    const pending = sessionStorage.getItem("mesa.join");
    if (pending) {
      sessionStorage.removeItem("mesa.join");
      setRoomId(pending.toUpperCase());
      setJoinOpen(true);
    }
  }, []);

  useEffect(() => {
    if (query.trim().length < SEARCH_MIN) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      setSearching(true);
      api
        .search(query.trim())
        .then((d) => setResults(d.users))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const chips = user?.chips ?? 0;
  const buyInClamped = useMemo(() => Math.min(buyIn, chips), [buyIn, chips]);

  async function createRoom() {
    setError("");
    setBusy(true);
    try {
      await api.createRoom(minBet, maxBet);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a sala.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(id: string) {
    setError("");
    setBusy(true);
    try {
      const found = await api.lookupRoom(id.trim().toUpperCase());
      await api.joinRoom(found.roomId, buyInClamped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sala não encontrada.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="felt-bg min-h-dvh px-4 pb-10 pt-6">
      <header className="mx-auto flex max-w-md items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-gold/70">Mesa</p>
          <h1 className="font-display text-3xl text-gold-soft">{user?.name}</h1>
        </div>
        <button onClick={logout} className="text-sm text-white/45">
          Sair
        </button>
      </header>

      <section className="mx-auto mt-6 max-w-md rounded-[28px] border border-white/10 bg-black/20 p-5">
        <div className="flex items-center gap-4">
          <div className="chip-stack shrink-0 scale-90" />
          <div>
            <p className="text-xs uppercase tracking-widest text-white/40">Suas fichas</p>
            <p className="font-display text-4xl text-gold">{chips}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button onClick={() => setJoinOpen(true)} variant="felt">
            Entrar na sala
          </Button>
          <Button onClick={() => setCreateOpen(true)}>Iniciar como dealer</Button>
        </div>
        <p className="mt-4 text-center text-xs text-white/35">
          No celular: menu do navegador → Adicionar à tela inicial
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-md space-y-3">
        <h2 className="text-sm uppercase tracking-[0.18em] text-white/40">Buscar jogadores</h2>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite ao menos 3 caracteres"
          onKeyUp={() => undefined}
        />
        {searching && <p className="text-xs text-white/40">Buscando…</p>}
        <div className="space-y-2">
          {results.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
              <div>
                <p className="font-semibold text-gold-soft">{r.name}</p>
                <p className="text-xs text-white/40">
                  {r.relation === "friends"
                    ? "Amigo"
                    : r.relation === "outgoing"
                      ? "Pedido enviado"
                      : r.relation === "incoming"
                        ? "Quer ser seu amigo"
                        : "Jogador"}
                </p>
              </div>
              {r.relation === "none" && (
                <Button
                  variant="ghost"
                  className="min-h-10 px-3 py-2 text-xs"
                  onClick={() => {
                    api.friendRequest(r.name)
                      .then(() => setResults((list) => list.map((x) => x.name === r.name ? { ...x, relation: "outgoing" } : x)))
                      .catch(() => undefined);
                  }}
                >
                  Adicionar
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-md space-y-3">
        <h2 className="text-sm uppercase tracking-[0.18em] text-white/40">Pedidos de amizade</h2>
        {incoming.length === 0 && <p className="text-sm text-white/35">Nenhum pedido no momento.</p>}
        {incoming.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
            <p className="font-semibold text-gold-soft">{r.name}</p>
            <div className="flex gap-2">
              <Button className="min-h-10 px-3 py-2 text-xs" onClick={() => api.friendRespond(r.id, true)}>
                Aceitar
              </Button>
              <Button variant="ghost" className="min-h-10 px-3 py-2 text-xs" onClick={() => api.friendRespond(r.id, false)}>
                Recusar
              </Button>
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto mt-8 max-w-md space-y-3">
        <h2 className="text-sm uppercase tracking-[0.18em] text-white/40">Convites de jogo</h2>
        {invites.length === 0 && <p className="text-sm text-white/35">Nenhum convite agora.</p>}
        {invites.map((n) => (
          <div key={n.id} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
            <div>
              <p className="font-semibold text-gold-soft">{n.fromName}</p>
              <p className="text-xs text-white/40">Sala {n.roomId}</p>
            </div>
            {n.roomId && (
              <Button className="min-h-10 px-3 py-2 text-xs" onClick={() => joinRoom(n.roomId!)}>
                Entrar
              </Button>
            )}
          </div>
        ))}
      </section>

      <section className="mx-auto mt-8 max-w-md space-y-3">
        <h2 className="text-sm uppercase tracking-[0.18em] text-white/40">Amigos</h2>
        {friends.length === 0 && <p className="text-sm text-white/35">Você ainda não adicionou ninguém.</p>}
        {friends.map((f) => (
          <div key={f.name} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3">
            <p className="font-semibold text-gold-soft">{f.name}</p>
            <p className="text-sm text-gold/80">{f.chips} fichas</p>
          </div>
        ))}
      </section>

      <Sheet open={joinOpen} title="Entrar na sala" onClose={() => setJoinOpen(false)}>
        <div className="space-y-3">
          <Field label="ID da sala">
            <Input
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="Ex: 7K3Q9P"
              maxLength={6}
            />
          </Field>
          <Field label="Buy-in">
            <Input
              type="number"
              value={buyIn}
              onChange={(e) => setBuyIn(Number(e.target.value))}
              min={1}
              max={chips}
            />
          </Field>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button className="w-full" disabled={busy} onClick={() => joinRoom(roomId)}>
            {busy ? "Aguarde…" : "Encontrar sala"}
          </Button>
        </div>
      </Sheet>

      <Sheet open={createOpen} title="Nova sala" onClose={() => setCreateOpen(false)}>
        <div className="space-y-3">
          <Field label="Aposta mínima">
            <Input type="number" value={minBet} onChange={(e) => setMinBet(Number(e.target.value))} />
          </Field>
          <Field label="Aposta máxima">
            <Input type="number" value={maxBet} onChange={(e) => setMaxBet(Number(e.target.value))} />
          </Field>
          <p className="text-sm leading-relaxed text-white/50">
            Você conduz a mesa: não senta, não aposta e não precisa de buy-in.
          </p>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <Button className="w-full" disabled={busy} onClick={createRoom}>
            {busy ? "Aguarde…" : "Abrir mesa"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
