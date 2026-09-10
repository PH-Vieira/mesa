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
    <div className="felt-bg min-h-dvh px-4 pb-10 pt-4 sm:px-8 sm:pb-14 sm:pt-8">
      <div className="mx-auto w-full max-w-md lg:max-w-5xl">
        <div className="navbar rounded-box bg-base-200/50 px-2 backdrop-blur-sm sm:px-4">
          <div className="navbar-start min-w-0">
            <div className="min-w-0 px-2">
              <p className="text-xs uppercase tracking-[0.22em] text-primary/70">Mesa</p>
              <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{user?.name}</h1>
            </div>
          </div>
          <div className="navbar-end">
            <Button variant="ghost" className="btn-sm sm:btn-md" onClick={logout}>
              Sair da conta
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-8">
          <div className="space-y-6">
            <div className="stats stats-vertical bg-base-200/70 border-base-300 w-full border shadow-lg backdrop-blur-sm sm:stats-horizontal">
              <div className="stat">
                <div className="stat-figure">
                  <div className="chip-stack scale-75 sm:scale-90" />
                </div>
                <div className="stat-title">Suas fichas</div>
                <div className="stat-value text-primary">{chips}</div>
                <div className="stat-desc">Saldo da conta</div>
              </div>
            </div>

            <div className="card bg-base-200/60 card-border shadow-md">
              <div className="card-body gap-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Button onClick={() => setJoinOpen(true)} variant="secondary" className="btn-block">
                    Entrar na sala
                  </Button>
                  <Button onClick={() => setCreateOpen(true)} className="btn-block">
                    Iniciar como dealer
                  </Button>
                </div>
                <p className="text-center text-xs text-base-content/45 sm:text-left">
                  No celular: menu do navegador → Adicionar à tela inicial
                </p>
              </div>
            </div>

            <section className="space-y-3">
              <h2 className="text-sm uppercase tracking-[0.18em] text-base-content/45">Buscar jogadores</h2>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Digite ao menos 3 caracteres"
              />
              {searching && (
                <p className="flex items-center gap-2 text-xs text-base-content/50">
                  <span className="loading loading-dots loading-xs" /> Buscando…
                </p>
              )}
              <ul className="list bg-base-200/40 rounded-box">
                {results.map((r) => (
                  <li key={r.name} className="list-row items-center">
                    <div>
                      <div className="font-semibold">{r.name}</div>
                      <div className="text-xs text-base-content/45">
                        {r.relation === "friends"
                          ? "Amigo"
                          : r.relation === "outgoing"
                            ? "Pedido enviado"
                            : r.relation === "incoming"
                              ? "Quer ser seu amigo"
                              : "Jogador"}
                      </div>
                    </div>
                    {r.relation === "none" && (
                      <Button
                        variant="ghost"
                        className="btn-sm"
                        onClick={() => {
                          api
                            .friendRequest(r.name)
                            .then(() =>
                              setResults((list) =>
                                list.map((x) => (x.name === r.name ? { ...x, relation: "outgoing" } : x)),
                              ),
                            )
                            .catch(() => undefined);
                        }}
                      >
                        Adicionar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="space-y-4">
            <div className="card bg-base-200/50 card-border">
              <div className="card-body gap-3">
                <h2 className="card-title text-base">Pedidos de amizade</h2>
                {incoming.length === 0 && <p className="text-sm text-base-content/45">Nenhum pedido no momento.</p>}
                <ul className="list">
                  {incoming.map((r) => (
                    <li key={r.id} className="list-row items-center">
                      <div className="font-semibold">{r.name}</div>
                      <div className="join">
                        <Button className="btn-sm join-item" onClick={() => api.friendRespond(r.id, true)}>
                          Aceitar
                        </Button>
                        <Button
                          variant="ghost"
                          className="btn-sm join-item"
                          onClick={() => api.friendRespond(r.id, false)}
                        >
                          Recusar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="card bg-base-200/50 card-border">
              <div className="card-body gap-3">
                <h2 className="card-title text-base">Convites de jogo</h2>
                {invites.length === 0 && <p className="text-sm text-base-content/45">Nenhum convite agora.</p>}
                <ul className="list">
                  {invites.map((n) => (
                    <li key={n.id} className="list-row items-center">
                      <div>
                        <div className="font-semibold">{n.fromName}</div>
                        <div className="text-xs text-base-content/45">Sala {n.roomId}</div>
                      </div>
                      {n.roomId && (
                        <Button className="btn-sm" onClick={() => joinRoom(n.roomId!)}>
                          Entrar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="card bg-base-200/50 card-border">
              <div className="card-body gap-3">
                <h2 className="card-title text-base">Amigos</h2>
                {friends.length === 0 && (
                  <p className="text-sm text-base-content/45">Você ainda não adicionou ninguém.</p>
                )}
                <ul className="list">
                  {friends.map((f) => (
                    <li key={f.name} className="list-row items-center">
                      <div className="font-semibold">{f.name}</div>
                      <div className="badge badge-soft badge-primary">{f.chips} fichas</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

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
          {error && (
            <div role="alert" className="alert alert-error alert-soft text-sm">
              <span>{error}</span>
            </div>
          )}
          <Button className="btn-block" disabled={busy} onClick={() => joinRoom(roomId)}>
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
          <p className="text-sm text-base-content/60">
            Você conduz a mesa: não senta, não aposta e não precisa de buy-in.
          </p>
          {error && (
            <div role="alert" className="alert alert-error alert-soft text-sm">
              <span>{error}</span>
            </div>
          )}
          <Button className="btn-block" disabled={busy} onClick={createRoom}>
            {busy ? "Aguarde…" : "Abrir mesa"}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
