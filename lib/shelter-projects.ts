import { createId } from "./id";
import type {
  GameState,
  NPC,
  ShelterManualAdjustments,
  ShelterPost,
  ShelterProject,
  ShelterProjectCategory,
  ShelterProjectCost,
  ShelterProjectEffect,
  ShelterState,
} from "./game";

type ProjectDefinition = {
  key: string;
  name: string;
  category: ShelterProjectCategory;
  requiredProgress: number;
  costs: ShelterProjectCost;
  requiredCapabilities?: string[];
  effects: ShelterProjectEffect[];
};

const effect = (label: string, values: Omit<ShelterProjectEffect, "label"> = {}): ShelterProjectEffect => ({ label, ...values });

/** The catalogue is local data: it makes each facility inspectable without adding a rules engine. */
export const shelterProjectCatalog: ProjectDefinition[] = [
  { key: "barricades", name: "Barricadas", category: "Segurança", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Construção"], effects: [effect("Entradas reforçadas", { security: 1 })] },
  { key: "reinforced-gate", name: "Portão reforçado", category: "Segurança", requiredProgress: 3, costs: { parts: 2 }, requiredCapabilities: ["Construção"], effects: [effect("Acesso controlado", { security: 1 })] },
  { key: "watchpost", name: "Posto de vigia", category: "Segurança", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Construção", "Vigilância"], effects: [effect("Ponto elevado de observação", { security: 1 })] },
  { key: "exterior-lighting", name: "Iluminação externa", category: "Segurança", requiredProgress: 2, costs: { parts: 1, fuel: 1 }, requiredCapabilities: ["Eletricidade"], effects: [effect("Perímetro iluminado", { security: 1, energy: -1 })] },
  { key: "improvised-alarm", name: "Alarme improvisado", category: "Segurança", requiredProgress: 1, costs: { parts: 1 }, requiredCapabilities: ["Mecânica"], effects: [effect("Aviso de invasão")] },
  { key: "evacuation-route", name: "Rota de evacuação", category: "Segurança", requiredProgress: 1, costs: {}, requiredCapabilities: ["Logística"], effects: [effect("Saída alternativa sinalizada")] },

  { key: "cistern", name: "Cisterna", category: "Sobrevivência", requiredProgress: 3, costs: { parts: 2 }, requiredCapabilities: ["Construção"], effects: [effect("Reserva e captação de água")] },
  { key: "water-filter", name: "Filtro de água", category: "Sobrevivência", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Mecânica"], effects: [effect("Tratamento de água coletada")] },
  { key: "community-kitchen", name: "Cozinha comunitária", category: "Sobrevivência", requiredProgress: 2, costs: { parts: 1, fuel: 1 }, requiredCapabilities: ["Cozinha"], effects: [effect("Preparo coletivo de refeições", { comfort: 1 })] },
  { key: "pantry", name: "Despensa", category: "Sobrevivência", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Logística"], effects: [effect("Estoque seco organizado")] },
  { key: "garden", name: "Horta", category: "Sobrevivência", requiredProgress: 4, costs: { parts: 2 }, requiredCapabilities: ["Cultivo"], effects: [effect("Área de cultivo comunitário")] },
  { key: "rain-collector", name: "Coletor de chuva", category: "Sobrevivência", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Construção"], effects: [effect("Captação de chuva")] },
  { key: "refrigeration", name: "Refrigeração", category: "Sobrevivência", requiredProgress: 3, costs: { parts: 2, fuel: 1 }, requiredCapabilities: ["Eletricidade"], effects: [effect("Conservação a frio", { energy: -1 })] },

  { key: "infirmary", name: "Enfermaria", category: "Saúde", requiredProgress: 2, costs: { parts: 1, medications: 1 }, requiredCapabilities: ["Medicina"], effects: [effect("Tratamentos e triagem em local próprio", { comfort: 1 })] },
  { key: "quarantine", name: "Área de quarentena", category: "Saúde", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Medicina"], effects: [effect("Isolamento para casos de infecção")] },
  { key: "medical-stock", name: "Estoque médico", category: "Saúde", requiredProgress: 1, costs: { parts: 1, medications: 1 }, requiredCapabilities: ["Medicina", "Logística"], effects: [effect("Medicamentos organizados e identificados")] },
  { key: "recovery-space", name: "Espaço de recuperação", category: "Saúde", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Medicina"], effects: [effect("Leitos para recuperação", { comfort: 1, capacity: 1 })] },

  { key: "generator", name: "Gerador", category: "Energia e infraestrutura", requiredProgress: 3, costs: { parts: 2, fuel: 1 }, requiredCapabilities: ["Mecânica", "Eletricidade"], effects: [effect("Geração elétrica local", { energy: 1 })] },
  { key: "solar-panels", name: "Painéis solares", category: "Energia e infraestrutura", requiredProgress: 3, costs: { parts: 2 }, requiredCapabilities: ["Eletricidade"], effects: [effect("Geração solar", { energy: 1 })] },
  { key: "battery-bank", name: "Banco de baterias", category: "Energia e infraestrutura", requiredProgress: 2, costs: { parts: 2 }, requiredCapabilities: ["Eletricidade"], effects: [effect("Armazenamento de energia", { energy: 1 })] },
  { key: "electrical-workshop", name: "Oficina elétrica", category: "Energia e infraestrutura", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Eletricidade"], effects: [effect("Reparo de equipamentos elétricos")] },
  { key: "interior-lighting", name: "Iluminação interna", category: "Energia e infraestrutura", requiredProgress: 1, costs: { parts: 1 }, requiredCapabilities: ["Eletricidade"], effects: [effect("Áreas internas iluminadas", { comfort: 1, energy: -1 })] },

  { key: "fixed-radio", name: "Rádio fixo", category: "Comunicação", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Comunicação", "Eletricidade"], effects: [effect("Contato por rádio a partir da base")] },
  { key: "elevated-antenna", name: "Antena elevada", category: "Comunicação", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Construção", "Comunicação"], effects: [effect("Alcance de sinal ampliado")] },
  { key: "communications-room", name: "Sala de comunicações", category: "Comunicação", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Comunicação"], effects: [effect("Mensagens e frequências registradas")] },
  { key: "route-board", name: "Quadro de rotas", category: "Comunicação", requiredProgress: 1, costs: {}, requiredCapabilities: ["Logística"], effects: [effect("Rotas e recados visíveis para a comunidade")] },

  { key: "workshop", name: "Oficina", category: "Produção e manutenção", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Mecânica"], effects: [effect("Reparos de equipamento e peças")] },
  { key: "garage", name: "Garagem", category: "Produção e manutenção", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Mecânica"], effects: [effect("Abrigo e reparos para veículos")] },
  { key: "tool-bench", name: "Bancada de ferramentas", category: "Produção e manutenção", requiredProgress: 1, costs: { parts: 1 }, requiredCapabilities: ["Mecânica"], effects: [effect("Ferramentas de uso coletivo")] },
  { key: "recycling", name: "Ponto de reciclagem", category: "Produção e manutenção", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Logística", "Mecânica"], effects: [effect("Triagem de materiais reaproveitáveis")] },

  { key: "dormitories", name: "Dormitórios", category: "Comunidade", requiredProgress: 3, costs: { parts: 2 }, requiredCapabilities: ["Construção"], effects: [effect("Leitos coletivos", { capacity: 4, comfort: 1 })] },
  { key: "community-kitchen-space", name: "Espaço de cozinha", category: "Comunidade", requiredProgress: 1, costs: { parts: 1 }, requiredCapabilities: ["Cozinha"], effects: [effect("Área organizada para cozinhar", { comfort: 1 })] },
  { key: "refectory", name: "Refeitório", category: "Comunidade", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Construção"], effects: [effect("Refeições em espaço comum", { comfort: 1 })] },
  { key: "common-area", name: "Área comum", category: "Comunidade", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Construção"], effects: [effect("Convivência e reuniões", { comfort: 1 })] },
  { key: "improvised-school", name: "Escola improvisada", category: "Comunidade", requiredProgress: 2, costs: { parts: 1 }, requiredCapabilities: ["Comunicação"], effects: [effect("Aprendizado e atividades para a comunidade")] },
  { key: "social-space", name: "Espaço social", category: "Comunidade", requiredProgress: 1, costs: {}, requiredCapabilities: [], effects: [effect("Ponto de encontro e escuta", { comfort: 1 })] },
];

export const shelterPostCatalog = [
  { key: "vigilance", name: "Vigilância", capability: "Vigilância", projects: [] },
  { key: "infirmary", name: "Enfermaria", capability: "Medicina", projects: ["infirmary"] },
  { key: "kitchen", name: "Cozinha", capability: "Cozinha", projects: ["community-kitchen"] },
  { key: "maintenance", name: "Manutenção", capability: "Mecânica", projects: ["workshop", "garage", "electrical-workshop"] },
  { key: "communications", name: "Comunicações", capability: "Comunicação", projects: ["fixed-radio", "communications-room"] },
  { key: "logistics", name: "Logística", capability: "Logística", projects: ["pantry", "route-board"] },
] as const;

export function projectDefinition(key: string) { return shelterProjectCatalog.find(project => project.key === key); }
export function projectDisplayCosts(costs: ShelterProjectCost) {
  const labels = (["parts", "medications", "fuel"] as const).flatMap(key => costs[key] ? [`${costs[key]} ${key === "parts" ? "Peças" : key === "medications" ? "Medicamentos" : "Combustível"}`] : []);
  return labels.length ? labels.join(" · ") : "Sem custo material";
}
export function createShelterProject(key: string): ShelterProject | null {
  const definition = projectDefinition(key);
  return definition ? {
    id: createId(), key: definition.key, name: definition.name, category: definition.category,
    state: "Planejado", progress: 0, requiredProgress: definition.requiredProgress, costs: structuredClone(definition.costs),
    requiredCapabilities: [...(definition.requiredCapabilities ?? [])], effects: structuredClone(definition.effects), helperIds: [],
  } : null;
}

export function normalizeShelter(shelter: ShelterState) {
  shelter.projects ??= [];
  shelter.posts ??= [];
  const baseSecurity = shelter.hex ? 1 : 0;
  shelter.manualAdjustments ??= {
    security: (shelter.security ?? baseSecurity) - baseSecurity,
    energy: shelter.energy ?? 0,
    comfort: shelter.comfort ?? 0,
  };
  shelter.baseCapacity ??= shelter.capacity ?? 0;
  for (const project of shelter.projects) {
    const definition = projectDefinition(project.key);
    project.name ??= definition?.name ?? project.key;
    project.category ??= definition?.category ?? "Comunidade";
    project.state ??= "Planejado";
    project.progress = Math.max(0, Math.trunc(project.progress ?? 0));
    project.requiredProgress = Math.max(1, Math.trunc(project.requiredProgress ?? definition?.requiredProgress ?? 1));
    project.costs ??= structuredClone(definition?.costs ?? {});
    project.requiredCapabilities ??= [...(definition?.requiredCapabilities ?? [])];
    project.effects ??= structuredClone(definition?.effects ?? []);
    project.helperIds ??= [];
  }
  for (const post of shelter.posts) post.helperIds ??= [];
  return shelter;
}

function activePresent(game: GameState, shelter: ShelterState, id?: string) {
  const npc = game.npcs.find(candidate => candidate.id === id);
  return Boolean(npc && npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === shelter.hex);
}
function hasCapability(npc: NPC | undefined, capability: string) {
  return Boolean(npc && npc.skills.some(skill => skill.localeCompare(capability, "pt-BR", { sensitivity: "base" }) === 0));
}
export function canVolunteer(npc: NPC, responsibility = false) {
  if (!npc.active || npc.status === "Morto" || npc.status === "Desaparecido" || npc.disposition === "Hostil") return false;
  if (responsibility) return npc.disposition === "Aliado" || npc.disposition === "Leal";
  // Distrust can still exist in the fiction, but it does not operate a post
  // or a capability-requiring structure until the GM changes that disposition.
  return npc.disposition !== "Desconfiado";
}
export function projectOperational(game: GameState, shelter: ShelterState, project: ShelterProject) {
  if (project.state !== "Concluído") return false;
  if (!project.requiredCapabilities.length) return true;
  const candidates = [project.responsibleId, ...(project.helperIds ?? [])]
    .map(id => game.npcs.find(npc => npc.id === id))
    .filter((npc): npc is NPC => Boolean(npc && activePresent(game, shelter, npc.id)));
  return project.requiredCapabilities.every(capability => candidates.some(npc => hasCapability(npc, capability) && canVolunteer(npc)));
}
export function projectAssignmentIssue(game: GameState, shelter: ShelterState, project: ShelterProject, npcId: string, responsible: boolean) {
  const npc = game.npcs.find(candidate => candidate.id === npcId);
  if (!npc || !activePresent(game, shelter, npcId)) return "A pessoa precisa estar presente no abrigo.";
  if (npc.disposition === "Desconfiado" && !responsible && project.requiredCapabilities.length === 0) return null;
  if (npc.disposition === "Desconfiado") return "NPC Desconfiado aceita apenas tarefas básicas, sem operar estruturas ou postos.";
  if (!canVolunteer(npc, responsible)) return responsible ? "Apenas NPCs Aliados ou Leais assumem responsabilidade." : "NPC Hostil não assume tarefas voluntariamente.";
  if (responsible && project.requiredCapabilities.length && !project.requiredCapabilities.some(capability => hasCapability(npc, capability)))
    return `Responsável precisa de: ${project.requiredCapabilities.join(" ou ")}.`;
  return null;
}
export function startProject(shelter: ShelterState, project: ShelterProject) {
  if (project.state !== "Planejado") return "O projeto já foi iniciado.";
  for (const [key, quantity] of Object.entries(project.costs) as [keyof ShelterProjectCost, number][]) {
    if ((shelter[key] ?? 0) < quantity) return `Faltam ${key === "parts" ? "Peças" : key === "medications" ? "Medicamentos" : "Combustível"}.`;
  }
  for (const [key, quantity] of Object.entries(project.costs) as [keyof ShelterProjectCost, number][]) shelter[key] -= quantity;
  project.costsPaid = true;
  project.state = "Em construção";
  return null;
}
export function advanceProject(project: ShelterProject, points = 1) {
  if (project.state !== "Em construção" || !Number.isInteger(points) || points < 1) return false;
  project.progress = Math.min(project.requiredProgress, project.progress + points);
  if (project.progress >= project.requiredProgress) project.state = "Concluído";
  return true;
}
export function projectContributions(shelter: ShelterState) {
  const values = { security: 0, energy: 0, comfort: 0, capacity: 0 };
  for (const project of shelter.projects ?? []) {
    if (project.state !== "Concluído") continue;
    for (const effect of project.effects) {
      values.security += effect.security ?? 0;
      values.energy += effect.energy ?? 0;
      values.comfort += effect.comfort ?? 0;
      values.capacity += effect.capacity ?? 0;
    }
  }
  return values;
}
export function shelterMetrics(shelter: ShelterState) {
  const legacyBaseSecurity = shelter.hex ? 1 : 0;
  // Until a JSON campaign is normalized, its old counters are its explicit GM
  // correction. This keeps old saves and test fixtures mechanically identical.
  const savedCorrections: ShelterManualAdjustments = shelter.manualAdjustments ?? {
    security: (shelter.security ?? legacyBaseSecurity) - legacyBaseSecurity,
    energy: shelter.energy ?? 0,
    comfort: shelter.comfort ?? 0,
  };
  // Some older callers still write the original counters directly. When that
  // value no longer matches the stored correction, honour the direct edit.
  const corrections: ShelterManualAdjustments = {
    security: shelter.security !== legacyBaseSecurity + savedCorrections.security
      ? (shelter.security ?? legacyBaseSecurity) - legacyBaseSecurity : savedCorrections.security,
    energy: shelter.energy !== savedCorrections.energy ? (shelter.energy ?? 0) : savedCorrections.energy,
    comfort: shelter.comfort !== savedCorrections.comfort ? (shelter.comfort ?? 0) : savedCorrections.comfort,
  };
  const structures = projectContributions(shelter);
  const base = { security: shelter.hex ? 1 : 0, energy: 0, comfort: 0, capacity: shelter.baseCapacity ?? shelter.capacity };
  return {
    security: base.security + structures.security + corrections.security,
    energy: base.energy + structures.energy + corrections.energy,
    comfort: base.comfort + structures.comfort + corrections.comfort,
    capacity: base.capacity + structures.capacity,
    base,
    structures,
    corrections,
  };
}
export function shelterPosts(game: GameState, shelter: ShelterState) {
  return shelterPostCatalog.map(definition => {
    const post: ShelterPost = shelter.posts?.find(entry => entry.key === definition.key) ?? { key: definition.key, helperIds: [] };
    const facilitiesReady = definition.projects.length === 0 || definition.projects.some(key => {
      const project = shelter.projects?.find(candidate => candidate.key === key);
      return Boolean(project && projectOperational(game, shelter, project));
    });
    const people = [post.responsibleId, ...(post.helperIds ?? [])].map(id => game.npcs.find(npc => npc.id === id));
    const operational = facilitiesReady && people.some(npc => npc && activePresent(game, shelter, npc.id) && hasCapability(npc, definition.capability) && canVolunteer(npc));
    return { ...definition, post, facilitiesReady, operational };
  });
}
