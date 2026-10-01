import content from "./content.json";
import { revealSector, sectorProfiles, type Sector } from "./sectors";
import { equipmentModifiers, getProtection, weaponAmmoType } from "./equipment";
import { createId } from "./id";
import { transferPortionLots } from "./provisions";
import { groupedProvisionPortions } from "./provision-items";
import { defaultThreatTemplates, type ThreatTemplate } from "./threats";
import type { ConflictScene, PublicConflictScene } from "./conflict";

export { content };

export type Discovery = "desconhecido" | "avistado" | "explorado";
export type Infection = "Saudável" | "Exposto" | "Infectado" | "Sintomático" | "Terminal";

export type Point = {
  id: string;
  name: string;
  kind: "local" | "comércio";
  signal: string;
  access: string;
  notes: string;
  revealed: boolean;
  searches: { id: string; what: string; why: string; sector: string; minutes: number; result: string;
    mode?: "specific" | "open"; table?: string; roll?: number }[];
};

export type HexState = {
  sector: Sector | null;
  discovery: Discovery;
  infestation: number | null;
  signs: string;
  notes: string;
  routeHours: 1 | 2;
  points: Point[];
  events: { id: string; text: string; trigger: string; revealed: boolean }[];
};

export type EquipmentSlot = "primary" | "secondary" | "protection" | "outfit" | "personal" | "bag" | "pocket1" | "pocket2";
export const ammunitionTypes = ["Pistola", "Espingarda", "Carabina", "Flechas", "Virotes", "Chumbinhos", "Outra"] as const;
export type AmmunitionType = typeof ammunitionTypes[number];

export function ammunitionItemName(type: AmmunitionType) {
  return `Munição de ${type}`;
}
export function ammunitionTypeFromName(name: string): AmmunitionType | null {
  const normalized = name.trim().toLocaleLowerCase("pt-BR");
  return ammunitionTypes.find(type => normalized === ammunitionItemName(type).toLocaleLowerCase("pt-BR")) ?? null;
}
export function ammunitionItemType(item: InventoryItem): AmmunitionType | null {
  if (item.ammunitionType && ammunitionTypes.includes(item.ammunitionType)) return item.ammunitionType;
  return ammunitionTypeFromName(item.name);
}
export function createAmmunitionItem(type: AmmunitionType, qty = 1): InventoryItem {
  return {
    id: createId(),
    name: ammunitionItemName(type),
    category: "Munição",
    catalogKey: `Munição::${ammunitionItemName(type)}`,
    condition: "Íntegro",
    load: 0,
    qty: Math.max(1, Math.min(99, Math.trunc(qty))),
    ammunitionType: type,
  };
}
export function ammunitionCount(items: InventoryItem[] | undefined, type?: AmmunitionType, availableOnly = false) {
  return (items ?? []).reduce((sum, item) => {
    const itemType = ammunitionItemType(item);
    if (!itemType || (type && itemType !== type)) return sum;
    const committed = Math.max(0, Math.min(item.qty, Math.trunc(item.committedAmmo ?? 0)));
    return sum + (availableOnly ? Math.max(0, item.qty - committed) : item.qty);
  }, 0);
}
export function ammunitionLoad(items: InventoryItem[] | undefined) {
  return ammunitionTypes.reduce((sum, type) => sum + Math.ceil(ammunitionCount(items, type) / 4), 0);
}

export function normalizeSurvivorAmmunition(survivor: Survivor) {
  survivor.inventory ??= [];
  for (const item of survivor.inventory) {
    const type = ammunitionItemType(item);
    if (type) {
      item.ammunitionType = type;
      item.category = "Munição";
      item.load = 0;
      const committed = Math.max(0, Math.min(item.qty, Math.trunc(item.committedAmmo ?? 0)));
      if (committed > 0) item.committedAmmo = committed;
      else delete item.committedAmmo;
    }
  }
  const legacy = Math.max(0, Math.trunc(survivor.ammo ?? 0));
  if (legacy > 0) {
    const legacyType = ammunitionTypes.includes(survivor.ammoType as AmmunitionType)
      ? survivor.ammoType as AmmunitionType
      : weaponAmmoType(survivor.primary);
    if (legacyType) {
      const existing = survivor.inventory.find(item => ammunitionItemType(item) === legacyType && !(item.committedAmmo ?? 0));
      if (existing && existing.qty + legacy <= 99) existing.qty += legacy;
      else survivor.inventory.push(createAmmunitionItem(legacyType, legacy));
      survivor.ammoType = legacyType;
    }
  }
  survivor.ammo = 0;
  return survivor;
}
export type InventoryItem = {
  id: string;
  name: string;
  load: number;
  qty: number;
  condition?: string;
  catalogKey?: string;
  category?: string;
  armorMarked?: number;
  foundDay?: number;
  provisionResource?: "food" | "water";
  portionsPerUnit?: number;
  portionsRemaining?: number;
  prepared?: boolean;
  verified?: boolean;
  opened?: boolean;
  expiresDay?: number;
  /** Estado simples para aparelhos pequenos que dependem de bateria. */
  battery?: "Carregada" | "Descarregada";
  /** Conteúdo de recipientes reutilizáveis, como o galão. */
  storedResource?: "water" | "fuel";
  storedAmount?: number;
  /** Carrinho dobrável aberto e sendo conduzido. Não é um slot de equipamento. */
  cartDeployed?: boolean;
  /** Itens fisicamente colocados no carrinho. O carrinho comporta até 4 espaços. */
  cartItems?: InventoryItem[];
  /** Categoria de munição quando este objeto representa uma carga física. */
  ammunitionType?: AmmunitionType;
  /** Unidades deste stack comprometidas por disparos na cena atual. Só são removidas ao trocar de cena. */
  committedAmmo?: number;
};

export type ProvisionLot = {
  id: string;
  resource: "food" | "water";
  qty: number;
  expiresDay: number;
  label: string;
};

export type StockHolder = {
  food: number; water: number; provisionLots?: ProvisionLot[];
};

export const communityCapabilities = [
  "Medicina", "Mecânica", "Construção", "Eletricidade", "Cultivo", "Cozinha",
  "Vigilância", "Comunicação", "Logística",
] as const;
export type CommunityCapability = typeof communityCapabilities[number];
export type ShelterProjectState = "Planejado" | "Em construção" | "Concluído" | "Danificado" | "Inoperante" | "Destruído";
export type ShelterProjectCategory = "Segurança" | "Sobrevivência" | "Saúde" | "Energia e infraestrutura"
  | "Comunicação" | "Produção e manutenção" | "Comunidade";
export type ShelterProjectCost = Partial<Record<"parts" | "medications" | "fuel", number>>;
/** Effects are concrete facilities first; numeric fields are only the visible shelter-state contribution. */
export type ShelterProjectEffect = {
  label: string;
  security?: number;
  energy?: number;
  comfort?: number;
  capacity?: number;
};
export type ShelterProject = {
  id: string;
  key: string;
  name: string;
  category: ShelterProjectCategory;
  state: ShelterProjectState;
  progress: number;
  requiredProgress: number;
  costs: ShelterProjectCost;
  costsPaid?: boolean;
  /** Capacidades exigidas da equipe durante a obra. */
  buildCapabilities?: string[];
  /** Capacidades exigidas quando a estrutura precisa de operação humana. */
  requiredCapabilities: string[];
  /** Passiva funciona ao concluir; staffed exige equipe; powered exige energia disponível. */
  operationMode?: "passive" | "staffed" | "powered";
  /** Estado de operação já calculado em projeções de jogador, sem expor identidades da equipe. */
  operatorReady?: boolean;
  /** Espaço físico da planta usado por instalações; melhorias de perímetro não precisam de sala. */
  slotId?: string;
  responsibleId?: string;
  helperIds?: string[];
  effects: ShelterProjectEffect[];
  /** Integridade estrutural: 3 íntegra, 2 danificada, 1 inoperante, 0 destruída. */
  integrity?: number;
  /** Progresso de tarefas recorrentes da instalação, como cultivo. */
  operationProgress?: number;
  /** Reparos usam progresso próprio sem apagar o histórico de construção. */
  repairProgress?: number;
  requiredRepairProgress?: number;
  repairCostsPaid?: boolean;
  repairFromIntegrity?: number;
  /** Sobreviventes jogadores que se ofereceram para a equipe da obra. */
  survivorWorkerIds?: string[];
  /** Turnos pessoais dos sobreviventes jogadores. São independentes do turno dos NPCs. */
  volunteerShifts?: {
    survivorId: string;
    startDay: number;
    startMinute: number;
    durationMinutes: number;
    endAbsoluteMinute: number;
    points: number;
    repairing: boolean;
    purpose?: "project" | "operation";
  }[];
  /** Turno de trabalho já programado para a equipe de NPCs. O relógio geral conclui automaticamente. */
  workShift?: {
    startDay: number;
    startMinute: number;
    durationMinutes: number;
    endAbsoluteMinute: number;
    points: number;
    workerIds: string[];
    repairing: boolean;
    purpose?: "project" | "operation";
  };
};
export type ShelterPost = {
  key: string;
  responsibleId?: string;
  helperIds?: string[];
};
export type ShelterManualAdjustments = { security: number; energy: number; comfort: number };

export type ShelterState = StockHolder & {
  hex: string | null; name: string; capacity: number; residents: number;
  medications: number; pistolAmmo: number; fuel: number; parts: number;
  /** Estoque tipado. pistolAmmo continua como espelho legado de Pistola. */
  ammoStocks?: Partial<Record<AmmunitionType, number>>;
  security: number; energy: number; comfort: number; notes: string;
  inventory?: InventoryItem[];
  coldStorage?: boolean;
  /** Persistent improvements and named operating posts. Old bases keep this snapshot too. */
  projects?: ShelterProject[];
  posts?: ShelterPost[];
  /** Deliberate GM corrections, kept apart from facilities that generate the visible state. */
  manualAdjustments?: ShelterManualAdjustments;
  /** Capacity before dormitories or other real structures are counted. */
  baseCapacity?: number;
  /** Estruturas energizadas podem ser desligadas manualmente para priorizar a rede. */
  disabledProjectKeys?: string[];
  /** Benefícios diários consumidos por sistemas do abrigo. */
  comfortRestDay?: number;
  alarmTriggeredDay?: number;
  maintenanceDiscountDay?: number;
};
export type ShelterManifest = {
  stocks?: Partial<Pick<ShelterState, "food" | "water" | "medications" | "pistolAmmo" | "fuel" | "parts">>;
  ammoStocks?: Partial<Record<AmmunitionType, number>>;
  itemIds?: string[];
  residents?: number;
  /** NPCs identificados que viajam com o manifesto. */
  npcIds?: string[];
};

export type NpcStatus = "Bem" | "Ferido" | "Grave" | "Morto" | "Desaparecido";
export type NpcDisposition = "Hostil" | "Desconfiado" | "Neutro" | "Aliado" | "Leal";
/** Uma ficha leve de personagem da campanha; não substitui uma ficha de sobrevivente. */
export type NPC = {
  id: string;
  name: string;
  portrait?: string;
  role: string;
  description: string;
  notes: string;
  publicNotes?: string;
  hex: string;
  /** Hex da base/comunidade a que pertence. Ausente quando está só em viagem. */
  home?: string;
  status: NpcStatus;
  infection: Infection;
  disposition: NpcDisposition;
  skills: string[];
  duty?: string;
  foodConsumedDay?: number;
  waterConsumedDay?: number;
  active: boolean;
  /** Quando marcado, acompanha automaticamente o grupo principal entre hexes. */
  accompaniesParty?: boolean;
  /** Pessoas que formam o grupo de campo que este NPC acompanha. */
  accompaniesSurvivorIds?: string[];
  /** Dados de encontro do mestre; nunca seguem para a projeção dos jogadores. */
  immediateNeed?: string;
  concern?: string;
  offer?: string;
};

export type Survivor = {
  id: string;
  name: string;
  portrait?: string;
  /** Posição individual. Ausente em campanhas antigas = posição do grupo principal (partyHex). */
  hex?: string;
  level?: number;
  proficiency?: number;
  origin: string;
  past: string;
  archetype: string;
  specialty: string;
  attributes: Record<string, number>;
  freeExperience: string;
  techniques: string[];
  abilityUses?: Record<string, string>;
  primary: string;
  secondary: string;
  protection: string;
  /** Traje vestido não conta novamente como carga guardada. */
  outfit?: string;
  personal: string;
  bag: string;
  /** Campo legado de campanhas antigas. O carrinho agora permanece como item no inventário. */
  transport?: string;
  pocket1?: string;
  pocket2?: string;
  kitCondition?: Partial<Record<EquipmentSlot, string>>;
  equippedItems?: Partial<Record<EquipmentSlot, InventoryItem>>;
  /** Campos legados mantidos apenas para migração de campanhas antigas. */
  ammoType?: string;
  hp: number;
  armorMarked: number;
  stress: number;
  hope: number;
  infection: Infection;
  exposureDeadline: number | null;
  treatmentAttempted: boolean;
  terminalScenes: number;
  food: number;
  water: number;
  foodConsumedDay?: number;
  waterConsumedDay?: number;
  provisionLots?: ProvisionLot[];
  /** Contador legado. Novas campanhas armazenam munição como itens físicos no inventário. */
  ammo: number;
  /** Uma unidade física compatível é comprometida na primeira ação daquele tipo durante a cena. */
  ammoSpentScene?: number;
  ammoSpentType?: string;
  ammoSpentTypes?: string[];
  inventory: InventoryItem[];
  notes: string;
  restPlan?: {
    kind: "short" | "long";
    choices: { action: string; targetId: string }[];
  };
};

export type GameState = {
  campaignId: string;
  day: number;
  minutes: number;
  partyHex: string;
  fear: number;
  noise: number;
  scene?: number;
  expedition?: number;
  shortRest?: number;
  longRest?: number;
  hexes: Record<string, HexState>;
  survivors: Survivor[];
  npcs: NPC[];
  /** Catálogo de ameaças da campanha. Ausente em campanhas antigas = catálogo-base. */
  threats?: ThreatTemplate[];
  /** Cena de conflito completa, usada pelo mestre. */
  conflict?: ConflictScene;
  /** Projeção pública efêmera enviada apenas aos jogadores; nunca é persistida pelo mestre. */
  publicConflict?: PublicConflictScene;
  shelter: ShelterState;
  formerShelters?: ShelterState[];
  log: { id: string; day: number; time: string; kind: string; text: string; actorId?: string; actorName?: string; actorPortrait?: string }[];
};

export const traits = ["Agilidade", "Força", "Finesse", "Instinto", "Presença", "Conhecimento"];

export function hexKey(q: number, r: number) { return `${q},${r}`; }
export function hexDistance(q: number, r: number) { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }

export function survivorHex(state: GameState, survivor: Survivor | string) {
  const person = typeof survivor === "string" ? state.survivors.find(entry => entry.id === survivor) : survivor;
  return person?.hex ?? state.partyHex;
}

export function survivorsAtHex(state: GameState, key: string) {
  return state.survivors.filter(person => survivorHex(state, person) === key);
}

export function survivorPositionGroups(state: GameState) {
  const groups = new Map<string, Survivor[]>();
  for (const person of state.survivors) {
    const key = survivorHex(state, person);
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }
  return [...groups.entries()].map(([hex, members]) => ({ hex, members }));
}
export function displayTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
export function absoluteMinutes(state: GameState) { return (state.day - 1) * 1440 + state.minutes; }
export function addLog(state: GameState, kind: string, text: string, actorId?: string) {
  const actor = actorId ? state.survivors.find(person => person.id === actorId) : null;
  state.log.unshift({ id: createId(), day: state.day,
    time: displayTime(state.minutes), kind, text,
    ...(actorId ? { actorId } : {}),
    ...(actor?.name ? { actorName: actor.name } : {}),
    ...(actor?.portrait ? { actorPortrait: actor.portrait } : {}) });
  state.log = state.log.slice(0, 200);
}

export function defaultState(options: { startSectorId?: string; withShelter?: boolean } = {}): GameState {
  const hexes: Record<string, HexState> = {};
  for (const area of content.hexes) {
    const distance = hexDistance(area.q, area.r);
    hexes[hexKey(area.q, area.r)] = {
      sector: null,
      discovery: distance === 0 ? "explorado" : distance === 1 ? "avistado" : "desconhecido",
      infestation: null,
      signs: "", notes: "", routeHours: 1, points: [], events: [],
    };
  }
  const chosen = sectorProfiles.find(profile => profile.id === options.startSectorId);
  if (chosen) hexes["0,0"].sector = structuredClone(chosen);
  const startSector = hexes["0,0"].sector;
  const withShelter = options.withShelter === true;
  const state: GameState = {
    campaignId: createId(), day: 1, minutes: 480, partyHex: "0,0", fear: 0, noise: 0,
    scene: 1, expedition: 1, shortRest: 1, longRest: 1, hexes, survivors: [], npcs: [], threats: defaultThreatTemplates(), formerShelters: [],
    shelter: { hex: withShelter ? "0,0" : null,
      name: startSector ? `Abrigo — ${startSector.name}` : "Abrigo",
      capacity: withShelter ? 8 : 0, residents: 0,
      food: 0, water: 0, medications: 0, pistolAmmo: 0, fuel: 0, parts: 0,
      ammoStocks: { Pistola: 0, Espingarda: 0, Carabina: 0, Flechas: 0, Virotes: 0, Chumbinhos: 0, Outra: 0 },
      security: withShelter ? 1 : 0, energy: 0, comfort: 0, notes: "", inventory: [],
      projects: [], posts: [], manualAdjustments: { security: 0, energy: 0, comfort: 0 }, baseCapacity: withShelter ? 8 : 0 },
    log: [],
  };
  const center = revealSector(state, "0,0");
  if (withShelter && !startSector) state.shelter.name = `Abrigo — ${center.name}`;
  addLog(state, "início", `A campanha começa em ${center.name}${withShelter ? `, com abrigo estabelecido` : `, sem abrigo`}.`);
  for (const area of content.hexes) {
    if (hexDistance(area.q, area.r) === 1) revealSector(state, hexKey(area.q, area.r));
  }
  return state;
}

export function resetCityPreservingSurvivors(state: GameState, options: { startSectorId?: string; withShelter?: boolean } = {}) {
  const campaignId = state.campaignId;
  const threats = state.threats === undefined ? undefined : structuredClone(state.threats);
  const survivors = structuredClone(state.survivors).map(person => {
    const preserved = normalizeSurvivorAmmunition({ ...person, hex: "0,0" } as Survivor);
    for (const item of [...preserved.inventory]) {
      const committed = Math.max(0, Math.min(item.qty, Math.trunc(item.committedAmmo ?? 0)));
      if (committed > 0) item.qty -= committed;
      delete item.committedAmmo;
      if (item.qty <= 0) preserved.inventory.splice(preserved.inventory.indexOf(item), 1);
    }
    delete preserved.restPlan;
    delete preserved.ammoSpentScene;
    delete preserved.ammoSpentType;
    delete preserved.ammoSpentTypes;
    delete preserved.abilityUses;
    return preserved;
  });
  const fresh = defaultState(options);
  fresh.campaignId = campaignId;
  fresh.survivors = survivors;
  if (threats !== undefined) fresh.threats = threats;
  if (survivors.length) addLog(fresh, "sobrevivente", `${survivors.length} sobrevivente(s) da conta foram preservados ao reiniciar a cidade.`);
  Object.assign(state, fresh);
  return survivors.length;
}

/** Shelter and survivor positions are separate; any group physically present may establish a base. */
export function establishShelter(state: GameState, key: string, manifest: ShelterManifest = {}) {
  const present = survivorsAtHex(state, key);
  if ((state.survivors.length > 0 && present.length === 0) || state.hexes[key]?.discovery !== "explorado") return false;
  const oldHex = state.shelter.hex;
  if (oldHex === key) return false;
  const sector = revealSector(state, key);
  if (oldHex) {
    if (!validManifest(state.shelter, manifest)) return false;
    const former = structuredClone(state.shelter);
    const recovered = state.formerShelters?.find(site => site.hex === key);
    const destination: ShelterState = recovered ? structuredClone(recovered) : emptyShelter(key, `Abrigo — ${sector.name}`);
    transportShelterStock(former, destination, manifest);
    transportShelterNpcs(state, oldHex, key, manifest.npcIds ?? []);
    state.formerShelters = [...(state.formerShelters ?? []).filter(site => site.hex !== key && site.hex !== oldHex), former];
    state.shelter = destination;
  } else {
    const recovered = state.formerShelters?.find(site => site.hex === key);
    if (recovered) {
      const destination = structuredClone(recovered);
      transportShelterStock(state.shelter, destination, { stocks: {
        food: state.shelter.food, water: state.shelter.water, medications: state.shelter.medications,
        pistolAmmo: state.shelter.pistolAmmo, fuel: state.shelter.fuel, parts: state.shelter.parts,
      }, itemIds: (state.shelter.inventory ?? []).map(item => item.id), residents: state.shelter.residents,
        npcIds: residentNpcs(state, null).map(npc => npc.id) });
      transportShelterNpcs(state, null, key, residentNpcs(state, null).map(npc => npc.id));
      state.shelter = destination;
      state.formerShelters = (state.formerShelters ?? []).filter(site => site.hex !== key);
    } else {
      state.shelter = { ...state.shelter, hex: key, name: `Abrigo — ${sector.name}`,
        capacity: 8, security: 1, energy: 0, comfort: 0, notes: "", projects: [], posts: [],
        manualAdjustments: { security: 0, energy: 0, comfort: 0 }, baseCapacity: 8 };
    }
  }
  addLog(state, "abrigo", oldHex
    ? `O grupo montou um novo abrigo em ${sector.name} (hex ${key}). A antiga base no hex ${oldHex} conserva o que não foi transportado.`
    : `O grupo estabeleceu ${state.shelter.name} em ${sector.name} (hex ${key}).`);
  return true;
}

const stockKeys = ["food", "water", "medications", "pistolAmmo", "fuel", "parts"] as const;

export function shelterAmmoCount(shelter: ShelterState, type: AmmunitionType) {
  const physical = ammunitionCount(shelter.inventory, type);
  if (physical > 0) return physical;
  if (type === "Pistola") return Math.max(0, Math.trunc(shelter.ammoStocks?.Pistola ?? shelter.pistolAmmo ?? 0));
  return Math.max(0, Math.trunc(shelter.ammoStocks?.[type] ?? 0));
}
export function setShelterAmmoCount(shelter: ShelterState, type: AmmunitionType, value: number) {
  const count = Math.max(0, Math.min(99, Math.trunc(value)));
  shelter.inventory ??= [];
  const stacks = shelter.inventory.filter(item => ammunitionItemType(item) === type);
  const current = stacks.reduce((sum, item) => sum + item.qty, 0);
  if (count > current) {
    const target = stacks[0];
    if (target && target.qty + (count - current) <= 99) target.qty += count - current;
    else shelter.inventory.push(createAmmunitionItem(type, count - current));
  } else if (count < current) {
    let remove = current - count;
    for (const item of [...stacks].reverse()) {
      const take = Math.min(remove, item.qty);
      item.qty -= take; remove -= take;
      if (item.qty <= 0) shelter.inventory.splice(shelter.inventory.indexOf(item), 1);
      if (!remove) break;
    }
  }
  shelter.ammoStocks ??= {};
  shelter.ammoStocks[type] = 0;
  if (type === "Pistola") shelter.pistolAmmo = 0;
}
export function normalizeShelterAmmo(shelter: ShelterState) {
  shelter.inventory ??= [];
  shelter.ammoStocks ??= {};
  for (const type of ammunitionTypes) {
    const legacy = Math.max(0, Math.trunc(shelter.ammoStocks[type] ?? (type === "Pistola" ? shelter.pistolAmmo ?? 0 : 0)));
    if (legacy > 0) {
      const existing = shelter.inventory.find(item => ammunitionItemType(item) === type && (item.committedAmmo ?? 0) === 0);
      if (existing && existing.qty + legacy <= 99) existing.qty += legacy;
      else shelter.inventory.push(createAmmunitionItem(type, legacy));
    }
    shelter.ammoStocks[type] = 0;
  }
  shelter.pistolAmmo = 0;
  return shelter;
}
function emptyShelter(hex: string | null, name: string): ShelterState {
  return { hex, name, capacity: hex ? 8 : 0, residents: 0, food: 0, water: 0,
    medications: 0, pistolAmmo: 0, fuel: 0, parts: 0,
    ammoStocks: { Pistola: 0, Espingarda: 0, Carabina: 0, Flechas: 0, Virotes: 0, Chumbinhos: 0, Outra: 0 },
    security: hex ? 1 : 0,
    energy: 0, comfort: 0, notes: "", inventory: [], provisionLots: [], projects: [], posts: [],
    manualAdjustments: { security: 0, energy: 0, comfort: 0 }, baseCapacity: hex ? 8 : 0 };
}
function validManifest(source: ShelterState, manifest: ShelterManifest) {
  return stockKeys.every(key => {
    const qty = manifest.stocks?.[key] ?? 0;
    return Number.isInteger(qty) && qty >= 0 && qty <= source[key];
  }) && ammunitionTypes.every(type => {
    const qty = manifest.ammoStocks?.[type] ?? 0;
    return Number.isInteger(qty) && qty >= 0 && qty <= shelterAmmoCount(source, type);
  }) && Number.isInteger(manifest.residents ?? 0) && (manifest.residents ?? 0) >= 0
    && (manifest.residents ?? 0) <= source.residents
    && (manifest.itemIds ?? []).every(id => source.inventory?.some(item => item.id === id));
}
function transportShelterStock(source: ShelterState, target: ShelterState, manifest: ShelterManifest) {
  for (const key of stockKeys) {
    const qty = manifest.stocks?.[key] ?? 0;
    if (key === "food" || key === "water") transferPortionLots(source, target, key, qty);
    else if (key === "pistolAmmo") {
      // Legacy manifests may still move pistolAmmo directly. New UI uses ammoStocks.
      if (!manifest.ammoStocks?.Pistola && qty > 0) {
        setShelterAmmoCount(source, "Pistola", shelterAmmoCount(source, "Pistola") - qty);
        setShelterAmmoCount(target, "Pistola", shelterAmmoCount(target, "Pistola") + qty);
      }
    } else { source[key] -= qty; target[key] += qty; }
  }
  for (const type of ammunitionTypes) {
    const qty = manifest.ammoStocks?.[type] ?? 0;
    if (!qty) continue;
    setShelterAmmoCount(source, type, shelterAmmoCount(source, type) - qty);
    setShelterAmmoCount(target, type, shelterAmmoCount(target, type) + qty);
  }
  const residents = manifest.residents ?? 0;
  source.residents -= residents; target.residents += residents;
  for (const id of new Set(manifest.itemIds ?? [])) {
    const index = (source.inventory ?? []).findIndex(item => item.id === id);
    if (index < 0) continue;
    const [item] = source.inventory!.splice(index, 1);
    target.inventory ??= [];
    target.inventory.push({ ...item, id: createId() });
  }
}

/** Identified residents are separate from the legacy numeric residents counter. */
export function residentNpcs(state: GameState, home: string | null = state.shelter.hex) {
  return (state.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.home === (home ?? undefined));
}

export function shelterPopulation(state: GameState) {
  const shelterHex = state.shelter.hex;
  const survivorsPresent = shelterHex ? survivorsAtHex(state, shelterHex).length : survivorsAtHex(state, state.partyHex).length;
  const namedPresent = (state.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido"
    && npc.hex === (shelterHex ?? state.partyHex)).length;
  return state.shelter.residents + namedPresent + survivorsPresent;
}

/** Community membership, current presence and field workers are intentionally distinct. */
export function shelterPopulationBreakdown(state: GameState, shelter: ShelterState = state.shelter) {
  const hex = shelter.hex;
  const living = (npc: NPC) => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido";
  const namedResidents = (state.npcs ?? []).filter(npc => living(npc) && npc.home === (hex ?? undefined));
  const namedPresent = (state.npcs ?? []).filter(npc => living(npc) && npc.hex === (hex ?? state.partyHex));
  const survivorsPresent = survivorsAtHex(state, hex ?? state.partyHex);
  return {
    residents: shelter.residents + namedResidents.length,
    unidentifiedResidents: shelter.residents,
    namedResidents,
    present: shelter.residents + namedPresent.length + survivorsPresent.length,
    namedPresent,
    survivorsPresent,
    field: namedResidents.filter(npc => npc.hex !== hex).length,
  };
}

function transportShelterNpcs(state: GameState, sourceHome: string | null, destinationHex: string | null, npcIds: string[]) {
  const selected = new Set(npcIds);
  for (const npc of state.npcs ?? []) {
    if (!selected.has(npc.id) || !npc.active || npc.status === "Morto" || npc.home !== (sourceHome ?? undefined)) continue;
    npc.home = destinationHex ?? undefined;
    npc.hex = destinationHex ?? state.partyHex;
    npc.accompaniesParty = destinationHex === null;
  }
}

export function abandonShelter(state: GameState, manifest: ShelterManifest = {}) {
  if (!state.shelter.hex || !validManifest(state.shelter, manifest)) return false;
  const former = structuredClone(state.shelter);
  const mobile = emptyShelter(null, "Reservas do grupo");
  transportShelterStock(former, mobile, manifest);
  transportShelterNpcs(state, state.shelter.hex, null, manifest.npcIds ?? []);
  // Residents travelling without a base are tracked in notes rather than counted as shelter occupants.
  if (mobile.residents) mobile.notes = `${mobile.residents} morador(es) acompanharam o grupo.`;
  state.formerShelters = [...(state.formerShelters ?? []).filter(site => site.hex !== former.hex), former];
  state.shelter = mobile;
  addLog(state, "abrigo", `O grupo deixou a base no hex ${former.hex}; os itens e mantimentos que não viajaram continuam registrados lá.`);
  return true;
}

export function recoverFormerStock(state: GameState, hex: string, receiverId: string, key: typeof stockKeys[number], quantity: number, itemId?: string) {
  const site = state.formerShelters?.find(s => s.hex === hex);
  const receiver = state.survivors.find(s => s.id === receiverId);
  if (!site || !receiver || survivorHex(state, receiver) !== hex) return false;
  if (itemId) {
    const index = (site.inventory ?? []).findIndex(item => item.id === itemId);
    if (index < 0) return false;
    receiver.inventory.push({ ...site.inventory!.splice(index, 1)[0], id: createId() });
  } else {
    if (!Number.isInteger(quantity) || quantity < 1 || site[key] < quantity) return false;
    if (key === "food" || key === "water") {
      if (receiver[key] + quantity > 99) return false;
      transferPortionLots(site, receiver, key, quantity);
    } else if (key === "pistolAmmo") {
      if (shelterAmmoCount(site, "Pistola") < quantity || ammunitionCount(receiver.inventory, "Pistola") + quantity > 99) return false;
      setShelterAmmoCount(site, "Pistola", shelterAmmoCount(site, "Pistola") - quantity);
      const stack = receiver.inventory.find(item => ammunitionItemType(item) === "Pistola" && !(item.committedAmmo ?? 0));
      if (stack && stack.qty + quantity <= 99) stack.qty += quantity;
      else receiver.inventory.push(createAmmunitionItem("Pistola", quantity));
    } else {
      const names = { parts: "Peças (1 unidade)", medications: "Medicamentos (1 unidade)", fuel: "Combustível (1 unidade)" };
      if (!(key in names)) return false;
      site[key] -= quantity;
      const name = names[key as keyof typeof names];
      const existing = receiver.inventory.find(item => item.name === name && item.condition === "Íntegro");
      if (existing && existing.qty + quantity <= 99) existing.qty += quantity;
      else receiver.inventory.push({ id: createId(), name, category: "Suprimentos abstratos",
        catalogKey: `Suprimentos abstratos::${name}`, condition: "Íntegro", load: 1, qty: quantity });
    }
  }
  addLog(state, "provisões", `${receiver.name} recuperou ${itemId ? "um item" : `${quantity} ${key}`} da antiga base no hex ${hex}.`, receiver.id);
  return true;
}


export function recoverFormerAmmo(state: GameState, hex: string, receiverId: string, type: AmmunitionType, quantity: number) {
  const site = state.formerShelters?.find(s => s.hex === hex);
  const receiver = state.survivors.find(s => s.id === receiverId);
  if (!site || !receiver || survivorHex(state, receiver) !== hex || !Number.isInteger(quantity) || quantity < 1) return false;
  const available = shelterAmmoCount(site, type);
  if (available < quantity || ammunitionCount(receiver.inventory, type) + quantity > 99) return false;
  setShelterAmmoCount(site, type, available - quantity);
  const stack = receiver.inventory.find(item => ammunitionItemType(item) === type && !(item.committedAmmo ?? 0));
  if (stack && stack.qty + quantity <= 99) stack.qty += quantity;
  else receiver.inventory.push(createAmmunitionItem(type, quantity));
  addLog(state, "provisões", `${receiver.name} recuperou ${quantity} unidade(s) de Munição de ${type} da antiga base no hex ${hex}.`, receiver.id);
  return true;
}

export function survivorStats(s: Survivor) {
  const archetype = content.archetypes.find(a => a.name === s.archetype);
  const armor = getProtection(s.protection);
  const modifiers = equipmentModifiers(s);
  const level = Math.max(1, Math.trunc(s.level ?? 1));
  const bagBonus: Record<string, number> = { "Bolsa tiracolo": 1, "Mochila urbana": 2, "Mochila de trilha": 3, "Mochila cargueira": 4 };
  const capacity = 3 + (bagBonus[s.bag] ?? 0)
    + (s.specialty === "Carregador" ? 1 : 0)
    + (s.techniques.includes("Carga bem distribuída") ? 1 : 0);
  const activeCart = s.inventory.find(item => item.name === "Carrinho dobrável" && item.cartDeployed);
  const looseInventory = s.inventory.filter(item => item !== activeCart);
  const foodInItems = groupedProvisionPortions(looseInventory, "food");
  const waterInItems = groupedProvisionPortions(looseInventory, "water");
  const cartItems = activeCart?.cartItems ?? [];
  const cartProvisionIds = new Set(cartItems.filter(item => item.provisionResource).map(item => item.id));
  const cartItemsLoad = cartItems
    .filter(item => !cartProvisionIds.has(item.id) && !ammunitionItemType(item))
    .reduce((sum, item) => sum + Math.max(0, item.load) * Math.max(0, item.qty), 0);
  const cartFoodLoad = Math.ceil(groupedProvisionPortions(cartItems, "food") / 4);
  const cartWaterLoad = Math.ceil(groupedProvisionPortions(cartItems, "water") / 4);
  const cartAmmoLoad = ammunitionLoad(cartItems);
  const cartCarried = cartItemsLoad + cartFoodLoad + cartWaterLoad + cartAmmoLoad;
  const load = {
    items: looseInventory.filter(item => !ammunitionItemType(item)).reduce((sum, item) => sum + Math.max(0, item.load) * Math.max(0, item.qty), 0),
    food: Math.max(0, Math.ceil((Math.max(0, s.food + foodInItems) - 2) / 4)),
    water: Math.max(0, Math.ceil((Math.max(0, s.water + waterInItems) - 2) / 4)),
    ammo: ammunitionLoad(looseInventory),
    personal: s.personal === "Kit médico de campo" || s.personal === "Kit de ferramentas de trabalho" ? 1 : 0,
  };
  const carried = Object.values(load).reduce((sum, value) => sum + value, 0);
  return {
    hp: archetype?.hp ?? 5, evasion: (archetype?.evasion ?? 10) + modifiers.evasion,
    major: armor ? armor.major + level : level, severe: armor ? armor.severe + level : level * 2,
    armor: Math.min(12, (armor?.armor ?? 0) + modifiers.armor), capacity, carried, load,
    cart: activeCart ? { id: activeCart.id, carried: cartCarried, capacity: 4 } : null,
  };
}

export function initialSurvivor(input: Omit<Survivor,
  "id" | "portrait" | "level" | "proficiency" | "bag" | "hp" | "armorMarked" | "stress" | "hope" | "infection" | "exposureDeadline" | "treatmentAttempted" |
  "terminalScenes" | "food" | "water" | "ammo" | "inventory" | "notes">): Survivor {
  const startingAmmo = weaponAmmoType(input.primary);
  return { ...input, id: createId(), level: 1, proficiency: 1, bag: input.personal === "Mochila urbana" ? "Mochila urbana" : "",
    outfit: input.outfit ?? "",
    ammoType: startingAmmo ?? "Indefinida",
    hp: 0, armorMarked: 0, stress: 0, hope: 0,
    infection: "Saudável", exposureDeadline: null, treatmentAttempted: false,
    terminalScenes: 3, food: 1, water: 1,
    ammo: 0,
    inventory: startingAmmo ? [createAmmunitionItem(startingAmmo, 1)] : [], notes: "" };
}
