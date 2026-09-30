"use client";

import { useMemo, useState } from "react";
import { MapPin, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { createId } from "@/lib/id";
import { addLog, type GameState, type NPC, type NpcDisposition, type NpcStatus } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
type Filter = "Todos" | "No abrigo" | "Em campo" | "Outros locais" | "Feridos" | "Infectados" | "Mortos/Desaparecidos";
const filters: Filter[] = ["Todos", "No abrigo", "Em campo", "Outros locais", "Feridos", "Infectados", "Mortos/Desaparecidos"];
const statuses: NpcStatus[] = ["Bem", "Ferido", "Grave", "Morto", "Desaparecido"];
const dispositions: NpcDisposition[] = ["Hostil", "Desconfiado", "Neutro", "Aliado", "Leal"];
const infections = ["Saudável", "Exposto", "Infectado", "Sintomático", "Terminal"] as const;

function blankNpc(game: GameState): NPC {
  return { id: "", name: "", role: "", description: "", notes: "", publicNotes: "", hex: game.partyHex,
    status: "Bem", infection: "Saudável", disposition: "Neutro", skills: [], duty: "", active: true };
}

function locationLabel(game: GameState, npc: NPC) {
  const sector = game.hexes[npc.hex]?.sector?.name ?? `Hex ${npc.hex}`;
  return npc.accompaniesParty ? `${sector} · acompanha o grupo` : sector;
}

export function NpcPanel({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const [filter, setFilter] = useState<Filter>("Todos");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NPC>(() => blankNpc(game));
  const npcs = game.npcs;
  const filtered = useMemo(() => npcs.filter(npc => {
    const atShelter = Boolean(game.shelter.hex && npc.hex === game.shelter.hex);
    const inField = npc.hex === game.partyHex && !atShelter;
    if (filter === "No abrigo") return atShelter;
    if (filter === "Em campo") return inField;
    if (filter === "Outros locais") return !atShelter && !inField;
    if (filter === "Feridos") return npc.status === "Ferido" || npc.status === "Grave";
    if (filter === "Infectados") return npc.infection !== "Saudável";
    if (filter === "Mortos/Desaparecidos") return npc.status === "Morto" || npc.status === "Desaparecido";
    return true;
  }), [filter, game.partyHex, game.shelter.hex, npcs]);
  const hexOptions = Object.keys(game.hexes).map(hex => ({ value: hex, label: `${hex} · ${game.hexes[hex].sector?.name ?? "setor oculto"}` }));

  function editNpc(npc?: NPC) { setDraft(npc ? { ...npc, skills: [...npc.skills] } : blankNpc(game)); setOpen(true); }
  function save() {
    const name = draft.name.trim().slice(0, 80);
    if (!name) return;
    const next = { ...draft, name, role: draft.role.trim().slice(0, 80), description: draft.description.trim().slice(0, 1200),
      notes: draft.notes.trim().slice(0, 4000), publicNotes: draft.publicNotes?.trim().slice(0, 2000),
      duty: draft.duty?.trim().slice(0, 80), skills: draft.skills.map(x => x.trim()).filter(Boolean).slice(0, 20) };
    edit(state => {
      const found = state.npcs.find(npc => npc.id === next.id);
      if (found) Object.assign(found, next);
      else { const created = { ...next, id: createId() }; state.npcs.push(created); addLog(state, "comunidade", `${created.name} foi registrado(a) na comunidade.`); }
    });
    setOpen(false);
  }

  return <div className="npc-panel">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5"><div><p className="dossier-title">Pessoas da campanha</p><h2 className="section-title mt-1">NPCs e comunidade</h2>
      <p className="intro-line mt-2">Pessoas identificadas podem morar em uma base, acompanhar o grupo ou permanecer em outro lugar.</p></div>
      {!playerPreview && <Button onClick={() => editNpc()}><Plus /> Novo NPC</Button>}</div>
    <div className="npc-filter-row" role="group" aria-label="Filtrar NPCs">{filters.map(value => <Button key={value} size="sm" variant={filter === value ? "default" : "outline"}
      onClick={() => setFilter(value)} aria-pressed={filter === value}>{value}</Button>)}</div>
    <div className="npc-grid mt-5">{filtered.length ? filtered.map(npc => <button type="button" key={npc.id} className="npc-card" onClick={() => editNpc(npc)}>
      <span className="npc-avatar" style={npc.portrait ? { backgroundImage: `url(${JSON.stringify(npc.portrait)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>{npc.portrait ? "" : npc.name.slice(0, 1).toUpperCase()}</span><span className="npc-card-copy"><strong>{npc.name}</strong><small>{npc.role || "Função não registrada"}</small>
        <span className="npc-card-meta"><MapPin size={13} /> {locationLabel(game, npc)}</span></span><span className={`npc-status npc-status-${npc.status.toLowerCase()}`}>{npc.status}</span>
    </button>) : <p className="character-empty-list">Nenhuma pessoa corresponde a este filtro.</p>}</div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="npc-dialog"><DialogHeader><DialogTitle>{draft.id ? draft.name || "NPC" : "Novo NPC"}</DialogTitle>
      <DialogDescription>{playerPreview ? "Informações públicas da comunidade." : "Ficha leve: registra situação e vínculos sem criar outra ficha completa de sobrevivente."}</DialogDescription></DialogHeader>
      {playerPreview ? <PublicNpcDetails npc={draft} game={game} /> : <NpcForm game={game} draft={draft} setDraft={setDraft} hexOptions={hexOptions} />}
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>{!playerPreview && <Button disabled={!draft.name.trim()} onClick={save}>Salvar NPC</Button>}</DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

function PublicNpcDetails({ npc, game }: { npc: NPC; game: GameState }) {
  return <div className="grid gap-3 text-sm"><p><b>{npc.role || "Pessoa da comunidade"}</b> · {npc.status} · {npc.disposition}</p>
    <p className="flex items-center gap-1"><MapPin size={15} /> {locationLabel(game, npc)}</p>{npc.description && <p>{npc.description}</p>}
    {npc.skills.length > 0 && <p><b>Capacidades:</b> {npc.skills.join(", ")}</p>}{npc.duty && <p><b>Função no abrigo:</b> {npc.duty}</p>}
    {npc.publicNotes && <p className="character-rule-note">{npc.publicNotes}</p>}</div>;
}

function NpcForm({ game, draft, setDraft, hexOptions }: { game: GameState; draft: NPC; setDraft: (value: NPC) => void; hexOptions: { value: string; label: string }[] }) {
  const update = <K extends keyof NPC>(key: K, value: NPC[K]) => setDraft({ ...draft, [key]: value });
  const isAtShelter = Boolean(game.shelter.hex && draft.hex === game.shelter.hex);
  return <div className="grid gap-4 py-1"><div className="grid gap-3 sm:grid-cols-2"><Field label="Nome" value={draft.name} onChange={value => update("name", value)} placeholder="Ex.: Maria Alves" />
    <Field label="Função / papel" value={draft.role} onChange={value => update("role", value)} placeholder="Enfermeira, vigia..." /></div>
    <div className="grid gap-3 sm:grid-cols-3"><Pick label="Estado" value={draft.status} options={statuses} onChange={value => update("status", value as NpcStatus)} />
      <Pick label="Infecção" value={draft.infection} options={infections} onChange={value => update("infection", value as NPC["infection"])} />
      <Pick label="Disposição" value={draft.disposition} options={dispositions} onChange={value => update("disposition", value as NpcDisposition)} /></div>
    <Field label="Retrato (URL opcional)" value={draft.portrait ?? ""} onChange={value => update("portrait", value || undefined)} placeholder="https://..." />
    <label className="field"><span className="field-label">Descrição</span><textarea value={draft.description} onChange={event => update("description", event.target.value)} placeholder="Aparência, vínculo e o que importa na ficção." /></label>
    <Field label="Capacidades (separe por vírgulas)" value={draft.skills.join(", ")} onChange={value => update("skills", value.split(","))} placeholder="Medicina, mecânica, cultivo" />
    <div className="grid gap-3 sm:grid-cols-2"><Pick label="Hex atual" value={draft.hex} options={hexOptions} onChange={value => update("hex", value)} />
      <Field label="Função no abrigo" value={draft.duty ?? ""} onChange={value => update("duty", value || undefined)} placeholder="Vigia, cozinha, reparos..." /></div>
    <div className="npc-toggle-row"><label><input type="checkbox" checked={draft.accompaniesParty ?? false} onChange={event => setDraft({ ...draft, accompaniesParty: event.target.checked, hex: event.target.checked ? game.partyHex : draft.hex })} /> <Users size={15} /> Acompanha o grupo</label>
      <label><input type="checkbox" checked={draft.active} onChange={event => update("active", event.target.checked)} /> Ativo na campanha</label>
      {game.shelter.hex && <label><input type="checkbox" checked={draft.home === game.shelter.hex} onChange={event => update("home", event.target.checked ? game.shelter.hex : undefined)} /> Morador identificado deste abrigo</label>}</div>
    {isAtShelter && <p className="text-xs subtle">Este NPC está na base ativa e entra no consumo individual das reservas ao encerrar o dia.</p>}
    <label className="field"><span className="field-label">Notas públicas</span><textarea value={draft.publicNotes ?? ""} onChange={event => update("publicNotes", event.target.value)} placeholder="O que jogadores podem ler." /></label>
    <label className="field"><span className="field-label">Notas privadas do mestre</span><textarea value={draft.notes} onChange={event => update("notes", event.target.value)} placeholder="Segredos, ganchos e relações ocultas." /></label>
  </div>;
}
