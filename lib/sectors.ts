import content from "./content.json";
import { normalizeSurvivorAmmunition, type GameState, type HexState, type InventoryItem, type Survivor } from "./game";
import { createId } from "./id";
import { normalizeShelter } from "./shelter-projects";

export type Sector = { id: string; name: string; border: string; invites: string[] };

/** Snapshot retained only to display the already established sector in older saves. */
export const legacyShelterSector: Sector = {
  id: "abrigo", name: "Ginásio e abrigo",
  border: "Depósito da Linha, Mara, Joel e suprimentos do abrigo. Infestação 0.",
  invites: ["conversar sobre as necessidades do abrigo", "observar os setores vizinhos do telhado"],
};

const extraSectors: Sector[] = [
  { id: "centro-antigo", name: "Centro antigo", border: "fachadas estreitas, toldos fechados e fios entre os prédios", invites: ["seguir placas antigas", "examinar as travessas"] },
  { id: "canal", name: "Margem do canal", border: "água turva, passarelas e taludes de concreto", invites: ["verificar a passagem", "observar a corrente"] },
  { id: "conjunto", name: "Conjunto habitacional", border: "blocos repetidos, janelas e uma quadra interna", invites: ["procurar uma entrada segura", "observar sinais de moradores"] },
  { id: "universidade", name: "Área universitária", border: "pavilhões amplos, cartazes e caminhos arborizados", invites: ["seguir um corredor coberto", "examinar os prédios de apoio"] },
  { id: "feira", name: "Feira coberta", border: "bancas fechadas, lonas e acesso de carga", invites: ["examinar os corredores", "verificar a área de entregas"] },
  { id: "parque", name: "Parque linear", border: "pista entre árvores, grades e um curso d'água", invites: ["seguir a pista", "observar a margem"] },
  { id: "morro", name: "Morro de casas", border: "escadarias, telhados próximos e ruas estreitas", invites: ["subir para observar", "procurar a via de acesso"] },
  { id: "industrial", name: "Distrito industrial", border: "chaminés paradas, muros e portões de serviço", invites: ["verificar os portões", "seguir os cabos e tubulações"] },
  { id: "bairro-baixo", name: "Bairro baixo", border: "marcas de água nas paredes e móveis nas calçadas", invites: ["medir a passagem seca", "observar as casas elevadas"] },
  { id: "cemiterio", name: "Cemitério e entorno", border: "muro antigo, árvores densas e entradas laterais", invites: ["contornar o muro", "examinar os edifícios vizinhos"] },
  { id: "estacao", name: "Estação ferroviária", border: "trilhos cobertos de mato e plataforma vazia", invites: ["seguir a linha", "examinar a plataforma"] },
  { id: "obras", name: "Obras interrompidas", border: "tapumes gastos, andaimes e desvios de trânsito", invites: ["achar uma passagem entre tapumes", "observar o canteiro"] },
  { id: "zona-esportiva", name: "Área esportiva", border: "arquibancadas, alambrados e quadras ao ar livre", invites: ["examinar as entradas", "observar de cima da arquibancada"] },
  { id: "mercado-municipal", name: "Mercado municipal", border: "galpão de bancas, docas e corredores largos", invites: ["verificar os acessos", "seguir sinais de uso recente"] },
  { id: "hospitalar", name: "Distrito hospitalar", border: "prédios clínicos, uma passarela e acesso de ambulâncias", invites: ["observar as entradas", "examinar o estacionamento"] },
  { id: "rodoviario", name: "Nó rodoviário", border: "alças de viaduto, acostamentos e placas de saída", invites: ["buscar rota por baixo", "avaliar a pista elevada"] },
  { id: "porto-seco", name: "Pátio de contêineres", border: "pilhas de caixas metálicas e vias de manobra", invites: ["seguir a via de carga", "observar os espaços entre contêineres"] },
  { id: "jardins", name: "Jardins públicos", border: "canteiros abandonados, coreto e caminhos de pedra", invites: ["examinar os edifícios próximos", "procurar uma passagem aberta"] },
];

export const sectorProfiles: Sector[] = [
  ...content.hexes.filter(hex => hex.q !== 0 || hex.r !== 0).map(hex => ({
    id: `original-${hex.q},${hex.r}`, name: hex.name, border: hex.border,
    invites: [...hex.invites],
  })),
  ...extraSectors,
];

export function drawSector(hexes: Record<string, HexState>): Sector {
  const used = new Set(Object.values(hexes).map(hex => hex.sector?.id).filter(Boolean));
  const available = sectorProfiles.filter(profile => !used.has(profile.id));
  if (!available.length) throw new Error("Não há mais setores disponíveis para revelar.");
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return structuredClone(available[bytes[0] % available.length]);
}

export function revealSector(state: GameState, key: string) {
  const hex = state.hexes[key];
  if (!hex) throw new Error(`Hex desconhecido: ${key}`);
  if (!hex.sector) hex.sector = drawSector(state.hexes);
  return hex.sector;
}

/** GM override: redraw one hex without consuming custom sectors or duplicating another procedural profile. */
export function redrawSector(state: GameState, key: string) {
  const hex = state.hexes[key];
  if (!hex) throw new Error(`Hex desconhecido: ${key}`);
  const previousId = hex.sector?.id;
  const usedElsewhere = new Set(Object.entries(state.hexes)
    .filter(([hexKey]) => hexKey !== key)
    .map(([, record]) => record.sector?.id)
    .filter(Boolean));
  let available = sectorProfiles.filter(profile => !usedElsewhere.has(profile.id) && profile.id !== previousId);
  if (!available.length) available = sectorProfiles.filter(profile => !usedElsewhere.has(profile.id));
  if (!available.length) throw new Error("Não há mais setores disponíveis para revelar.");
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  hex.sector = structuredClone(available[bytes[0] % available.length]);
  return hex.sector;
}

/** GM override: names a hex directly. Custom IDs never reserve entries from the procedural pool. */
export function assignCustomSector(state: GameState, key: string, name: string) {
  const hex = state.hexes[key];
  if (!hex) throw new Error(`Hex desconhecido: ${key}`);
  const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 80);
  if (!cleanName) throw new Error("Informe um nome para o setor.");
  const sector: Sector = { id: `custom-${createId()}`, name: cleanName, border: "", invites: [] };
  hex.sector = sector;
  return sector;
}

/** Keep names that were already visible before the map became procedural. */
export function preserveKnownSectors(state: GameState) {
  if (!state.campaignId) state.campaignId = "campanha-anterior";
  // NPCs were added after the original JSON campaign format. Missing data means
  // an empty registry, never an inferred identity for legacy residents.
  if (!Array.isArray(state.npcs)) state.npcs = [];
  for (const npc of state.npcs) {
    npc.skills ??= [];
    npc.notes ??= "";
    npc.description ??= "";
    npc.role ??= "";
    npc.hex ??= state.shelter?.hex ?? state.partyHex;
    npc.status ??= "Bem";
    npc.infection ??= "Saudável";
    npc.disposition ??= "Neutro";
    npc.active ??= true;
    npc.accompaniesSurvivorIds ??= [];
  }
  for (const survivor of state.survivors ?? []) {
    survivor.inventory ??= [];
    normalizeSurvivorAmmunition(survivor);
    const legacy = survivor as Survivor & {
      transport?: string;
      equippedItems?: Record<string, InventoryItem>;
      kitCondition?: Record<string, string>;
    };
    if (legacy.transport === "Carrinho dobrável"
      && !survivor.inventory.some(item => item.name === "Carrinho dobrável")) {
      const previous = legacy.equippedItems?.transport;
      survivor.inventory.push({
        ...(previous ?? {}),
        id: previous?.id ?? createId(),
        name: "Carrinho dobrável",
        load: 1,
        qty: 1,
        condition: previous?.condition ?? legacy.kitCondition?.transport ?? "Íntegro",
        category: previous?.category ?? "Abrigo, transporte e mochilas",
        cartDeployed: false,
        cartItems: [],
      });
    }
    delete legacy.transport;
    if (legacy.equippedItems) delete legacy.equippedItems.transport;
    if (legacy.kitCondition) delete legacy.kitCondition.transport;
    for (const cart of survivor.inventory.filter(item => item.name === "Carrinho dobrável")) {
      cart.cartDeployed ??= false;
      cart.cartItems ??= [];
    }
  }

  // Older campaigns had a shelter in the central gym, without an explicit location.
  const previousShelter = state.shelter as GameState["shelter"] & { hex?: string | null };
  if (previousShelter && previousShelter.hex === undefined) previousShelter.hex = "0,0";
  if (state.shelter) normalizeShelter(state.shelter);
  for (const shelter of state.formerShelters ?? []) normalizeShelter(shelter);
  for (const area of content.hexes) {
    const key = `${area.q},${area.r}`;
    const hex = state.hexes[key];
    if (!hex || hex.sector !== undefined) continue;
    const established = hex.discovery !== "desconhecido" || Boolean(hex.points?.length || hex.events?.length || hex.signs);
    hex.sector = key === "0,0" ? structuredClone(legacyShelterSector) : established
      ? { id: `original-${key}`, name: area.name, border: area.border, invites: [...area.invites] }
      : null;
  }
  return state;
}
