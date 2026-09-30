import content from "./content.json";
import { revealSector, sectorProfiles, type Sector } from "./sectors";
import { equipmentModifiers, getProtection, weaponAmmoType } from "./equipment";
import { createId } from "./id";
import { transferPortionLots } from "./provisions";
import { groupedProvisionPortions } from "./provision-items";

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

export type EquipmentSlot = "primary" | "secondary" | "protection" | "personal" | "bag" | "pocket1" | "pocket2";
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

export type ShelterState = StockHolder & {
  hex: string | null; name: string; capacity: number; residents: number;
  medications: number; pistolAmmo: number; fuel: number; parts: number;
  security: number; energy: number; comfort: number; notes: string;
  inventory?: InventoryItem[];
  coldStorage?: boolean;
};
export type ShelterManifest = {
  stocks?: Partial<Pick<ShelterState, "food" | "water" | "medications" | "pistolAmmo" | "fuel" | "parts">>;
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
  personal: string;
  bag: string;
  pocket1?: string;
  pocket2?: string;
  kitCondition?: Partial<Record<EquipmentSlot, string>>;
  equippedItems?: Partial<Record<EquipmentSlot, InventoryItem>>;
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
  ammo: number;
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
    scene: 1, expedition: 1, shortRest: 1, longRest: 1, hexes, survivors: [], npcs: [], formerShelters: [],
    shelter: { hex: withShelter ? "0,0" : null,
      name: startSector ? `Abrigo — ${startSector.name}` : "Abrigo",
      capacity: withShelter ? 8 : 0, residents: 0,
      food: 0, water: 0, medications: 0, pistolAmmo: 0, fuel: 0, parts: 0,
      security: withShelter ? 1 : 0, energy: 0, comfort: 0, notes: "", inventory: [] },
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
        capacity: 8, security: 1, energy: 0, comfort: 0, notes: "" };
    }
  }
  addLog(state, "abrigo", oldHex
    ? `O grupo montou um novo abrigo em ${sector.name} (hex ${key}). A antiga base no hex ${oldHex} conserva o que não foi transportado.`
    : `O grupo estabeleceu ${state.shelter.name} em ${sector.name} (hex ${key}).`);
  return true;
}

const stockKeys = ["food", "water", "medications", "pistolAmmo", "fuel", "parts"] as const;
function emptyShelter(hex: string | null, name: string): ShelterState {
  return { hex, name, capacity: hex ? 8 : 0, residents: 0, food: 0, water: 0,
    medications: 0, pistolAmmo: 0, fuel: 0, parts: 0, security: hex ? 1 : 0,
    energy: 0, comfort: 0, notes: "", inventory: [], provisionLots: [] };
}
function validManifest(source: ShelterState, manifest: ShelterManifest) {
  return stockKeys.every(key => {
    const qty = manifest.stocks?.[key] ?? 0;
    return Number.isInteger(qty) && qty >= 0 && qty <= source[key];
  }) && Number.isInteger(manifest.residents ?? 0) && (manifest.residents ?? 0) >= 0
    && (manifest.residents ?? 0) <= source.residents
    && (manifest.itemIds ?? []).every(id => source.inventory?.some(item => item.id === id));
}
function transportShelterStock(source: ShelterState, target: ShelterState, manifest: ShelterManifest) {
  for (const key of stockKeys) {
    const qty = manifest.stocks?.[key] ?? 0;
    if (key === "food" || key === "water") transferPortionLots(source, target, key, qty);
    else { source[key] -= qty; target[key] += qty; }
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
  return (state.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.home === (home ?? undefined));
}

export function shelterPopulation(state: GameState) {
  const shelterHex = state.shelter.hex;
  const survivorsPresent = shelterHex ? survivorsAtHex(state, shelterHex).length : survivorsAtHex(state, state.partyHex).length;
  return state.shelter.residents + residentNpcs(state).length + survivorsPresent;
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
      if (receiver.ammo + quantity > 99 || (receiver.ammo > 0 && receiver.ammoType !== "Pistola")) return false;
      site.pistolAmmo -= quantity; receiver.ammo += quantity; receiver.ammoType = "Pistola";
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

export function survivorStats(s: Survivor) {
  const archetype = content.archetypes.find(a => a.name === s.archetype);
  const armor = getProtection(s.protection);
  const modifiers = equipmentModifiers(s);
  const level = Math.max(1, Math.trunc(s.level ?? 1));
  const bagBonus: Record<string, number> = { "Bolsa tiracolo": 1, "Mochila urbana": 2, "Mochila de trilha": 3, "Mochila cargueira": 4 };
  const capacity = 3 + (bagBonus[s.bag] ?? 0)
    + (s.specialty === "Carregador" ? 1 : 0)
    + (s.techniques.includes("Carga bem distribuída") ? 1 : 0);
  const foodInItems = groupedProvisionPortions(s.inventory, "food");
  const waterInItems = groupedProvisionPortions(s.inventory, "water");
  const ammoType = weaponAmmoType(s.primary);
  const firearm = ammoType !== null && (s.ammoType ?? ammoType) === ammoType;
  const load = {
    items: s.inventory.reduce((sum, item) => sum + Math.max(0, item.load) * Math.max(0, item.qty), 0),
    food: Math.floor(Math.max(0, s.food + foodInItems) / 4),
    water: Math.floor(Math.max(0, s.water + waterInItems) / 4),
    ammo: Math.max(0, s.ammo - (firearm ? 1 : 0)),
    personal: s.personal === "Kit médico de campo" || s.personal === "Kit de ferramentas de trabalho" ? 1 : 0,
  };
  const carried = Object.values(load).reduce((sum, value) => sum + value, 0);
  return {
    hp: archetype?.hp ?? 5, evasion: (archetype?.evasion ?? 10) + modifiers.evasion,
    major: armor ? armor.major + level : level, severe: armor ? armor.severe + level : level * 2,
    armor: Math.min(12, (armor?.armor ?? 0) + modifiers.armor), capacity, carried, load,
  };
}

export function initialSurvivor(input: Omit<Survivor,
  "id" | "portrait" | "level" | "proficiency" | "bag" | "hp" | "armorMarked" | "stress" | "hope" | "infection" | "exposureDeadline" | "treatmentAttempted" |
  "terminalScenes" | "food" | "water" | "ammo" | "inventory" | "notes">): Survivor {
  return { ...input, id: createId(), level: 1, proficiency: 1, bag: input.personal === "Mochila urbana" ? "Mochila urbana" : "",
    ammoType: ["Pistola", "Revólver"].includes(input.primary) ? "Pistola" : ["Espingarda", "Carabina"].includes(input.primary) ? input.primary : "Indefinida",
    hp: 0, armorMarked: 0, stress: 0, hope: 2,
    infection: "Saudável", exposureDeadline: null, treatmentAttempted: false,
    terminalScenes: 3, food: 1, water: 1,
    ammo: ["Pistola", "Revólver", "Espingarda", "Carabina"].includes(input.primary) ? 1 : 0,
    inventory: [], notes: "" };
}
