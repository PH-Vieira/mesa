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
    <div className="felt-bg hero min-h-dvh px-4 py-10">
      <div className="hero-content w-full max-w-md flex-col p-0 sm:max-w-lg">
        <div className="mb-2 text-center">
          <div className="chip-stack mx-auto mb-5" />
          <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Mesa</p>
          <h1 className="font-display mt-2 text-4xl font-bold sm:text-5xl">Conta as fichas.</h1>
          <p className="mt-2 text-sm text-base-content/60 sm:text-base">
            Poker na vida real, saldo no app — celular ou desktop.
          </p>
        </div>

        <div className="card bg-base-200/70 card-border w-full shadow-xl backdrop-blur-sm">
          <form onSubmit={submit} className="card-body gap-3">
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
              <div role="alert" className="alert alert-warning alert-soft text-sm">
                <span>
                  Sem e-mail e sem telefone obrigatório: se esquecer a senha, não há como recuperá-la.
                </span>
              </div>
            )}

            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className="label-text">Salvar login neste navegador</span>
            </label>

            {error && (
              <div role="alert" className="alert alert-error alert-soft text-sm">
                <span>{error}</span>
              </div>
            )}

            <div className="card-actions mt-1">
              <Button type="submit" disabled={busy} className="btn-block">
                {busy ? <span className="loading loading-spinner" /> : null}
                {busy ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
              </Button>
            </div>
          </form>
        </div>

        <button
          type="button"
          className="btn btn-link text-base-content/80"
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
