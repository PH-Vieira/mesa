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
      <div className="felt-bg grid min-h-dvh place-items-center">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <>
      {screen === "auth" && <AuthScreen />}
      {screen === "home" && <HomeScreen />}
      {screen === "room" && <RoomScreen />}

      {lostSignal && (
        <div role="alert" className="alert alert-error fixed inset-x-0 top-0 z-50 rounded-none">
          <span>
            {conn === "offline"
              ? "Sem internet. Reconectamos assim que a rede voltar."
              : "Sem sinal da sala. Tentando reconectar…"}
          </span>
        </div>
      )}

      <div className="toast toast-center toast-bottom z-50 mb-16 sm:mb-8">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            role="alert"
            className={`alert shadow-lg ${
              t.level === "error" ? "alert-error" : t.level === "warn" ? "alert-warning" : "alert-info"
            }`}
            onClick={() => dismissToast(t.id)}
          >
            <span>{t.message}</span>
          </button>
        ))}
      </div>
    </>
  );
}
