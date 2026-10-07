import content from "./content.json";
import { normalizeSurvivorAmmunition, type GameState, type HexState, type InventoryItem, type Survivor } from "./game";
import { createId } from "./id";
import { normalizeShelter } from "./shelter-projects";
import { defaultTerrainForCoordinate, inferTerrainFromSector, type Terrain } from "./world";

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

const landscapes: Record<Exclude<Terrain, "urban">, { names: string[]; border: string; invites: string[] }> = {
  suburban: {
    names: ["Bairro residencial", "Conjunto de casas", "Loteamento silencioso", "Faixa suburbana"],
    border: "casas baixas, muros, pequenos comércios e ruas residenciais",
    invites: ["examinar as casas", "seguir a via principal do bairro"],
  },
  industrial: {
    names: ["Zona fabril", "Pátio logístico", "Cinturão de galpões", "Complexo fabril"],
    border: "galpões, portões largos, pátios de carga e infraestrutura técnica",
    invites: ["verificar os portões de serviço", "seguir as vias de carga"],
  },
  rural: { names: ["Campos abandonados", "Sítios isolados", "Pastagens vazias", "Pomar esquecido"], border: "cercas gastas, caminhos de terra e construções espaçadas", invites: ["observar as construções", "seguir os caminhos entre os campos"] },
  forest: { names: ["Mata fechada", "Clareira silenciosa", "Bosque antigo", "Vale arborizado"], border: "copas densas, vegetação e sinais de passagem no chão", invites: ["examinar os rastros", "buscar uma passagem entre as árvores"] },
  open: {
    names: ["Terrenos abertos", "Parque abandonado", "Campos urbanos", "Área de lazer vazia"],
    border: "vegetação baixa, espaços expostos e poucas estruturas oferecendo cobertura",
    invites: ["observar o terreno de longe", "procurar estruturas nas bordas"],
  },
  roadway: {
    names: ["Trevo rodoviário", "Faixa de acesso", "Corredor de viadutos", "Terminal de estrada"],
    border: "pistas, acostamentos, rampas, placas e veículos abandonados",
    invites: ["avaliar a pista transitável", "examinar postos e acessos laterais"],
  },
  swamp: { names: ["Margem alagada", "Várzea silenciosa", "Canal tomado", "Faixa de mangue"], border: "água parada, vegetação úmida e trechos descontínuos de solo firme", invites: ["testar o terreno", "observar os canais de água"] },
  mountain: { names: ["Encosta rochosa", "Passo da serra", "Vale pedregoso", "Crista elevada"], border: "rochas expostas, desníveis e vento entre os morros", invites: ["avaliar a subida", "procurar um ponto de observação"] },
};

function generatedSector(terrain: Terrain): Sector {
  const landscape = terrain === "urban" ? null : landscapes[terrain];
  const urban = sectorProfiles[crypto.getRandomValues(new Uint32Array(1))[0] % sectorProfiles.length];
  const index = crypto.getRandomValues(new Uint32Array(1))[0];
  return {
    id: `generated-${createId()}`,
    name: landscape ? landscape.names[index % landscape.names.length] : urban.name,
    border: landscape?.border ?? urban.border,
    invites: [...(landscape?.invites ?? urban.invites)],
  };
}

export function drawSector(hexes: Record<string, HexState>, terrain: Terrain = "urban"): Sector {
  if (terrain !== "urban") return generatedSector(terrain);
  const used = new Set(Object.values(hexes).map(hex => hex.sector?.id).filter(Boolean));
  const available = sectorProfiles.filter(profile => !used.has(profile.id));
  // A landscape can recur in a larger world; its identity and saved details cannot.
  if (!available.length) return generatedSector(terrain);
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return structuredClone(available[bytes[0] % available.length]);
}

export function revealSector(state: GameState, key: string) {
  const hex = state.hexes[key];
  if (!hex) throw new Error(`Hex desconhecido: ${key}`);
  if (!hex.sector) hex.sector = drawSector(state.hexes, hex.terrain ?? "urban");
  return hex.sector;
}

/** GM override: redraw one hex without consuming custom sectors or duplicating another procedural profile. */
export function redrawSector(state: GameState, key: string) {
  const hex = state.hexes[key];
  if (!hex) throw new Error(`Hex desconhecido: ${key}`);
  if (hex.terrain && hex.terrain !== "urban") {
    hex.sector = generatedSector(hex.terrain);
    return hex.sector;
  }
  const previousId = hex.sector?.id;
  const usedElsewhere = new Set(Object.entries(state.hexes)
    .filter(([hexKey]) => hexKey !== key)
    .map(([, record]) => record.sector?.id)
    .filter(Boolean));
  let available = sectorProfiles.filter(profile => !usedElsewhere.has(profile.id) && profile.id !== previousId);
  if (!available.length) available = sectorProfiles.filter(profile => !usedElsewhere.has(profile.id));
  if (!available.length) {
    hex.sector = generatedSector("urban");
    return hex.sector;
  }
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
  for (const [key, hex] of Object.entries(state.hexes)) {
    if (hex.terrain) continue;
    const [q, r] = key.split(",").map(Number);
    hex.terrain = hex.sector
      ? inferTerrainFromSector(`${hex.sector.name} ${hex.sector.border}`)
      : defaultTerrainForCoordinate(q, r);
  }
  return state;
}
