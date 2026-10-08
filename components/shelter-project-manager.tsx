"use client";
import { RuleHelp } from "@/components/rule-help";

import { useRef, useState } from "react";
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
  Trash2,
  Wrench,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Counter, Pick } from "@/components/game-controls";
import { addLog, displayTime, type GameState, type ShelterProject, type ShelterState } from "@/lib/game";
import {
  applyShelterIncident,
  cancelShelterWorkShift,
  cancelSurvivorWorkShift,
  canVolunteer,
  createShelterProject,
  joinShelterProjectAsSurvivor,
  leaveShelterProjectAsSurvivor,
  markProjectDamaged,
  projectAssignmentIssue,
  projectDefinition,
  projectDependencyIssue,
  projectDisplayCosts,
  projectIntegrity,
  projectIntegrityLabel,
  projectMechanicalBenefits,
  placeShelterProject,
  projectOperational,
  projectPlacementIssue,
  projectProgress,
  projectWorkPreview,
  scheduleShelterWorkShift,
  scheduleSurvivorWorkShift,
  shelterBlueprintSlots,
  repairPlan,
  shelterIncidentCandidates,
  shelterIncidentMitigation,
  shelterMetrics,
  shelterPosts,
  shelterPower,
  shelterProjectCatalog,
  shelterRecommendations,
  survivorShelterCapabilities,
  survivorWorkPreview,
  startProject,
  startRepair,
  type ShelterIncidentKind,
} from "@/lib/shelter-projects";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MasterActionControls } from "@/components/player-actions-panel";
import { projectRemovalLabel, removalFingerprint } from "@/lib/master-removals";
import { createId } from "@/lib/id";

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

const incidentKinds: ShelterIncidentKind[] = ["Invasão", "Sabotagem", "Incêndio", "Tempestade", "Curto elétrico", "Inundação", "Outro"];

function projectFor(shelter: ShelterState, key: string) {
  return shelter.projects?.find(project => project.key === key);
}

function projectStateLabel(project?: ShelterProject) {
  if (!project) return "Disponível";
  if (project.workShift || (project.volunteerShifts ?? []).length) return "Turno agendado";
  if (project.state === "Em construção" && project.repairProgress !== undefined) return "Em reparo";
  return project.state;
}

function projectStateTone(project?: ShelterProject) {
  if (!project) return "available";
  if (project.state === "Concluído") return "complete";
  if (["Danificado", "Inoperante", "Destruído"].includes(project.state)) return "damaged";
  if (project.state === "Em construção") return "building";
  return "planned";
}

function projectLocation(project?: ShelterProject) {
  if (!project?.slotId) return "Sem posição na planta";
  return shelterBlueprintSlots.find(slot => slot.id === project.slotId)?.label ?? project.slotId;
}

function integrityGlyph(project: ShelterProject) {
  const value = projectIntegrity(project);
  return `${"●".repeat(value)}${"○".repeat(Math.max(0, 3 - value))}`;
}

export function ShelterProjectsManager({ initialProjectId, game, edit, playerPreview, playerSurvivorId, masterActions }: { initialProjectId?:string; game: GameState; edit: Edit; playerPreview: boolean; playerSurvivorId?: string | null; masterActions?: MasterActionControls }) {
  const shelter = game.shelter;
  const recommendations = shelterRecommendations(game, shelter);
  const [filter, setFilter] = useState<CatalogFilter>("Recomendados");
  const [selectedKey, setSelectedKey] = useState<string>(shelter.projects?.find(p=>p.id===initialProjectId)?.key ?? (playerSurvivorId ? (shelter.projects?.[0]?.key ?? shelterProjectCatalog[0].key) : (recommendations[0]?.key ?? shelter.projects?.[0]?.key ?? shelterProjectCatalog[0].key)));
  const [planningKey, setPlanningKey] = useState<string | null>(null);
  const [planningSlotId, setPlanningSlotId] = useState<string | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incidentKind, setIncidentKind] = useState<ShelterIncidentKind>("Invasão");
  const [incidentImpact, setIncidentImpact] = useState(2);
  const [incidentCatastrophic, setIncidentCatastrophic] = useState(false);
  const [incidentTargets, setIncidentTargets] = useState<string[]>([]);

  const [removalTarget, setRemovalTarget] = useState<{ project: ShelterProject; day: number; hex: string; id: string } | null>(null);
  const [removalPending, setRemovalPending] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const removalLock = useRef(false);

  async function confirmRemoval() {
    if (playerPreview || !removalTarget || !masterActions?.canAct || masterActions.pending || removalLock.current) return;
    removalLock.current = true;
    setRemovalPending(true);
    setRemovalError("");
    try {
      await masterActions.send({ type: "remove-shelter-project", id: removalTarget.id, day: removalTarget.day,
        shelterHex: removalTarget.hex, projectId: removalTarget.project.id,
        expectedFingerprint: await removalFingerprint(removalTarget.project) });
      setRemovalTarget(null);
      setPlanningKey(null);
      setPlanningSlotId(null);
      setIncidentTargets(ids => ids.filter(id => id !== removalTarget.project.id));
      toast.success(removalTarget.project.state === "Planejado" ? "Solicitação cancelada" : "Construção removida");
    } catch (error) { setRemovalError(error instanceof Error ? error.message : "Não foi possível remover a construção."); }
    finally { removalLock.current = false; setRemovalPending(false); }
  }

  if (!shelter.hex) return null;

  const power = shelterPower(game, shelter);
  const activeProjects = (shelter.projects ?? []).filter(project => project.state !== "Concluído" || Boolean(project.workShift) || Boolean(project.volunteerShifts?.length));
  const completedProjects = (shelter.projects ?? []).filter(project => project.state === "Concluído");
  const selectedDefinition = projectDefinition(selectedKey) ?? shelterProjectCatalog[0];
  const selectedProject = projectFor(shelter, selectedDefinition.key);
  const selectedProgress = selectedProject ? projectProgress(selectedProject) : null;
  const selectedIntegrity = selectedProject ? projectIntegrity(selectedProject) : null;
  const selectedBenefits = projectMechanicalBenefits(selectedDefinition.key);
  const selectedOperationAvailable = Boolean(selectedProject && selectedDefinition.operationWork
    && ["Concluído", "Danificado"].includes(selectedProject.state) && projectIntegrity(selectedProject) >= 2);
  const selectedCanOperateWork = Boolean(selectedOperationAvailable && selectedProject && projectOperational(game, shelter, selectedProject));
  const selectedPreview = !playerSurvivorId && selectedProject && (selectedProject.state === "Em construção" || selectedCanOperateWork)
    ? projectWorkPreview(game, shelter, selectedProject) : null;
  const selectedRepairPlan = selectedProject && ["Danificado", "Inoperante", "Destruído"].includes(selectedProject.state)
    ? repairPlan(game, selectedProject) : null;
  const playerSurvivor = playerSurvivorId ? game.survivors.find(person => person.id === playerSurvivorId) : undefined;
  const playerJoined = Boolean(selectedProject && playerSurvivorId && (selectedProject.survivorWorkerIds ?? []).includes(playerSurvivorId));
  const playerShift = selectedProject && playerSurvivorId
    ? (selectedProject.volunteerShifts ?? []).find(shift => shift.survivorId === playerSurvivorId)
    : undefined;
  const playerWork = selectedProject && playerSurvivorId ? survivorWorkPreview(game, selectedProject, playerSurvivorId) : null;
  const playerCapabilities = playerSurvivor ? survivorShelterCapabilities(playerSurvivor) : [];
  const volunteerPlayers = selectedProject
    ? (selectedProject.survivorWorkerIds ?? []).map(id => game.survivors.find(person => person.id === id)).filter(Boolean)
    : [];
  const dependencyIssue = projectDependencyIssue(shelter, selectedDefinition.key);
  const placementIssue = selectedProject ? projectPlacementIssue(shelter, selectedProject) : null;
  const peopleAtBase = game.npcs.filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === shelter.hex);
  const workersBusy = new Set((shelter.projects ?? []).filter(project => project.state === "Em construção")
    .flatMap(project => [project.responsibleId, ...(project.helperIds ?? [])]).filter(Boolean));
  const availableWorkers = peopleAtBase.filter(npc => !workersBusy.has(npc.id)).length;
  const planningDefinition = planningKey ? projectDefinition(planningKey) : null;
  const planningSlot = planningSlotId ? shelterBlueprintSlots.find(slot => slot.id === planningSlotId) : null;
  const occupiedSlots = new globalThis.Map((shelter.projects ?? []).filter(project => project.slotId).map(project => [project.slotId!, project]));
  const unplacedFacilities = (shelter.projects ?? []).filter(project => projectDefinition(project.key)?.kind === "facility" && !project.slotId);
  const buildLog = game.log.filter(entry => entry.kind === "abrigo").slice(0, 12);
  const scheduledProjects = (shelter.projects ?? []).filter(project => Boolean(project.workShift) || Boolean(project.volunteerShifts?.length));
  const perimeterProjects = (shelter.projects ?? []).filter(project => projectDefinition(project.key)?.kind === "upgrade");
  const incidentCandidates = shelterIncidentCandidates(game, incidentKind);
  const incidentMitigation = shelterIncidentMitigation(game, incidentKind);
  const slotChoices = planningSlot
    ? shelterProjectCatalog.filter(definition => definition.kind === "facility" && definition.zone === planningSlot.zone
      && (!projectFor(shelter, definition.key) || !projectFor(shelter, definition.key)?.slotId))
    : [];

  const damagedProjects = (shelter.projects ?? []).filter(project => ["Danificado", "Inoperante", "Destruído"].includes(project.state));
  const idleProjects = (shelter.projects ?? []).filter(project => project.state === "Em construção"
    && !project.workShift && !(project.volunteerShifts ?? []).length);
  const waitingProjects = (shelter.projects ?? []).filter(project => ["Concluído", "Danificado"].includes(project.state)
    && !projectOperational(game, shelter, project) && !(shelter.disabledProjectKeys ?? []).includes(project.key));

  const catalog = filter === "Recomendados"
    ? (() => {
        const keys = new Set(recommendations.map(item => item.key));
        return shelterProjectCatalog.filter(definition => keys.has(definition.key));
      })()
    : shelterProjectCatalog.filter(definition => definition.category === filter);

  const constructionNext = damagedProjects[0]
    ? { kind: "project" as const, tone: "danger", icon: Wrench, title: `Reparar ${damagedProjects[0].name}`, detail: `Integridade ${projectIntegrity(damagedProjects[0])}/3 · ${projectIntegrityLabel(damagedProjects[0])}.`, project: damagedProjects[0], action: "Abrir reparo" }
    : power.balance < 0
      ? { kind: "power" as const, tone: "warning", icon: Zap, title: "Equilibrar a rede de energia", detail: `Produção ${power.production} · consumo ${power.consumption}. Desligue consumidores ou aumente a geração.`, action: "Revisar energia" }
      : unplacedFacilities[0]
        ? { kind: "placement" as const, tone: "action", icon: Plus, title: `Posicionar ${unplacedFacilities[0].name}`, detail: "A instalação existe, mas ainda não ocupa um espaço da planta.", project: unplacedFacilities[0], action: "Definir local" }
        : idleProjects[0]
          ? { kind: "project" as const, tone: "action", icon: Clock3, title: `Alocar trabalho em ${idleProjects[0].name}`, detail: "A obra está iniciada, mas não há turno programado.", project: idleProjects[0], action: "Abrir obra" }
          : waitingProjects[0]
            ? { kind: "project" as const, tone: "action", icon: Users, title: `Ativar ${waitingProjects[0].name}`, detail: projectDefinition(waitingProjects[0].key)?.requiresPower ? "A estrutura precisa de energia para operar." : "A estrutura precisa da equipe indicada para operar.", project: waitingProjects[0], action: "Revisar operação" }
            : recommendations[0]
              ? { kind: "recommendation" as const, tone: "stable", icon: Lightbulb, title: `Melhoria sugerida: ${projectDefinition(recommendations[0].key)?.name ?? recommendations[0].key}`, detail: recommendations[0].reason, key: recommendations[0].key, action: "Ver recomendação" }
              : { kind: "stable" as const, tone: "stable", icon: CheckCircle2, title: "Nenhuma ação estrutural urgente", detail: "Obras, integridade e energia estão estáveis. Inicie uma nova construção apenas quando a ficção pedir.", action: "Nova construção" };
  const ConstructionNextIcon = constructionNext.icon;

  function openConstructionNext() {
    if (constructionNext.kind === "project") {
      setSelectedKey(constructionNext.project.key);
      setPlanningKey(null);
      setPlanningSlotId(null);
      document.getElementById("construction-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (constructionNext.kind === "placement") {
      setSelectedKey(constructionNext.project.key);
      setPlanningKey(constructionNext.project.key);
      setPlanningSlotId(null);
      document.getElementById("construction-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (constructionNext.kind === "power") {
      document.getElementById("construction-power")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setFilter("Recomendados");
    setCatalogOpen(true);
    if (constructionNext.kind === "recommendation") setSelectedKey(constructionNext.key);
    document.getElementById("construction-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
    if (!project.responsibleId && !(project.helperIds ?? []).length && !(project.survivorWorkerIds ?? []).length) {
      toast.error("Defina a equipe primeiro", { description: "Escolha um PNJ ou aguarde um jogador se oferecer para trabalhar nesta obra." });
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
      issue = startRepair(draft, target);
      if (!issue) addLog(draft, "abrigo", `Reparo iniciado: ${target.name}.`);
    });
    if (issue) toast.error("Reparo não iniciado", { description: issue });
    else toast.success("Reparo iniciado.");
  }

  function scheduleShift(project: ShelterProject) {
    const outcome: { value: ReturnType<typeof scheduleShelterWorkShift> | null } = { value: null };
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) outcome.value = scheduleShelterWorkShift(draft, target, 4);
    });
    if (!outcome.value?.ok) toast.error("Turno não programado", { description: outcome.value?.message ?? "Verifique a equipe e o horário." });
    else toast.success("Turno programado", { description: outcome.value.message });
  }

  function cancelShift(project: ShelterProject) {
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) cancelShelterWorkShift(draft, target);
    });
    toast("Turno cancelado.");
  }

  function toggleIncidentTarget(id: string) {
    setIncidentTargets(current => current.includes(id) ? current.filter(entry => entry !== id) : [...current, id]);
  }

  function registerIncident() {
    const outcome: { value: ReturnType<typeof applyShelterIncident> | null } = { value: null };
    edit(draft => {
      outcome.value = applyShelterIncident(draft, {
        kind: incidentKind,
        impact: incidentImpact,
        targetProjectIds: incidentTargets,
        catastrophic: incidentCatastrophic,
      });
    });
    if (!outcome.value?.ok) {
      toast.error("Incidente não aplicado", { description: outcome.value?.message ?? "Revise o Impacto e os alvos." });
      return;
    }
    const damaged = outcome.value.damaged.map(row => `${row.name} ${row.integrity}/3`).join(" · ");
    toast.warning(`${incidentKind} registrado`, {
      description: `Impacto ${outcome.value.impact} · mitigado ${outcome.value.mitigation.amount}${damaged ? ` · ${damaged}` : " · sem dano estrutural"}${outcome.value.unassignedImpact ? ` · ${outcome.value.unassignedImpact} sem alvo` : ""}`,
    });
    setIncidentOpen(false);
    setIncidentTargets([]);
  }

  function joinAsPlayer(project: ShelterProject) {
    if (!playerSurvivorId) return;
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) issue = joinShelterProjectAsSurvivor(draft, target, playerSurvivorId);
    });
    if (issue) toast.error("Não foi possível entrar na equipe", { description: issue });
    else toast.success("Você entrou na equipe", { description: `Agora você pode trabalhar em ${project.name} quando a obra estiver iniciada.` });
  }

  function leaveAsPlayer(project: ShelterProject) {
    if (!playerSurvivorId) return;
    let issue: string | null = null;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) issue = leaveShelterProjectAsSurvivor(draft, target, playerSurvivorId);
    });
    if (issue) toast.error("Não foi possível sair da equipe", { description: issue });
    else toast("Você saiu da equipe da obra.");
  }

  function schedulePlayerShift(project: ShelterProject) {
    if (!playerSurvivorId) return;
    const outcome: { value: ReturnType<typeof scheduleSurvivorWorkShift> | null } = { value: null };
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) outcome.value = scheduleSurvivorWorkShift(draft, target, playerSurvivorId, 4);
    });
    if (!outcome.value?.ok) toast.error("Turno não programado", { description: outcome.value?.message ?? "Verifique sua posição e o horário." });
    else toast.success("Seu turno foi programado", { description: outcome.value.message });
  }

  function cancelPlayerShift(project: ShelterProject) {
    if (!playerSurvivorId) return;
    edit(draft => {
      const target = projectFor(draft.shelter, project.key);
      if (target) cancelSurvivorWorkShift(target, playerSurvivorId, draft);
    });
    toast("Seu turno foi cancelado.");
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

  function renderBlueprintSlot(slot: (typeof shelterBlueprintSlots)[number]) {
    const occupant = occupiedSlots.get(slot.id);
    const compatible = Boolean(planningDefinition && planningDefinition.zone === slot.zone && !occupant);
    const selectedSlot = planningSlotId === slot.id;
    const progress = occupant ? projectProgress(occupant) : null;
    return <button type="button" key={slot.id}
      disabled={Boolean(planningDefinition && (!compatible || occupant)) || Boolean(!occupant && playerPreview)}
      className={`architectural-slot is-${slot.zone} ${occupant ? "is-occupied" : "is-empty"} ${compatible ? "is-compatible" : ""} ${selectedSlot || occupant?.key === selectedKey ? "is-selected" : ""}`}
      onClick={() => {
        if (occupant && !planningDefinition) {
          setSelectedKey(occupant.key);
          setPlanningKey(null);
          setPlanningSlotId(null);
        } else if (planningDefinition && compatible) addProject(planningDefinition.key, slot.id);
        else if (!planningDefinition && !occupant) {
          setPlanningSlotId(slot.id);
          setPlanningKey(null);
        }
      }}>
      <span className="architectural-slot-number">{slot.label}</span>
      {occupant ? <>
        <b>{occupant.name}</b>
        <span className={`construction-state is-${projectStateTone(occupant)}`}>{projectStateLabel(occupant)}</span>
        {["Concluído", "Danificado", "Inoperante", "Destruído"].includes(occupant.state) && <small className="construction-integrity-mini">{integrityGlyph(occupant)} · {projectIntegrity(occupant)}/3</small>}
        {(occupant.workShift || occupant.volunteerShifts?.length) && <small><Clock3 size={12} /> até {displayTime(Math.min(
          ...(occupant.workShift ? [occupant.workShift.startMinute + occupant.workShift.durationMinutes] : []),
          ...(occupant.volunteerShifts ?? []).map(shift => shift.startMinute + shift.durationMinutes),
        ))}</small>}
        {occupant.state === "Em construção" && progress && <span className="architectural-progress"><i style={{ width: `${Math.min(100, progress.value / progress.required * 100)}%` }} /></span>}
      </> : <>
        <Plus size={17} />
        <b>{planningDefinition && compatible ? "Construir aqui" : selectedSlot ? "Espaço selecionado" : "Espaço livre"}</b>
        <small>{slot.zone === "interior" ? "Cômodo interno" : slot.zone === "utility" ? "Área técnica" : "Área externa"}</small>
      </>}
    </button>;
  }

  return <div className="construction-console"><RuleHelp topic="shelter"/>
    <section className="construction-summary">
      <div className="construction-summary-stat"><Hammer size={18} /><span><small>Em andamento</small><b>{activeProjects.length}</b></span></div>
      <div className="construction-summary-stat"><Clock3 size={18} /><span><small>Turnos agendados</small><b>{scheduledProjects.length}</b></span></div>
      <div className="construction-summary-stat"><CheckCircle2 size={18} /><span><small>Concluídas</small><b>{completedProjects.length}</b></span></div>
      <div className="construction-summary-stat"><Wrench size={18} /><span><small>Peças</small><b>{shelter.parts}</b></span></div>
      <div className="construction-summary-stat"><Users size={18} /><span><small>Equipe livre</small><b>{availableWorkers}/{peopleAtBase.length}</b></span></div>
      <div className={`construction-summary-stat ${power.balance < 0 ? "is-warning" : ""}`}><Zap size={18} /><span><small>Energia</small><b>{power.production} / {power.consumption}</b></span></div>
    </section>

    {!playerPreview && <section className={`construction-next-action is-${constructionNext.tone}`}>
      <div><ConstructionNextIcon size={18} /><span><small>PRÓXIMA AÇÃO</small><b>{constructionNext.title}</b><p>{constructionNext.detail}</p></span></div>
      <Button size="sm" variant={constructionNext.tone === "danger" || constructionNext.tone === "warning" ? "default" : "outline"} onClick={openConstructionNext}>{constructionNext.action}<ChevronRight size={15} /></Button>
    </section>}

    {!playerPreview && <section className="construction-incident-launch">
      <div><AlertTriangle size={17} /><span><b>Danos e incidentes</b><small>Registre invasões, acidentes e outros eventos que possam danificar estruturas.</small></span></div>
      <Button size="sm" variant="outline" onClick={() => setIncidentOpen(value => !value)}>{incidentOpen ? "Fechar" : "Registrar incidente"}</Button>
    </section>}

    {incidentOpen && !playerPreview && <section className="construction-incident-panel">
      <div className="construction-section-heading">
        <div><p className="dossier-title">Incidente estrutural</p><h3 className="section-title">Impacto, mitigação e alvos</h3></div>
        <span className="tag">Mitigação {incidentMitigation.amount}</span>
      </div>
      <div className="construction-incident-controls">
        <Pick label="Tipo" value={incidentKind} options={incidentKinds.map(value => ({ value, label: value }))}
          onChange={value => { setIncidentKind(value as ShelterIncidentKind); setIncidentTargets([]); }} />
        <Counter compact editable label="Impacto" value={incidentImpact} min={1} max={9} onChange={setIncidentImpact} />
        <label className="construction-incident-catastrophic"><input type="checkbox" checked={incidentCatastrophic}
          onChange={event => setIncidentCatastrophic(event.target.checked)} /><span><b>Catastrófico</b><small>Permite concentrar até 2 danos na mesma estrutura.</small></span></label>
      </div>
      <div className="construction-incident-preview">
        <span>Impacto bruto <b>{incidentImpact}</b></span>
        <span>Mitigação <b>−{incidentMitigation.amount}</b></span>
        <span>Impacto restante <b>{Math.max(0, incidentImpact - incidentMitigation.amount)}</b></span>
      </div>
      {incidentMitigation.sources.length > 0 && <p className="construction-team-help">Proteções aplicadas: {incidentMitigation.sources.join(" · ")}.</p>}
      <div className="construction-incident-targets">
        <span>Estruturas elegíveis</span>
        {incidentCandidates.length
          ? incidentCandidates.map(project => <label key={project.id} className={incidentTargets.includes(project.id) ? "is-selected" : ""}>
              <input type="checkbox" checked={incidentTargets.includes(project.id)} onChange={() => toggleIncidentTarget(project.id)} />
              <span><b>{project.name}</b><small>Integridade {projectIntegrity(project)}/3 · {projectIntegrityLabel(project)}</small></span>
            </label>)
          : <p>Nenhuma estrutura atual é um alvo compatível com este incidente.</p>}
      </div>
      <div className="construction-incident-actions">
        <p>{Math.max(0, incidentImpact - incidentMitigation.amount) === 0
          ? "As defesas atuais absorvem todo o Impacto."
          : incidentCatastrophic
            ? "Cada alvo pode receber até 2 danos."
            : "Dano comum é distribuído: no máximo 1 por estrutura selecionada."}</p>
        <Button disabled={Math.max(0, incidentImpact - incidentMitigation.amount) > 0 && incidentTargets.length === 0} onClick={registerIncident}>
          <AlertTriangle size={15} /> Aplicar incidente
        </Button>
      </div>
    </section>}

    {power.balance < 0 && <div className="construction-alert"><AlertTriangle size={17} /><div><b>Energia insuficiente</b><span>Produção {power.production} · consumo {power.consumption}. Desligue consumidores menos prioritários até o saldo voltar a zero.</span></div></div>}

    {(power.consumers.length > 0 || power.disabled.length > 0) && <section id="construction-power" className="construction-power-manager">
      <div><Zap size={16} /><span><b>Prioridade de energia</b><small>Produção {power.production} · consumo {power.consumption} · saldo {power.balance >= 0 ? "+" : ""}{power.balance}</small></span></div>
      <div>{[...new Set([...power.consumers, ...power.disabled])].map(key => {
        const project = projectFor(shelter, key);
        const off = (shelter.disabledProjectKeys ?? []).includes(key);
        return <button type="button" key={key} disabled={playerPreview} className={off ? "is-off" : ""} onClick={() => togglePower(key)}>
          <span>{project?.name ?? key}</span><b>{off ? "Desligado" : "Ligado"}</b>
        </button>;
      })}</div>
    </section>}

    {unplacedFacilities.length > 0 && <section className="construction-unplaced-alert">
      <div><AlertTriangle size={18} /><span><b>{unplacedFacilities.length} instalação(ões) sem local definido</b><small>Essas estruturas existem na campanha, mas ainda precisam ser associadas a um espaço da planta.</small></span></div>
      <div>{unplacedFacilities.map(project => <button type="button" key={project.id} onClick={() => { setSelectedKey(project.key); setPlanningKey(project.key); setPlanningSlotId(null); }}>
        <span>{project.name}</span><b>Definir local</b>
      </button>)}</div>
    </section>}

    <section className="construction-active-section">
      <div className="construction-section-heading">
        <div><p className="dossier-title">Agora</p><h3 className="section-title">Projetos ativos</h3></div>
        <span className="tag">Dia {game.day} · {displayTime(game.minutes)}</span>
      </div>
      {activeProjects.length === 0
        ? <div className="construction-empty"><Hammer size={20} /><span>Nenhuma obra, dano ou reparo pendente. Use Nova construção quando quiser ampliar o abrigo.</span></div>
        : <div className="construction-active-grid">{activeProjects.map(project => {
          const progress = projectProgress(project);
          const operation = projectDefinition(project.key)?.operationWork;
          const operationActive = Boolean(operation && ["Concluído", "Danificado"].includes(project.state)
            && (project.workShift?.purpose === "operation" || project.volunteerShifts?.some(shift => shift.purpose === "operation")));
          const damagePending = ["Danificado", "Inoperante", "Destruído"].includes(project.state);
          const preview = project.state === "Em construção" ? projectWorkPreview(game, shelter, project) : null;
          return <button type="button" key={project.id} className={`construction-active-card ${selectedKey === project.key ? "is-selected" : ""}`} onClick={() => setSelectedKey(project.key)}>
            <div className="construction-active-top"><span className={`construction-state is-${projectStateTone(project)}`}>{projectStateLabel(project)}</span><ChevronRight size={16} /></div>
            <b>{project.name}</b>
            {damagePending ? <div className="construction-integrity-card"><span>{integrityGlyph(project)}</span><b>{projectIntegrity(project)}/3</b></div>
              : operationActive && operation ? <>
                <div className="construction-mini-progress"><span style={{ width: `${Math.min(100, (project.operationProgress ?? 0) / operation.requiredProgress * 100)}%` }} /></div>
                <small>{project.operationProgress ?? 0}/{operation.requiredProgress} · {operation.label}</small>
              </> : <>
                <div className="construction-mini-progress"><span style={{ width: `${Math.min(100, progress.value / progress.required * 100)}%` }} /></div>
                <small>{progress.value}/{progress.required} progresso{progress.repairing ? " de reparo" : ""}</small>
              </>}
            <small>{project.workShift
              ? `⏱ Equipe PNJ até ${displayTime(project.workShift.startMinute + project.workShift.durationMinutes)} · +${project.workShift.points} previsto`
              : project.volunteerShifts?.length
                ? `⏱ ${project.volunteerShifts.length} turno(s) de jogador · próximo até ${displayTime(Math.min(...project.volunteerShifts.map(shift => shift.startMinute + shift.durationMinutes)))}`
                : preview?.issue ? `⏸ ${preview.issue}`
                : preview ? `Pronto para agendar: +${preview.points} em 4h`
                : damagePending ? `${projectIntegrityLabel(project)} · reparo pendente`
                : projectPlacementIssue(shelter, project) ?? "Aguardando início"}</small>
          </button>;
        })}</div>}
    </section>

    <div id="construction-workspace" className="construction-workspace">
      <section className="construction-blueprint-panel construction-blueprint-architectural">
        <div className="construction-section-heading architectural-plan-heading">
          <div>
            <p className="dossier-title">Planta do abrigo</p>
            <h3 className="section-title">
              {planningDefinition
                ? `Escolha onde posicionar ${planningDefinition.name}`
                : planningSlot
                  ? `Escolha uma instalação para ${planningSlot.label}`
                  : shelter.name}
            </h3>
          </div>
          <div className="architectural-plan-actions">
            {!playerPreview && <Button size="sm" onClick={() => setCatalogOpen(value => !value)}><Plus size={15} /> Nova construção</Button>}
            {(planningDefinition || planningSlot) && <Button size="sm" variant="outline" onClick={() => { setPlanningKey(null); setPlanningSlotId(null); }}>Cancelar</Button>}
          </div>
        </div>

        <div className="architectural-site">
          <div className="architectural-perimeter">
            <div className="architectural-zone-label"><ShieldCheck size={14} /> Melhorias / perímetro</div>
            <div className="architectural-perimeter-items">
              {perimeterProjects.length ? perimeterProjects.map(project => <button type="button" key={project.id}
                className={project.key === selectedKey ? "is-selected" : ""}
                onClick={() => { setSelectedKey(project.key); setPlanningKey(null); setPlanningSlotId(null); }}>
                <span className={`construction-state is-${projectStateTone(project)}`}>{projectStateLabel(project)}</span>
                <b>{project.name}</b>
              </button>) : <span className="architectural-empty-note">Nenhuma melhoria de perímetro instalada.</span>}
            </div>
          </div>

          <div className="architectural-building-shell">
            <div className="architectural-building-caption"><span>Bloco principal</span><small>interior do abrigo</small></div>
            <div className="architectural-building-plan">
              <div className="architectural-room architectural-room-a">{renderBlueprintSlot(shelterBlueprintSlots.find(slot => slot.id === "room-a")!)}</div>
              <div className="architectural-room architectural-room-b">{renderBlueprintSlot(shelterBlueprintSlots.find(slot => slot.id === "room-b")!)}</div>
              <div className="architectural-corridor">
                <span>CORREDOR</span>
                <i /><i /><i />
              </div>
              <div className="architectural-room architectural-room-c">{renderBlueprintSlot(shelterBlueprintSlots.find(slot => slot.id === "room-c")!)}</div>
              <div className="architectural-room architectural-room-d">{renderBlueprintSlot(shelterBlueprintSlots.find(slot => slot.id === "room-d")!)}</div>
              <div className="architectural-room architectural-room-e">{renderBlueprintSlot(shelterBlueprintSlots.find(slot => slot.id === "room-e")!)}</div>
              <div className="architectural-room architectural-room-f">{renderBlueprintSlot(shelterBlueprintSlots.find(slot => slot.id === "room-f")!)}</div>
            </div>

            <div className="architectural-service-band">
              <div className="architectural-zone-label"><Wrench size={14} /> Área técnica</div>
              <div className="architectural-service-grid">
                {shelterBlueprintSlots.filter(slot => slot.zone === "utility").map(renderBlueprintSlot)}
              </div>
            </div>
          </div>

          <div className="architectural-yard">
            <div className="architectural-zone-label"><span>↳</span> Pátio / área externa</div>
            <div className="architectural-yard-grid">
              {shelterBlueprintSlots.filter(slot => slot.zone === "exterior").map(renderBlueprintSlot)}
            </div>
          </div>
        </div>

        {planningSlot && !planningDefinition && <div className="construction-slot-picker">
          <div><b>Construir em {planningSlot.label}</b><small>Mostrando apenas instalações compatíveis com esta área.</small></div>
          <div>{slotChoices.length
            ? slotChoices.map(definition => <button type="button" key={definition.key} onClick={() => { setSelectedKey(definition.key); addProject(definition.key, planningSlot.id); }}>
                <span><b>{definition.name}</b><small>{definition.effects.map(item => item.label).join(" · ")}</small></span>
                <ChevronRight size={15} />
              </button>)
            : <p>Nenhuma instalação disponível para este espaço.</p>}</div>
        </div>}

        <div className="shelter-blueprint-legend architectural-legend">
          <span><i className="is-operational" /> Concluída</span>
          <span><i className="is-building" /> Em obra</span>
          <span><i className="is-damaged" /> Danificada</span>
          <span><i className="is-available" /> Espaço livre</span>
        </div>
      </section>

      <aside className="construction-detail-panel">
        <header>
          <div><p className="dossier-title">{selectedDefinition.category}</p><h3>{selectedDefinition.name}</h3></div>
          <span className={`construction-state is-${projectStateTone(selectedProject)}`}>{projectStateLabel(selectedProject)}</span>
        </header>

        <div className="construction-detail-scroll">
          <div className="construction-flow-steps" aria-label="Etapas da construção">
            <span className={selectedDefinition.kind !== "facility" || selectedProject?.slotId ? "is-done" : "is-current"}><i>1</i><b>{selectedDefinition.kind === "facility" ? "Local" : "Plano"}</b></span>
            <span className={selectedProject && (selectedProject.responsibleId || (selectedProject.helperIds ?? []).length || (selectedProject.survivorWorkerIds ?? []).length) ? "is-done" : selectedProject ? "is-current" : ""}><i>2</i><b>Equipe</b></span>
            <span className={selectedProject && selectedProject.state !== "Planejado" ? "is-done" : selectedProject ? "is-current" : ""}><i>3</i><b>Iniciar</b></span>
            <span className={selectedProject?.workShift ? "is-current" : selectedProject?.state === "Concluído" ? "is-done" : ""}><i>4</i><b>Trabalho</b></span>
          </div>

          <dl className="construction-detail-facts">
            <div><dt>Tipo</dt><dd>{selectedDefinition.kind === "facility" ? "Instalação física · ocupa espaço na planta" : "Melhoria · não ocupa sala"}</dd></div>
            <div><dt>Custo</dt><dd>{projectDisplayCosts(selectedDefinition.costs)}</dd></div>
            <div><dt>Trabalho</dt><dd>{selectedDefinition.requiredProgress} progresso</dd></div>
            {selectedDefinition.kind === "facility" && <div><dt>Local</dt><dd>{projectLocation(selectedProject)}</dd></div>}
            <div><dt>Construção</dt><dd>{selectedDefinition.buildCapabilities?.length ? selectedDefinition.buildCapabilities.join(" + ") : "Sem especialidade obrigatória"}</dd></div>
            <div><dt>Operação</dt><dd>{selectedDefinition.operationMode === "staffed"
              ? selectedDefinition.requiredCapabilities?.join(" + ") || "Equipe"
              : selectedDefinition.requiresPower ? "Automática com energia" : "Passiva"}</dd></div>
          </dl>

          <div className="construction-effect-box"><span>Efeito estrutural</span><p>{selectedDefinition.effects.map(item => item.label).join(" · ")}</p></div>
          {selectedBenefits.length > 0 && <div className="construction-benefit-box">
            <span>Benefícios mecânicos</span>
            <ul>{selectedBenefits.map(benefit => <li key={benefit}>{benefit}</li>)}</ul>
          </div>}

          {selectedProject && !["Planejado"].includes(selectedProject.state) && <div className={`construction-integrity-panel is-${projectStateTone(selectedProject)}`}>
            <div><span>Integridade</span><strong>{integrityGlyph(selectedProject)}</strong></div>
            <div><b>{selectedIntegrity}/3 · {projectIntegrityLabel(selectedProject)}</b>
              <small>{selectedIntegrity === 3 ? "Estrutura íntegra."
                : selectedIntegrity === 2 ? "Continua funcional, mas está vulnerável a novo dano."
                : selectedIntegrity === 1 ? "Inoperante: benefícios suspensos até o reparo."
                : "Destruída: exige restauração antes de voltar a funcionar."}</small></div>
          </div>}

          {selectedRepairPlan && <div className="construction-repair-plan">
            <Wrench size={17} />
            <span><b>{selectedRepairPlan.label}</b><small>{projectDisplayCosts(selectedRepairPlan.costs)} · {selectedRepairPlan.requiredProgress} trabalho
              {selectedRepairPlan.workshopDiscount ? " · Oficina aplicará desconto de 1 Peça" : ""}</small></span>
          </div>}

          {selectedDefinition.operationWork && selectedProject && ["Concluído", "Danificado"].includes(selectedProject.state) && <div className="construction-operation-progress">
            <div><span>{selectedDefinition.operationWork.label}</span><b>{selectedProject.operationProgress ?? 0}/{selectedDefinition.operationWork.requiredProgress}</b></div>
            <div className="construction-mini-progress"><span style={{ width: `${Math.min(100, (selectedProject.operationProgress ?? 0) / selectedDefinition.operationWork.requiredProgress * 100)}%` }} /></div>
            <small>Ao completar o ciclo: {Object.entries(selectedDefinition.operationWork.output).map(([key, value]) => `${value} ${key === "food" ? "Comida" : key === "water" ? "Água" : "Peças"}`).join(" · ")}.</small>
          </div>}

          {dependencyIssue && !selectedProject && <div className="construction-inline-warning"><AlertTriangle size={15} /> {dependencyIssue}</div>}
          {selectedProject && placementIssue && <div className="construction-inline-warning"><AlertTriangle size={15} /><span><b>Local ainda não definido.</b> {placementIssue}</span></div>}

          {selectedProject && ["Planejado", "Em construção"].includes(selectedProject.state) && <div className="construction-project-progress">
            <div><span>{selectedProgress?.repairing ? "Reparo" : "Progresso"}</span><b>{selectedProgress?.value}/{selectedProgress?.required}</b></div>
            <div className="construction-mini-progress"><span style={{ width: `${Math.min(100, (selectedProgress?.value ?? 0) / Math.max(1, selectedProgress?.required ?? 1) * 100)}%` }} /></div>
            {selectedProject.workShift
              ? <div className="construction-shift-status">
                  <Clock3 size={16} />
                  <span><b>Turno em andamento</b><small>{displayTime(selectedProject.workShift.startMinute)} → {displayTime(selectedProject.workShift.startMinute + selectedProject.workShift.durationMinutes)} · +{selectedProject.workShift.points} previsto</small>
                    <small>Você pode sair desta tela. Viagens, buscas e qualquer avanço do relógio concluem o turno automaticamente quando o horário final for alcançado.</small></span>
                </div>
              : selectedPreview && <small className={selectedPreview.issue || selectedPreview.missingCapabilities.length ? "is-warning" : ""}>{selectedPreview.issue
                ?? `Próximo turno de 4h: +${selectedPreview.points} com ${selectedPreview.workers.map(worker => worker.name).join(", ")}${selectedPreview.missingCapabilities.length ? ` · sem especialista em ${selectedPreview.missingCapabilities.join(" + ")}` : ""}`}</small>}
          </div>}

          {selectedProject && playerSurvivorId && playerSurvivor && <section className="construction-player-work">
            <div className="construction-player-work-head">
              <Users size={17} />
              <span><b>Seu trabalho no abrigo</b><small>{playerSurvivor.name}</small></span>
              <span className={`construction-state ${playerShift ? "is-building" : playerJoined ? "is-planned" : "is-available"}`}>
                {playerShift ? "Em turno" : playerJoined ? "Na equipe" : "Disponível"}
              </span>
            </div>

            <p>{playerCapabilities.length
              ? `Experiências relacionadas: ${playerCapabilities.join(", ")}.`
              : "Seu personagem pode ajudar mesmo sem experiência específica; uma experiência relacionada concede +1 progresso ao turno."}</p>

            {playerShift ? <div className="construction-player-shift">
              <Clock3 size={16} />
              <span><b>{displayTime(playerShift.startMinute)} → {displayTime(playerShift.startMinute + playerShift.durationMinutes)}</b>
                <small>+{playerShift.points} progresso previsto. Enquanto este turno estiver ativo, seu personagem não pode viajar para outro hex.</small></span>
              <Button size="sm" variant="outline" onClick={() => cancelPlayerShift(selectedProject)}>Cancelar meu turno</Button>
            </div> : <>
              {playerJoined && selectedProject.state === "Planejado" && <p className="construction-next-step">Você se ofereceu para esta obra. O mestre ainda precisa iniciar a construção.</p>}
              {playerJoined && (selectedProject.state === "Em construção" || selectedCanOperateWork) && <div className="construction-player-preview">
                <span><b>{selectedCanOperateWork ? `${selectedDefinition.operationWork?.label ?? "Operação"} · 4h` : "Turno de 4h"}</b><small>{playerWork?.issue ?? `+${playerWork?.points ?? 1} progresso previsto${playerWork?.matches?.length ? ` · bônus por ${playerWork.matches.join(" + ")}` : ""}`}</small></span>
                <Button size="sm" disabled={Boolean(playerWork?.issue)} onClick={() => schedulePlayerShift(selectedProject)}><Clock3 size={14} /> Trabalhar 4h</Button>
              </div>}
              {!playerJoined && (["Planejado", "Em construção"].includes(selectedProject.state) || selectedOperationAvailable) && <Button size="sm" onClick={() => joinAsPlayer(selectedProject)}>
                <Users size={14} /> Quero ajudar nesta obra
              </Button>}
              {playerJoined && <Button size="sm" variant="ghost" onClick={() => leaveAsPlayer(selectedProject)}>Sair da equipe</Button>}
            </>}
          </section>}

          {selectedProject && !playerPreview && !selectedProject.workShift && <div className="construction-team">
            <b>{["Concluído", "Danificado"].includes(selectedProject.state) ? "Equipe de operação" : "2 · Defina a equipe"}</b>
            <p className="construction-team-help">{["Concluído", "Danificado"].includes(selectedProject.state)
              ? "A operação usa as capacidades indicadas acima."
              : "PNJs são coordenados pelo mestre. Jogadores podem se oferecer diretamente pela própria interface e cumprem turnos individuais."}</p>
            <Pick label="Responsável PNJ" value={selectedProject.responsibleId ?? ""} options={[
              { value: "", label: "Sem responsável" },
              ...peopleAtBase.filter(npc => canVolunteer(npc, true)).map(npc => ({ value: npc.id, label: `${npc.name} · ${npc.skills.join(", ") || "sem capacidade"}` })),
            ]} onChange={id => setProjectResponsible(selectedProject, id)} />
            {peopleAtBase.length > 0 && <div className="construction-helper-list">{peopleAtBase.filter(npc => npc.id !== selectedProject.responsibleId).map(npc =>
              <label key={npc.id}><input type="checkbox" checked={(selectedProject.helperIds ?? []).includes(npc.id)} onChange={event => toggleProjectHelper(selectedProject, npc.id, event.target.checked)} /><span>{npc.name}<small>{npc.skills.join(", ") || "sem capacidade"}</small></span></label>)}</div>}
            {volunteerPlayers.length > 0 && <div className="construction-player-volunteers">
              <span>Jogadores voluntários</span>
              {volunteerPlayers.map(person => person && <div key={person.id}>
                <b>{person.name}</b>
                <small>{survivorShelterCapabilities(person).join(", ") || "sem experiência relacionada"}</small>
                {(selectedProject.volunteerShifts ?? []).some(shift => shift.survivorId === person.id) && <em>turno ativo</em>}
              </div>)}
            </div>}
          </div>}

          {selectedProject?.workShift && !playerPreview && <div className="construction-team-locked">
            <Clock3 size={16} /><span><b>Equipe ocupada até {displayTime(selectedProject.workShift.startMinute + selectedProject.workShift.durationMinutes)}</b><small>Cancele o turno antes de trocar responsáveis ou ajudantes.</small></span>
          </div>}

          {selectedProject && ["Concluído", "Danificado"].includes(selectedProject.state) && selectedDefinition.requiresPower && <div className="construction-power-toggle">
            <div><BatteryCharging size={17} /><span><b>Rede de energia</b><small>{(shelter.disabledProjectKeys ?? []).includes(selectedProject.key) ? "Desligado manualmente" : projectOperational(game, shelter, selectedProject) ? "Ligado" : "Sem energia suficiente"}</small></span></div>
            {!playerPreview && <Button size="sm" variant="outline" onClick={() => togglePower(selectedProject.key)}>{(shelter.disabledProjectKeys ?? []).includes(selectedProject.key) ? <><Play size={14} /> Ligar</> : <><PauseCircle size={14} /> Desligar</>}</Button>}
          </div>}

          {!playerPreview && <div className="construction-detail-actions">
            {selectedProject && <Button variant="outline" disabled={!masterActions?.canAct || masterActions.pending || removalPending}
              onClick={() => { setRemovalError(""); setRemovalTarget({ project: structuredClone(selectedProject), day: game.day, hex: shelter.hex!, id: createId() }); }}>
              <Trash2 size={15} /> {projectRemovalLabel(selectedProject)}
            </Button>}
            {!selectedProject && selectedDefinition.kind === "facility" && <Button disabled={Boolean(dependencyIssue)} onClick={() => { setPlanningKey(selectedDefinition.key); setPlanningSlotId(null); }}>
              <Plus size={15} /> 1 · Escolher local na planta
            </Button>}
            {!selectedProject && selectedDefinition.kind === "upgrade" && <Button disabled={Boolean(dependencyIssue)} onClick={() => addProject(selectedDefinition.key)}>
              <Plus size={15} /> Planejar melhoria
            </Button>}

            {selectedProject && selectedDefinition.kind === "facility" && !selectedProject.slotId && <Button onClick={() => { setPlanningKey(selectedProject.key); setPlanningSlotId(null); }}>
              <Plus size={15} /> 1 · Definir local na planta
            </Button>}

            {selectedProject?.state === "Planejado" && (!selectedProject.responsibleId && !(selectedProject.helperIds ?? []).length && !(selectedProject.survivorWorkerIds ?? []).length)
              && <p className="construction-next-step">Próximo passo: escolha um PNJ ou aguarde um jogador se oferecer para a equipe.</p>}

            {selectedProject?.state === "Planejado" && !placementIssue && Boolean(selectedProject.responsibleId || (selectedProject.helperIds ?? []).length || (selectedProject.survivorWorkerIds ?? []).length)
              && <Button onClick={() => begin(selectedProject)}><Hammer size={15} /> 3 · Iniciar obra e pagar custos</Button>}

            {selectedProject && (selectedProject.state === "Em construção" || selectedCanOperateWork) && !selectedProject.workShift
              && <Button onClick={() => scheduleShift(selectedProject)}><Clock3 size={15} /> {selectedCanOperateWork ? `Trabalhar 4h · ${selectedDefinition.operationWork?.label ?? "Operação"}` : "4 · Programar turno de 4h"}</Button>}

            {selectedProject?.workShift && <Button variant="outline" onClick={() => cancelShift(selectedProject)}><PauseCircle size={15} /> Cancelar turno</Button>}

            {selectedProject && ["Danificado", "Inoperante", "Destruído"].includes(selectedProject.state) && <Button onClick={() => repair(selectedProject)}><Wrench size={15} /> {selectedProject.state === "Destruído" ? "Iniciar restauração" : "Iniciar reparo"}</Button>}

            {selectedProject && ["Concluído", "Danificado", "Inoperante"].includes(selectedProject.state) && <Button variant="outline" onClick={() => edit(draft => {
              const target = projectFor(draft.shelter, selectedProject.key);
              if (target && markProjectDamaged(target)) addLog(draft, "abrigo", `${target.name} sofreu 1 dano estrutural e ficou com Integridade ${projectIntegrity(target)}/3.`);
            })}><AlertTriangle size={15} /> Aplicar 1 dano</Button>}
          </div>}
        </div>
      </aside>
    </div>

    {!playerPreview && <Dialog open={Boolean(removalTarget)} onOpenChange={open => { if (!open && !removalLock.current) setRemovalTarget(null); }}>
      <DialogContent><DialogHeader><DialogTitle>{removalTarget ? projectRemovalLabel(removalTarget.project) : "Remover construção"}?</DialogTitle>
        <DialogDescription>{removalTarget?.project.name}. {removalTarget?.project.slotId ? `${projectLocation(removalTarget.project)} ficará disponível para outra construção.` : "A melhoria será removida do abrigo."}</DialogDescription>
      </DialogHeader>
      <p className="text-sm">Os turnos serão cancelados e a equipe ficará livre. Os benefícios desta construção deixarão de valer; estruturas dependentes podem parar de funcionar.</p>
      <p className="text-sm subtle">{removalTarget?.project.state === "Planejado" && !removalTarget.project.costsPaid ? "Nenhum custo de construção foi pago." : "Materiais já gastos na obra ou no reparo não serão devolvidos."} Esta remoção não pode ser desfeita.</p>
      {removalError && <p role="alert" className="text-sm text-destructive">{removalError}</p>}
      <DialogFooter><Button variant="outline" disabled={removalPending} onClick={() => { if (!removalLock.current) setRemovalTarget(null); }}>Manter construção</Button>
        <Button variant="destructive" disabled={!masterActions?.canAct || masterActions.pending || removalPending} onClick={confirmRemoval}>{removalPending ? "Removendo…" : removalTarget ? projectRemovalLabel(removalTarget.project) : "Remover"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>}

    {catalogOpen && !playerPreview && <div className="construction-catalog-overlay">
      <button type="button" className="construction-catalog-backdrop" aria-label="Fechar catálogo" onClick={() => setCatalogOpen(false)} />
      <section className="construction-catalog construction-catalog-drawer" role="dialog" aria-modal="true" aria-label="Nova construção">
      <div className="construction-section-heading">
        <div><p className="dossier-title">Nova construção</p><h3 className="section-title">Escolha o que deseja adicionar ao abrigo</h3></div>
        <Button size="sm" variant="outline" onClick={() => setCatalogOpen(false)}>Fechar</Button>
      </div>

      {recommendations.length > 0 && <div className="construction-catalog-recommendations">
        <span><Lightbulb size={14} /> Sugestões</span>
        {recommendations.map(item => <button type="button" key={item.key} onClick={() => { const definition = projectDefinition(item.key); setSelectedKey(item.key); setFilter("Recomendados"); if (definition?.kind === "facility" && !projectFor(shelter, item.key)?.slotId) { setPlanningKey(item.key); setPlanningSlotId(null); } setCatalogOpen(false); }}>
          {projectDefinition(item.key)?.name}
        </button>)}
      </div>}

      <div className="construction-filter-row">{filters.map(value => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{value}</button>)}</div>
      {catalog.length === 0
        ? <div className="construction-empty"><Lightbulb size={18} /><span>Nenhuma recomendação urgente. Escolha outra categoria.</span></div>
        : <div className="construction-catalog-grid">{catalog.map(definition => {
          const project = projectFor(shelter, definition.key);
          const locked = !project && Boolean(projectDependencyIssue(shelter, definition.key));
          return <button type="button" key={definition.key}
            className={`construction-catalog-card ${selectedKey === definition.key ? "is-selected" : ""}`}
            onClick={() => {
              setSelectedKey(definition.key);
              if (definition.kind === "facility" && !project?.slotId) {
                setPlanningKey(definition.key);
                setPlanningSlotId(null);
              }
              setCatalogOpen(false);
            }}>
            <div><b>{definition.name}</b><span className={`construction-state is-${projectStateTone(project)}`}>{projectStateLabel(project)}</span></div>
            <p>{definition.effects.map(item => item.label).join(" · ")}</p>
            <small>{definition.kind === "facility" ? "Instalação física" : "Melhoria do abrigo"} · {projectDisplayCosts(definition.costs)} · {definition.requiredProgress} trabalho</small>
            {locked && <small className="is-warning">Dependência pendente</small>}
          </button>;
        })}</div>}
</section>
    </div>}

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
