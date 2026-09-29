"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AuthPanel({ onAuthenticated }: { onAuthenticated: () => void | Promise<void> }) {
  const [register, setRegister] = useState(false);
  const [reset, setReset] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newRecovery, setNewRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const invited = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("campanha");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: reset ? "reset" : register ? "register" : "login", email, password, recoveryCode }) });
      const result = await response.json() as { error?: string; recoveryCode?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível entrar.");
      setPassword("");
      if (result.recoveryCode) setNewRecovery(result.recoveryCode);
      else await onAuthenticated();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Tente novamente."); }
    finally { setBusy(false); }
  }

  if (newRecovery) return <main className="auth-shell"><section className="panel panel-pad auth-card max-w-lg w-full">
    <div className="auth-emblem" aria-hidden="true">ZM</div>
    <p className="dossier-title">Zona Morta / sua conta</p><h1 className="page-title mt-2">Guarde seu código de recuperação</h1>
    <p className="intro-line mt-3">Este código substitui a recuperação por e-mail. Guarde-o fora do navegador: ele aparece uma vez e permite redefinir a senha. Nunca o envie a outros jogadores.</p>
    <code className="block mt-5 p-3 break-all rounded border bg-white select-all">{newRecovery}</code>
    <Button className="mt-5" onClick={() => void onAuthenticated()}>Guardei o código · continuar</Button>
  </section></main>;

  return <main className="auth-shell"><section className="panel panel-pad auth-card max-w-lg w-full">
    <div className="auth-emblem" aria-hidden="true">ZM</div>
    <p className="dossier-title">Zona Morta / acesso independente</p>
    <h1 className="page-title mt-2">{reset ? "Recuperar acesso" : register ? "Criar conta" : "Entrar no dossiê"}</h1>
    <p className="intro-line mt-3">{invited
      ? "Entre ou crie uma conta para aceitar o convite da campanha e montar seu sobrevivente."
      : "Entre para acessar suas campanhas salvas como mestre ou jogador. Você também pode criar uma nova mesa depois do login."}</p>
    <form onSubmit={event => void submit(event)} className="mt-6 grid gap-4">
      <label className="field text-sm font-semibold">E-mail
        <input className="field-input" type="email" autoComplete="email" required maxLength={254}
          value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label className="field text-sm font-semibold">Senha
        <input className="field-input" type="password" autoComplete={register || reset ? "new-password" : "current-password"}
          minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {reset && <label className="field text-sm font-semibold">Código de recuperação
        <input className="field-input" type="text" required value={recoveryCode} onChange={event => setRecoveryCode(event.target.value)} /></label>}
      {(register || reset) && <p className="text-sm subtle">A senha deve ter pelo menos 12 caracteres. Ao terminar, você receberá um novo código de recuperação.</p>}
      {error && <p role="alert" className="inventory-danger">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? "Aguarde..." : reset ? "Redefinir senha" : register ? "Criar conta" : "Entrar"}</Button>
    </form>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="ghost" onClick={() => { setRegister(!register && !reset); setReset(false); setError(""); }}>
        {register || reset ? "Voltar para entrar" : "Criar uma conta"}</Button>
      {!reset && <Button type="button" variant="ghost" onClick={() => { setReset(true); setRegister(false); setError(""); }}>Esqueci a senha</Button>}
    </div>
  </section></main>;
}
