import { absoluteMinutes, addLog, content, displayTime, normalizeShelterAmmo, survivorHex, type GameState, type NPC, type ShelterManualAdjustments, type ShelterPost, type ShelterProject, type ShelterProjectCategory, type ShelterProjectCost, type ShelterProjectEffect, type ShelterState, type Survivor } from "./game";
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
  operationWork?: { label: string; requiredProgress: number; output: Partial<Record<"food" | "water" | "parts", number>>; capability?: string };
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
  { key: "garden", name: "Horta", category: "Sobrevivência", kind: "facility", zone: "exterior", requiredProgress: 4, costs: { parts: 2 }, buildCapabilities: ["Construção"], ...staffed(["Cultivo"]), repairCosts: { parts: 1 }, repairProgress: 2, operationWork: { label: "Cultivar", requiredProgress: 4, output: { food: 2 }, capability: "Cultivo" }, effects: [effect("Área de cultivo comunitário")] },
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

export const shelterMechanicalBenefits: Record<string, string[]> = {
  barricades: ["+1 Segurança enquanto estiver funcional."],
  "reinforced-gate": ["+1 Segurança.", "Reduz em 1 o Impacto de invasões enquanto estiver funcional."],
  watchpost: ["+1 Segurança quando houver operador com Vigilância."],
  "exterior-lighting": ["+1 Segurança enquanto houver energia."],
  "improvised-alarm": ["A primeira invasão ou sabotagem do dia sofre −1 Impacto."],
  "evacuation-route": ["Mantém uma rota alternativa preparada para eventos de evacuação."],
  cistern: ["Reserva física para sistemas de água; não cria água automaticamente."],
  "water-filter": ["Infraestrutura de tratamento de água; não cria água automaticamente."],
  "community-kitchen": ["+1 Conforto quando operada."],
  pantry: ["Organiza estoque seco; conservação específica será aplicada apenas a itens compatíveis."],
  garden: ["4 pontos de trabalho de Cultivo produzem 2 porções de Comida."],
  "rain-collector": ["Captação preparada; produção depende de chuva/evento e não é automática."],
  refrigeration: ["Conserva automaticamente alimentos refrigeráveis no depósito enquanto estiver operacional e energizada."],
  infirmary: ["+1 Conforto e infraestrutura para tratamento médico."],
  quarantine: ["Infraestrutura para isolamento de casos de infecção."],
  "medical-stock": ["Infraestrutura para organização de medicamentos."],
  "recovery-space": ["+1 Conforto e +1 Capacidade."],
  generator: ["+1 Energia enquanto estiver operacional."],
  "solar-panels": ["+1 Energia enquanto estiver funcional."],
  "battery-bank": ["+1 Energia de reserva enquanto estiver funcional."],
  "electrical-workshop": ["+1 progresso em turnos de reparo de estruturas elétricas."],
  "interior-lighting": ["+1 Conforto enquanto houver energia."],
  "fixed-radio": ["Habilita comunicação fixa enquanto houver energia e operador."],
  "elevated-antenna": ["Infraestrutura para ampliar comunicações futuras."],
  "communications-room": ["Infraestrutura para coordenação de comunicações."],
  "route-board": ["Registra rotas conhecidas para futuras ações de logística."],
  workshop: ["A primeira reparação paga iniciada no dia custa 1 Peça a menos, mínimo 0."],
  garage: ["Infraestrutura de manutenção para futuros veículos."],
  "tool-bench": ["+1 progresso em qualquer turno de reparo realizado no abrigo."],
  recycling: ["Infraestrutura para reciclagem; não gera Peças sem matéria-prima."],
  dormitories: ["+4 Capacidade e +1 Conforto."],
  "community-kitchen-space": ["+1 Conforto."],
  refectory: ["+1 Conforto."],
  "common-area": ["+1 Conforto."],
  "improvised-school": ["Infraestrutura para treinamento comunitário futuro."],
  "social-space": ["+1 Conforto."],
};

export function projectMechanicalBenefits(key: string) {
  return shelterMechanicalBenefits[key] ?? [];
}

export const shelterPostCatalog = [
  { key: "vigilance", name: "Vigilância", capability: "Vigilância", projects: [] },
  { key: "infirmary", name: "Enfermaria", capability: "Medicina", projects: ["infirmary"] },
  { key: "kitchen", name: "Cozinha", capability: "Cozinha", projects: ["community-kitchen"] },
  { key: "maintenance", name: "Manutenção", capability: "Mecânica", projects: ["workshop", "garage", "electrical-workshop"] },
  { key: "communications", name: "Comunicações", capability: "Comunicação", projects: ["fixed-radio", "communications-room"] },
  { key: "logistics", name: "Logística", capability: "Logística", projects: ["pantry", "route-board"] },
] as const;

export function projectDefinition(key: string) { return shelterProjectCatalog.find(project => project.key === key); }

export const shelterProjectMaxIntegrity = 3;

export function projectIntegrity(project: ShelterProject) {
  if (project.integrity !== undefined) return Math.max(0, Math.min(shelterProjectMaxIntegrity, Math.trunc(project.integrity)));
  if (project.state === "Destruído") return 0;
  if (project.state === "Inoperante") return 1;
  if (project.state === "Danificado") return 2;
  return shelterProjectMaxIntegrity;
}

export function projectIntegrityLabel(project: ShelterProject) {
  const integrity = projectIntegrity(project);
  if (integrity >= 3) return "Íntegra";
  if (integrity === 2) return "Danificada";
  if (integrity === 1) return "Inoperante";
  return "Destruída";
}

function syncProjectIntegrityState(project: ShelterProject) {
  const integrity = projectIntegrity(project);
  project.integrity = integrity;
  if (project.repairProgress !== undefined || project.state === "Em construção" || project.state === "Planejado") return integrity;
  project.state = integrity >= 3 ? "Concluído" : integrity === 2 ? "Danificado" : integrity === 1 ? "Inoperante" : "Destruído";
  return integrity;
}

export function applyProjectDamage(project: ShelterProject, points = 1) {
  if (!Number.isInteger(points) || points < 1) return 0;
  if (!["Concluído", "Danificado", "Inoperante"].includes(project.state)) return 0;
  const before = projectIntegrity(project);
  const after = Math.max(0, before - points);
  if (after === before) return 0;
  project.integrity = after;
  project.state = after >= 3 ? "Concluído" : after === 2 ? "Danificado" : after === 1 ? "Inoperante" : "Destruído";
  delete project.workShift;
  project.volunteerShifts = [];
  delete project.repairProgress;
  delete project.requiredRepairProgress;
  delete project.repairCostsPaid;
  delete project.repairFromIntegrity;
  return before - after;
}

export function projectPlacementIssue(shelter: ShelterState, projectOrKey: ShelterProject | string) {
  const project = typeof projectOrKey === "string" ? shelter.projects?.find(entry => entry.key === projectOrKey) : projectOrKey;
  const key = typeof projectOrKey === "string" ? projectOrKey : projectOrKey.key;
  const definition = projectDefinition(key);
  if (!definition || definition.kind !== "facility") return null;
  if (!project?.slotId) return "Escolha um local na planta antes de iniciar esta instalação.";
  const slot = shelterBlueprintSlots.find(entry => entry.id === project.slotId);
  if (!slot) return "O local salvo para esta instalação não existe mais na planta.";
  if (definition.zone && slot.zone !== definition.zone) return `Esta instalação precisa de uma área ${definition.zone === "interior" ? "interna" : definition.zone === "utility" ? "técnica" : "externa"}.`;
  const conflict = shelter.projects?.find(other => other.id !== project.id && other.slotId === project.slotId);
  if (conflict) return `${slot.label} já está ocupado por ${conflict.name}.`;
  return null;
}

export function placeShelterProject(shelter: ShelterState, project: ShelterProject, slotId: string) {
  const definition = projectDefinition(project.key);
  const slot = shelterBlueprintSlots.find(entry => entry.id === slotId);
  if (!definition || definition.kind !== "facility") return "Esta melhoria não ocupa um espaço da planta.";
  if (!slot) return "Espaço da planta inválido.";
  if (definition.zone && slot.zone !== definition.zone) return `Escolha uma área ${definition.zone === "interior" ? "interna" : definition.zone === "utility" ? "técnica" : "externa"}.`;
  const conflict = shelter.projects?.find(other => other.id !== project.id && other.slotId === slotId);
  if (conflict) return `${slot.label} já está ocupado por ${conflict.name}.`;
  if (project.slotId && project.slotId !== slotId && project.state !== "Planejado")
    return "Só é possível mover uma instalação já posicionada antes do início da obra.";
  project.slotId = slotId;
  return null;
}


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
    integrity: shelterProjectMaxIntegrity,
    operationProgress: 0,
    costs: structuredClone(definition.costs),
    buildCapabilities: [...(definition.buildCapabilities ?? [])],
    requiredCapabilities: [...(definition.requiredCapabilities ?? [])],
    operationMode: definition.operationMode ?? "passive",
    slotId,
    effects: structuredClone(definition.effects),
    helperIds: [],
    survivorWorkerIds: [],
    volunteerShifts: [],
  } : null;
}

export function normalizeShelter(shelter: ShelterState) {
  normalizeShelterAmmo(shelter);
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
    project.integrity = project.state === "Planejado" || (project.state === "Em construção" && project.repairProgress === undefined)
      ? shelterProjectMaxIntegrity
      : projectIntegrity(project);
    if (!["Planejado", "Em construção"].includes(project.state)) syncProjectIntegrityState(project);
    project.operationProgress = Math.max(0, Math.trunc(project.operationProgress ?? 0));
    project.progress = Math.max(0, Math.trunc(project.progress ?? 0));
    project.requiredProgress = Math.max(1, Math.trunc(project.requiredProgress ?? definition?.requiredProgress ?? 1));
    project.costs ??= structuredClone(definition?.costs ?? {});
    project.buildCapabilities ??= [...(definition?.buildCapabilities ?? [])];
    project.requiredCapabilities ??= [...(definition?.requiredCapabilities ?? [])];
    project.operationMode ??= definition?.operationMode ?? "passive";
    project.effects ??= structuredClone(definition?.effects ?? []);
    project.helperIds ??= [];
    project.survivorWorkerIds = [...new Set((project.survivorWorkerIds ?? []).filter(id => typeof id === "string"))];
    project.volunteerShifts = (project.volunteerShifts ?? []).filter(shift => shift && typeof shift.survivorId === "string").map(shift => ({
      ...shift,
      durationMinutes: Math.max(60, Math.trunc(shift.durationMinutes ?? 240)),
      endAbsoluteMinute: Math.max(0, Math.trunc(shift.endAbsoluteMinute ?? 0)),
      points: Math.max(1, Math.trunc(shift.points ?? 1)),
      repairing: Boolean(shift.repairing),
    }));
    if (project.workShift) {
      project.workShift.durationMinutes = Math.max(60, Math.trunc(project.workShift.durationMinutes ?? 240));
      project.workShift.points = Math.max(1, Math.trunc(project.workShift.points ?? 1));
      project.workShift.workerIds ??= [];
      project.workShift.repairing = Boolean(project.workShift.repairing);
    }
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

function normalizeWorkText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

const survivorCapabilityKeywords: Record<string, string[]> = {
  "Construção": ["constr", "pedreir", "carpint", "engenh", "arquitet", "obra"],
  "Eletricidade": ["eletric", "eletron", "energia"],
  "Mecânica": ["mecanic", "motor", "automot", "manutenc"],
  "Medicina": ["medic", "enferm", "socor", "saude", "paramed"],
  "Logística": ["logist", "estoque", "almox", "supriment", "organiz"],
  "Vigilância": ["vigil", "segur", "guarda", "polic", "militar"],
  "Cozinha": ["cozinh", "culin", "chef"],
  "Cultivo": ["cultiv", "agric", "hort", "jardin"],
  "Comunicação": ["comunic", "radio", "jornal", "midia", "oratoria"],
};

export function survivorShelterCapabilities(survivor: Survivor) {
  const originExperience = content.origins.find(origin => origin.name === survivor.origin)?.experience ?? "";
  const sources = [originExperience, survivor.freeExperience].filter(Boolean);
  const normalized = sources.map(normalizeWorkText);
  return Object.entries(survivorCapabilityKeywords)
    .filter(([capability, keywords]) => normalized.some(source => source.includes(normalizeWorkText(capability))
      || keywords.some(keyword => source.includes(keyword))))
    .map(([capability]) => capability);
}

export function survivorActiveShelterShift(game: GameState, survivorId: string) {
  const now = absoluteMinutes(game);
  for (const project of game.shelter.projects ?? []) {
    const shift = (project.volunteerShifts ?? []).find(entry => entry.survivorId === survivorId && entry.endAbsoluteMinute > now);
    if (shift) return { project, shift };
  }
  return null;
}

export function survivorShelterWorkIssue(game: GameState, project: ShelterProject, survivorId: string) {
  const survivor = game.survivors.find(person => person.id === survivorId);
  if (!survivor) return "Sobrevivente não encontrado.";
  if (!game.shelter.hex || survivorHex(game, survivor) !== game.shelter.hex) return "Seu personagem precisa estar no abrigo para trabalhar aqui.";
  if (!["Planejado", "Em construção"].includes(project.state)) return "Esta estrutura não está aceitando trabalhadores agora.";
  const active = survivorActiveShelterShift(game, survivorId);
  if (active && active.project.id !== project.id) return `Você já está trabalhando em ${active.project.name} até ${displayTime(active.shift.startMinute + active.shift.durationMinutes)}.`;
  return null;
}

export function joinShelterProjectAsSurvivor(game: GameState, project: ShelterProject, survivorId: string) {
  const issue = survivorShelterWorkIssue(game, project, survivorId);
  if (issue) return issue;
  project.survivorWorkerIds ??= [];
  if (!project.survivorWorkerIds.includes(survivorId)) project.survivorWorkerIds.push(survivorId);
  return null;
}

export function leaveShelterProjectAsSurvivor(game: GameState, project: ShelterProject, survivorId: string) {
  if ((project.volunteerShifts ?? []).some(shift => shift.survivorId === survivorId))
    return "Cancele seu turno antes de sair da equipe.";
  project.survivorWorkerIds = (project.survivorWorkerIds ?? []).filter(id => id !== survivorId);
  return null;
}

export function survivorWorkPreview(game: GameState, project: ShelterProject, survivorId: string) {
  const issue = survivorShelterWorkIssue(game, project, survivorId);
  const survivor = game.survivors.find(person => person.id === survivorId);
  if (issue || !survivor) return { issue: issue ?? "Sobrevivente não encontrado.", points: 0, capabilities: [] as string[], matches: [] as string[] };
  if (project.state !== "Em construção") return { issue: "A obra ainda precisa ser iniciada pelo mestre.", points: 0, capabilities: survivorShelterCapabilities(survivor), matches: [] as string[] };
  if (!(project.survivorWorkerIds ?? []).includes(survivorId))
    return { issue: "Entre na equipe desta obra antes de programar um turno.", points: 0, capabilities: survivorShelterCapabilities(survivor), matches: [] as string[] };
  const capabilities = survivorShelterCapabilities(survivor);
  const requirements = project.buildCapabilities ?? projectDefinition(project.key)?.buildCapabilities ?? [];
  const matches = requirements.filter(capability => capabilities.includes(capability));
  return { issue: null, points: 1 + (matches.length ? 1 : 0), capabilities, matches };
}

export function scheduleSurvivorWorkShift(game: GameState, project: ShelterProject, survivorId: string, hours = 4) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 8) return { ok: false, message: "Duração de turno inválida." };
  if (game.minutes + hours * 60 >= 1440) return { ok: false, message: "Este turno terminaria depois do fim do dia." };
  if ((project.volunteerShifts ?? []).some(shift => shift.survivorId === survivorId))
    return { ok: false, message: "Você já tem um turno programado nesta obra." };
  const preview = survivorWorkPreview(game, project, survivorId);
  if (preview.issue || preview.points < 1) return { ok: false, message: preview.issue ?? "Não foi possível programar seu turno." };
  const durationMinutes = hours * 60;
  project.volunteerShifts ??= [];
  project.volunteerShifts.push({
    survivorId,
    startDay: game.day,
    startMinute: game.minutes,
    durationMinutes,
    endAbsoluteMinute: absoluteMinutes(game) + durationMinutes,
    points: preview.points,
    repairing: Boolean(project.repairProgress !== undefined),
  });
  return { ok: true, message: `Seu turno foi programado até ${displayTime(game.minutes + durationMinutes)}.`, preview };
}

export function cancelSurvivorWorkShift(project: ShelterProject, survivorId: string) {
  const before = project.volunteerShifts?.length ?? 0;
  project.volunteerShifts = (project.volunteerShifts ?? []).filter(shift => shift.survivorId !== survivorId);
  return (project.volunteerShifts?.length ?? 0) < before;
}

export function canVolunteer(npc: NPC, responsibility = false) {
  if (!npc.active || npc.status === "Morto" || npc.status === "Desaparecido" || npc.disposition === "Hostil") return false;
  if (responsibility) return npc.disposition === "Aliado" || npc.disposition === "Leal";
  return npc.disposition !== "Desconfiado";
}

function concluded(shelter: ShelterState, key: string) {
  return Boolean(shelter.projects?.some(project => project.key === key && ["Concluído", "Danificado"].includes(project.state) && projectIntegrity(project) >= 2));
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

export function projectBaseOperational(game: GameState, shelter: ShelterState, project: ShelterProject) {
  if (!["Concluído", "Danificado"].includes(project.state) || projectIntegrity(project) < 2 || projectDependencyIssue(shelter, project)) return false;
  if (project.operatorReady !== undefined) return project.operatorReady;
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
    if (!projectBaseOperational(game, shelter, project)) continue;
    const delta = energyDelta(project);
    if (delta > 0) { production += delta; producers.push(project.key); }
    if (delta < 0 && !disabled.has(project.key)) { consumption += Math.abs(delta); consumers.push(project.key); }
  }
  return { production, consumption, balance: production - consumption, producers, consumers, disabled: [...disabled] };
}

export function projectOperational(game: GameState, shelter: ShelterState, project: ShelterProject) {
  if (!projectBaseOperational(game, shelter, project)) return false;
  const definition = projectDefinition(project.key);
  if (!definition?.requiresPower) return true;
  if ((shelter.disabledProjectKeys ?? []).includes(project.key)) return false;
  return shelterPower(game, shelter).balance >= 0;
}

export function projectAssignmentIssue(game: GameState, shelter: ShelterState, project: ShelterProject, npcId: string, responsible: boolean) {
  if (project.workShift) return "Cancele o turno em andamento antes de alterar a equipe.";
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
  const placementIssue = projectPlacementIssue(shelter, project);
  if (placementIssue) return placementIssue;
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
  const specialistBonus = requirements.length > 0 && missingCapabilities.length === 0 ? 1 : 0;
  return { issue: null, workers, points: Math.max(1, workers.length + specialistBonus), missingCapabilities };
}

export function scheduleShelterWorkShift(game: GameState, project: ShelterProject, hours = 4) {
  if (project.state !== "Em construção") return { ok: false, message: "Inicie a obra antes de programar um turno." };
  const placementIssue = projectPlacementIssue(game.shelter, project);
  if (placementIssue) return { ok: false, message: placementIssue };
  if (project.workShift) return { ok: false, message: "Já existe um turno de trabalho programado para este projeto." };
  if (!Number.isInteger(hours) || hours < 1 || hours > 8) return { ok: false, message: "Duração de turno inválida." };
  if (game.minutes + hours * 60 >= 1440) return { ok: false, message: "Este turno terminaria depois do fim do dia. Encerre o dia ou escolha outro horário." };
  const preview = projectWorkPreview(game, game.shelter, project);
  if (preview.issue || preview.points < 1) return { ok: false, message: preview.issue ?? "A equipe não consegue trabalhar neste projeto." };
  const start = absoluteMinutes(game);
  const durationMinutes = hours * 60;
  project.workShift = {
    startDay: game.day,
    startMinute: game.minutes,
    durationMinutes,
    endAbsoluteMinute: start + durationMinutes,
    points: preview.points,
    workerIds: preview.workers.map(worker => worker.id),
    repairing: Boolean(project.repairProgress !== undefined),
  };
  addLog(game, "abrigo", `Turno programado em ${project.name}: ${displayTime(game.minutes)}–${displayTime(game.minutes + durationMinutes)}, equipe ${preview.workers.map(worker => worker.name).join(", ")}.`);
  return { ok: true, message: `Turno programado até ${displayTime(game.minutes + durationMinutes)}.`, preview };
}

export function cancelShelterWorkShift(game: GameState, project: ShelterProject) {
  if (!project.workShift) return false;
  delete project.workShift;
  addLog(game, "abrigo", `Turno de trabalho cancelado em ${project.name}.`);
  return true;
}

export function processScheduledShelterWork(game: GameState) {
  const now = absoluteMinutes(game);
  const completed: { key: string; name: string; points: number; completed: boolean }[] = [];

  const dueNpc = (game.shelter.projects ?? [])
    .filter(project => project.workShift && project.workShift.endAbsoluteMinute <= now)
    .sort((a, b) => (a.workShift?.endAbsoluteMinute ?? 0) - (b.workShift?.endAbsoluteMinute ?? 0));
  for (const project of dueNpc) {
    const shift = project.workShift;
    if (!shift) continue;
    const before = projectProgress(project);
    const points = project.state === "Em construção" ? Math.max(0, Math.min(shift.points, before.required - before.value)) : 0;
    if (points > 0) advanceProject(project, points);
    const finished = project.state === "Concluído";
    const workers = shift.workerIds.map(id => game.npcs.find(npc => npc.id === id)?.name).filter(Boolean);
    delete project.workShift;
    if (finished) project.volunteerShifts = [];
    completed.push({ key: project.key, name: project.name, points, completed: finished });
    addLog(game, "abrigo", finished
      ? `${project.name} foi ${shift.repairing ? "reparado" : "concluído"} ao fim do turno programado${workers.length ? ` com ${workers.join(", ")}` : ""}.`
      : `${project.name}: +${points} progresso no turno programado (${projectProgress(project).value}/${projectProgress(project).required}).`);
  }

  const volunteerDue = (game.shelter.projects ?? []).flatMap(project =>
    (project.volunteerShifts ?? [])
      .filter(shift => shift.endAbsoluteMinute <= now)
      .map(shift => ({ project, shift })))
    .sort((a, b) => a.shift.endAbsoluteMinute - b.shift.endAbsoluteMinute);

  for (const { project, shift } of volunteerDue) {
    if (!(project.volunteerShifts ?? []).includes(shift)) continue;
    const survivor = game.survivors.find(person => person.id === shift.survivorId);
    const before = projectProgress(project);
    const points = project.state === "Em construção" ? Math.max(0, Math.min(shift.points, before.required - before.value)) : 0;
    if (points > 0) advanceProject(project, points);
    const finished = project.state === "Concluído";
    project.volunteerShifts = (project.volunteerShifts ?? []).filter(entry => entry !== shift);
    if (finished) {
      project.volunteerShifts = [];
      delete project.workShift;
    }
    completed.push({ key: project.key, name: project.name, points, completed: finished });
    addLog(game, "abrigo", points > 0
      ? `${survivor?.name ?? "Um sobrevivente"} trabalhou em ${project.name}: +${points} progresso${finished ? " e a obra foi concluída" : ""}.`
      : `O turno de ${survivor?.name ?? "um sobrevivente"} em ${project.name} terminou sem progresso adicional.`,
      survivor?.id);
  }

  return completed;
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
