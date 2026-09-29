"use client";

import { useMemo, useState } from "react";
import { Archive, BookOpen, LogOut, Pencil, Plus, ShieldCheck, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CampaignSummary = {
  id: string;
  name: string;
  role: "mestre" | "jogador";
  survivorId: string | null;
  survivorName: string | null;
  day: number | null;
  updatedAt: string;
};

export function CampaignLibrary({ campaigns, onRefresh, onSignOut }: {
  campaigns: CampaignSummary[];
  onRefresh: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owned = useMemo(() => campaigns.filter(c => c.role === "mestre"), [campaigns]);
  const joined = useMemo(() => campaigns.filter(c => c.role === "jogador"), [campaigns]);

  function openCampaign(id: string) {
    window.location.assign("/?campanha=" + encodeURIComponent(id));
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/campaigns", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }) });
      const result = await response.json() as { campaign?: { id: string }; error?: string };
      if (!response.ok || !result.campaign) throw new Error(result.error || "Não foi possível criar a campanha.");
      setName("");
      openCampaign(result.campaign.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar a campanha."); }
    finally { setBusy(false); }
  }

  async function rename(campaign: CampaignSummary) {
    const next = window.prompt("Novo nome da campanha:", campaign.name)?.trim();
    if (!next || next === campaign.name) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/campaigns", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, name: next }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível renomear.");
      await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível renomear."); }
    finally { setBusy(false); }
  }

  async function archive(campaign: CampaignSummary) {
    if (!window.confirm(`Arquivar “${campaign.name}”? Ela deixará de aparecer em Seus dossiês. Os dados não serão apagados.`)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/campaigns", { method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível arquivar.");
      await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível arquivar."); }
    finally { setBusy(false); }
  }

  const cards = (items: CampaignSummary[]) => <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
    {items.map(campaign => <article key={`${campaign.role}-${campaign.id}`} className="list-card flex min-h-[180px] flex-col">
      <div className="flex items-start gap-3">
        <div className="players-avatar mt-0.5">{campaign.role === "mestre" ? <ShieldCheck size={18} /> : <UserRound size={18} />}</div>
        <div className="min-w-0 flex-1"><p className="dossier-title">{campaign.role === "mestre" ? "Mestre" : "Jogador"}</p>
          <h3 className="font-extrabold text-[1.05rem] mt-1 break-words">{campaign.name}</h3></div>
      </div>
      <div className="mt-4 grid gap-1 text-sm subtle">
        <span>{campaign.day ? `Dia ${campaign.day}` : "Campanha pronta para começar"}</span>
        {campaign.role === "jogador" && <span>{campaign.survivorName ? `Sobrevivente: ${campaign.survivorName}` : "Sobrevivente pendente"}</span>}
      </div>
      <div className="mt-auto pt-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => openCampaign(campaign.id)}><BookOpen size={16} /> Abrir</Button>
        {campaign.role === "mestre" && <>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void rename(campaign)}><Pencil size={15} /> Renomear</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void archive(campaign)}><Archive size={15} /> Arquivar</Button>
        </>}
      </div>
    </article>)}
  </div>;

  return <main className="min-h-screen p-5 sm:p-8 lg:p-10">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-7">
        <div><p className="eyebrow">Daggerheart / Zona Morta</p><h1 className="page-title mt-1">Seus dossiês</h1>
          <p className="intro-line mt-2 max-w-2xl">Suas campanhas ficam vinculadas à conta. O convite é necessário apenas para entrar em uma nova mesa; depois ela permanece aqui.</p></div>
        <Button variant="outline" onClick={() => void onSignOut()}><LogOut size={16} /> Sair</Button>
      </header>

      {error && <div role="alert" className="mb-5 rounded-md border border-[#d5aaa1] bg-[#fff2ed] px-4 py-3 text-sm text-[#803b35]">{error}</div>}

      <section className="panel panel-pad mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="dossier-title">Nova operação</p><h2 className="section-title mt-1">Criar campanha como mestre</h2>
            <p className="intro-line mt-2">Cada campanha possui mapa, sobreviventes, jogadores e convite próprios.</p></div>
          <Plus size={22} className="text-[#397574]" />
        </div>
        <form onSubmit={event => void createCampaign(event)} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input className="field-input flex-1" aria-label="Nome da nova campanha" placeholder="Ex.: Fortaleza — Dia Zero" maxLength={80}
            value={name} onChange={event => setName(event.target.value)} />
          <Button type="submit" disabled={busy}>{busy ? "Criando..." : "Criar campanha"}</Button>
        </form>
      </section>

      <section className="mb-8">
        <div className="flex items-center gap-2 mb-3"><ShieldCheck size={19} /><div><p className="dossier-title">Como mestre</p><h2 className="section-title mt-1">Campanhas que você conduz</h2></div></div>
        {owned.length ? cards(owned) : <div className="panel panel-pad"><p className="intro-line">Você ainda não criou uma campanha nesta conta.</p></div>}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-3"><Users size={19} /><div><p className="dossier-title">Como jogador</p><h2 className="section-title mt-1">Mesas em que você participa</h2></div></div>
        {joined.length ? cards(joined) : <div className="panel panel-pad"><p className="intro-line">Nenhuma campanha de jogador salva. Ao aceitar um convite, a mesa aparecerá aqui automaticamente.</p></div>}
      </section>
    </div>
  </main>;
}
