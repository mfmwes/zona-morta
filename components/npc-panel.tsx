"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, MapPin, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { NpcPortrait, NpcPortraitEditor } from "@/components/npc-portrait";
import { ImagePicker } from "@/components/image-picker";
import { NpcCapabilities, NpcCapabilityChips } from "@/components/npc-capabilities";
import { Field, Pick } from "@/components/game-controls";
import { createId } from "@/lib/id";
import { addLog, type GameState, type NPC, type NpcDisposition, type NpcStatus } from "@/lib/game";
import { normalizeNpcCapabilities, npcVisibleToPlayers } from "@/lib/npc-presentation";
import { encounterContexts, encounterTones, generateNpcDrafts, type EncounterContext, type EncounterTone, type GeneratedNpc } from "@/lib/npc-generator";

type Edit = (fn: (draft: GameState) => void) => void;
type Filter = "Todos" | "No abrigo" | "Em campo" | "Outros locais" | "Feridos" | "Infectados" | "Mortos/Desaparecidos" | "Ocultos";
const filters: Filter[] = ["Todos", "No abrigo", "Em campo", "Outros locais", "Feridos", "Infectados", "Mortos/Desaparecidos"];
const statuses: NpcStatus[] = ["Bem", "Ferido", "Grave", "Morto", "Desaparecido"];
const dispositions: NpcDisposition[] = ["Hostil", "Desconfiado", "Neutro", "Aliado", "Leal"];
const infections = ["Saudável", "Exposto", "Infectado", "Sintomático", "Terminal"] as const;

function blankNpc(game: GameState): NPC {
  return { id: "", visibleToPlayers: false, name: "", role: "", description: "", notes: "", publicNotes: "", hex: game.partyHex,
    status: "Bem", infection: "Saudável", disposition: "Neutro", skills: [], duty: "", active: true, accompaniesSurvivorIds: [] };
}

function locationLabel(game: GameState, npc: NPC) {
  const sector = game.hexes[npc.hex]?.sector?.name ?? `Hex ${npc.hex}`;
  return npc.accompaniesParty ? `${sector} · acompanha o grupo` : sector;
}

export function NpcPanel({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Todos");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<NPC>(() => blankNpc(game));
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [context, setContext] = useState<EncounterContext>("Abrigo");
  const [tone, setTone] = useState<EncounterTone>("Aleatório");
  const [generationHex, setGenerationHex] = useState(game.shelter.hex ?? game.partyHex);
  const [generated, setGenerated] = useState<GeneratedNpc[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const npcs = game.npcs;
  const availableNpcs = useMemo(() => npcs.filter(npc => !playerPreview || npcVisibleToPlayers(npc)), [npcs, playerPreview]);
  const effectiveFilter = playerPreview && filter === "Ocultos" ? "Todos" : filter;
  function matchesFilter(npc: NPC, value: Filter) {
    const atShelter = Boolean(game.shelter.hex && npc.hex === game.shelter.hex);
    const inField = npc.hex === game.partyHex && !atShelter;
    if (value === "Ocultos") return !npcVisibleToPlayers(npc);
    if (value === "No abrigo") return atShelter;
    if (value === "Em campo") return inField;
    if (value === "Outros locais") return !atShelter && !inField;
    if (value === "Feridos") return npc.status === "Ferido" || npc.status === "Grave";
    if (value === "Infectados") return npc.infection !== "Saudável";
    if (value === "Mortos/Desaparecidos") return npc.status === "Morto" || npc.status === "Desaparecido";
    return true;
  }
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const needle = normalize(query.trim());
  const filtered = availableNpcs.filter(npc => matchesFilter(npc, effectiveFilter)
    && (!needle || normalize(`${npc.name} ${npc.role} ${npc.skills.join(" ")} ${npc.duty ?? ""} ${locationLabel(game, npc)}`).includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const publicDraft = playerPreview ? npcs.find(npc => npc.id === draft.id && npcVisibleToPlayers(npc)) : null;
  const hiddenCount = npcs.filter(npc => !npcVisibleToPlayers(npc)).length;
  const hexOptions = Object.keys(game.hexes).map(hex => ({ value: hex, label: `${hex} · ${game.hexes[hex].sector?.name ?? "setor oculto"}` }));

  function editNpc(npc?: NPC) { setDraft(npc ? { ...npc, skills: [...npc.skills], accompaniesSurvivorIds: [...(npc.accompaniesSurvivorIds ?? [])] } : blankNpc(game)); setOpen(true); }
  function save() {
    const name = draft.name.trim().slice(0, 80);
    if (!name) return;
    const next = { ...draft, name, role: draft.role.trim().slice(0, 80), description: draft.description.trim().slice(0, 1200),
      notes: draft.notes.trim().slice(0, 4000), publicNotes: draft.publicNotes?.trim().slice(0, 2000),
      duty: draft.duty?.trim().slice(0, 80), skills: normalizeNpcCapabilities(draft.skills) };
    edit(state => {
      const found = state.npcs.find(npc => npc.id === next.id);
      if (found) Object.assign(found, next);
      else { const created = { ...next, id: createId() }; state.npcs.push(created); if (npcVisibleToPlayers(created)) addLog(state, "comunidade", `${created.name} foi registrado(a) na comunidade.`); }
    });
    setOpen(false);
    toast.success(draft.id ? "PNJ atualizado" : "PNJ registrado", { description: name });
  }
  function toggleVisibility(npc: NPC) {
    if (playerPreview) return;
    const visible = !npcVisibleToPlayers(npc);
    edit(state => {
      const found = state.npcs.find(person => person.id === npc.id);
      if (found) found.visibleToPlayers = visible;
    });
    toast.success(`${npc.name} ${visible ? "agora está visível aos jogadores" : "ficou oculto dos jogadores"}.`);
  }
  function generate(count = quantity) {
    setGenerated(generateNpcDrafts({ quantity: count, context, tone, hex: generationHex,
      home: context === "Abrigo" && game.shelter.hex === generationHex ? game.shelter.hex : undefined }));
  }
  function addGenerated() {
    if (!generated.length) return;
    edit(state => {
      const names: string[] = [];
      for (const item of generated) {
        const created = { ...item, id: createId(), skills: [...item.skills], accompaniesSurvivorIds: [...(item.accompaniesSurvivorIds ?? [])] };
        state.npcs.push(created);
        if (npcVisibleToPlayers(created)) names.push(created.name);
      }
      if (names.length) addLog(state, "comunidade", `${names.join(", ")} ${names.length === 1 ? "foi registrado(a)" : "foram registrados(as)"} por encontro local.`);
    });
    toast.success(`${generated.length} PNJ(s) adicionado(s)`, { description: "Estão ocultos dos jogadores até você revelá-los." });
    setGenerated([]);
    setGeneratorOpen(false);
  }

  function deleteNpc() {
    const npc = game.npcs.find(person => person.id === deleteId);
    if (!npc) { setDeleteId(null); return; }
    edit(state => {
      state.npcs = state.npcs.filter(person => person.id !== npc.id);
      const shelters = [state.shelter, ...(state.formerShelters ?? [])];
      for (const shelter of shelters) {
        for (const project of shelter.projects ?? []) {
          if (project.responsibleId === npc.id) delete project.responsibleId;
          project.helperIds = (project.helperIds ?? []).filter(id => id !== npc.id);
          if (project.workShift) project.workShift.workerIds = project.workShift.workerIds.filter(id => id !== npc.id);
        }
        for (const post of shelter.posts ?? []) {
          if (post.responsibleId === npc.id) delete post.responsibleId;
          post.helperIds = (post.helperIds ?? []).filter(id => id !== npc.id);
        }
      }
      if (npcVisibleToPlayers(npc)) addLog(state, "comunidade", `${npc.name} foi removido(a) do registro de PNJs.`);
    });
    setDeleteId(null);
    setOpen(false);
  }

  return <div className="npc-panel">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5"><div><p className="dossier-title">Pessoas da campanha</p><h2 className="section-title mt-1">PNJs e comunidade</h2>
      <p className="intro-line mt-2">Pessoas identificadas podem morar em uma base, acompanhar o grupo ou permanecer em outro lugar.</p></div>
      {!playerPreview && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setGenerationHex(game.shelter.hex ?? game.partyHex); setGenerated([]); setGeneratorOpen(true); }}><Sparkles /> Gerar PNJ / encontro</Button><Button onClick={() => editNpc()}><Plus /> Novo PNJ</Button></div>}</div>
    <div className="npc-search-row">
      <Field label="Buscar pessoa, função ou capacidade" value={query} onChange={setQuery} placeholder="Nome, medicina, vigia, local…" type="search" />
      <span className="tag" role="status">{filtered.length} de {availableNpcs.length} pessoa(s)</span>
      {(query || effectiveFilter !== "Todos") && <Button size="sm" variant="outline" onClick={() => { setQuery(""); setFilter("Todos"); }}>Limpar filtros</Button>}
    </div>
    <div className="npc-filter-row" role="group" aria-label="Filtrar PNJs">{[...filters, ...(!playerPreview ? ["Ocultos" as const] : [])].map(value => <Button key={value} size="sm" variant={effectiveFilter === value ? "default" : "outline"}
      onClick={() => setFilter(value)} aria-pressed={effectiveFilter === value}>{value === "Ocultos" && <EyeOff size={14} />}{value} · {availableNpcs.filter(npc => matchesFilter(npc, value)).length}</Button>)}</div>
    {!playerPreview && <p className="npc-visibility-summary"><Eye size={14} /> {npcs.length - hiddenCount} visível(is) <span>·</span><EyeOff size={14} /> {hiddenCount} oculto(s) <small>Use o olhinho para revelar um encontro.</small></p>}
    <div className="npc-grid mt-5">{filtered.length ? filtered.map(npc => <article key={npc.id} className={`npc-card ${!npcVisibleToPlayers(npc) ? "npc-card-hidden" : ""}`}>
      <button type="button" className="npc-card-open" aria-label={`Abrir ficha de ${npc.name}`} onClick={() => editNpc(npc)}>
        <span className="npc-avatar">{npc.portrait ? <NpcPortrait src={npc.portrait} frame={npc.portraitFrame} /> : npc.name.slice(0, 1).toUpperCase()}</span>
        <span className="npc-card-copy"><strong>{npc.name}</strong><small>{npc.role || "Função não registrada"}</small>
          <span className="npc-card-meta"><MapPin size={13} /> {locationLabel(game, npc)}</span>
          <span className="npc-card-labels"><span className={`npc-status npc-status-${npc.status.toLowerCase()}`}>{npc.status}</span>
            {npc.infection !== "Saudável" && <span className="tag">{npc.infection}</span>}
            {!npc.active && <span className="tag">Inativo</span>}
            {!playerPreview && <span className="npc-visibility-label">{npcVisibleToPlayers(npc) ? <Eye size={12} /> : <EyeOff size={12} />}{npcVisibleToPlayers(npc) ? "Visível aos jogadores" : "Somente o mestre"}</span>}</span>
          <NpcCapabilityChips skills={npc.skills} />
        </span>
      </button>
      {!playerPreview && <button type="button" className="npc-eye-toggle" aria-label={`${npcVisibleToPlayers(npc) ? "Ocultar" : "Exibir"} ${npc.name} ${npcVisibleToPlayers(npc) ? "dos" : "aos"} jogadores`}
        aria-pressed={npcVisibleToPlayers(npc)} title={npcVisibleToPlayers(npc) ? "Ocultar dos jogadores" : "Exibir aos jogadores"} onClick={() => toggleVisibility(npc)}>
        {npcVisibleToPlayers(npc) ? <Eye size={18} /> : <EyeOff size={18} />}
      </button>}
    </article>) : <p className="character-empty-list">{availableNpcs.length ? "Nenhuma pessoa corresponde à busca e aos filtros." : playerPreview ? "O mestre ainda não revelou pessoas da comunidade." : "A comunidade está vazia. Registre um PNJ ou gere um encontro para começar."}</p>}</div>
    <Dialog open={open && (!playerPreview || Boolean(publicDraft))} onOpenChange={setOpen}><DialogContent className="npc-dialog z-[100]" overlayClassName="z-[90]"><DialogHeader><DialogTitle>{playerPreview ? publicDraft?.name : draft.id ? draft.name || "PNJ" : "Novo PNJ"}</DialogTitle>
      <DialogDescription>{playerPreview ? "Informações públicas da comunidade." : "Ficha leve: registra situação e vínculos sem criar outra ficha completa de sobrevivente."}</DialogDescription></DialogHeader>
      {playerPreview ? publicDraft && <PublicNpcDetails npc={publicDraft} game={game} /> : <NpcForm game={game} draft={draft} setDraft={setDraft} hexOptions={hexOptions} />}
      <DialogFooter className="npc-dialog-actions">
        {!playerPreview && draft.id && <Button variant="outline" className="npc-delete-button" onClick={() => setDeleteId(draft.id)}><Trash2 size={15} /> Excluir PNJ</Button>}
        <span className="npc-dialog-actions-spacer" />
        <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
        {!playerPreview && <Button disabled={!draft.name.trim()} onClick={save}>Salvar PNJ</Button>}
      </DialogFooter>
    </DialogContent></Dialog>
    <AlertDialog open={Boolean(deleteId)} onOpenChange={value => { if (!value) setDeleteId(null); }}>
      <AlertDialogContent className="z-[120]" overlayClassName="z-[110]">
        <AlertDialogHeader><AlertDialogTitle>Excluir {game.npcs.find(person => person.id === deleteId)?.name ?? "PNJ"}?</AlertDialogTitle>
          <AlertDialogDescription>O PNJ será removido da campanha e também deixará funções, postos e equipes de trabalho do abrigo. Esta ação não transforma a pessoa novamente em morador sem nome.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={deleteNpc}>Excluir PNJ</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {!playerPreview && <Dialog open={generatorOpen} onOpenChange={setGeneratorOpen}><DialogContent className="npc-dialog z-[100]" overlayClassName="z-[90]"><DialogHeader><DialogTitle>Gerar PNJ ou encontro</DialogTitle>
      <DialogDescription>Gerador local: cria rascunhos ficcionais. Os PNJs são adicionados ocultos dos jogadores; revele-os quando o encontro acontecer.</DialogDescription></DialogHeader>
      <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2"><Pick contentClassName="z-[110]" label="Quantidade" value={String(quantity)} options={[1,2,3,4,5,6].map(value => ({ value: String(value), label: String(value) }))} onChange={value => setQuantity(Number(value))} />
        <Pick contentClassName="z-[110]" label="Tom" value={tone} options={[...encounterTones]} onChange={value => setTone(value as EncounterTone)} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><Pick contentClassName="z-[110]" label="Contexto" value={context} options={[...encounterContexts]} onChange={value => setContext(value as EncounterContext)} />
          <Pick contentClassName="z-[110]" label="Local" value={generationHex} options={hexOptions} onChange={setGenerationHex} /></div>
        {!generated.length ? <Button onClick={() => generate()}><Sparkles /> Gerar prévia</Button> : <div className="grid gap-2"><div className="flex flex-wrap justify-between gap-2"><b>Prévia de encontro</b><span className="text-xs subtle">{generated.length} pessoa(s), ainda não salvas</span></div>
          {generated.map((npc, index) => <div className="list-card text-sm" key={`${npc.name}-${index}`}><div className="flex justify-between gap-3"><div><b>{npc.name}</b><span className="subtle"> · {npc.role} · {npc.disposition}</span><p className="mt-1">{npc.description}</p><p className="text-xs subtle mt-2">{npc.skills.join(", ")} · necessidade: {npc.immediateNeed} · oferece: {npc.offer}</p></div>
            <div className="flex flex-col gap-1"><Button size="sm" variant="outline" onClick={() => { setDraft({ ...npc, id: "" }); setGeneratorOpen(false); setOpen(true); }}>Editar</Button><Button size="sm" variant="ghost" onClick={() => setGenerated(current => current.map((entry, itemIndex) => itemIndex === index ? generateNpcDrafts({ quantity: 1, context, tone, hex: generationHex, home: context === "Abrigo" ? (game.shelter.hex ?? undefined) : undefined })[0] : entry))}>Sortear este</Button></div></div></div>)}
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => generate()}><Sparkles /> Sortear todos</Button><Button onClick={addGenerated}>Adicionar {generated.length} à campanha</Button></div>
        </div>}</div>
      <DialogFooter><Button variant="outline" onClick={() => setGeneratorOpen(false)}>Fechar</Button></DialogFooter>
    </DialogContent></Dialog>}
  </div>;
}

function PublicNpcDetails({ npc, game }: { npc: NPC; game: GameState }) {
  return <div className="npc-public-details">
    {npc.portrait && <div className="npc-public-portrait npc-complete-portrait"><img src={npc.portrait} alt="" /></div>}
    <div className="grid gap-3 text-sm"><p><b>{npc.role || "Pessoa da comunidade"}</b> · {npc.status} · {npc.disposition}</p>
      <p className="flex items-center gap-1"><MapPin size={15} /> {locationLabel(game, npc)}</p>{npc.description && <p>{npc.description}</p>}
      {npc.skills.length > 0 && <div><b>Capacidades:</b><NpcCapabilityChips skills={npc.skills} /></div>}{npc.duty && <p><b>Função no abrigo:</b> {npc.duty}</p>}
      {npc.publicNotes && <p className="character-rule-note">{npc.publicNotes}</p>}</div>
  </div>;
}

function NpcForm({ game, draft, setDraft, hexOptions }: { game: GameState; draft: NPC; setDraft: (value: NPC) => void; hexOptions: { value: string; label: string }[] }) {
  const update = <K extends keyof NPC>(key: K, value: NPC[K]) => setDraft({ ...draft, [key]: value });
  const isAtShelter = Boolean(game.shelter.hex && draft.hex === game.shelter.hex);
  const visible = npcVisibleToPlayers(draft);
  return <div className="grid gap-4 py-1">
    <div className={`npc-visibility-control ${visible ? "is-visible" : ""}`}><span className="npc-visibility-control-icon">{visible ? <Eye size={22} /> : <EyeOff size={22} />}</span>
      <div><b>{visible ? "Visível aos jogadores" : "Somente o mestre"}</b><p>{visible ? "Este PNJ aparece na comunidade e no mapa dos jogadores." : "Prepare este PNJ em segredo e revele-o no momento do encontro."}</p></div>
      <Button type="button" size="sm" variant="outline" aria-pressed={visible} onClick={() => update("visibleToPlayers", !visible)}>{visible ? <EyeOff size={15} /> : <Eye size={15} />}{visible ? "Ocultar" : "Exibir"}</Button>
    </div>
    <Tabs defaultValue="perfil" className="npc-form-tabs">
      <TabsList aria-label="Seções da ficha do PNJ"><TabsTrigger value="perfil">Perfil e estado</TabsTrigger><TabsTrigger value="vinculos">Local e vínculos</TabsTrigger><TabsTrigger value="notas">Notas</TabsTrigger></TabsList>
      <TabsContent value="perfil" className="npc-form-section">
    <div className="grid gap-3 sm:grid-cols-2"><Field label="Nome" value={draft.name} onChange={value => update("name", value)} placeholder="Ex.: Maria Alves" />
    <Field label="Função / papel" value={draft.role} onChange={value => update("role", value)} placeholder="Enfermeira, vigia..." /></div>
    <div className="grid gap-3 sm:grid-cols-3"><Pick contentClassName="z-[110]" label="Estado" value={draft.status} options={statuses} onChange={value => update("status", value as NpcStatus)} />
      <Pick contentClassName="z-[110]" label="Infecção" value={draft.infection} options={[...infections]} onChange={value => update("infection", value as NPC["infection"])} />
      <Pick contentClassName="z-[110]" label="Disposição" value={draft.disposition} options={dispositions} onChange={value => update("disposition", value as NpcDisposition)} /></div>
    <details className="npc-photo-section"><summary>Retrato e enquadramento{draft.portrait ? " · imagem definida" : " · opcional"}</summary>
      <div>
        <ImagePicker label="Retrato do PNJ" mode="npc" value={draft.portrait} onChange={value => setDraft({ ...draft, portrait: value, portraitFrame: undefined })} fallback={draft.name.slice(0, 2).toUpperCase() || "PNJ"} />
    {draft.portrait && <NpcPortraitEditor key={draft.portrait} src={draft.portrait} frame={draft.portraitFrame} onChange={value => update("portraitFrame", value)} />}
      </div>
    </details>
    <label className="field"><span className="field-label">Descrição</span><textarea value={draft.description} onChange={event => update("description", event.target.value)} placeholder="Aparência, vínculo e o que importa na ficção." /></label>
    <NpcCapabilities skills={draft.skills} onChange={value => update("skills", value)} />
      </TabsContent>
      <TabsContent value="vinculos" className="npc-form-section">
    <div className="grid gap-3 sm:grid-cols-2"><Pick contentClassName="z-[110]" label="Hex atual" value={draft.hex} options={hexOptions} onChange={value => update("hex", value)} />
      <Field label="Função no abrigo" value={draft.duty ?? ""} onChange={value => update("duty", value || undefined)} placeholder="Vigia, cozinha, reparos..." /></div>
    <div className="npc-toggle-row"><label><input type="checkbox" checked={draft.accompaniesParty ?? false} onChange={event => setDraft({ ...draft, accompaniesParty: event.target.checked, hex: event.target.checked ? game.partyHex : draft.hex })} /> <Users size={15} /> Acompanha o grupo principal</label>
      <label><input type="checkbox" checked={draft.active} onChange={event => update("active", event.target.checked)} /> Ativo na campanha</label>
      {game.shelter.hex && <label><input type="checkbox" checked={draft.home === game.shelter.hex} onChange={event => update("home", event.target.checked ? (game.shelter.hex ?? undefined) : undefined)} /> Morador identificado deste abrigo</label>}</div>
    <div className="field"><span className="field-label">Acompanha este grupo de sobreviventes</span><div className="npc-companion-list">{game.survivors.filter(person => (person.hex ?? game.partyHex) === draft.hex).map(person => <label key={person.id}><input type="checkbox" checked={(draft.accompaniesSurvivorIds ?? []).includes(person.id)} onChange={event => update("accompaniesSurvivorIds", event.target.checked ? [...new Set([...(draft.accompaniesSurvivorIds ?? []), person.id])] : (draft.accompaniesSurvivorIds ?? []).filter(id => id !== person.id))} /> {person.name}</label>)}{!game.survivors.some(person => (person.hex ?? game.partyHex) === draft.hex) && <small className="subtle">Nenhum sobrevivente neste hex. Mova o PNJ ou use o grupo principal.</small>}</div></div>
    {isAtShelter && <p className="text-xs subtle">Este PNJ está na base ativa e entra no consumo individual das reservas ao encerrar o dia.</p>}
      </TabsContent>
      <TabsContent value="notas" className="npc-form-section">
    <p className="subtle text-sm">Notas públicas aparecem na ficha dos jogadores. As notas privadas ficam disponíveis apenas para o mestre.</p>
    <label className="field"><span className="field-label">Notas públicas</span><textarea value={draft.publicNotes ?? ""} onChange={event => update("publicNotes", event.target.value)} placeholder="O que jogadores podem ler." /></label>
    <label className="field"><span className="field-label">Notas privadas do mestre</span><textarea value={draft.notes} onChange={event => update("notes", event.target.value)} placeholder="Segredos, ganchos e relações ocultas." /></label>
      </TabsContent>
    </Tabs>
  </div>;
}
