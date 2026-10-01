"use client";

import { useMemo, useState } from "react";
import { Copy, Pencil, Plus, RotateCcw, Search, ShieldAlert, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Field, Pick } from "@/components/game-controls";
import { addLog, type GameState } from "@/lib/game";
import { createId } from "@/lib/id";
import {
  baseThreatTemplate,
  createThreatTemplate,
  defaultThreatTemplates,
  duplicateThreatTemplate,
  sanitizeThreatTemplate,
  threatLibrary,
  type ThreatFeatureKind,
  type ThreatTemplate,
} from "@/lib/threats";

type Edit = (fn: (draft: GameState) => void) => void;

function numberValue(value: string, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function nullableNumber(value: string, min: number, max: number) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function thresholdsLabel(threat: ThreatTemplate) {
  if (threat.majorThreshold === null && threat.severeThreshold === null) return "—";
  return `${threat.majorThreshold ?? "—"} / ${threat.severeThreshold ?? "—"}`;
}

function resourceLabel(value: number | null) {
  return value === null ? "—" : String(value);
}

function ThreatCard({ threat, onOpen }: { threat: ThreatTemplate; onOpen: () => void }) {
  return <button type="button" className="threat-card" onClick={onOpen} aria-label={`Abrir ficha de ${threat.name}`}>
    <div className="threat-card-heading">
      <span className="threat-card-icon"><ShieldAlert size={18} aria-hidden="true" /></span>
      <span><small>Patamar {threat.tier} · {threat.role}</small><strong>{threat.name}</strong></span>
      {threat.source === "custom" && <span className="tag">AUTORAL</span>}
    </div>
    <p>{threat.description || "Sem descrição cadastrada."}</p>
    <div className="threat-card-stats">
      <span><small>Dificuldade</small><b>{threat.difficulty}</b></span>
      <span><small>Limiares</small><b>{thresholdsLabel(threat)}</b></span>
      <span><small>PV</small><b>{resourceLabel(threat.maxHp)}</b></span>
      <span><small>Estresse</small><b>{resourceLabel(threat.maxStress)}</b></span>
    </div>
    {threat.attack && <div className="threat-card-attack"><b>{threat.attack.name}</b><span>{threat.attack.bonus >= 0 ? "+" : ""}{threat.attack.bonus} · {threat.attack.range} · {threat.attack.damage} {threat.attack.damageType}</span></div>}
  </button>;
}

function ThreatSheet({ threat }: { threat: ThreatTemplate }) {
  return <div className="threat-sheet">
    <div className="threat-sheet-meta">
      <span className="tag">PATAMAR {threat.tier}</span>
      <span className="tag">{threat.role.toUpperCase()}</span>
      {threat.tags.map(tag => <span className="tag" key={tag}>{tag}</span>)}
    </div>
    {threat.description && <p className="threat-sheet-description">{threat.description}</p>}
    {threat.motivations && <div className="threat-sheet-block"><b>Motivações e táticas</b><p>{threat.motivations}</p></div>}
    <div className="threat-sheet-stats">
      <span><small>Dificuldade</small><strong>{threat.difficulty}</strong></span>
      <span><small>Limiares</small><strong>{thresholdsLabel(threat)}</strong></span>
      <span><small>PV</small><strong>{resourceLabel(threat.maxHp)}</strong></span>
      <span><small>Estresse</small><strong>{resourceLabel(threat.maxStress)}</strong></span>
    </div>
    {threat.attack && <div className="threat-sheet-attack">
      <span>ATQ {threat.attack.bonus >= 0 ? "+" : ""}{threat.attack.bonus}</span>
      <strong>{threat.attack.name}</strong>
      <span>{threat.attack.range}</span>
      <b>{threat.attack.damage} {threat.attack.damageType}</b>
    </div>}
    <div className="threat-sheet-features">
      <h4>Características</h4>
      {threat.features.length ? threat.features.map(feature => <article key={feature.id}>
        <div><strong>{feature.name}</strong><span>{feature.kind}</span></div>
        <p>{feature.effect}</p>
      </article>) : <p className="subtle text-sm">Nenhuma característica cadastrada.</p>}
    </div>
  </div>;
}

function ThreatEditor({ draft, onChange }: { draft: ThreatTemplate; onChange: (next: ThreatTemplate) => void }) {
  function patch(values: Partial<ThreatTemplate>) {
    onChange({ ...draft, ...values });
  }
  function patchAttack(values: Partial<NonNullable<ThreatTemplate["attack"]>>) {
    const attack = draft.attack ?? { name: "Ataque", bonus: 0, range: "Corpo a corpo", damage: "1d6+1", damageType: "físico" };
    patch({ attack: { ...attack, ...values } });
  }
  function patchFeature(id: string, values: Partial<ThreatTemplate["features"][number]>) {
    patch({ features: draft.features.map(feature => feature.id === id ? { ...feature, ...values } : feature) });
  }

  return <div className="threat-editor">
    <div className="threat-editor-grid">
      <Field label="Nome" value={draft.name} onChange={name => patch({ name })} />
      <Field label="Função" value={draft.role} onChange={role => patch({ role })} placeholder="Padrão, Bruto, Horda..." />
      <Field label="Patamar" type="number" value={String(draft.tier)} onChange={value => patch({ tier: numberValue(value, 1, 1, 4) })} />
      <Field label="Dificuldade" type="number" value={String(draft.difficulty)} onChange={value => patch({ difficulty: numberValue(value, 10, 1, 99) })} />
      <Field label="Limiar Maior" type="number" value={draft.majorThreshold === null ? "" : String(draft.majorThreshold)} onChange={value => patch({ majorThreshold: nullableNumber(value, 1, 999) })} placeholder="—" />
      <Field label="Limiar Severo" type="number" value={draft.severeThreshold === null ? "" : String(draft.severeThreshold)} onChange={value => patch({ severeThreshold: nullableNumber(value, 1, 999) })} placeholder="—" />
      <Field label="PV" type="number" value={draft.maxHp === null ? "" : String(draft.maxHp)} onChange={value => patch({ maxHp: nullableNumber(value, 1, 99) })} placeholder="—" />
      <Field label="Estresse" type="number" value={draft.maxStress === null ? "" : String(draft.maxStress)} onChange={value => patch({ maxStress: nullableNumber(value, 0, 99) })} placeholder="—" />
    </div>

    <Field label="Descrição" multiline value={draft.description} onChange={description => patch({ description })} placeholder="Aparência, comportamento e função ficcional." />
    <Field label="Motivações e táticas" multiline value={draft.motivations} onChange={motivations => patch({ motivations })} placeholder="O que busca e como costuma agir." />
    <Field label="Tags" value={draft.tags.join(", ")} onChange={value => patch({ tags: value.split(",").map(tag => tag.trim()).filter(Boolean) })} placeholder="Infectado, Humano, Especial..." />

    <section className="threat-editor-section">
      <div className="threat-editor-section-heading"><div><p className="dossier-title">Ataque básico</p><h4>{draft.attack ? "Ataque configurado" : "Sem ataque básico"}</h4></div>
        <Button type="button" size="sm" variant="outline" onClick={() => patch({ attack: draft.attack ? null : { name: "Ataque", bonus: 0, range: "Corpo a corpo", damage: "1d6+1", damageType: "físico" } })}>
          {draft.attack ? <X size={15} /> : <Plus size={15} />}{draft.attack ? "Remover ataque" : "Adicionar ataque"}
        </Button></div>
      {draft.attack && <div className="threat-editor-grid threat-editor-attack-grid">
        <Field label="Nome do ataque" value={draft.attack.name} onChange={name => patchAttack({ name })} />
        <Field label="Bônus de ataque" type="number" value={String(draft.attack.bonus)} onChange={value => patchAttack({ bonus: numberValue(value, 0, -20, 20) })} />
        <Field label="Alcance" value={draft.attack.range} onChange={range => patchAttack({ range })} placeholder="Corpo a corpo, Perto..." />
        <Field label="Dano" value={draft.attack.damage} onChange={damage => patchAttack({ damage })} placeholder="1d8+2" />
        <Field label="Tipo de dano" value={draft.attack.damageType} onChange={damageType => patchAttack({ damageType })} placeholder="físico" />
      </div>}
    </section>

    <section className="threat-editor-section">
      <div className="threat-editor-section-heading"><div><p className="dossier-title">Características</p><h4>{draft.features.length} cadastrada(s)</h4></div>
        <Button type="button" size="sm" variant="outline" onClick={() => patch({ features: [...draft.features, { id: createId(), name: "Nova característica", kind: "Passiva", effect: "" }] })}><Plus size={15} /> Adicionar</Button></div>
      <div className="threat-feature-editor-list">
        {draft.features.map((feature, index) => <article key={feature.id} className="threat-feature-editor">
          <div className="threat-feature-editor-heading"><strong>Característica {index + 1}</strong>
            <button type="button" onClick={() => patch({ features: draft.features.filter(row => row.id !== feature.id) })} aria-label={`Remover ${feature.name}`}><Trash2 size={15} /></button></div>
          <div className="threat-editor-grid">
            <Field label="Nome" value={feature.name} onChange={name => patchFeature(feature.id, { name })} />
            <Pick label="Tipo" value={feature.kind} options={["Passiva", "Ação", "Reação", "Outro"]} onChange={kind => patchFeature(feature.id, { kind: kind as ThreatFeatureKind })} />
          </div>
          <Field label="Efeito" multiline value={feature.effect} onChange={effect => patchFeature(feature.id, { effect })} />
        </article>)}
        {!draft.features.length && <p className="subtle text-sm">Adicione características para registrar ações, reações e passivas da ameaça.</p>}
      </div>
    </section>
  </div>;
}

export function ThreatManager({ game, edit }: { game: GameState; edit: Edit }) {
  const library = threatLibrary(game.threats);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("Todas");
  const [viewId, setViewId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<ThreatTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const roles = useMemo(() => ["Todas", ...new Set(library.map(threat => threat.role).filter(Boolean))], [library]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return library.filter(threat => (role === "Todas" || threat.role === role)
      && (!normalized || `${threat.name} ${threat.role} ${threat.description} ${threat.motivations} ${threat.tags.join(" ")}`.toLocaleLowerCase("pt-BR").includes(normalized)))
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name, "pt-BR"));
  }, [library, query, role]);

  const viewed = viewId ? library.find(threat => threat.id === viewId) ?? null : null;
  const deleteThreat = deleteId ? library.find(threat => threat.id === deleteId) ?? null : null;

  function ensureLibrary(state: GameState) {
    state.threats ??= defaultThreatTemplates();
    return state.threats;
  }

  function openCreate() {
    setDraft(createThreatTemplate());
    setEditorOpen(true);
  }

  function openEdit(threat: ThreatTemplate) {
    setViewId(null);
    setDraft(structuredClone(threat));
    setEditorOpen(true);
  }

  function saveDraft() {
    if (!draft) return;
    const next = sanitizeThreatTemplate(draft);
    edit(state => {
      const threats = ensureLibrary(state);
      const index = threats.findIndex(threat => threat.id === next.id);
      if (index >= 0) threats[index] = next;
      else threats.push(next);
      addLog(state, "ameaça", `${index >= 0 ? "Ficha atualizada" : "Ameaça criada"}: ${next.name}.`);
    });
    setDraft(null);
    setEditorOpen(false);
    toast.success("Ameaça salva", { description: next.name });
  }

  function duplicate(threat: ThreatTemplate) {
    const copy = duplicateThreatTemplate(threat);
    setViewId(null);
    setDraft(copy);
    setEditorOpen(true);
  }

  function restoreBase(threat: ThreatTemplate) {
    const original = baseThreatTemplate(threat.id);
    if (!original) return;
    edit(state => {
      const threats = ensureLibrary(state);
      const index = threats.findIndex(row => row.id === threat.id);
      if (index >= 0) threats[index] = original;
      else threats.push(original);
      addLog(state, "ameaça", `Ficha-base restaurada: ${original.name}.`);
    });
    setViewId(null);
    toast.success("Ficha-base restaurada", { description: original.name });
  }

  function confirmDelete() {
    if (!deleteThreat || deleteThreat.source !== "custom") return;
    edit(state => {
      const threats = ensureLibrary(state);
      state.threats = threats.filter(threat => threat.id !== deleteThreat.id);
      addLog(state, "ameaça", `Ameaça removida do catálogo: ${deleteThreat.name}.`);
    });
    setDeleteId(null);
    setViewId(null);
    toast.success("Ameaça removida", { description: deleteThreat.name });
  }

  return <div className="threat-manager">
    <div className="threat-manager-heading">
      <div><h2 className="section-title">Gerenciador de ameaças</h2>
        <p className="intro-line mt-1">Catálogo mecânico do mestre. As fichas-base podem ser adaptadas para esta campanha e ameaças autorais ficam salvas no dossiê.</p></div>
      <Button onClick={openCreate}><Plus size={16} /> Nova ameaça</Button>
    </div>

    <div className="threat-manager-toolbar">
      <div className="threat-search"><Search size={16} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar ameaça, função ou tag…" aria-label="Buscar ameaças" /></div>
      <Pick label="Função" value={role} options={roles} onChange={setRole} />
      <span className="tag">{visible.length} / {library.length}</span>
    </div>

    <div className="threat-grid">
      {visible.map(threat => <ThreatCard key={threat.id} threat={threat} onOpen={() => setViewId(threat.id)} />)}
    </div>
    {!visible.length && <div className="threat-empty"><ShieldAlert size={26} /><b>Nenhuma ameaça encontrada.</b><span>Ajuste a busca ou crie uma nova ficha.</span></div>}

    <Dialog open={Boolean(viewed)} onOpenChange={open => { if (!open) setViewId(null); }}>
      {viewed && <DialogContent className="threat-detail-dialog sm:max-w-[720px]">
        <DialogHeader><p className="dossier-title">Ficha de ameaça</p><DialogTitle>{viewed.name}</DialogTitle>
          <DialogDescription>Dados do catálogo desta campanha. Instâncias de combate serão conectadas à Cena de Conflito na próxima etapa.</DialogDescription></DialogHeader>
        <ThreatSheet threat={viewed} />
        <DialogFooter className="threat-detail-actions">
          {viewed.source === "base" && <Button variant="outline" onClick={() => restoreBase(viewed)}><RotateCcw size={15} /> Restaurar base</Button>}
          {viewed.source === "custom" && <Button variant="outline" onClick={() => setDeleteId(viewed.id)}><Trash2 size={15} /> Excluir</Button>}
          <Button variant="outline" onClick={() => duplicate(viewed)}><Copy size={15} /> Duplicar</Button>
          <Button onClick={() => openEdit(viewed)}><Pencil size={15} /> Editar ficha</Button>
        </DialogFooter>
      </DialogContent>}
    </Dialog>

    <Dialog open={editorOpen} onOpenChange={open => { setEditorOpen(open); if (!open) setDraft(null); }}>
      {draft && <DialogContent className="threat-editor-dialog sm:max-w-[760px]">
        <DialogHeader><p className="dossier-title">{draft.source === "custom" ? "Ameaça autoral" : "Ficha-base da campanha"}</p>
          <DialogTitle>{draft.id && library.some(threat => threat.id === draft.id) ? `Editar ${draft.name}` : "Criar ameaça"}</DialogTitle>
          <DialogDescription>Registre apenas dados mecânicos que o gerenciador de cena poderá usar automaticamente depois.</DialogDescription></DialogHeader>
        <ThreatEditor draft={draft} onChange={setDraft} />
        <DialogFooter><Button variant="outline" onClick={() => { setEditorOpen(false); setDraft(null); }}>Cancelar</Button><Button onClick={saveDraft}>Salvar ameaça</Button></DialogFooter>
      </DialogContent>}
    </Dialog>

    <AlertDialog open={Boolean(deleteThreat)} onOpenChange={open => { if (!open) setDeleteId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Excluir {deleteThreat?.name}?</AlertDialogTitle>
          <AlertDialogDescription>Esta ficha autoral será removida do catálogo da campanha. Fichas-base não podem ser excluídas.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmDelete}>Excluir ameaça</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
