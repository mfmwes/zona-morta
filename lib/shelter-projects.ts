import { addLog, normalizeShelterAmmo, type GameState, type NPC, type ShelterManualAdjustments, type ShelterPost, type ShelterProject, type ShelterProjectCategory, type ShelterProjectCost, type ShelterProjectEffect, type ShelterState } from "./game";
import { createId } from "./id";

export type ShelterProjectKind = "facility" | "upgrade";
export type ShelterBlueprintZone = "interior" | "utility" | "exterior";

export type ProjectDefinition = {
  key: string;
  name: string;
  category: ShelterProjectCategory;
  kind: ShelterProjectKind;
  zone?: ShelterBlueprintZone;
  requiredProgress: number;
  costs: ShelterProjectCost;
  buildCapabilities?: string[];
  requiredCapabilities?: string[];
  operationMode?: "passive" | "staffed";
  requiresPower?: boolean;
  dependencies?: { allOf?: string[]; anyOf?: string[] };
  repairCosts?: ShelterProjectCost;
  repairProgress?: number;
  effects: ShelterProjectEffect[];
};

export const shelterBlueprintSlots = [
  { id: "room-a", label: "Sala A", zone: "interior" as const },
  { id: "room-b", label: "Sala B", zone: "interior" as const },
  { id: "room-c", label: "Sala C", zone: "interior" as const },
  { id: "room-d", label: "Sala D", zone: "interior" as const },
  { id: "room-e", label: "Sala E", zone: "interior" as const },
  { id: "room-f", label: "Sala F", zone: "interior" as const },
  { id: "utility-a", label: "Área técnica A", zone: "utility" as const },
  { id: "utility-b", label: "Área técnica B", zone: "utility" as const },
  { id: "utility-c", label: "Área técnica C", zone: "utility" as const },
  { id: "yard-a", label: "Área externa A", zone: "exterior" as const },
  { id: "yard-b", label: "Área externa B", zone: "exterior" as const },
  { id: "yard-c", label: "Área externa C", zone: "exterior" as const },
] as const;

const effect = (label: string, values: Omit<ShelterProjectEffect, "label"> = {}): ShelterProjectEffect => ({ label, ...values });
const passive = { operationMode: "passive" as const, requiredCapabilities: [] as string[] };
const staffed = (requiredCapabilities: string[]) => ({ operationMode: "staffed" as const, requiredCapabilities });

export const shelterProjectCatalog: ProjectDefinition[] = [
  { key: "barricades", name: "Barricadas", category: "Segurança", kind: "upgrade", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Entradas reforçadas", { security: 1 })] },
  { key: "reinforced-gate", name: "Portão reforçado", category: "Segurança", kind: "upgrade", requiredProgress: 3, costs: { parts: 2 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 2, effects: [effect("Acesso controlado", { security: 1 })] },
  { key: "watchpost", name: "Posto de vigia", category: "Segurança", kind: "facility", zone: "exterior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Vigilância"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Ponto elevado de observação", { security: 1 })] },
  { key: "exterior-lighting", name: "Iluminação externa", category: "Segurança", kind: "upgrade", requiredProgress: 2, costs: { parts: 1, fuel: 1 }, buildCapabilities: ["Eletricidade"], ...passive, requiresPower: true, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Perímetro iluminado", { security: 1, energy: -1 })] },
  { key: "improvised-alarm", name: "Alarme improvisado", category: "Segurança", kind: "upgrade", requiredProgress: 1, costs: { parts: 1 }, buildCapabilities: ["Mecânica"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Aviso de invasão")] },
  { key: "evacuation-route", name: "Rota de evacuação", category: "Segurança", kind: "upgrade", requiredProgress: 1, costs: {}, buildCapabilities: ["Logística"], ...passive, repairCosts: {}, repairProgress: 1, effects: [effect("Saída alternativa sinalizada")] },

  { key: "cistern", name: "Cisterna", category: "Sobrevivência", kind: "facility", zone: "exterior", requiredProgress: 3, costs: { parts: 2 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 2, effects: [effect("Reserva e captação de água")] },
  { key: "water-filter", name: "Filtro de água", category: "Sobrevivência", kind: "facility", zone: "utility", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Mecânica"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Tratamento de água coletada")] },
  { key: "community-kitchen", name: "Cozinha comunitária", category: "Sobrevivência", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1, fuel: 1 }, buildCapabilities: ["Construção"], ...staffed(["Cozinha"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Preparo coletivo de refeições", { comfort: 1 })] },
  { key: "pantry", name: "Despensa", category: "Sobrevivência", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Logística"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Estoque seco organizado")] },
  { key: "garden", name: "Horta", category: "Sobrevivência", kind: "facility", zone: "exterior", requiredProgress: 4, costs: { parts: 2 }, buildCapabilities: ["Construção"], ...staffed(["Cultivo"]), repairCosts: { parts: 1 }, repairProgress: 2, effects: [effect("Área de cultivo comunitário")] },
  { key: "rain-collector", name: "Coletor de chuva", category: "Sobrevivência", kind: "upgrade", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Captação de chuva")] },
  { key: "refrigeration", name: "Refrigeração", category: "Sobrevivência", kind: "facility", zone: "utility", requiredProgress: 3, costs: { parts: 2, fuel: 1 }, buildCapabilities: ["Eletricidade"], ...passive, requiresPower: true, dependencies: { anyOf: ["generator", "solar-panels", "battery-bank"] }, repairCosts: { parts: 1 }, repairProgress: 2, effects: [effect("Conservação a frio", { energy: -1 })] },

  { key: "infirmary", name: "Enfermaria", category: "Saúde", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1, medications: 1 }, buildCapabilities: ["Construção"], ...staffed(["Medicina"]), repairCosts: { parts: 1, medications: 1 }, repairProgress: 1, effects: [effect("Tratamentos e triagem em local próprio", { comfort: 1 })] },
  { key: "quarantine", name: "Área de quarentena", category: "Saúde", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Medicina"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Isolamento para casos de infecção")] },
  { key: "medical-stock", name: "Estoque médico", category: "Saúde", kind: "facility", zone: "interior", requiredProgress: 1, costs: { parts: 1, medications: 1 }, buildCapabilities: ["Logística"], ...staffed(["Medicina", "Logística"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Medicamentos organizados e identificados")] },
  { key: "recovery-space", name: "Espaço de recuperação", category: "Saúde", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Medicina"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Leitos para recuperação", { comfort: 1, capacity: 1 })] },

  { key: "generator", name: "Gerador", category: "Energia e infraestrutura", kind: "facility", zone: "utility", requiredProgress: 3, costs: { parts: 2, fuel: 1 }, buildCapabilities: ["Mecânica", "Eletricidade"], ...staffed(["Mecânica"]), repairCosts: { parts: 1, fuel: 1 }, repairProgress: 2, effects: [effect("Geração elétrica local", { energy: 1 })] },
  { key: "solar-panels", name: "Painéis solares", category: "Energia e infraestrutura", kind: "upgrade", requiredProgress: 3, costs: { parts: 2 }, buildCapabilities: ["Eletricidade"], ...passive, repairCosts: { parts: 1 }, repairProgress: 2, effects: [effect("Geração solar", { energy: 1 })] },
  { key: "battery-bank", name: "Banco de baterias", category: "Energia e infraestrutura", kind: "facility", zone: "utility", requiredProgress: 2, costs: { parts: 2 }, buildCapabilities: ["Eletricidade"], ...passive, dependencies: { anyOf: ["generator", "solar-panels"] }, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Armazenamento de energia", { energy: 1 })] },
  { key: "electrical-workshop", name: "Oficina elétrica", category: "Energia e infraestrutura", kind: "facility", zone: "utility", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção", "Eletricidade"], ...staffed(["Eletricidade"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Reparo de equipamentos elétricos")] },
  { key: "interior-lighting", name: "Iluminação interna", category: "Energia e infraestrutura", kind: "upgrade", requiredProgress: 1, costs: { parts: 1 }, buildCapabilities: ["Eletricidade"], ...passive, requiresPower: true, dependencies: { anyOf: ["generator", "solar-panels", "battery-bank"] }, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Áreas internas iluminadas", { comfort: 1, energy: -1 })] },

  { key: "fixed-radio", name: "Rádio fixo", category: "Comunicação", kind: "facility", zone: "utility", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Eletricidade"], ...staffed(["Comunicação"]), requiresPower: true, dependencies: { anyOf: ["generator", "solar-panels", "battery-bank"] }, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Contato por rádio a partir da base", { energy: -1 })] },
  { key: "elevated-antenna", name: "Antena elevada", category: "Comunicação", kind: "upgrade", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção", "Comunicação"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Alcance de sinal ampliado")] },
  { key: "communications-room", name: "Sala de comunicações", category: "Comunicação", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Comunicação"]), dependencies: { anyOf: ["fixed-radio", "elevated-antenna"] }, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Mensagens e frequências registradas")] },
  { key: "route-board", name: "Quadro de rotas", category: "Comunicação", kind: "upgrade", requiredProgress: 1, costs: {}, buildCapabilities: ["Logística"], ...passive, repairCosts: {}, repairProgress: 1, effects: [effect("Rotas e recados visíveis para a comunidade")] },

  { key: "workshop", name: "Oficina", category: "Produção e manutenção", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Mecânica"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Reparos de equipamento e peças")] },
  { key: "garage", name: "Garagem", category: "Produção e manutenção", kind: "facility", zone: "exterior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Mecânica"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Abrigo e reparos para veículos")] },
  { key: "tool-bench", name: "Bancada de ferramentas", category: "Produção e manutenção", kind: "facility", zone: "utility", requiredProgress: 1, costs: { parts: 1 }, buildCapabilities: ["Mecânica"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Ferramentas de uso coletivo")] },
  { key: "recycling", name: "Ponto de reciclagem", category: "Produção e manutenção", kind: "facility", zone: "exterior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Logística", "Mecânica"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Triagem de materiais reaproveitáveis")] },

  { key: "dormitories", name: "Dormitórios", category: "Comunidade", kind: "facility", zone: "interior", requiredProgress: 3, costs: { parts: 2 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 2, effects: [effect("Leitos coletivos", { capacity: 4, comfort: 1 })] },
  { key: "community-kitchen-space", name: "Espaço de cozinha", category: "Comunidade", kind: "facility", zone: "interior", requiredProgress: 1, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Área organizada para cozinhar", { comfort: 1 })] },
  { key: "refectory", name: "Refeitório", category: "Comunidade", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Refeições em espaço comum", { comfort: 1 })] },
  { key: "common-area", name: "Área comum", category: "Comunidade", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...passive, repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Convivência e reuniões", { comfort: 1 })] },
  { key: "improvised-school", name: "Escola improvisada", category: "Comunidade", kind: "facility", zone: "interior", requiredProgress: 2, costs: { parts: 1 }, buildCapabilities: ["Construção"], ...staffed(["Comunicação"]), repairCosts: { parts: 1 }, repairProgress: 1, effects: [effect("Aprendizado e atividades para a comunidade")] },
  { key: "social-space", name: "Espaço social", category: "Comunidade", kind: "facility", zone: "interior", requiredProgress: 1, costs: {}, buildCapabilities: [], ...passive, repairCosts: {}, repairProgress: 1, effects: [effect("Ponto de encontro e escuta", { comfort: 1 })] },
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
  const labels = (["parts", "medications", "fuel"] as const).flatMap(key => costs[key]
    ? [`${costs[key]} ${key === "parts" ? "Peças" : key === "medications" ? "Medicamentos" : "Combustível"}`] : []);
  return labels.length ? labels.join(" · ") : "Sem custo material";
}

export function createShelterProject(key: string, slotId?: string): ShelterProject | null {
  const definition = projectDefinition(key);
  return definition ? {
    id: createId(),
    key: definition.key,
    name: definition.name,
    category: definition.category,
    state: "Planejado",
    progress: 0,
    requiredProgress: definition.requiredProgress,
    costs: structuredClone(definition.costs),
    buildCapabilities: [...(definition.buildCapabilities ?? [])],
    requiredCapabilities: [...(definition.requiredCapabilities ?? [])],
    operationMode: definition.operationMode ?? "passive",
    slotId,
    effects: structuredClone(definition.effects),
    helperIds: [],
  } : null;
}

export function normalizeShelter(shelter: ShelterState) {
  normalizeShelterAmmo(shelter);
  shelter.projects ??= [];
  shelter.posts ??= [];
  shelter.disabledProjectKeys ??= [];
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
    project.buildCapabilities ??= [...(definition?.buildCapabilities ?? [])];
    project.requiredCapabilities ??= [...(definition?.requiredCapabilities ?? [])];
    project.operationMode ??= definition?.operationMode ?? "passive";
    project.effects ??= structuredClone(definition?.effects ?? []);
    project.helperIds ??= [];
    if (project.repairProgress !== undefined) project.repairProgress = Math.max(0, Math.trunc(project.repairProgress));
    if (project.requiredRepairProgress !== undefined) project.requiredRepairProgress = Math.max(1, Math.trunc(project.requiredRepairProgress));
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
  return npc.disposition !== "Desconfiado";
}

function concluded(shelter: ShelterState, key: string) {
  return Boolean(shelter.projects?.some(project => project.key === key && project.state === "Concluído"));
}

export function projectDependencyIssue(shelter: ShelterState, projectOrKey: ShelterProject | string) {
  const key = typeof projectOrKey === "string" ? projectOrKey : projectOrKey.key;
  const definition = projectDefinition(key);
  if (!definition?.dependencies) return null;
  const { allOf = [], anyOf = [] } = definition.dependencies;
  const missingAll = allOf.filter(dep => !concluded(shelter, dep));
  if (missingAll.length) return `Requer: ${missingAll.map(dep => projectDefinition(dep)?.name ?? dep).join(", ")}.`;
  if (anyOf.length && !anyOf.some(dep => concluded(shelter, dep)))
    return `Requer uma destas estruturas: ${anyOf.map(dep => projectDefinition(dep)?.name ?? dep).join(" ou ")}.`;
  return null;
}

function assignedPeople(game: GameState, shelter: ShelterState, project: ShelterProject) {
  return [project.responsibleId, ...(project.helperIds ?? [])]
    .filter((id): id is string => Boolean(id))
    .map(id => game.npcs.find(npc => npc.id === id))
    .filter((npc): npc is NPC => Boolean(npc && activePresent(game, shelter, npc.id) && canVolunteer(npc, npc.id === project.responsibleId)));
}

function baseOperational(game: GameState, shelter: ShelterState, project: ShelterProject) {
  if (project.state !== "Concluído" || projectDependencyIssue(shelter, project)) return false;
  const definition = projectDefinition(project.key);
  const mode = project.operationMode ?? definition?.operationMode ?? "passive";
  if (mode === "passive") return true;
  const requirements = project.requiredCapabilities ?? definition?.requiredCapabilities ?? [];
  if (!requirements.length) return true;
  const people = assignedPeople(game, shelter, project);
  return requirements.every(capability => people.some(npc => hasCapability(npc, capability)));
}

function energyDelta(project: ShelterProject) {
  return project.effects.reduce((sum, item) => sum + (item.energy ?? 0), 0);
}

export function shelterPower(game: GameState, shelter: ShelterState) {
  const disabled = new Set(shelter.disabledProjectKeys ?? []);
  const corrections = shelter.manualAdjustments?.energy ?? shelter.energy ?? 0;
  let production = Math.max(0, corrections);
  let consumption = Math.max(0, -corrections);
  const producers: string[] = [];
  const consumers: string[] = [];
  for (const project of shelter.projects ?? []) {
    if (!baseOperational(game, shelter, project)) continue;
    const delta = energyDelta(project);
    if (delta > 0) { production += delta; producers.push(project.key); }
    if (delta < 0 && !disabled.has(project.key)) { consumption += Math.abs(delta); consumers.push(project.key); }
  }
  return { production, consumption, balance: production - consumption, producers, consumers, disabled: [...disabled] };
}

export function projectOperational(game: GameState, shelter: ShelterState, project: ShelterProject) {
  if (!baseOperational(game, shelter, project)) return false;
  const definition = projectDefinition(project.key);
  if (!definition?.requiresPower) return true;
  if ((shelter.disabledProjectKeys ?? []).includes(project.key)) return false;
  return shelterPower(game, shelter).balance >= 0;
}

export function projectAssignmentIssue(game: GameState, shelter: ShelterState, project: ShelterProject, npcId: string, responsible: boolean) {
  const npc = game.npcs.find(candidate => candidate.id === npcId);
  if (!npc || !activePresent(game, shelter, npcId)) return "A pessoa precisa estar presente no abrigo.";
  if (npc.disposition === "Desconfiado" && !responsible && (project.buildCapabilities?.length ?? 0) === 0 && project.requiredCapabilities.length === 0) return null;
  if (npc.disposition === "Desconfiado") return "NPC Desconfiado aceita apenas tarefas básicas, sem operar estruturas ou assumir obra especializada.";
  if (!canVolunteer(npc, responsible)) return responsible ? "Apenas NPCs Aliados ou Leais assumem responsabilidade." : "NPC Hostil não assume tarefas voluntariamente.";

  if (project.state === "Em construção") {
    const conflict = shelter.projects?.find(other => other.id !== project.id && other.state === "Em construção"
      && (other.responsibleId === npcId || (other.helperIds ?? []).includes(npcId)));
    if (conflict) return `${npc.name} já está trabalhando em ${conflict.name}.`;
  }

  const requirements = project.state === "Concluído"
    ? project.requiredCapabilities
    : (project.buildCapabilities ?? projectDefinition(project.key)?.buildCapabilities ?? []);
  if (responsible && requirements.length && !requirements.some(capability => hasCapability(npc, capability)))
    return `Responsável precisa de ao menos uma destas capacidades: ${requirements.join(" ou ")}.`;
  return null;
}

export function startProject(shelter: ShelterState, project: ShelterProject) {
  if (project.state !== "Planejado") return "O projeto já foi iniciado.";
  const dependencyIssue = projectDependencyIssue(shelter, project);
  if (dependencyIssue) return dependencyIssue;
  for (const [key, quantity] of Object.entries(project.costs) as [keyof ShelterProjectCost, number][]) {
    if ((shelter[key] ?? 0) < quantity) return `Faltam ${key === "parts" ? "Peças" : key === "medications" ? "Medicamentos" : "Combustível"}.`;
  }
  for (const [key, quantity] of Object.entries(project.costs) as [keyof ShelterProjectCost, number][]) shelter[key] -= quantity;
  project.costsPaid = true;
  project.state = "Em construção";
  return null;
}

export function markProjectDamaged(project: ShelterProject) {
  if (project.state !== "Concluído") return false;
  const definition = projectDefinition(project.key);
  project.state = "Danificado";
  project.repairProgress = 0;
  project.requiredRepairProgress = definition?.repairProgress ?? Math.max(1, Math.ceil(project.requiredProgress / 2));
  project.repairCostsPaid = false;
  return true;
}

export function startRepair(shelter: ShelterState, project: ShelterProject) {
  if (project.state !== "Danificado") return "A estrutura não está danificada.";
  const definition = projectDefinition(project.key);
  const costs = definition?.repairCosts ?? { parts: 1 };
  for (const [key, quantity] of Object.entries(costs) as [keyof ShelterProjectCost, number][]) {
    if ((shelter[key] ?? 0) < quantity) return `Faltam ${key === "parts" ? "Peças" : key === "medications" ? "Medicamentos" : "Combustível"} para o reparo.`;
  }
  for (const [key, quantity] of Object.entries(costs) as [keyof ShelterProjectCost, number][]) shelter[key] -= quantity;
  project.repairProgress ??= 0;
  project.requiredRepairProgress ??= definition?.repairProgress ?? 1;
  project.repairCostsPaid = true;
  project.state = "Em construção";
  return null;
}

export function projectProgress(project: ShelterProject) {
  const repairing = project.state === "Em construção" && project.repairProgress !== undefined;
  return repairing
    ? { value: project.repairProgress ?? 0, required: project.requiredRepairProgress ?? 1, repairing: true }
    : { value: project.progress, required: project.requiredProgress, repairing: false };
}

export function advanceProject(project: ShelterProject, points = 1) {
  if (project.state !== "Em construção" || !Number.isInteger(points) || points < 1) return false;
  if (project.repairProgress !== undefined) {
    const required = project.requiredRepairProgress ?? 1;
    project.repairProgress = Math.min(required, project.repairProgress + points);
    if (project.repairProgress >= required) {
      project.state = "Concluído";
      delete project.repairProgress;
      delete project.requiredRepairProgress;
      delete project.repairCostsPaid;
    }
    return true;
  }
  project.progress = Math.min(project.requiredProgress, project.progress + points);
  if (project.progress >= project.requiredProgress) project.state = "Concluído";
  return true;
}

export function projectWorkPreview(game: GameState, shelter: ShelterState, project: ShelterProject) {
  if (project.state !== "Em construção") return { issue: "Projeto fora de construção.", workers: [] as NPC[], points: 0, missingCapabilities: [] as string[] };
  const workers = assignedPeople(game, shelter, project);
  if (!workers.length) return { issue: "Atribua pelo menos uma pessoa presente à equipe.", workers, points: 0, missingCapabilities: project.buildCapabilities ?? [] };
  const sharedWorker = workers.find(worker => shelter.projects?.some(other => other.id !== project.id && other.state === "Em construção"
    && (other.responsibleId === worker.id || (other.helperIds ?? []).includes(worker.id))));
  if (sharedWorker) return { issue: `${sharedWorker.name} está atribuído a outra obra ativa.`, workers, points: 0, missingCapabilities: [] as string[] };
  const requirements = project.buildCapabilities ?? projectDefinition(project.key)?.buildCapabilities ?? [];
  const missingCapabilities = requirements.filter(capability => !workers.some(npc => hasCapability(npc, capability)));
  if (missingCapabilities.length) return {
    issue: `Falta capacidade na equipe: ${missingCapabilities.join(" + ")}.`,
    workers,
    points: 0,
    missingCapabilities,
  };
  const specialistBonus = requirements.length ? 1 : 0;
  return { issue: null, workers, points: Math.max(1, workers.length + specialistBonus), missingCapabilities };
}

export function runShelterWorkShift(game: GameState, hours = 4) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 8) return { ok: false, message: "Duração de turno inválida.", results: [] as { key: string; name: string; points: number; completed: boolean }[] };
  if (game.minutes + hours * 60 >= 1440) return { ok: false, message: "Não há tempo suficiente neste dia. Encerre o dia antes de iniciar outro turno.", results: [] as { key: string; name: string; points: number; completed: boolean }[] };
  const active = (game.shelter.projects ?? []).filter(project => project.state === "Em construção");
  const previews = active.map(project => ({ project, preview: projectWorkPreview(game, game.shelter, project) }))
    .filter(row => !row.preview.issue && row.preview.points > 0);
  if (!previews.length) return { ok: false, message: "Nenhum projeto em obra tem uma equipe válida para trabalhar.", results: [] as { key: string; name: string; points: number; completed: boolean }[] };

  game.minutes += hours * 60;
  const results: { key: string; name: string; points: number; completed: boolean }[] = [];
  for (const { project, preview } of previews) {
    const before = projectProgress(project);
    advanceProject(project, preview.points);
    const after = projectProgress(project);
    const completed = project.state === "Concluído";
    const applied = Math.max(0, Math.min(preview.points, before.required - before.value));
    results.push({ key: project.key, name: project.name, points: applied, completed });
    addLog(game, "abrigo", completed
      ? `${project.name} foi ${before.repairing ? "reparado" : "concluído"} após um turno de ${hours}h com ${preview.workers.map(worker => worker.name).join(", ")}.`
      : `${project.name}: +${applied} progresso em ${hours}h (${after.value}/${after.required}) com ${preview.workers.map(worker => worker.name).join(", ")}.`);
  }
  return { ok: true, message: `${hours}h de trabalho registradas em ${results.length} projeto(s).`, results };
}

export function projectContributions(shelter: ShelterState, game?: GameState) {
  const values = { security: 0, energy: 0, comfort: 0, capacity: 0 };
  for (const project of shelter.projects ?? []) {
    if (project.state !== "Concluído") continue;
    if (game && !projectOperational(game, shelter, project)) continue;
    for (const item of project.effects) {
      values.security += item.security ?? 0;
      values.energy += item.energy ?? 0;
      values.comfort += item.comfort ?? 0;
      values.capacity += item.capacity ?? 0;
    }
  }
  return values;
}

export function shelterMetrics(shelter: ShelterState, game?: GameState) {
  const legacyBaseSecurity = shelter.hex ? 1 : 0;
  const savedCorrections: ShelterManualAdjustments = shelter.manualAdjustments ?? {
    security: (shelter.security ?? legacyBaseSecurity) - legacyBaseSecurity,
    energy: shelter.energy ?? 0,
    comfort: shelter.comfort ?? 0,
  };
  const corrections: ShelterManualAdjustments = {
    security: shelter.security !== legacyBaseSecurity + savedCorrections.security
      ? (shelter.security ?? legacyBaseSecurity) - legacyBaseSecurity : savedCorrections.security,
    energy: shelter.energy !== savedCorrections.energy ? (shelter.energy ?? 0) : savedCorrections.energy,
    comfort: shelter.comfort !== savedCorrections.comfort ? (shelter.comfort ?? 0) : savedCorrections.comfort,
  };
  const structures = projectContributions(shelter, game);
  const base = { security: shelter.hex ? 1 : 0, energy: 0, comfort: 0, capacity: shelter.baseCapacity ?? shelter.capacity };
  const power = game ? shelterPower(game, shelter) : null;
  return {
    security: base.security + structures.security + corrections.security,
    energy: power ? power.balance : base.energy + structures.energy + corrections.energy,
    comfort: base.comfort + structures.comfort + corrections.comfort,
    capacity: base.capacity + structures.capacity,
    base,
    structures,
    corrections,
    power,
  };
}

export function shelterRecommendations(game: GameState, shelter: ShelterState) {
  const metrics = shelterMetrics(shelter, game);
  const present = game.survivors.filter(person => (person.hex ?? game.partyHex) === shelter.hex).length
    + game.npcs.filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === shelter.hex).length
    + shelter.residents;
  const built = new Set((shelter.projects ?? []).filter(project => project.state !== "Planejado").map(project => project.key));
  const recommendations: { key: string; reason: string }[] = [];
  if (metrics.security <= 1 && !built.has("barricades")) recommendations.push({ key: "barricades", reason: "Segurança baixa; reforçar entradas reduz a vulnerabilidade da base." });
  if (present >= Math.max(1, metrics.capacity - 1) && !built.has("dormitories")) recommendations.push({ key: "dormitories", reason: "A capacidade está perto do limite; dormitórios criam 4 vagas." });
  if ((metrics.power?.production ?? metrics.energy) <= 0 && !built.has("generator") && !built.has("solar-panels")) recommendations.push({ key: "generator", reason: "A base não possui geração de energia registrada." });
  if (!built.has("infirmary")) recommendations.push({ key: "infirmary", reason: "Uma enfermaria cria um ponto próprio para tratamento e triagem." });
  return recommendations.slice(0, 3);
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
