import eventDefinitions from "./event-guide-definitions.json";
import content from "./content.json";
import type { GameState, HexEvent, Point } from "./game";
import type { Terrain } from "./world";

export type HexGeneratorKind = "locais" | "comercios" | "eventos";
export type GeneratorCategory =
  | "residencial" | "institucional" | "industrial" | "aberto" | "especial"
  | "alimentos" | "saude" | "ferramentas" | "veiculos" | "servicos"
  | "pista" | "pessoas" | "ambiente" | "oportunidade" | "ameaca";

export type GeneratedHexContent = {
  kind: HexGeneratorKind;
  roll: number;
  text: string;
  publicText: string;
  gmGuidance: string;
  category: GeneratorCategory;
  categoryLabel: string;
  contextLabel: string;
  suggestedLootTable?: string;
  suggestedCondition?: string;
  suggestedRisk?: string;
  suggestedAccess?: string;
  suggestedTriggerType?: NonNullable<HexEvent["triggerType"]>;
  suggestedTriggerValue?: number;
};

const categoryLabels: Record<GeneratorCategory, string> = {
  residencial: "Residencial",
  institucional: "Institucional",
  industrial: "Industrial / logística",
  aberto: "Área aberta / infraestrutura",
  especial: "Especial / misto",
  alimentos: "Alimentos / abastecimento",
  saude: "Saúde / cuidados",
  ferramentas: "Ferramentas / tecnologia",
  veiculos: "Veículos / sobrevivência",
  servicos: "Serviços / comércio diverso",
  pista: "Pista / informação",
  pessoas: "Pessoas / animais",
  ambiente: "Ambiente / obstáculo",
  oportunidade: "Oportunidade / recurso",
  ameaca: "Ameaça / infectados",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function categoryFor(kind: HexGeneratorKind, roll: number): GeneratorCategory {
  if (kind === "locais") {
    if (roll <= 20) return "residencial";
    if (roll <= 40) return "institucional";
    if (roll <= 60) return "industrial";
    if (roll <= 80) return "aberto";
    return "especial";
  }
  if (kind === "comercios") {
    if (roll <= 20) return "alimentos";
    if (roll <= 40) return "saude";
    if (roll <= 60) return "ferramentas";
    if (roll <= 80) return "veiculos";
    return "servicos";
  }
  if ([44, 65, 66, 80, 91].includes(roll)) return "pista";
  if (roll === 73) return "pessoas";
  if (roll <= 20) return "pista";
  if (roll <= 40) return "pessoas";
  if (roll <= 60) return "ambiente";
  if (roll <= 80) return "oportunidade";
  return "ameaca";
}

function terrainWeight(kind: HexGeneratorKind, category: GeneratorCategory, terrain: Terrain) {
  if (terrain === "urban") return 1;
  if (kind === "locais") {
    const weights: Record<Exclude<Terrain, "urban">, Partial<Record<GeneratorCategory, number>>> = {
      rural: { residencial: 2.1, institucional: .6, industrial: 1, aberto: 4.5, especial: 1.1 },
      forest: { residencial: .18, institucional: .08, industrial: .08, aberto: 6, especial: 1.4 },
      mountain: { residencial: .22, institucional: .08, industrial: .12, aberto: 5.5, especial: 1.6 },
      swamp: { residencial: .12, institucional: .06, industrial: .08, aberto: 6, especial: 1.2 },
    };
    return weights[terrain][category] ?? .1;
  }
  if (kind === "comercios") {
    const weights: Record<Exclude<Terrain, "urban">, Partial<Record<GeneratorCategory, number>>> = {
      rural: { alimentos: 2.4, saude: .65, ferramentas: 1.7, veiculos: 1.5, servicos: .6 },
      forest: { alimentos: .25, saude: .12, ferramentas: .55, veiculos: .4, servicos: .12 },
      mountain: { alimentos: .28, saude: .12, ferramentas: .65, veiculos: .55, servicos: .12 },
      swamp: { alimentos: .22, saude: .1, ferramentas: .5, veiculos: .35, servicos: .1 },
    };
    return weights[terrain][category] ?? .1;
  }
  const environmentBonus = category === "ambiente" ? 1.8 : 1;
  return environmentBonus;
}

function sectorCategoryBoost(kind: HexGeneratorKind, category: GeneratorCategory, sectorName: string) {
  const name = normalize(sectorName);
  if (!name) return 1;
  const matches = (pattern: RegExp, categories: GeneratorCategory[], boost = 3) =>
    pattern.test(name) && categories.includes(category) ? boost : 1;

  if (kind === "locais") {
    return Math.max(
      matches(/resid|habit|bairro|casas|conjunto|morro/, ["residencial"], 4),
      matches(/hospital|saude|univers|escola|cemiter|esport|mercado|feira/, ["institucional"], 3.6),
      matches(/industrial|galp|oficina|garagem|porto|servico|patio/, ["industrial"], 4),
      matches(/canal|parque|jard|via|rodov|terminal|estacao|obras|margem/, ["aberto"], 3.5),
      matches(/centro|antigo|misto/, ["especial"], 2.5),
    );
  }
  if (kind === "comercios") {
    return Math.max(
      matches(/mercado|comerc|feira|resid|bairro/, ["alimentos"], 3.4),
      matches(/hospital|saude|clin|univers/, ["saude"], 4.2),
      matches(/industrial|galp|obra|servico|oficina/, ["ferramentas"], 3.8),
      matches(/rodov|terminal|garagem|patio|porto|viaduto|via/, ["veiculos"], 4.2),
      matches(/centro|antigo|univers|mercado|feira/, ["servicos"], 2.4),
    );
  }
  return Math.max(
    matches(/hospital|resid|univers|centro/, ["pessoas", "pista"], 1.8),
    matches(/industrial|obras|canal|parque|morro|rodov/, ["ambiente"], 1.7),
    matches(/mercado|feira|servico|industrial/, ["oportunidade"], 1.6),
  );
}

function infestationEventWeight(game: GameState, category: GeneratorCategory) {
  if (!["pista","pessoas","ambiente","oportunidade","ameaca"].includes(category)) return 1;
  const infestationValues = Object.values(game.hexes).map(hex => hex.infestation).filter((value): value is number => value !== null);
  const fallback = infestationValues.length ? Math.round(infestationValues.reduce((a,b)=>a+b,0) / infestationValues.length) : 2;
  const infestation = Math.max(0, Math.min(5, fallback));
  const matrix: Record<GeneratorCategory, number[]> = {
    pista: [2.2, 2, 1.5, 1.1, .7, .45],
    pessoas: [2.2, 1.9, 1.4, 1, .55, .3],
    ambiente: [1, 1.1, 1.2, 1.4, 1.6, 1.7],
    oportunidade: [1.8, 1.6, 1.3, .95, .6, .4],
    ameaca: [.35, .55, .9, 1.5, 2.5, 3.8],
    residencial: [1,1,1,1,1,1], institucional:[1,1,1,1,1,1], industrial:[1,1,1,1,1,1], aberto:[1,1,1,1,1,1], especial:[1,1,1,1,1,1],
    alimentos:[1,1,1,1,1,1], saude:[1,1,1,1,1,1], ferramentas:[1,1,1,1,1,1], veiculos:[1,1,1,1,1,1], servicos:[1,1,1,1,1,1],
  };
  return matrix[category][infestation] ?? 1;
}

function rowName(text: string) {
  const first = text.indexOf(".");
  return (first >= 0 ? text.slice(0, first) : text).trim();
}

function recentUsage(game: GameState, kind: HexGeneratorKind, hexId: string) {
  const sameHex = new Set<number>();
  const globalCounts = new Map<number, number>();
  for (const [id, hex] of Object.entries(game.hexes)) {
    if (kind === "eventos") {
      for (const event of hex.events) if (event.generatorKind === kind && Number.isInteger(event.generatorRoll)) {
        const roll = event.generatorRoll!;
        globalCounts.set(roll, (globalCounts.get(roll) ?? 0) + 1);
        if (id === hexId) sameHex.add(roll);
      }
    } else {
      for (const point of hex.points) if (point.generatorKind === kind && Number.isInteger(point.generatorRoll)) {
        const roll = point.generatorRoll!;
        globalCounts.set(roll, (globalCounts.get(roll) ?? 0) + 1);
        if (id === hexId) sameHex.add(roll);
      }
    }
  }
  return { sameHex, globalCounts };
}

function contextTokens(game: GameState, hexId: string) {
  const hex = game.hexes[hexId];
  const sector = hex?.sector;
  return normalize([sector?.name ?? "", sector?.border ?? "", ...(sector?.invites ?? [])].join(" "))
    .split(/[^a-z0-9]+/).filter(token => token.length >= 5);
}

function overlapBoost(text: string, tokens: string[]) {
  if (!tokens.length) return 1;
  const normalized = normalize(text);
  const matches = tokens.filter(token => normalized.includes(token)).length;
  return 1 + Math.min(2, matches * .35);
}

function weightedPick<T extends { weight: number }>(rows: T[], random = Math.random) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  if (total <= 0) return rows[Math.floor(random() * rows.length)];
  let cursor = random() * total;
  for (const row of rows) {
    if (row.weight <= 0) continue;
    cursor -= row.weight;
    if (cursor <= 0) return row;
  }
  return [...rows].reverse().find(row => row.weight > 0) ?? rows[rows.length - 1];
}

export function splitGeneratorText(text: string) {
  const parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const guidance: string[] = [];
  const publicParts: string[] = [];
  const directive = /^(pergunte|mostre|anuncie|confira|confiram|verifique|verifiquem|descubra|descubram|avise|avisem|decidam|escolha)\b/i;
  for (const part of parts) {
    const semicolon = part.split(/;\s+/);
    if (semicolon.length > 1 && directive.test(semicolon[semicolon.length - 1])) {
      publicParts.push(semicolon.slice(0, -1).join("; ") + ".");
      guidance.push(semicolon[semicolon.length - 1]);
    } else if (directive.test(part)) guidance.push(part);
    else publicParts.push(part);
  }
  return { publicText: publicParts.join(" ").trim() || text, gmGuidance: guidance.join(" ").trim() };
}

export function suggestedLootTable(text: string, category: GeneratorCategory) {
  const t = normalize(text);
  const table = (pattern: RegExp, name: string) => pattern.test(t) ? name : "";
  return table(/casa|apart|condominio|pensao|moradia|habitac|hotel|hospedaria/, "Residências / condomínios")
    || table(/mercad|mercearia|graos|bebidas|conservas|conveniencia|bazar/, "Mercados / depósitos de alimentos")
    || table(/restaurant|lanchonete|cafeteria|padaria|cantina|cozinha/, "Restaurantes / cozinhas")
    || table(/horta|pomar|jardim|agricol|cultiv|floricultura/, "Hortas / áreas rurais")
    || table(/farmacia|consultorio|veterinaria|higiene/, "Farmácias / consultórios")
    || table(/hospital|laboratorio|clinica|posto de saude/, "Hospitais / laboratórios")
    || table(/escola|univers|escritorio|cartorio|arquivo|biblioteca|administrat|subprefeitura/, "Escolas / escritórios")
    || table(/oficina|posto de combustivel|autopecas|borracharia|gerador|elevador|refrigeracao/, "Oficinas / postos de serviço")
    || table(/delegacia|bombeiro|quartel/, "Delegacias / quartéis")
    || table(/veiculo|carro|onibus|taxi|estacionamento|garagem|moto|bicicleta/, "Ruas / veículos abandonados")
    || table(/roupa|lavanderia|costuraria|calcados|armarinho/, "Lojas de roupa / lavanderias")
    || table(/esport|caca|camping|pesca/, "Artigos esportivos / caça")
    || table(/obra|construcao|hidraulica|eletrico|madeira|tinta/, "Obras / instalações em reforma")
    || table(/galpao|deposito|armazem|triagem|porto seco|conteiner/, "Galpões / centros de distribuição")
    || ({ residencial: "Residências / condomínios", institucional: "Escolas / escritórios", industrial: "Galpões / centros de distribuição",
      aberto: "Ruas / veículos abandonados", especial: "Escolas / escritórios", alimentos: "Mercados / depósitos de alimentos",
      saude: "Farmácias / consultórios", ferramentas: "Obras / instalações em reforma", veiculos: "Oficinas / postos de serviço",
      servicos: "Escolas / escritórios" } as Partial<Record<GeneratorCategory,string>>)[category];
}

function conditionSuggestion(category: GeneratorCategory) {
  if (["ameaca","ambiente"].includes(category)) return "instável / exige avaliação";
  if (["industrial","ferramentas","veiculos"].includes(category)) return "parcialmente saqueado";
  if (["pessoas","pista"].includes(category)) return "sinais recentes";
  return "estado ainda não confirmado";
}

function riskSuggestion(game: GameState, hexId: string, category: GeneratorCategory) {
  const infestation = game.hexes[hexId]?.infestation;
  if (category === "ameaca") return "alto — presença hostil provável";
  if (infestation !== null && infestation !== undefined && infestation >= 4) return "alto — infestação elevada";
  if (["industrial","ambiente"].includes(category)) return "médio — risco ambiental ou estrutural";
  return "variável — confirme sinais antes de entrar";
}

function accessSuggestion(category: GeneratorCategory) {
  if (category === "residencial") return "entrada principal e acesso secundário podem levar a áreas diferentes";
  if (category === "industrial" || category === "veiculos" || category === "ferramentas") return "portão ou acesso técnico; verifique rota lateral antes de forçar entrada";
  if (category === "aberto") return "aproximação aberta, mas rotas e cobertura podem mudar o risco";
  if (category === "institucional" || category === "saude") return "acesso público visível; áreas internas podem estar isoladas";
  return "defina o acesso a partir dos sinais do local";
}

function triggerSuggestion(game: GameState, category: GeneratorCategory) {
  if (category === "ameaca" && game.noise >= 2) return { type: "noise" as const, value: Math.max(2, Math.min(5, game.noise)) };
  if (category === "oportunidade") return { type: "search" as const };
  if (category === "pessoas" || category === "ambiente" || category === "ameaca") return { type: "enter" as const };
  return { type: "manual" as const };
}

export function generatorContextLabel(game: GameState, hexId: string) {
  const hex = game.hexes[hexId];
  if (!hex) return `Hex ${hexId}`;
  const terrain = ({ urban:"Urbano", rural:"Rural", forest:"Floresta", mountain:"Montanha", swamp:"Pântano" } as const)[hex.terrain ?? "urban"];
  const infestation = hex.infestation === null ? "Infestação ?" : `Infestação ${hex.infestation}/5`;
  return [terrain, hex.sector?.name, infestation, `Barulho ${game.noise}/5`].filter(Boolean).join(" · ");
}

export function generateHexContent(game: GameState, hexId: string, kind: HexGeneratorKind, random = Math.random): GeneratedHexContent {
  const hex = game.hexes[hexId];
  if (!hex) throw new Error(`Hex desconhecido: ${hexId}`);
  const rows = content.generators[kind];
  const usage = recentUsage(game, kind, hexId);
  const tokens = contextTokens(game, hexId);
  const terrain = hex.terrain ?? "urban";
  const weighted = rows.map(row => {
    const category = categoryFor(kind, row.roll);
    if (kind === "eventos" && !eventContentCompatible(game, hexId, row.roll)) return { row, category, weight: 0 };
    let weight = terrainWeight(kind, category, terrain)
      * sectorCategoryBoost(kind, category, hex.sector?.name ?? "")
      * overlapBoost(row.text, tokens);
    if (kind === "eventos") {
      const infestation = hex.infestation ?? 2;
      const eventMatrix: Partial<Record<GeneratorCategory, number[]>> = {
        pista:[2.2,2,1.5,1.1,.7,.45], pessoas:[2.2,1.9,1.4,1,.55,.3], ambiente:[1,1.1,1.2,1.4,1.6,1.7],
        oportunidade:[1.8,1.6,1.3,.95,.6,.4], ameaca:[.35,.55,.9,1.5,2.5,3.8],
      };
      weight *= eventMatrix[category]?.[infestation] ?? infestationEventWeight(game, category);
      if (category === "ameaca" && game.noise >= 3) weight *= 1 + (game.noise - 2) * .45;
    }
    const used = usage.globalCounts.get(row.roll) ?? 0;
    if (used) weight *= Math.max(.08, 1 / (1 + used * 2.5));
    if (usage.sameHex.has(row.roll)) weight *= .08;
    const existingName = rowName(row.text);
    if (hex.points.some(point => normalize(point.name) === normalize(existingName))) weight *= .04;
    return { row, category, weight };
  });
  const chosen = weightedPick(weighted, random);
  const split = splitGeneratorText(chosen.row.text);
  const trigger = triggerSuggestion(game, chosen.category);
  return {
    kind,
    roll: chosen.row.roll,
    text: chosen.row.text,
    publicText: split.publicText,
    gmGuidance: split.gmGuidance,
    category: chosen.category,
    categoryLabel: categoryLabels[chosen.category],
    contextLabel: generatorContextLabel(game, hexId),
    ...(kind !== "eventos" ? {
      suggestedLootTable: suggestedLootTable(chosen.row.text, chosen.category),
      suggestedCondition: conditionSuggestion(chosen.category),
      suggestedRisk: riskSuggestion(game, hexId, chosen.category),
      suggestedAccess: accessSuggestion(chosen.category),
    } : {
      suggestedTriggerType: trigger.type,
      ...(trigger.value !== undefined ? { suggestedTriggerValue: trigger.value } : {}),
    }),
  };
}

export const eventTriggerLabels: Record<NonNullable<HexEvent["triggerType"]>, string> = {
  manual: "Manual",
  enter: "Ao entrar no hex",
  search: "Após uma busca",
  noise: "Quando o Barulho atingir",
  night: "Durante a noite",
};

export function eventStatus(event: HexEvent): NonNullable<HexEvent["status"]> {
  return event.status ?? "active";
}

export function eventTriggerLabel(event: HexEvent) {
  if (!event.triggerType) return event.trigger || "Gatilho legado";
  if (event.triggerType === "noise") return `${eventTriggerLabels.noise} ${event.triggerValue ?? 3}`;
  return eventTriggerLabels[event.triggerType];
}

export function eventTriggerReady(game: GameState, hexId: string, event: HexEvent) {
  if (eventStatus(event) !== "pending") return false;
  const type = event.triggerType ?? "manual";
  if (type === "manual") return false;
  if (type === "enter") return game.survivors.some(person => (person.hex ?? game.partyHex) === hexId);
  if (type === "search") {
    const hex = game.hexes[hexId];
    return event.searchBaseline === undefined ? Boolean(hex?.points.some(point => point.searches.length > 0))
      : (hex?.searchSequence ?? hex?.points.reduce((sum, point) => sum + point.searches.length, 0) ?? 0) > event.searchBaseline;
  }
  if (type === "noise") return game.noise >= Math.max(0, Math.min(5, event.triggerValue ?? 3));
  if (type === "night") return game.minutes >= 18 * 60 || game.minutes < 6 * 60;
  return false;
}

export function pointGeneratorMetadata(point: Point) {
  return [point.generatorCategory, point.condition, point.risk].filter(Boolean);
}

/** Do not generate a built-environment event in an empty natural sector. Manual selection remains available. */
export function eventContentCompatible(game: GameState, hexId: string, roll: number) {
  const hex = game.hexes[hexId];
  if (!hex) return false;
  const guide = eventDefinitions.find(g => g.roll === roll);
  const requirements: readonly string[] = guide?.requirements ?? [];
  const requiresStructure = requirements.includes("structure") || requirements.includes("power") || requirements.includes("communication");
  const requiresVehicle = requirements.includes("vehicle");
  if ((!requiresStructure && !requiresVehicle) || (hex.terrain ?? "urban") === "urban") return true;
  const surroundings = [hex.sector?.name, ...hex.points.filter(p => !p.clueTargetHex && !p.clue).map(p => `${p.name} ${p.signal}`)].join(" ");
  if (requiresVehicle && !/carro|veículo|veiculo|garagem|rodovia|estrada|estacionamento|oficina/i.test(surroundings)) return false;
  if (!requiresStructure) return true;
  return /casa|prédio|predio|galpão|galpao|oficina|posto|abrigo|depósito|deposito|hospital|escola|torre|cabana|estação|estacao|portaria|construção|construcao/i.test(surroundings);
}
