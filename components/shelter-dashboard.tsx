"use client";

import { useState, type ComponentType } from "react";
import {
  BedDouble,
  Boxes,
  CheckCircle2,
  Cross,
  Droplets,
  Hammer,
  HeartHandshake,
  Package,
  Shield,
  Users,
  Utensils,
  Wrench,
  Zap,
} from "lucide-react";
import { provisionBreakdown } from "@/lib/provision-items";
import { shelterPopulationBreakdown, type GameState, type ShelterProject } from "@/lib/game";
import { projectDefinition, projectDisplayCosts, projectOperational, shelterMetrics } from "@/lib/shelter-projects";

type Icon = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

type RoomSlot = {
  key: string;
  label: string;
  area: string;
  icon: Icon;
};

const roomSlots: RoomSlot[] = [
  { key: "dormitories", label: "Dormitórios", area: "dorm", icon: BedDouble },
  { key: "infirmary", label: "Enfermaria", area: "infirmary", icon: Cross },
  { key: "workshop", label: "Oficina", area: "workshop", icon: Wrench },
  { key: "pantry", label: "Despensa", area: "storage", icon: Boxes },
  { key: "common-area", label: "Área comum", area: "common", icon: Users },
  { key: "generator", label: "Gerador", area: "generator", icon: Zap },
  { key: "cistern", label: "Cisterna", area: "cistern", icon: Droplets },
  { key: "reinforced-gate", label: "Portão", area: "gate", icon: Shield },
];

function projectFor(game: GameState, key: string) {
  return game.shelter.projects?.find(project => project.key === key);
}

function projectState(game: GameState, project?: ShelterProject) {
  if (!project) return { label: "Disponível", tone: "available" };
  if (project.state === "Concluído") {
    return projectOperational(game, game.shelter, project)
      ? { label: "Operacional", tone: "operational" }
      : { label: "Sem operador", tone: "waiting" };
  }
  if (project.state === "Em construção") return { label: "Em construção", tone: "building" };
  if (project.state === "Danificado") return { label: "Danificado", tone: "damaged" };
  return { label: "Planejado", tone: "planned" };
}

export function ShelterVisualDashboard({ game }: { game: GameState }) {
  const firstExisting = roomSlots.find(slot => projectFor(game, slot.key))?.key ?? "common-area";
  const [selectedKey, setSelectedKey] = useState(firstExisting);
  const shelter = game.shelter;
  const metrics = shelterMetrics(shelter);
  const population = shelterPopulationBreakdown(game);
  const food = provisionBreakdown(shelter, "food");
  const water = provisionBreakdown(shelter, "water");
  const selectedSlot = roomSlots.find(slot => slot.key === selectedKey) ?? roomSlots[0];
  const selectedProject = projectFor(game, selectedSlot.key);
  const definition = projectDefinition(selectedSlot.key);
  const selectedState = projectState(game, selectedProject);
  const SelectedIcon = selectedSlot.icon;
  const responsible = selectedProject?.responsibleId
    ? game.npcs.find(npc => npc.id === selectedProject.responsibleId)
    : undefined;

  const summary = [
    { label: "Pessoas", value: `${population.present}/${metrics.capacity}`, note: "presentes / capacidade", icon: Users },
    { label: "Comida", value: food.total, note: "porções disponíveis", icon: Utensils },
    { label: "Água", value: water.total, note: "porções disponíveis", icon: Droplets },
    { label: "Energia", value: metrics.energy, note: "saldo estrutural", icon: Zap },
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
          <div>
            <p className="dossier-title">Planta do abrigo</p>
            <h3>{shelter.name}</h3>
          </div>
          <span>Hex {shelter.hex}</span>
        </div>

        <div className="shelter-blueprint">
          <div className="shelter-blueprint-grid" aria-hidden="true" />
          {roomSlots.map(slot => {
            const project = projectFor(game, slot.key);
            const state = projectState(game, project);
            const Icon = slot.icon;
            const progress = project ? Math.min(100, project.progress / project.requiredProgress * 100) : 0;
            return <button
              type="button"
              key={slot.key}
              className={`shelter-room is-${state.tone} ${selectedKey === slot.key ? "is-selected" : ""}`}
              style={{ gridArea: slot.area }}
              aria-pressed={selectedKey === slot.key}
              onClick={() => setSelectedKey(slot.key)}
            >
              <span className="shelter-room-icon"><Icon size={20} aria-hidden /></span>
              <span className="shelter-room-copy"><b>{slot.label}</b><small>{state.label}</small></span>
              <span className={`shelter-room-dot is-${state.tone}`} aria-hidden="true" />
              {project?.state === "Em construção" && <span className="shelter-room-progress" aria-label={`${project.progress} de ${project.requiredProgress} de progresso`}>
                <span style={{ width: `${progress}%` }} />
              </span>}
            </button>;
          })}
        </div>

        <div className="shelter-blueprint-legend">
          <span><i className="is-operational" /> Operacional</span>
          <span><i className="is-building" /> Em obra</span>
          <span><i className="is-waiting" /> Sem operador</span>
          <span><i className="is-damaged" /> Danificado</span>
          <span><i className="is-available" /> Não construído</span>
        </div>
      </section>

      <aside className="shelter-room-detail" aria-live="polite">
        <header>
          <span className="shelter-detail-icon"><SelectedIcon size={24} aria-hidden /></span>
          <div>
            <p className="dossier-title">{definition?.category ?? "Estrutura"}</p>
            <h3>{selectedSlot.label}</h3>
          </div>
          <span className={`shelter-detail-state is-${selectedState.tone}`}>{selectedState.label}</span>
        </header>

        <div className="shelter-detail-body">
          <div className="shelter-detail-row">
            <span>Estado</span>
            <b>{selectedProject?.state ?? "Ainda não planejado"}</b>
          </div>
          {selectedProject && <div className="shelter-detail-row">
            <span>Progresso</span>
            <b>{selectedProject.progress}/{selectedProject.requiredProgress}</b>
          </div>}
          <div className="shelter-detail-row">
            <span>Custo</span>
            <b>{definition ? projectDisplayCosts(definition.costs) : "—"}</b>
          </div>
          <div className="shelter-detail-row">
            <span>Operação</span>
            <b>{definition?.requiredCapabilities?.length ? definition.requiredCapabilities.join(" + ") : "Sem operador obrigatório"}</b>
          </div>
          {responsible && <div className="shelter-detail-row">
            <span>Responsável</span>
            <b>{responsible.name}</b>
          </div>}

          <div className="shelter-detail-effects">
            <span>Efeito</span>
            <p>{definition?.effects.map(item => item.label).join(" · ") ?? "Estrutura sem efeito cadastrado."}</p>
          </div>

          {selectedProject?.state === "Em construção" && <div className="shelter-detail-progress">
            <span style={{ width: `${Math.min(100, selectedProject.progress / selectedProject.requiredProgress * 100)}%` }} />
          </div>}

          <p className="shelter-detail-hint">
            {selectedProject
              ? selectedProject.state === "Concluído" && !projectOperational(game, shelter, selectedProject)
                ? "A estrutura está pronta, mas ainda precisa das capacidades e pessoas indicadas para operar."
                : "Use a aba Construção para gerenciar responsável, ajudantes, progresso e reparos."
              : "Esta área ainda não foi planejada. Use a aba Construção para iniciar o projeto."}
          </p>
        </div>
      </aside>
    </div>
  </div>;
}
