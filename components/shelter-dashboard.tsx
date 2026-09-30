"use client";

import { useMemo, useState, type ComponentType } from "react";
import {
  Boxes,
  Cross,
  Droplets,
  HeartHandshake,
  Package,
  Shield,
  Users,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";
import { provisionBreakdown } from "@/lib/provision-items";
import { displayTime, shelterPopulationBreakdown, type GameState, type ShelterProject } from "@/lib/game";
import {
  projectDefinition,
  projectDisplayCosts,
  projectOperational,
  projectProgress,
  shelterBlueprintSlots,
  shelterMetrics,
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
  if (project.state === "Concluído") {
    const definition = projectDefinition(project.key);
    if ((game.shelter.disabledProjectKeys ?? []).includes(project.key)) return { label: "Desligado", tone: "waiting" };
    if (projectOperational(game, game.shelter, project)) return { label: "Operacional", tone: "operational" };
    if (definition?.requiresPower) return { label: "Sem energia", tone: "waiting" };
    return { label: "Sem operador", tone: "waiting" };
  }
  if (project.workShift) return { label: `Trabalhando até ${displayTime(project.workShift.startMinute + project.workShift.durationMinutes)}`, tone: "building" };
  if (project.state === "Em construção") return { label: project.repairProgress !== undefined ? "Em reparo" : "Em construção", tone: "building" };
  if (project.state === "Danificado") return { label: "Danificado", tone: "damaged" };
  return { label: "Planejado", tone: "planned" };
}

export function ShelterVisualDashboard({ game }: { game: GameState }) {
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
  const food = provisionBreakdown(shelter, "food");
  const water = provisionBreakdown(shelter, "water");
  const occupied = new Map(facilities.filter(project => project.slotId).map(project => [project.slotId!, project]));
  const unplaced = facilities.filter(project => !project.slotId);

  const summary = [
    { label: "Pessoas", value: `${population.present}/${metrics.capacity}`, note: "presentes / capacidade", icon: Users },
    { label: "Comida", value: food.total, note: "porções disponíveis", icon: Utensils },
    { label: "Água", value: water.total, note: "porções disponíveis", icon: Droplets },
    { label: "Energia", value: metrics.energy, note: metrics.power ? `${metrics.power.production} produzida · ${metrics.power.consumption} usada` : "saldo estrutural", icon: Zap },
    { label: "Segurança", value: metrics.security, note: "proteção da base", icon: Shield },
    { label: "Conforto", value: metrics.comfort, note: "qualidade do abrigo", icon: HeartHandshake },
    { label: "Medicamentos", value: shelter.medications, note: "tratamentos", icon: Cross },
  ];

  return <div className="shelter-visual-dashboard">
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

        <div className="construction-blueprint-grid shelter-overview-blueprint">
          {shelterBlueprintSlots.map(slot => {
            const project = occupied.get(slot.id);
            const state = projectState(game, project);
            const Icon = projectIcon(project);
            const progress = project ? projectProgress(project) : null;
            return <button type="button" key={slot.id} disabled={!project}
              className={`construction-blueprint-slot shelter-overview-slot is-${slot.zone} ${project ? "is-occupied" : ""} ${project?.key === selectedProject?.key ? "is-selected" : ""}`}
              aria-pressed={project?.key === selectedProject?.key}
              onClick={() => project && setSelectedKey(project.key)}>
              <small>{slot.label}</small>
              {project ? <><Icon size={19} aria-hidden /><b>{project.name}</b><span className={`shelter-detail-state is-${state.tone}`}>{state.label}</span>
                {project.state === "Em construção" && progress && <span className="shelter-room-progress"><span style={{ width: `${Math.min(100, progress.value / progress.required * 100)}%` }} /></span>}</>
                : <><span className="shelter-room-icon"><Boxes size={18} aria-hidden /></span><span>Espaço livre</span></>}
            </button>;
          })}
        </div>

        {(upgrades.length > 0 || unplaced.length > 0) && <div className="shelter-perimeter-strip">
          {upgrades.map(project => {
            const state = projectState(game, project);
            return <button type="button" key={project.id} className={project.key === selectedProject?.key ? "is-selected" : ""} onClick={() => setSelectedKey(project.key)}>
              <Shield size={14} /><span><b>{project.name}</b><small>{state.label}</small></span>
            </button>;
          })}
          {unplaced.map(project => <button type="button" key={project.id} className={project.key === selectedProject?.key ? "is-selected" : ""} onClick={() => setSelectedKey(project.key)}>
            <Package size={14} /><span><b>{project.name}</b><small>Instalação sem posição registrada</small></span>
          </button>)}
        </div>}

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
            <div className="shelter-detail-row"><span>Progresso</span><b>{selectedProgress?.value}/{selectedProgress?.required}{selectedProgress?.repairing ? " · reparo" : ""}</b></div>
            <div className="shelter-detail-row"><span>Custo</span><b>{definition ? projectDisplayCosts(definition.costs) : "—"}</b></div>
            <div className="shelter-detail-row"><span>Construção</span><b>{definition?.buildCapabilities?.length ? definition.buildCapabilities.join(" + ") : "Sem especialidade obrigatória"}</b></div>
            <div className="shelter-detail-row"><span>Operação</span><b>{definition?.operationMode === "staffed" ? definition.requiredCapabilities?.join(" + ") || "Equipe" : definition?.requiresPower ? "Energia" : "Passiva"}</b></div>
            {responsible && <div className="shelter-detail-row"><span>Responsável</span><b>{responsible.name}</b></div>}
            <div className="shelter-detail-effects"><span>Efeito</span><p>{definition?.effects.map(item => item.label).join(" · ") ?? "Estrutura sem efeito cadastrado."}</p></div>
            {selectedProject.state === "Em construção" && selectedProgress && <div className="shelter-detail-progress"><span style={{ width: `${Math.min(100, selectedProgress.value / selectedProgress.required * 100)}%` }} /></div>}
            <p className="shelter-detail-hint">{selectedProject.state === "Concluído" && !projectOperational(game, shelter, selectedProject)
              ? definition?.requiresPower ? "A estrutura está pronta, mas não está recebendo energia ou foi desligada." : "A estrutura está pronta, mas ainda precisa da equipe indicada para operar."
              : "Use a aba Construção para gerenciar equipe, turnos, energia, reparos e novas instalações."}</p>
          </div>
        </> : <div className="shelter-detail-empty"><Package size={24} /><b>Nenhuma estrutura construída</b><p>Use a aba Construção para planejar a primeira instalação ou melhoria deste abrigo.</p></div>}
      </aside>
    </div>
  </div>;
}
