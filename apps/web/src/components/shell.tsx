"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/app-context";
import { AuthScreen } from "./auth-screen";
import { HomeScreen } from "./home-screen";
import { RoomScreen } from "./room-screen";

export function Shell() {
  const { screen, bootstrapping, conn, toasts, dismissToast } = useApp();
  const [lostSignal, setLostSignal] = useState(false);

  useEffect(() => {
    const sala = new URLSearchParams(window.location.search).get("sala");
    if (sala) sessionStorage.setItem("mesa.join", sala);
  }, []);

  useEffect(() => {
    const lost = screen === "room" && (conn === "reconnecting" || conn === "offline");
    if (!lost) {
      setLostSignal(false);
      return;
    }
    const timer = window.setTimeout(() => setLostSignal(true), 1200);
    return () => window.clearTimeout(timer);
  }, [screen, conn]);

  if (bootstrapping) {
    return (
      <div className="felt-bg grid min-h-dvh place-items-center text-gold-soft">
        Abrindo a mesa…
      </div>
    );
  }

  return (
    <>
      {screen === "auth" && <AuthScreen />}
      {screen === "home" && <HomeScreen />}
      {screen === "room" && <RoomScreen />}

      {lostSignal && (
        <div className="fixed inset-x-0 top-0 z-50 bg-[#c23b3b] px-4 py-2.5 text-center text-sm font-semibold text-white">
          {conn === "offline"
            ? "Sem internet. Reconectamos assim que a rede voltar."
            : "Sem sinal da sala. Tentando reconectar…"}
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 mx-auto flex max-w-md flex-col gap-2 px-4">
        {toasts.map((t) => (
          <button
            key={t.id}
            className={`pointer-events-auto rounded-2xl px-4 py-3 text-left text-sm text-white shadow-lg ${
              t.level === "error" ? "bg-[#c23b3b]" : t.level === "warn" ? "bg-amber-600" : "bg-felt-rim"
            }`}
            onClick={() => dismissToast(t.id)}
          >
            {t.message}
          </button>
        ))}
      </div>
    </>
  );
}
