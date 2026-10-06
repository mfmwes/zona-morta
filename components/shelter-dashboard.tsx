"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Cross,
  Droplets,
  HeartHandshake,
  Hammer,
  Package,
  Shield,
  Users,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";
import { provisionBreakdown } from "@/lib/provision-items";
import { Button } from "@/components/ui/button";
import { displayTime, shelterPopulationBreakdown, type GameState, type ShelterProject } from "@/lib/game";
import {
  projectDefinition,
  projectDisplayCosts,
  projectIntegrity,
  projectIntegrityLabel,
  projectMechanicalBenefits,
  projectOperational,
  projectProgress,
  shelterBlueprintSlots,
  shelterMetrics,
  shelterOvercrowded,
  shelterRecommendations,
} from "@/lib/shelter-projects";

type Icon = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

function projectIcon(project?: ShelterProject): Icon {
  const category = project?.category;
  if (category === "Segurança") return Shield;
  if (category === "Saúde") return Cross;
  if (category === "Energia e infraestrutura") return Zap;
  if (category === "Sobrevivência") return Droplets;
  if (category === "Produção e manutenção") return Wrench;
  if (category === "Comunicação") return Package;
  return Users;
}

function projectState(game: GameState, project?: ShelterProject) {
  if (!project) return { label: "Livre", tone: "available" };
  if (project.state === "Destruído") return { label: "Destruída", tone: "damaged" };
  if (project.state === "Inoperante") return { label: "Inoperante", tone: "damaged" };
  if (project.state === "Danificado" || project.state === "Concluído") {
    const definition = projectDefinition(project.key);
    if ((game.shelter.disabledProjectKeys ?? []).includes(project.key)) return { label: "Desligado", tone: "waiting" };
    if (projectOperational(game, game.shelter, project)) return { label: project.state === "Danificado" ? "Danificada · operacional" : "Operacional", tone: project.state === "Danificado" ? "damaged" : "operational" };
    if (definition?.requiresPower) return { label: "Sem energia", tone: "waiting" };
    return { label: "Sem operador", tone: "waiting" };
  }
  if (project.workShift || project.volunteerShifts?.length) {
    const ends = [
      ...(project.workShift ? [project.workShift.startMinute + project.workShift.durationMinutes] : []),
      ...(project.volunteerShifts ?? []).map(shift => shift.startMinute + shift.durationMinutes),
    ];
    return { label: `Trabalhando até ${displayTime(Math.min(...ends))}`, tone: "building" };
  }
  if (project.state === "Em construção") return { label: project.repairProgress !== undefined ? "Em reparo" : "Em construção", tone: "building" };
  if (project.state === "Danificado") return { label: "Danificado", tone: "damaged" };
  return { label: "Planejado", tone: "planned" };
}

export function ShelterVisualDashboard({ game, onNavigate }: { game: GameState; onNavigate?: (tab: string) => void }) {
  const shelter = game.shelter;
  const facilities = useMemo(() => (shelter.projects ?? []).filter(project => projectDefinition(project.key)?.kind === "facility"), [shelter.projects]);
  const upgrades = useMemo(() => (shelter.projects ?? []).filter(project => projectDefinition(project.key)?.kind === "upgrade"), [shelter.projects]);
  const first = facilities[0] ?? upgrades[0] ?? null;
  const [selectedKey, setSelectedKey] = useState(first?.key ?? "");
  const selectedProject = (shelter.projects ?? []).find(project => project.key === selectedKey) ?? first;
  const definition = selectedProject ? projectDefinition(selectedProject.key) : undefined;
  const selectedState = projectState(game, selectedProject);
  const SelectedIcon = projectIcon(selectedProject);
  const responsible = selectedProject?.responsibleId ? game.npcs.find(npc => npc.id === selectedProject.responsibleId) : undefined;
  const selectedProgress = selectedProject ? projectProgress(selectedProject) : null;
  const metrics = shelterMetrics(shelter, game);
  const population = shelterPopulationBreakdown(game);
  const present = game.publicShelterCommunity?.present ?? population.present;
  const overcrowded = game.publicShelterCommunity ? present > metrics.capacity : shelterOvercrowded(game, shelter);
  const food = provisionBreakdown(shelter, "food");
  const water = provisionBreakdown(shelter, "water");
  const occupied = new Map(facilities.filter(project => project.slotId).map(project => [project.slotId!, project]));
  const unplaced = facilities.filter(project => !project.slotId);
  const projects = shelter.projects ?? [];
  const damagedProjects = projects.filter(project => ["Danificado", "Inoperante", "Destruído"].includes(project.state));
  const idleWork = projects.filter(project => project.state === "Em construção" && !project.workShift && !(project.volunteerShifts ?? []).length);
  const waitingOperations = projects.filter(project => ["Concluído", "Danificado"].includes(project.state)
    && !projectOperational(game, shelter, project) && !(shelter.disabledProjectKeys ?? []).includes(project.key));
  const recommendations = shelterRecommendations(game, shelter);
  const lowFood = present > 0 && food.total < present;
  const lowWater = present > 0 && water.total < present;
  const powerDeficit = Boolean(metrics.power && metrics.power.balance < 0);

  const attention = [
    ...(damagedProjects.length ? [{ id: "damage", tone: "danger", icon: Wrench, title: `${damagedProjects.length} estrutura(s) danificada(s)`, detail: damagedProjects.slice(0, 2).map(project => project.name).join(" · "), tab: "construction", action: "Revisar reparos" }] : []),
    ...(powerDeficit ? [{ id: "power", tone: "warning", icon: Zap, title: "Energia insuficiente", detail: `${metrics.power!.production} produzida · ${metrics.power!.consumption} consumida. Estruturas dependentes podem ficar inativas.`, tab: "construction", action: "Revisar energia" }] : []),
    ...(overcrowded ? [{ id: "capacity", tone: "warning", icon: Users, title: "Abrigo superlotado", detail: `${present} pessoas para ${metrics.capacity} vagas. O benefício de Conforto está suspenso.`, tab: "community", action: "Revisar moradores" }] : []),
    ...(idleWork.length ? [{ id: "idle-work", tone: "action", icon: Hammer, title: "Obra sem turno agendado", detail: idleWork.slice(0, 2).map(project => project.name).join(" · "), tab: "construction", action: "Alocar trabalho" }] : []),
    ...(waitingOperations.length ? [{ id: "operation", tone: "action", icon: Users, title: "Estrutura pronta, mas inativa", detail: waitingOperations.slice(0, 2).map(project => `${project.name}: ${projectState(game, project).label}`).join(" · "), tab: "construction", action: "Revisar operação" }] : []),
    ...((lowFood || lowWater) ? [{ id: "supplies", tone: "warning", icon: lowWater ? Droplets : Utensils, title: "Provisões abaixo da população presente", detail: `${food.total} comida · ${water.total} água para ${present} pessoa(s).`, tab: "resources", action: "Revisar recursos" }] : []),
    ...(unplaced.length ? [{ id: "placement", tone: "action", icon: Boxes, title: "Estrutura sem posição na planta", detail: unplaced.slice(0, 2).map(project => project.name).join(" · "), tab: "construction", action: "Posicionar estrutura" }] : []),
  ];

  const nextAction = attention[0] ?? (recommendations[0]
    ? { id: "recommendation", tone: "stable", icon: Wrench, title: "Próxima melhoria sugerida", detail: recommendations[0].reason, tab: "construction", action: "Ver recomendação" }
    : { id: "stable", tone: "stable", icon: CheckCircle2, title: "Abrigo sem pendências imediatas", detail: "Recursos, estruturas e população não exigem uma intervenção urgente agora.", tab: "resources", action: "Ver recursos" });
  const NextActionIcon = nextAction.icon;

  const summary = [
    { label: "Pessoas", value: `${present}/${metrics.capacity}`, note: overcrowded ? "SUPERLOTADO · Conforto suspenso" : "presentes / capacidade", icon: Users },
    { label: "Comida", value: food.total, note: "porções disponíveis", icon: Utensils },
    { label: "Água", value: water.total, note: "porções disponíveis", icon: Droplets },
    { label: "Energia", value: metrics.energy, note: metrics.power ? `${metrics.power.production} produzida · ${metrics.power.consumption} usada` : "saldo estrutural", icon: Zap },
    { label: "Segurança", value: metrics.security, note: "proteção da base", icon: Shield },
    { label: "Conforto", value: metrics.comfort, note: overcrowded ? "sem benefício enquanto superlotado" : metrics.comfort >= 4 ? "−2 Medo no 1º descanso do dia" : metrics.comfort >= 2 ? "−1 Medo no 1º descanso do dia" : "qualidade do abrigo", icon: HeartHandshake },
    { label: "Medicamentos", value: shelter.medications, note: "tratamentos", icon: Cross },
  ];

  function renderOverviewSlot(slot: (typeof shelterBlueprintSlots)[number]) {
    const project = occupied.get(slot.id);
    const state = projectState(game, project);
    const Icon = projectIcon(project);
    const progress = project ? projectProgress(project) : null;
    return <button type="button" key={slot.id} disabled={!project}
      className={`architectural-slot shelter-overview-slot is-${slot.zone} ${project ? "is-occupied" : "is-empty"} ${project?.key === selectedProject?.key ? "is-selected" : ""}`}
      aria-pressed={project?.key === selectedProject?.key}
      onClick={() => project && setSelectedKey(project.key)}>
      <span className="architectural-slot-number">{slot.label}</span>
      {project ? <>
        <Icon size={18} aria-hidden />
        <b>{project.name}</b>
        <span className={`shelter-detail-state is-${state.tone}`}>{state.label}</span>
        {["Concluído", "Danificado", "Inoperante", "Destruído"].includes(project.state) && <small className="construction-integrity-mini">{"●".repeat(projectIntegrity(project))}{"○".repeat(3 - projectIntegrity(project))} · {projectIntegrity(project)}/3</small>}
        {(project.workShift || project.volunteerShifts?.length) && <small><span>⏱</span> até {displayTime(Math.min(
          ...(project.workShift ? [project.workShift.startMinute + project.workShift.durationMinutes] : []),
          ...(project.volunteerShifts ?? []).map(shift => shift.startMinute + shift.durationMinutes),
        ))}</small>}
        {project.state === "Em construção" && progress && <span className="architectural-progress"><i style={{ width: `${Math.min(100, progress.value / progress.required * 100)}%` }} /></span>}
      </> : <>
        <span className="shelter-room-icon"><Boxes size={17} aria-hidden /></span>
        <b>Espaço livre</b>
      </>}
    </button>;
  }

  return <div className="shelter-visual-dashboard">
    <section className={`shelter-now is-${nextAction.tone}`}>
      <div className="shelter-now-main">
        <span className="shelter-now-icon"><NextActionIcon size={20} aria-hidden /></span>
        <div><p className="dossier-title">Abrigo agora</p><h3>{nextAction.title}</h3><p>{nextAction.detail}</p></div>
      </div>
      {onNavigate && <Button size="sm" onClick={() => onNavigate(nextAction.tab)}>{nextAction.action}<ChevronRight size={15} /></Button>}
    </section>

    {attention.length > 1 && <section className="shelter-attention-list" aria-label="Pendências do abrigo">
      <header><AlertTriangle size={17} /><span><b>Outras pendências</b><small>Priorize apenas o que precisa de decisão agora.</small></span></header>
      <div>{attention.slice(1, 5).map(item => {
        const Icon = item.icon;
        return <button type="button" key={item.id} className={`shelter-attention-item is-${item.tone}`} onClick={() => onNavigate?.(item.tab)}>
          <Icon size={16} /><span><b>{item.title}</b><small>{item.detail}</small></span><ChevronRight size={15} />
        </button>;
      })}</div>
    </section>}

    <div className="shelter-status-strip" aria-label="Resumo do abrigo">
      {summary.map(item => {
        const Icon = item.icon;
        return <div className="shelter-status-item" key={item.label}>
          <span className="shelter-status-icon"><Icon size={18} aria-hidden /></span>
          <span><small>{item.label}</small><b>{item.value}</b><em>{item.note}</em></span>
        </div>;
      })}
    </div>

    <div className="shelter-visual-layout">
      <section className="shelter-blueprint-card" aria-label="Planta visual do abrigo">
        <div className="shelter-blueprint-heading">
          <div><p className="dossier-title">Planta do abrigo</p><h3>{shelter.name}</h3></div>
          <span>Hex {shelter.hex}</span>
        </div>

        <div className="architectural-site shelter-overview-architectural">
          <div className="architectural-perimeter">
            <div className="architectural-zone-label"><Shield size={14} /> Melhorias / perímetro</div>
            <div className="architectural-perimeter-items">
              {upgrades.length ? upgrades.map(project => {
                const state = projectState(game, project);
                return <button type="button" key={project.id} className={project.key === selectedProject?.key ? "is-selected" : ""} onClick={() => setSelectedKey(project.key)}>
                  <span className={`shelter-detail-state is-${state.tone}`}>{state.label}</span>
                  <b>{project.name}</b>
                </button>;
              }) : <span className="architectural-empty-note">Nenhuma melhoria de perímetro instalada.</span>}
            </div>
          </div>

          <div className="architectural-building-shell">
            <div className="architectural-building-caption"><span>Bloco principal</span><small>interior do abrigo</small></div>
            <div className="architectural-building-plan">
              <div className="architectural-room architectural-room-a">{renderOverviewSlot(shelterBlueprintSlots.find(slot => slot.id === "room-a")!)}</div>
              <div className="architectural-room architectural-room-b">{renderOverviewSlot(shelterBlueprintSlots.find(slot => slot.id === "room-b")!)}</div>
              <div className="architectural-corridor"><span>CORREDOR</span><i /><i /><i /></div>
              <div className="architectural-room architectural-room-c">{renderOverviewSlot(shelterBlueprintSlots.find(slot => slot.id === "room-c")!)}</div>
              <div className="architectural-room architectural-room-d">{renderOverviewSlot(shelterBlueprintSlots.find(slot => slot.id === "room-d")!)}</div>
              <div className="architectural-room architectural-room-e">{renderOverviewSlot(shelterBlueprintSlots.find(slot => slot.id === "room-e")!)}</div>
              <div className="architectural-room architectural-room-f">{renderOverviewSlot(shelterBlueprintSlots.find(slot => slot.id === "room-f")!)}</div>
            </div>
            <div className="architectural-service-band">
              <div className="architectural-zone-label"><Wrench size={14} /> Área técnica</div>
              <div className="architectural-service-grid">
                {shelterBlueprintSlots.filter(slot => slot.zone === "utility").map(renderOverviewSlot)}
              </div>
            </div>
          </div>

          <div className="architectural-yard">
            <div className="architectural-zone-label"><span>↳</span> Pátio / área externa</div>
            <div className="architectural-yard-grid">
              {shelterBlueprintSlots.filter(slot => slot.zone === "exterior").map(renderOverviewSlot)}
            </div>
          </div>

          {unplaced.length > 0 && <div className="shelter-unplaced-strip">
            <span><Package size={14} /> Sem posição na planta</span>
            <div>{unplaced.map(project => <button type="button" key={project.id} className={project.key === selectedProject?.key ? "is-selected" : ""} onClick={() => setSelectedKey(project.key)}>
              <b>{project.name}</b><small>Defina o local na aba Construção</small>
            </button>)}</div>
          </div>}
        </div>

        <div className="shelter-blueprint-legend">
          <span><i className="is-operational" /> Operacional</span>
          <span><i className="is-building" /> Em obra</span>
          <span><i className="is-waiting" /> Inativo</span>
          <span><i className="is-damaged" /> Danificado</span>
          <span><i className="is-available" /> Espaço livre</span>
        </div>
      </section>

      <aside className="shelter-room-detail" aria-live="polite">
        {selectedProject ? <>
          <header>
            <span className="shelter-detail-icon"><SelectedIcon size={24} aria-hidden /></span>
            <div><p className="dossier-title">{definition?.category ?? "Estrutura"}</p><h3>{selectedProject.name}</h3></div>
            <span className={`shelter-detail-state is-${selectedState.tone}`}>{selectedState.label}</span>
          </header>
          <div className="shelter-detail-body">
            <div className="shelter-detail-row"><span>Estado</span><b>{selectedProject.state}</b></div>
            {selectedProject.state !== "Planejado" && <div className="shelter-detail-row"><span>Integridade</span><b>{projectIntegrity(selectedProject)}/3 · {projectIntegrityLabel(selectedProject)}</b></div>}
            {["Planejado", "Em construção"].includes(selectedProject.state) && <div className="shelter-detail-row"><span>Progresso</span><b>{selectedProgress?.value}/{selectedProgress?.required}{selectedProgress?.repairing ? " · reparo" : ""}</b></div>}
            <div className="shelter-detail-row"><span>Custo</span><b>{definition ? projectDisplayCosts(definition.costs) : "—"}</b></div>
            <div className="shelter-detail-row"><span>Construção</span><b>{definition?.buildCapabilities?.length ? definition.buildCapabilities.join(" + ") : "Sem especialidade obrigatória"}</b></div>
            <div className="shelter-detail-row"><span>Operação</span><b>{definition?.operationMode === "staffed" ? definition.requiredCapabilities?.join(" + ") || "Equipe" : definition?.requiresPower ? "Energia" : "Passiva"}</b></div>
            {responsible && <div className="shelter-detail-row"><span>Responsável</span><b>{responsible.name}</b></div>}
            <div className="shelter-detail-effects"><span>Efeito</span><p>{definition?.effects.map(item => item.label).join(" · ") ?? "Estrutura sem efeito cadastrado."}</p></div>
            {projectMechanicalBenefits(selectedProject.key).length > 0 && <div className="shelter-detail-effects"><span>Benefícios mecânicos</span><p>{projectMechanicalBenefits(selectedProject.key).join(" · ")}</p></div>}
            {selectedProject.state === "Em construção" && selectedProgress && <div className="shelter-detail-progress"><span style={{ width: `${Math.min(100, selectedProgress.value / selectedProgress.required * 100)}%` }} /></div>}
            <div className="shelter-detail-next">
              <span><Clock3 size={15} /><b>Próximo passo</b></span>
              <p>{selectedProject.state === "Concluído" && !projectOperational(game, shelter, selectedProject)
                ? definition?.requiresPower ? "Revise a rede de energia ou religue esta estrutura." : "Designe alguém com a capacidade necessária para operar esta estrutura."
                : selectedProject.state === "Em construção" && !selectedProject.workShift && !(selectedProject.volunteerShifts ?? []).length
                  ? "A obra está pronta para receber trabalhadores e um turno."
                  : ["Danificado", "Inoperante", "Destruído"].includes(selectedProject.state)
                    ? "Abra Construção para iniciar ou acompanhar o reparo."
                    : "Nenhuma ação obrigatória nesta estrutura agora."}</p>
              {onNavigate && (selectedProject.state !== "Concluído" || !projectOperational(game, shelter, selectedProject))
                ? <Button size="sm" variant="outline" onClick={() => onNavigate("construction")}>Abrir Construção</Button> : null}
            </div>
          </div>
        </> : <div className="shelter-detail-empty"><Package size={24} /><b>Nenhuma estrutura construída</b><p>Use a aba Construção para planejar a primeira instalação ou melhoria deste abrigo.</p></div>}
      </aside>
    </div>
  </div>;
}
