"use client";

import { AlertTriangle, CheckCircle2, Hammer, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Pick } from "@/components/game-controls";
import { addLog, type GameState, type ShelterProject, type ShelterState } from "@/lib/game";
import {
  advanceProject,
  canVolunteer,
  createShelterProject,
  projectAssignmentIssue,
  projectDisplayCosts,
  projectOperational,
  shelterPosts,
  shelterProjectCatalog,
  startProject,
} from "@/lib/shelter-projects";

type Edit = (fn: (draft: GameState) => void) => void;

function projectFor(shelter: ShelterState, key: string) { return shelter.projects?.find(project => project.key === key); }
function stateClass(project?: ShelterProject) { return `shelter-project-state ${project ? `is-${project.state.toLowerCase().replace(" ", "-")}` : ""}`; }

export function ShelterProjectsManager({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const shelter = game.shelter;
  if (!shelter.hex) return null;
  const categories = [...new Set(shelterProjectCatalog.map(project => project.category))];

  function addProject(key: string) {
    const definition = createShelterProject(key);
    if (!definition) return;
    edit(draft => {
      draft.shelter.projects ??= [];
      if (draft.shelter.projects.some(project => project.key === key)) return;
      draft.shelter.projects.push(definition);
      addLog(draft, "abrigo", `${definition.name} foi planejado(a) para ${draft.shelter.name}.`);
    });
  }
  function begin(project: ShelterProject) {
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (!target) return;
      issue = startProject(draft.shelter, target);
      if (!issue) addLog(draft, "abrigo", `Construção iniciada: ${target.name}. Custos pagos: ${projectDisplayCosts(target.costs)}.`);
    });
    if (issue) toast.error("Projeto não iniciado", { description: issue });
  }
  function work(project: ShelterProject) {
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (!target || !advanceProject(target)) return;
      addLog(draft, "abrigo", target.state === "Concluído" ? `${target.name} foi concluído.` : `${target.name}: progresso ${target.progress}/${target.requiredProgress}.`);
    });
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
      if (!issue) target.helperIds = checked ? [...new Set([...(target.helperIds ?? []), id])] : (target.helperIds ?? []).filter(entry => entry !== id);
    });
    if (issue) toast.error("Não foi possível atribuir", { description: issue });
  }

  const peopleAtBase = game.npcs.filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === shelter.hex);
  return <section className="shelter-projects"><div className="flex items-start justify-between gap-3 flex-wrap"><div><h3 className="section-title">Projetos e estruturas</h3>
    <p className="intro-line mt-2">Custos são pagos ao iniciar. Progresso é registrado por ação de trabalho; estruturas concluídas só operam quando a capacidade necessária está presente na base.</p></div><span className="tag">{(shelter.projects ?? []).filter(project => project.state === "Concluído").length} concluído(s)</span></div>
    {categories.map(category => <div className="shelter-project-category" key={category}><h4>{category}</h4><div className="shelter-project-grid">{shelterProjectCatalog.filter(definition => definition.category === category).map(definition => {
      const project = projectFor(shelter, definition.key);
      const operational = project ? projectOperational(game, shelter, project) : false;
      return <article className="shelter-project-card" key={definition.key}><div className="flex items-start justify-between gap-2"><div><b>{definition.name}</b><p className="text-xs subtle mt-1">{projectDisplayCosts(definition.costs)} · {definition.requiredProgress} progresso</p></div><span className={stateClass(project)}>{project?.state ?? "Disponível"}</span></div>
        <p className="text-sm mt-3">{definition.effects.map(item => item.label).join(" · ")}</p>
        {definition.requiredCapabilities?.length ? <p className="text-xs subtle mt-2">Requer: {definition.requiredCapabilities.join(" + ")}</p> : <p className="text-xs subtle mt-2">Sem operador obrigatório.</p>}
        {project && <><div className="project-progress"><span style={{ width: `${Math.min(100, project.progress / project.requiredProgress * 100)}%` }} /></div><p className="text-xs subtle mt-1">{project.progress}/{project.requiredProgress} de progresso · {operational ? "operacional" : project.state === "Concluído" ? "aguarda operador presente" : "em preparação"}</p>
          {!playerPreview && <div className="grid gap-2 mt-3"><Pick label="Responsável" value={project.responsibleId ?? ""} options={[{ value: "", label: "Sem responsável" }, ...peopleAtBase.map(npc => ({ value: npc.id, label: `${npc.name} · ${npc.skills.join(", ") || "sem capacidade"}` }))]} onChange={id => setProjectResponsible(project, id)} />
            {peopleAtBase.length > 0 && <div className="project-helpers"><small>Ajudantes</small>{peopleAtBase.filter(npc => npc.id !== project.responsibleId).map(npc => <label key={npc.id}><input type="checkbox" checked={(project.helperIds ?? []).includes(npc.id)} onChange={event => toggleProjectHelper(project, npc.id, event.target.checked)} /> {npc.name}</label>)}</div>}
          </div>}</>}
        {!playerPreview && <div className="flex flex-wrap gap-2 mt-3">{!project && <Button size="sm" variant="outline" onClick={() => addProject(definition.key)}><Plus size={15} /> Planejar</Button>}
          {project?.state === "Planejado" && <Button size="sm" onClick={() => begin(project)}><Hammer size={15} /> Iniciar</Button>}
          {project?.state === "Em construção" && <Button size="sm" onClick={() => work(project)}><Hammer size={15} /> Registrar trabalho</Button>}
          {project?.state === "Concluído" && <Button size="sm" variant="outline" onClick={() => edit(draft => { const target = projectFor(draft.shelter, project.key); if (target) { target.state = "Danificado"; addLog(draft, "abrigo", `${target.name} foi marcado como danificado.`); } })}><AlertTriangle size={15} /> Danificado</Button>}
          {project?.state === "Danificado" && <Button size="sm" variant="outline" onClick={() => edit(draft => { const target = projectFor(draft.shelter, project.key); if (target) target.state = "Em construção"; })}><Hammer size={15} /> Reparar</Button>}
        </div>}</article>;
    })}</div></div>)}
    <ShelterPostsManager game={game} edit={edit} playerPreview={playerPreview} />
  </section>;
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
  return <div className="shelter-posts"><div className="divider" /><h3 className="section-title">Postos e operação</h3><p className="intro-line mt-2">A função livre do NPC continua sendo uma anotação. Aqui, responsável e ajudantes mostram se um posto tem estrutura, capacidade e pessoas presentes para operar.</p>
    <div className="shelter-post-grid mt-3">{rows.map(row => <article className="shelter-post-card" key={row.key}><div className="flex justify-between gap-2"><b>{row.name}</b><span className={`shelter-post-state ${row.operational ? "is-operational" : ""}`}>{row.operational ? <><CheckCircle2 size={14} /> Operacional</> : row.facilitiesReady ? "Sem operador" : "Estrutura pendente"}</span></div>
      <p className="text-xs subtle mt-2">Capacidade: {row.capability}{row.projects.length ? ` · estrutura: ${row.projects.join(" ou ")}` : ""}</p>
      {!playerPreview && <div className="grid gap-2 mt-3"><Pick label="Responsável" value={row.post.responsibleId ?? ""} options={[{ value: "", label: "Sem responsável" }, ...people.filter(npc => canVolunteer(npc, true)).map(npc => ({ value: npc.id, label: `${npc.name} · ${npc.skills.join(", ") || "sem capacidade"}` }))]} onChange={id => updatePost(row.key, id)} />
        <div className="project-helpers"><small>Ajudantes</small>{people.filter(npc => npc.id !== row.post.responsibleId && canVolunteer(npc)).map(npc => <label key={npc.id}><input type="checkbox" checked={(row.post.helperIds ?? []).includes(npc.id)} onChange={event => toggleHelper(row.key, npc.id, event.target.checked)} /> {npc.name}</label>)}</div></div>}
    </article>)}</div>
  </div>;
}

export function FormerShelterProjects({ shelter }: { shelter: ShelterState }) {
  const projects = shelter.projects ?? [];
  if (!projects.length) return <p className="text-xs subtle mt-3">Nenhuma melhoria estrutural registrada nesta base antes de ela se tornar um depósito antigo.</p>;
  return <div className="former-shelter-projects"><b>Estruturas preservadas</b>{projects.map(project => <span key={project.id}>{project.name} · {project.state} ({project.progress}/{project.requiredProgress})</span>)}</div>;
}
