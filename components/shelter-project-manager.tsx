"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Hammer,
  History,
  Lightbulb,
  PauseCircle,
  Play,
  Plus,
  ShieldCheck,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pick } from "@/components/game-controls";
import { addLog, displayTime, type GameState, type ShelterProject, type ShelterState } from "@/lib/game";
import {
  cancelShelterWorkShift,
  canVolunteer,
  createShelterProject,
  markProjectDamaged,
  projectAssignmentIssue,
  projectDefinition,
  projectDependencyIssue,
  projectDisplayCosts,
  placeShelterProject,
  projectOperational,
  projectPlacementIssue,
  projectProgress,
  projectWorkPreview,
  scheduleShelterWorkShift,
  shelterBlueprintSlots,
  shelterMetrics,
  shelterPosts,
  shelterPower,
  shelterProjectCatalog,
  shelterRecommendations,
  startProject,
  startRepair,
} from "@/lib/shelter-projects";

type Edit = (fn: (draft: GameState) => void) => void;
type CatalogFilter = "Recomendados" | "Segurança" | "Sobrevivência" | "Saúde" | "Energia e infraestrutura" | "Comunicação" | "Produção e manutenção" | "Comunidade";

const filters: CatalogFilter[] = [
  "Recomendados",
  "Segurança",
  "Sobrevivência",
  "Saúde",
  "Energia e infraestrutura",
  "Comunicação",
  "Produção e manutenção",
  "Comunidade",
];

function projectFor(shelter: ShelterState, key: string) {
  return shelter.projects?.find(project => project.key === key);
}

function projectStateLabel(project?: ShelterProject) {
  if (!project) return "Disponível";
  if (project.workShift) return "Turno agendado";
  if (project.state === "Em construção" && project.repairProgress !== undefined) return "Em reparo";
  return project.state;
}

function projectStateTone(project?: ShelterProject) {
  if (!project) return "available";
  if (project.state === "Concluído") return "complete";
  if (project.state === "Danificado") return "damaged";
  if (project.state === "Em construção") return "building";
  return "planned";
}

function projectLocation(project?: ShelterProject) {
  if (!project?.slotId) return "Sem posição na planta";
  return shelterBlueprintSlots.find(slot => slot.id === project.slotId)?.label ?? project.slotId;
}

export function ShelterProjectsManager({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const shelter = game.shelter;
  const recommendations = shelterRecommendations(game, shelter);
  const [filter, setFilter] = useState<CatalogFilter>("Recomendados");
  const [selectedKey, setSelectedKey] = useState<string>(recommendations[0]?.key ?? shelter.projects?.[0]?.key ?? shelterProjectCatalog[0].key);
  const [planningKey, setPlanningKey] = useState<string | null>(null);
  const [planningSlotId, setPlanningSlotId] = useState<string | null>(null);

  if (!shelter.hex) return null;

  const power = shelterPower(game, shelter);
  const activeProjects = (shelter.projects ?? []).filter(project => project.state !== "Concluído");
  const completedProjects = (shelter.projects ?? []).filter(project => project.state === "Concluído");
  const selectedDefinition = projectDefinition(selectedKey) ?? shelterProjectCatalog[0];
  const selectedProject = projectFor(shelter, selectedDefinition.key);
  const selectedProgress = selectedProject ? projectProgress(selectedProject) : null;
  const selectedPreview = selectedProject?.state === "Em construção" ? projectWorkPreview(game, shelter, selectedProject) : null;
  const dependencyIssue = projectDependencyIssue(shelter, selectedDefinition.key);
  const placementIssue = selectedProject ? projectPlacementIssue(shelter, selectedProject) : null;
  const peopleAtBase = game.npcs.filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === shelter.hex);
  const workersBusy = new Set((shelter.projects ?? []).filter(project => project.state === "Em construção")
    .flatMap(project => [project.responsibleId, ...(project.helperIds ?? [])]).filter(Boolean));
  const availableWorkers = peopleAtBase.filter(npc => !workersBusy.has(npc.id)).length;
  const planningDefinition = planningKey ? projectDefinition(planningKey) : null;
  const planningSlot = planningSlotId ? shelterBlueprintSlots.find(slot => slot.id === planningSlotId) : null;
  const occupiedSlots = new globalThis.Map((shelter.projects ?? []).filter(project => project.slotId).map(project => [project.slotId!, project]));
  const buildLog = game.log.filter(entry => entry.kind === "abrigo").slice(0, 12);
  const scheduledProjects = (shelter.projects ?? []).filter(project => Boolean(project.workShift));
  const slotChoices = planningSlot
    ? shelterProjectCatalog.filter(definition => definition.kind === "facility" && definition.zone === planningSlot.zone
      && (!projectFor(shelter, definition.key) || !projectFor(shelter, definition.key)?.slotId))
    : [];

  const catalog = filter === "Recomendados"
    ? (() => {
        const keys = new Set(recommendations.map(item => item.key));
        return shelterProjectCatalog.filter(definition => keys.has(definition.key));
      })()
    : shelterProjectCatalog.filter(definition => definition.category === filter);

  function addProject(key: string, slotId?: string) {
    const definition = projectDefinition(key);
    if (!definition) return;
    const existing = projectFor(shelter, key);
    if (definition.kind === "facility" && !slotId) {
      setPlanningKey(key);
      setPlanningSlotId(null);
      setSelectedKey(key);
      return;
    }

    let issue: string | null = null;
    if (existing && slotId && !existing.slotId) {
      edit(draft => {
        const target = projectFor(draft.shelter, key);
        if (!target) return;
        issue = placeShelterProject(draft.shelter, target, slotId);
        if (!issue) addLog(draft, "abrigo", `${target.name} foi posicionada em ${shelterBlueprintSlots.find(slot => slot.id === slotId)?.label ?? slotId}.`);
      });
      if (issue) toast.error("Local inválido", { description: issue });
      else toast.success("Local definido.");
      setPlanningKey(null);
      setPlanningSlotId(null);
      setSelectedKey(key);
      return;
    }

    if (existing) {
      setSelectedKey(key);
      return;
    }

    const created = createShelterProject(key, slotId);
    if (!created) return;
    edit(draft => {
      draft.shelter.projects ??= [];
      if (draft.shelter.projects.some(project => project.key === key)) return;
      draft.shelter.projects.push(created);
      addLog(draft, "abrigo", `${created.name} foi planejado(a)${slotId ? ` em ${shelterBlueprintSlots.find(slot => slot.id === slotId)?.label ?? slotId}` : ""} para ${draft.shelter.name}.`);
    });
    setPlanningKey(null);
    setPlanningSlotId(null);
    setSelectedKey(key);
  }

  function begin(project: ShelterProject) {
    if (!project.responsibleId && !(project.helperIds ?? []).length) {
      toast.error("Defina a equipe primeiro", { description: "Escolha ao menos uma pessoa para trabalhar nesta obra antes de iniciá-la." });
      return;
    }
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (!target) return;
      issue = startProject(draft.shelter, target);
      if (!issue) addLog(draft, "abrigo", `Construção iniciada: ${target.name}. Custos pagos: ${projectDisplayCosts(target.costs)}.`);
    });
    if (issue) toast.error("Projeto não iniciado", { description: issue });
    else toast.success("Construção iniciada", { description: "Agora programe um turno. O relógio geral concluirá o trabalho automaticamente quando chegar ao horário final." });
  }

  function repair(project: ShelterProject) {
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (!target) return;
      issue = startRepair(draft.shelter, target);
      if (!issue) addLog(draft, "abrigo", `Reparo iniciado: ${target.name}.`);
    });
    if (issue) toast.error("Reparo não iniciado", { description: issue });
    else toast.success("Reparo iniciado.");
  }

  function scheduleShift(project: ShelterProject) {
    let result: ReturnType<typeof scheduleShelterWorkShift> | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) result = scheduleShelterWorkShift(draft, target, 4);
    });
    if (!result?.ok) toast.error("Turno não programado", { description: result?.message ?? "Verifique a equipe e o horário." });
    else toast.success("Turno programado", { description: result.message });
  }

  function cancelShift(project: ShelterProject) {
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) cancelShelterWorkShift(draft, target);
    });
    toast("Turno cancelado.");
  }

  function setProjectResponsible(project: ShelterProject, id: string) {
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (!target) return;
      issue = id ? projectAssignmentIssue(draft, draft.shelter, target, id, true) : null;
      if (!issue) target.responsibleId = id || undefined;
    });
    if (issue) toast.error("Não foi possível atribuir", { description: issue });
  }

  function toggleProjectHelper(project: ShelterProject, id: string, checked: boolean) {
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (!target) return;
      issue = checked ? projectAssignmentIssue(draft, draft.shelter, target, id, false) : null;
      if (!issue) target.helperIds = checked
        ? [...new Set([...(target.helperIds ?? []), id])]
        : (target.helperIds ?? []).filter(entry => entry !== id);
    });
    if (issue) toast.error("Não foi possível atribuir", { description: issue });
  }

  function togglePower(key: string) {
    edit(draft => {
      draft.shelter.disabledProjectKeys ??= [];
      draft.shelter.disabledProjectKeys = draft.shelter.disabledProjectKeys.includes(key)
        ? draft.shelter.disabledProjectKeys.filter(projectKey => projectKey !== key)
        : [...draft.shelter.disabledProjectKeys, key];
      const project = projectFor(draft.shelter, key);
      addLog(draft, "abrigo", `${project?.name ?? key} foi ${draft.shelter.disabledProjectKeys.includes(key) ? "desligado" : "religado"} na rede de energia.`);
    });
  }

  return <div className="construction-console">
    <section className="construction-summary">
      <div className="construction-summary-stat"><Hammer size={18} /><span><small>Em andamento</small><b>{activeProjects.length}</b></span></div>
      <div className="construction-summary-stat"><CheckCircle2 size={18} /><span><small>Concluídas</small><b>{completedProjects.length}</b></span></div>
      <div className="construction-summary-stat"><Wrench size={18} /><span><small>Peças</small><b>{shelter.parts}</b></span></div>
      <div className="construction-summary-stat"><Users size={18} /><span><small>Equipe livre</small><b>{availableWorkers}/{peopleAtBase.length}</b></span></div>
      <div className={`construction-summary-stat ${power.balance < 0 ? "is-warning" : ""}`}><Zap size={18} /><span><small>Energia</small><b>{power.production} / {power.consumption}</b></span></div>
      {!playerPreview && <Button onClick={runShift} disabled={!activeProjects.some(project => project.state === "Em construção")}><Clock3 size={16} /> Turno da equipe · 4h</Button>}
    </section>

    {power.balance < 0 && <div className="construction-alert"><AlertTriangle size={17} /><div><b>Energia insuficiente</b><span>Produção {power.production} · consumo {power.consumption}. Desligue consumidores menos prioritários até o saldo voltar a zero.</span></div></div>}

    {(power.consumers.length > 0 || power.disabled.length > 0) && <section className="construction-power-manager">
      <div><Zap size={16} /><span><b>Prioridade de energia</b><small>Produção {power.production} · consumo {power.consumption} · saldo {power.balance >= 0 ? "+" : ""}{power.balance}</small></span></div>
      <div>{[...new Set([...power.consumers, ...power.disabled])].map(key => {
        const project = projectFor(shelter, key);
        const off = (shelter.disabledProjectKeys ?? []).includes(key);
        return <button type="button" key={key} disabled={playerPreview} className={off ? "is-off" : ""} onClick={() => togglePower(key)}>
          <span>{project?.name ?? key}</span><b>{off ? "Desligado" : "Ligado"}</b>
        </button>;
      })}</div>
    </section>}

    <section className="construction-active-section">
      <div className="construction-section-heading">
        <div><p className="dossier-title">Agora</p><h3 className="section-title">Projetos ativos</h3></div>
        <span className="tag">Dia {game.day} · {displayTime(game.minutes)}</span>
      </div>
      {activeProjects.length === 0
        ? <div className="construction-empty"><Hammer size={20} /><span>Nenhuma obra ativa. Escolha uma melhoria no catálogo abaixo.</span></div>
        : <div className="construction-active-grid">{activeProjects.map(project => {
          const progress = projectProgress(project);
          const preview = project.state === "Em construção" ? projectWorkPreview(game, shelter, project) : null;
          return <button type="button" key={project.id} className={`construction-active-card ${selectedKey === project.key ? "is-selected" : ""}`} onClick={() => setSelectedKey(project.key)}>
            <div className="construction-active-top"><span className={`construction-state is-${projectStateTone(project)}`}>{projectStateLabel(project)}</span><ChevronRight size={16} /></div>
            <b>{project.name}</b>
            <div className="construction-mini-progress"><span style={{ width: `${Math.min(100, progress.value / progress.required * 100)}%` }} /></div>
            <small>{progress.value}/{progress.required} progresso{progress.repairing ? " de reparo" : ""}</small>
            <small>{preview?.issue ? `⏸ ${preview.issue}` : preview ? `Próximo turno: +${preview.points}` : project.state === "Danificado" ? "Aguardando reparo" : "Aguardando início"}</small>
          </button>;
        })}</div>}
    </section>

    {recommendations.length > 0 && <section className="construction-recommendations">
      <div><Lightbulb size={17} /><b>Sugestões para este abrigo</b></div>
      <div>{recommendations.map(item => <button type="button" key={item.key} onClick={() => { setSelectedKey(item.key); setFilter("Recomendados"); }}>
        <span>{projectDefinition(item.key)?.name}</span><small>{item.reason}</small>
      </button>)}</div>
    </section>}

    <div className="construction-workspace">
      <section className="construction-blueprint-panel">
        <div className="construction-section-heading">
          <div><p className="dossier-title">Planta</p><h3 className="section-title">{planningDefinition ? `Escolha onde construir ${planningDefinition.name}` : "Implantação física"}</h3></div>
          {planningDefinition && <Button size="sm" variant="outline" onClick={() => setPlanningKey(null)}>Cancelar posição</Button>}
        </div>
        <div className="construction-blueprint-grid">
          {shelterBlueprintSlots.map(slot => {
            const occupant = occupiedSlots.get(slot.id);
            const compatible = Boolean(planningDefinition && planningDefinition.zone === slot.zone && !occupant);
            return <button type="button" key={slot.id}
              disabled={Boolean(occupant) || Boolean(planningDefinition && !compatible) || playerPreview}
              className={`construction-blueprint-slot is-${slot.zone} ${occupant ? "is-occupied" : ""} ${compatible ? "is-compatible" : ""}`}
              onClick={() => planningDefinition && compatible && addProject(planningDefinition.key, slot.id)}>
              <small>{slot.label}</small>
              {occupant ? <><b>{occupant.name}</b><span className={`construction-state is-${projectStateTone(occupant)}`}>{projectStateLabel(occupant)}</span></> : <><Plus size={18} /><span>{planningDefinition && compatible ? "Construir aqui" : "Espaço livre"}</span></>}
            </button>;
          })}
        </div>
        <div className="construction-blueprint-legend"><span><i className="is-interior" /> Interior</span><span><i className="is-utility" /> Técnica</span><span><i className="is-exterior" /> Exterior</span></div>
      </section>

      <aside className="construction-detail-panel">
        <header>
          <div><p className="dossier-title">{selectedDefinition.category}</p><h3>{selectedDefinition.name}</h3></div>
          <span className={`construction-state is-${projectStateTone(selectedProject)}`}>{projectStateLabel(selectedProject)}</span>
        </header>

        <div className="construction-detail-scroll">
          <dl className="construction-detail-facts">
            <div><dt>Tipo</dt><dd>{selectedDefinition.kind === "facility" ? "Instalação física" : "Melhoria do abrigo"}</dd></div>
            <div><dt>Custo</dt><dd>{projectDisplayCosts(selectedDefinition.costs)}</dd></div>
            <div><dt>Trabalho</dt><dd>{selectedDefinition.requiredProgress} progresso</dd></div>
            {selectedDefinition.kind === "facility" && <div><dt>Local</dt><dd>{projectLocation(selectedProject)}</dd></div>}
            <div><dt>Construção</dt><dd>{selectedDefinition.buildCapabilities?.length ? selectedDefinition.buildCapabilities.join(" + ") : "Sem especialidade obrigatória"}</dd></div>
            <div><dt>Operação</dt><dd>{selectedDefinition.operationMode === "staffed"
              ? selectedDefinition.requiredCapabilities?.join(" + ") || "Equipe"
              : selectedDefinition.requiresPower ? "Automática com energia" : "Passiva"}</dd></div>
          </dl>

          <div className="construction-effect-box"><span>Efeito</span><p>{selectedDefinition.effects.map(item => item.label).join(" · ")}</p></div>

          {dependencyIssue && !selectedProject && <div className="construction-inline-warning"><AlertTriangle size={15} /> {dependencyIssue}</div>}

          {selectedProject && <div className="construction-project-progress">
            <div><span>{selectedProgress?.repairing ? "Reparo" : "Progresso"}</span><b>{selectedProgress?.value}/{selectedProgress?.required}</b></div>
            <div className="construction-mini-progress"><span style={{ width: `${Math.min(100, (selectedProgress?.value ?? 0) / Math.max(1, selectedProgress?.required ?? 1) * 100)}%` }} /></div>
            {selectedPreview && <small className={selectedPreview.issue || selectedPreview.missingCapabilities.length ? "is-warning" : ""}>{selectedPreview.issue
              ?? `Turno de 4h: +${selectedPreview.points} com ${selectedPreview.workers.map(worker => worker.name).join(", ")}${selectedPreview.missingCapabilities.length ? ` · sem especialista em ${selectedPreview.missingCapabilities.join(" + ")}` : ""}`}</small>}
          </div>}

          {selectedProject && !playerPreview && <div className="construction-team">
            <b>{selectedProject.state === "Concluído" ? "Equipe de operação" : "Equipe da obra"}</b>
            <Pick label="Responsável" value={selectedProject.responsibleId ?? ""} options={[
              { value: "", label: "Sem responsável" },
              ...peopleAtBase.filter(npc => canVolunteer(npc, true)).map(npc => ({ value: npc.id, label: `${npc.name} · ${npc.skills.join(", ") || "sem capacidade"}` })),
            ]} onChange={id => setProjectResponsible(selectedProject, id)} />
            {peopleAtBase.length > 0 && <div className="construction-helper-list">{peopleAtBase.filter(npc => npc.id !== selectedProject.responsibleId).map(npc =>
              <label key={npc.id}><input type="checkbox" checked={(selectedProject.helperIds ?? []).includes(npc.id)} onChange={event => toggleProjectHelper(selectedProject, npc.id, event.target.checked)} /><span>{npc.name}<small>{npc.skills.join(", ") || "sem capacidade"}</small></span></label>)}</div>}
          </div>}

          {selectedProject?.state === "Concluído" && selectedDefinition.requiresPower && <div className="construction-power-toggle">
            <div><BatteryCharging size={17} /><span><b>Rede de energia</b><small>{(shelter.disabledProjectKeys ?? []).includes(selectedProject.key) ? "Desligado manualmente" : projectOperational(game, shelter, selectedProject) ? "Ligado" : "Sem energia suficiente"}</small></span></div>
            {!playerPreview && <Button size="sm" variant="outline" onClick={() => togglePower(selectedProject.key)}>{(shelter.disabledProjectKeys ?? []).includes(selectedProject.key) ? <><Play size={14} /> Ligar</> : <><PauseCircle size={14} /> Desligar</>}</Button>}
          </div>}

          {!playerPreview && <div className="construction-detail-actions">
            {!selectedProject && <Button disabled={Boolean(dependencyIssue)} onClick={() => addProject(selectedDefinition.key)}><Plus size={15} /> {selectedDefinition.kind === "facility" ? "Planejar na planta" : "Planejar"}</Button>}
            {selectedProject?.state === "Planejado" && <Button onClick={() => begin(selectedProject)}><Hammer size={15} /> Iniciar obra</Button>}
            {selectedProject?.state === "Danificado" && <Button onClick={() => repair(selectedProject)}><Wrench size={15} /> Iniciar reparo</Button>}
            {selectedProject?.state === "Concluído" && <Button variant="outline" onClick={() => edit(draft => {
              const target = projectFor(draft.shelter, selectedProject.key);
              if (target && markProjectDamaged(target)) addLog(draft, "abrigo", `${target.name} foi marcado como danificado.`);
            })}><AlertTriangle size={15} /> Marcar danificado</Button>}
          </div>}
        </div>
      </aside>
    </div>

    <section className="construction-catalog">
      <div className="construction-section-heading"><div><p className="dossier-title">Catálogo</p><h3 className="section-title">O que construir depois</h3></div></div>
      <div className="construction-filter-row">{filters.map(value => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>
      {catalog.length === 0
        ? <div className="construction-empty"><Lightbulb size={18} /><span>Nenhuma recomendação urgente. Explore uma categoria para ver todas as melhorias.</span></div>
        : <div className="construction-catalog-grid">{catalog.map(definition => {
          const project = projectFor(shelter, definition.key);
          const locked = !project && Boolean(projectDependencyIssue(shelter, definition.key));
          return <button type="button" key={definition.key} className={`construction-catalog-card ${selectedKey === definition.key ? "is-selected" : ""}`} onClick={() => setSelectedKey(definition.key)}>
            <div><b>{definition.name}</b><span className={`construction-state is-${projectStateTone(project)}`}>{projectStateLabel(project)}</span></div>
            <p>{definition.effects.map(item => item.label).join(" · ")}</p>
            <small>{projectDisplayCosts(definition.costs)} · {definition.requiredProgress} trabalho</small>
            {locked && <small className="is-warning">Dependência pendente</small>}
          </button>;
        })}</div>}
    </section>

    {completedProjects.length > 0 && <details className="construction-collapsible">
      <summary><CheckCircle2 size={16} /> Estruturas concluídas <span>{completedProjects.length}</span></summary>
      <div className="construction-completed-grid">{completedProjects.map(project => <button type="button" key={project.id} onClick={() => setSelectedKey(project.key)}>
        <ShieldCheck size={16} /><span><b>{project.name}</b><small>{projectOperational(game, shelter, project) ? "Operacional" : "Aguardando requisito"}</small></span>
      </button>)}</div>
    </details>}

    <details className="construction-collapsible">
      <summary><Users size={16} /> Postos e operação</summary>
      <ShelterPostsManager game={game} edit={edit} playerPreview={playerPreview} />
    </details>

    {buildLog.length > 0 && <details className="construction-collapsible">
      <summary><History size={16} /> Histórico do abrigo</summary>
      <div className="construction-history">{buildLog.map(entry => <div key={entry.id}><span>Dia {entry.day} · {entry.time}</span><p>{entry.text}</p></div>)}</div>
    </details>}
  </div>;
}

function ShelterPostsManager({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const shelter = game.shelter;
  const rows = shelterPosts(game, shelter);
  const people = game.npcs.filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === shelter.hex);

  function updatePost(key: string, responsibleId: string) {
    edit(draft => {
      draft.shelter.posts ??= [];
      let post = draft.shelter.posts.find(entry => entry.key === key);
      if (!post) { post = { key, helperIds: [] }; draft.shelter.posts.push(post); }
      post.responsibleId = responsibleId || undefined;
    });
  }

  function toggleHelper(key: string, id: string, checked: boolean) {
    edit(draft => {
      draft.shelter.posts ??= [];
      let post = draft.shelter.posts.find(entry => entry.key === key);
      if (!post) { post = { key, helperIds: [] }; draft.shelter.posts.push(post); }
      post.helperIds = checked ? [...new Set([...(post.helperIds ?? []), id])] : (post.helperIds ?? []).filter(value => value !== id);
    });
  }

  return <div className="construction-post-grid">{rows.map(row => <article className="construction-post-card" key={row.key}>
    <div><b>{row.name}</b><span className={row.operational ? "is-operational" : ""}>{row.operational ? "Operacional" : row.facilitiesReady ? "Sem operador" : "Estrutura pendente"}</span></div>
    <small>{row.capability}{row.projects.length ? ` · ${row.projects.join(" ou ")}` : ""}</small>
    {!playerPreview && <><Pick label="Responsável" value={row.post.responsibleId ?? ""} options={[{ value: "", label: "Sem responsável" }, ...people.filter(npc => canVolunteer(npc, true)).map(npc => ({ value: npc.id, label: `${npc.name} · ${npc.skills.join(", ") || "sem capacidade"}` }))]} onChange={id => updatePost(row.key, id)} />
      <div className="construction-helper-list">{people.filter(npc => npc.id !== row.post.responsibleId && canVolunteer(npc)).map(npc => <label key={npc.id}><input type="checkbox" checked={(row.post.helperIds ?? []).includes(npc.id)} onChange={event => toggleHelper(row.key, npc.id, event.target.checked)} /><span>{npc.name}</span></label>)}</div></>}
  </article>)}</div>;
}

export function FormerShelterProjects({ shelter }: { shelter: ShelterState }) {
  const projects = shelter.projects ?? [];
  if (!projects.length) return <p className="text-xs subtle mt-3">Nenhuma melhoria estrutural registrada nesta base antes de ela se tornar um depósito antigo.</p>;
  return <div className="former-shelter-projects"><b>Estruturas preservadas</b>{projects.map(project => {
    const progress = projectProgress(project);
    return <span key={project.id}>{project.name} · {projectStateLabel(project)} ({progress.value}/{progress.required})</span>;
  })}</div>;
}
