"use client";

import { useState } from "react";
import { PASSWORD_MAX, PASSWORD_MIN, validateName, validatePassword } from "@mesa/shared";
import { rememberDefault, useApp } from "@/lib/app-context";
import { Button, Field, Input } from "./ui";

export function AuthScreen() {
  const { login, register } = useApp();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(rememberDefault());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const n = validateName(name);
    const p = validatePassword(password);
    if (mode === "register" && (n || p)) {
      setError(n || p || "");
      return;
    }
    setBusy(true);
    try {
      if (mode === "register") await register(name, password, remember);
      else await login(name, password, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="felt-bg flex min-h-dvh flex-col px-5 pb-8 pt-12">
      <div className="mx-auto mt-4 flex w-full max-w-md flex-1 flex-col">
        <div className="mb-10 text-center">
          <div className="chip-stack mx-auto mb-5" />
          <p className="text-xs uppercase tracking-[0.28em] text-gold/80">Mesa</p>
          <h1 className="font-display mt-2 text-4xl text-gold-soft">Conta as fichas.</h1>
          <p className="mt-2 text-sm text-white/55">Poker na vida real, saldo no celular.</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-white/10 bg-black/20 p-5">
          <Field label="Nome ou telefone">
            <Input
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="3 a 12 letras ou números"
              maxLength={12}
            />
          </Field>
          <Field label="Senha">
            <Input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres`}
              maxLength={PASSWORD_MAX}
            />
          </Field>

          {mode === "register" && (
            <p className="rounded-2xl bg-amber-400/10 px-3 py-3 text-sm leading-relaxed text-amber-100">
              Sem e-mail e sem telefone obrigatório: se esquecer a senha, não há como recuperá-la.
            </p>
          )}

          <label className="flex items-center gap-3 text-sm text-white/70">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-5 accent-gold"
            />
            Salvar login neste navegador
          </label>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <button
          className="mt-6 text-center text-sm text-gold-soft/80"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </div>
    </div>
  );
}
