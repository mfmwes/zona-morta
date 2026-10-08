import { isCluePoint } from "./hex-event-links";
import definitions from "./loot-definitions.json";
import { addLog, content, survivorStats, survivorsAtHex, type GameState, type Point } from "./game";
import { createId } from "./id";
import { addStack, catalogKey, fillReusableContainer, itemFromCatalog, removeFromCart, sharedStorageHex, transferItem } from "./inventory";
import { expirePhysicalFood } from "./provisions";
import { normalizedSector, searchAreaLabel, searchAvailabilityError } from "./exploration";
import { registerActivityHandler } from "./activity-handlers";
import { scheduleActivity, runningActivities } from "./activity-timeline";
import { advanceParticipantTime, completeSingleGroupActivity } from "./time";
import { abilityAvailable, recordAbilityUse } from "./abilities";
import { eventTriggerReady, generateHexContent, suggestedLootTable } from "./hex-generators";
import { equipmentModifiers } from "./equipment";
import { resolveActionRoll, resolveRollResources, rollDie, type Edge } from "./rolls";
import type { LocationScale, SearchAttempt, SearchArea } from "./hex-automation-types";
import { parallelTimeLabel, participantTimePreview, timedActionParticipantIssue } from "./activity";

type LootItem = { catalogKey: string; qty: number; battery?: "Carregada" | "Descarregada" };
type LootDefinition = { roll: number; items: LootItem[]; choices?: string[];
  requirement?: "armedGuard" | "compatibleOwner"; fallback?: LootItem[] };
export const lootDefinitions = definitions as { table: string; entries: LootDefinition[] }[];
export const searchSequence = (game: GameState, hexId: string) => game.hexes[hexId]?.searchSequence
  ?? game.hexes[hexId]?.points.reduce((total, point) => total + point.searches.length, 0) ?? 0;
const pointAt = (game: GameState, hexId: string, pointId: string) => game.hexes[hexId]?.points.find(p => p.id === pointId);
const warehouseOrigin = "Trabalhador(a) de depósito";
const warehouseEffect = () => content.origins.find(row => row.name === warehouseOrigin)?.effect ?? "";
type AreaBlueprint = {
  name: string;
  signal: string;
  table?: string;
  minutes?: 30 | 60;
  searchable?: boolean;
};

export const locationScaleLabels: Record<LocationScale, string> = {
  small: "Pequeno",
  medium: "Médio",
  large: "Grande",
  complex: "Complexo",
};

export const locationScaleAreaCounts: Record<LocationScale, number> = {
  small: 3,
  medium: 4,
  large: 6,
  complex: 8,
};

/** Limita rolagens sem reduzir a riqueza espacial do local. */
export const locationScaleSearchCaps: Record<LocationScale, number> = {
  small: 2,
  medium: 3,
  large: 4,
  complex: 5,
};

/** Busca profunda é uma decisão estratégica do local, não uma segunda busca em todo cômodo. */
export const locationScaleDeepSearchLimits: Record<LocationScale, number> = {
  small: 1,
  medium: 1,
  large: 2,
  complex: 3,
};

const areaModels: Record<string, AreaBlueprint[]> = {
  "Residências / condomínios": [
    { name: "Cozinha", signal: "Bancada, armários e eletrodomésticos formam um espaço separado.", table: "Restaurantes / cozinhas", searchable: true },
    { name: "Sala / circulação", signal: "Móveis e passagens conectam os demais cômodos.", searchable: false },
    { name: "Quarto", signal: "Porta interna leva a um cômodo de uso pessoal.", searchable: true },
    { name: "Garagem", signal: "Acesso lateral ou portão leva à área de veículos e ferramentas.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Área comum", signal: "Espaço compartilhado conecta diferentes unidades do local.", searchable: false },
    { name: "Depósito", signal: "Um cômodo menor concentra caixas e objetos guardados.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Administração / portaria", signal: "Mesa, chaves e registros ficam próximos ao acesso principal.", table: "Escolas / escritórios", searchable: false },
  ],
  "Mercados / depósitos de alimentos": [
    { name: "Prateleiras do salão", signal: "Corredores de exposição ainda conservam produtos espalhados.", searchable: true },
    { name: "Caixas / atendimento", signal: "Balcões e gavetas ficam próximos da entrada.", table: "Escolas / escritórios", searchable: false },
    { name: "Depósito dos fundos", signal: "Porta de serviço separa o estoque das prateleiras do salão.", searchable: true },
    { name: "Câmara fria", signal: "Porta térmica isola uma área de armazenamento refrigerado.", table: "Restaurantes / cozinhas", searchable: true },
    { name: "Doca de carga", signal: "Acesso de serviço liga o prédio à área de recebimento.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Escritório", signal: "Documentos e chaves ficam em uma sala administrativa.", table: "Escolas / escritórios", searchable: false },
    { name: "Estacionamento", signal: "Carrinhos e veículos abandonados ocupam a área externa imediata.", table: "Ruas / veículos abandonados", searchable: true },
  ],
  "Restaurantes / cozinhas": [
    { name: "Cozinha", signal: "Bancadas, fogões e armários concentram utensílios e mantimentos.", searchable: true },
    { name: "Salão", signal: "Mesas e circulação ocupam a maior parte da área pública.", searchable: false },
    { name: "Despensa", signal: "Armário de estoque separado das bancadas de preparo.", searchable: true },
    { name: "Câmara fria", signal: "Uma porta térmica leva à conservação de alimentos.", searchable: true },
    { name: "Escritório / caixa", signal: "Registros e objetos pessoais ficam atrás do atendimento.", table: "Escolas / escritórios", searchable: false },
    { name: "Área de serviço", signal: "Produtos de limpeza e manutenção ficam próximos da saída dos fundos.", table: "Obras / instalações em reforma", searchable: true },
    { name: "Estacionamento / entrega", signal: "Acesso externo concentra caixas, carrinhos e veículos.", table: "Ruas / veículos abandonados", searchable: true },
  ],
  "Hortas / áreas rurais": [
    { name: "Área de cultivo", signal: "Canteiros ou fileiras de plantio ainda definem o espaço.", searchable: true },
    { name: "Abrigo de ferramentas", signal: "Uma cobertura simples guarda instrumentos de trabalho.", table: "Obras / instalações em reforma", searchable: true },
    { name: "Casa / apoio", signal: "Uma construção de apoio oferece abrigo e armazenamento.", table: "Residências / condomínios", searchable: true },
    { name: "Depósito", signal: "Sacos, caixas e recipientes ficam protegidos do tempo.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Poço / reservatório", signal: "Estruturas de captação ou armazenamento de água ficam próximas.", searchable: false },
    { name: "Curral / pátio", signal: "Cercas e marcas no solo delimitam uma área de manejo.", searchable: false },
    { name: "Garagem rural", signal: "Máquinas e veículos de trabalho ocupam um abrigo lateral.", table: "Oficinas / postos de serviço", searchable: true },
  ],
  "Farmácias / consultórios": [
    { name: "Balcão / dispensação", signal: "Prateleiras e gavetas ficam atrás do balcão principal.", searchable: true },
    { name: "Sala de atendimento", signal: "Porta interna leva a um espaço de atendimento separado do balcão.", searchable: true },
    { name: "Recepção", signal: "Cadeiras e fichários ocupam a área de espera.", table: "Escolas / escritórios", searchable: false },
    { name: "Estoque restrito", signal: "Armários fechados e caixas ficam em um cômodo interno.", searchable: true },
    { name: "Arquivo", signal: "Documentos e registros ficam em armários administrativos.", table: "Escolas / escritórios", searchable: false },
    { name: "Sala de procedimentos", signal: "Bancada clínica e descarte identificam um espaço técnico.", table: "Hospitais / laboratórios", searchable: true },
    { name: "Área de serviço", signal: "Materiais de limpeza e manutenção ficam próximos ao acesso dos fundos.", table: "Obras / instalações em reforma", searchable: true },
  ],
  "Hospitais / laboratórios": [
    { name: "Recepção", signal: "Balcões e fichários marcam a entrada do atendimento.", table: "Escolas / escritórios", searchable: false },
    { name: "Ala de atendimento", signal: "Corredor separado da recepção leva às salas de atendimento.", minutes: 60, searchable: true },
    { name: "Enfermaria", signal: "Leitos e armários clínicos ocupam uma ala própria.", searchable: true },
    { name: "Farmácia interna", signal: "Armários controlados concentram medicamentos e insumos.", table: "Farmácias / consultórios", searchable: true },
    { name: "Almoxarifado", signal: "Caixas identificadas e carrinhos ficam em área de suprimentos.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Administração", signal: "Salas com computadores e arquivos ficam afastadas dos leitos.", table: "Escolas / escritórios", searchable: false },
    { name: "Manutenção", signal: "Acesso técnico independente leva a ferramentas e instalações.", table: "Oficinas / postos de serviço", searchable: true },
  ],
  "Escolas / escritórios": [
    { name: "Sala de trabalho / aula", signal: "Mesas, cadeiras e armários definem o espaço principal.", searchable: true },
    { name: "Corredor / recepção", signal: "Circulação e avisos conectam os demais ambientes.", searchable: false },
    { name: "Arquivo", signal: "Sala de arquivos separada dos espaços de circulação.", searchable: true },
    { name: "Administração", signal: "Computadores, chaves e documentos ficam numa área reservada.", searchable: true },
    { name: "Copa", signal: "Uma pequena cozinha de apoio atende funcionários ou estudantes.", table: "Restaurantes / cozinhas", searchable: true },
    { name: "Almoxarifado", signal: "Materiais de uso cotidiano ficam guardados em caixas e armários.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Estacionamento", signal: "Veículos e acessos externos ficam próximos ao prédio.", table: "Ruas / veículos abandonados", searchable: false },
  ],
  "Oficinas / postos de serviço": [
    { name: "Oficina principal", signal: "Bancadas e elevadores ocupam o espaço de trabalho.", searchable: true },
    { name: "Atendimento", signal: "Balcão e papéis ficam separados da área de reparo.", table: "Escolas / escritórios", searchable: false },
    { name: "Estoque de ferramentas", signal: "Compartimento de ferramentas separado das vagas de trabalho.", searchable: true },
    { name: "Estoque de peças", signal: "Prateleiras identificadas concentram peças e consumíveis.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Pátio / veículos", signal: "Veículos aguardam reparo numa área aberta ou coberta.", table: "Ruas / veículos abandonados", searchable: true },
    { name: "Escritório", signal: "Ordens de serviço e chaves ficam em uma sala administrativa.", table: "Escolas / escritórios", searchable: false },
    { name: "Área técnica", signal: "Instalações elétricas, hidráulicas ou de combustível ficam isoladas.", table: "Obras / instalações em reforma", searchable: true },
  ],
  "Delegacias / quartéis": [
    { name: "Recepção / plantão", signal: "Balcão e registros ficam próximos da entrada.", table: "Escolas / escritórios", searchable: false },
    { name: "Almoxarifado", signal: "Porta interna distingue o estoque da recepção.", searchable: true },
    { name: "Sala de equipamentos", signal: "Armários reforçados concentram proteção e ferramentas.", searchable: true },
    { name: "Arquivo / investigação", signal: "Pastas e computadores ocupam uma sala administrativa.", table: "Escolas / escritórios", searchable: true },
    { name: "Garagem", signal: "Viaturas e manutenção ocupam um acesso lateral.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Alojamento", signal: "Beliches e armários pessoais ficam em uma área reservada.", table: "Residências / condomínios", searchable: true },
    { name: "Cozinha / refeitório", signal: "Mesas e equipamentos de preparo formam uma área de apoio.", table: "Restaurantes / cozinhas", searchable: true },
  ],
  "Ruas / veículos abandonados": [
    { name: "Veículo acessível", signal: "Um veículo chama atenção entre os obstáculos do trajeto.", searchable: true },
    { name: "Trecho de passagem", signal: "A via concentra destroços e rotas possíveis.", searchable: false },
    { name: "Veículo secundário", signal: "Outro veículo parece ter sido abandonado em circunstâncias diferentes.", searchable: true },
    { name: "Ponto de serviço", signal: "Uma guarita, cobertura ou estrutura pequena acompanha a via.", table: "Escolas / escritórios", searchable: true },
    { name: "Carga caída", signal: "Caixas ou volumes se espalharam perto de um veículo de transporte.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Área de manutenção", signal: "Ferramentas e sinais de reparo aparecem junto à pista.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Margem / acostamento", signal: "A lateral da via guarda objetos fora do fluxo principal.", searchable: false },
  ],
  "Lojas de roupa / lavanderias": [
    { name: "Salão de exposição", signal: "Araras, balcões e prateleiras ocupam a área pública.", searchable: true },
    { name: "Provadores / circulação", signal: "Pequenos espaços e corredores ficam atrás das araras.", searchable: false },
    { name: "Depósito", signal: "Espaço de estoque separado da área de exposição.", searchable: true },
    { name: "Lavanderia / serviço", signal: "Máquinas e produtos ficam numa área técnica.", table: "Obras / instalações em reforma", searchable: true },
    { name: "Escritório / caixa", signal: "Documentos e objetos pessoais ficam perto do atendimento.", table: "Escolas / escritórios", searchable: false },
    { name: "Doca / fundos", signal: "Caixas e carrinhos ocupam o acesso de serviço.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Estacionamento", signal: "Veículos e objetos abandonados cercam a entrada.", table: "Ruas / veículos abandonados", searchable: true },
  ],
  "Artigos esportivos / caça": [
    { name: "Salão de vendas", signal: "Expositores e vitrines concentram equipamentos variados.", searchable: true },
    { name: "Balcão", signal: "Área de atendimento separa produtos controlados do público.", searchable: false },
    { name: "Depósito", signal: "Área interna de estoque separada do balcão.", searchable: true },
    { name: "Oficina / manutenção", signal: "Ferramentas de ajuste e reparo ficam numa bancada técnica.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Escritório", signal: "Registros de vendas e chaves ficam em uma sala pequena.", table: "Escolas / escritórios", searchable: false },
    { name: "Carga / fundos", signal: "Caixas e equipamentos maiores ficam perto do acesso de entrega.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Estacionamento", signal: "Veículos e equipamentos de transporte aparecem do lado de fora.", table: "Ruas / veículos abandonados", searchable: true },
  ],
  "Obras / instalações em reforma": [
    { name: "Frente de obra", signal: "Materiais e ferramentas ficam próximos da área de intervenção.", searchable: true },
    { name: "Circulação insegura", signal: "Andaimes, entulho ou aberturas tornam a passagem mais importante que os achados.", searchable: false },
    { name: "Depósito de materiais", signal: "Sacos, caixas e peças ficam protegidos em uma área separada.", table: "Galpões / centros de distribuição", searchable: true },
    { name: "Ferramentaria", signal: "Ferramentas de trabalho se concentram numa bancada ou contêiner.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Escritório da obra", signal: "Plantas, chaves e registros ficam em uma sala improvisada.", table: "Escolas / escritórios", searchable: false },
    { name: "Pátio", signal: "Máquinas e veículos ocupam a área externa da obra.", table: "Ruas / veículos abandonados", searchable: true },
    { name: "Instalações", signal: "Quadros, tubulações e componentes ficam numa área técnica.", searchable: true },
  ],
  "Galpões / centros de distribuição": [
    { name: "Estoque", signal: "Prateleiras de carga ficam em uma ala separada da triagem.", minutes: 60, searchable: true },
    { name: "Triagem / circulação", signal: "Corredores largos conectam pilhas de carga e docas.", searchable: false },
    { name: "Doca de carga", signal: "Paletes e veículos de movimentação ficam junto aos portões.", searchable: true },
    { name: "Manutenção", signal: "Oficina técnica separada das prateleiras de carga.", table: "Oficinas / postos de serviço", searchable: true },
    { name: "Escritório", signal: "Computadores, chaves e documentos ficam numa sala elevada ou lateral.", table: "Escolas / escritórios", searchable: false },
    { name: "Pátio de veículos", signal: "Caminhões e utilitários ocupam a área externa.", table: "Ruas / veículos abandonados", searchable: true },
    { name: "Estoque secundário", signal: "Uma ala menor guarda materiais de outra categoria.", searchable: true },
  ],
};

export function inferLocationScale(point: Point): LocationScale {
  const name = point.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (/hospital|universidade|shopping|complexo|fabrica|centro de distribuicao|terminal|quartel|centro comercial/.test(name)) return "complex";
  if (/condominio|supermercado|galpao|armazem|escola|delegacia|hotel|mercado municipal|deposito|posto grande/.test(name)) return "large";
  if (/banca|quiosque|trailer|guarita|consultorio pequeno|loja pequena|casa pequena/.test(name)) return "small";
  return "medium";
}

export function locationScaleOf(point: Point): LocationScale {
  return point.preparation?.scale ?? inferLocationScale(point);
}

function baseSearchArea(point: Point, table: string, scale: LocationScale): SearchArea {
  const roomy = scale === "large" || scale === "complex";
  return {
    id: createId(),
    name: "Área principal",
    signal: point.signal,
    table,
    minutes: roomy ? 60 : 30,
    access: point.risk?.startsWith("alto") || point.risk?.startsWith("médio") ? "risk" : "open",
    difficulty: 12,
    noise: 0,
    armedGuard: false,
    compatibleOwner: false,
    ammunition: "Pistola",
    spacious: roomy,
    searchable: true,
    source: "generated",
  };
}

function blueprintArea(point: Point, baseTable: string, scale: LocationScale, blueprint: AreaBlueprint): SearchArea {
  const roomy = scale === "large" || scale === "complex";
  return {
    ...baseSearchArea(point, blueprint.table ?? baseTable, scale),
    id: createId(),
    name: blueprint.name,
    signal: blueprint.signal,
    minutes: blueprint.minutes ?? 30,
    searchable: blueprint.searchable !== false,
    spacious: blueprint.minutes === 60,
    source: "generated",
  };
}

function buildLocationAreas(point: Point, scale: LocationScale) {
  const table = content.lootTables.find(row => row.name === point.lootTable)?.name ?? suggestedLootTable(point.name, "especial")!;
  const models = areaModels[table] ?? [];
  const count = locationScaleAreaCounts[scale];
  const areas: SearchArea[] = [baseSearchArea(point, table, scale), ...models.slice(0, Math.max(0, count - 1)).map(model => blueprintArea(point, table, scale, model))];
  const searchCap = locationScaleSearchCaps[scale];
  let searchableSeen = 0;
  for (const area of areas) {
    if (area.searchable === false) continue;
    searchableSeen += 1;
    if (searchableSeen > searchCap) area.searchable = false;
  }

  for (const search of point.searches) {
    const name = searchAreaLabel(point, search.sector);
    if (areas.some(area => normalizedSector(area.name) === normalizedSector(name))) continue;
    areas.push({
      ...baseSearchArea(point, search.table && content.lootTables.some(row => row.name === search.table) ? search.table : table, scale),
      id: createId(),
      name,
      signal: "Área preservada a partir do histórico desta campanha.",
      minutes: search.minutes >= 60 ? 60 : 30,
      searchable: true,
      source: "historical",
    });
  }
  return areas.slice(0, 80);
}

/** Preparation is private and idempotent. Historical searches never grant stock. */
export function prepareLocation(point: Point) {
  if (point.preparation || isCluePoint(point)) return false;
  const scale = inferLocationScale(point);
  const areas = buildLocationAreas(point, scale);
  const seenAttempts = new Set<string>();
  const historical = point.searches.filter(row => {
    const area = areas.find(area => normalizedSector(area.name) === normalizedSector(searchAreaLabel(point, row.sector)));
    const kind = row.depth === "deep" ? "deep" : "normal";
    const key = area ? `${area.id}:${kind}` : "";
    if (!area || seenAttempts.has(key)) return false;
    seenAttempts.add(key); return true;
  });
  const attempts: SearchAttempt[] = historical.map(row => ({ id: row.id,
    areaId: areas.find(area => normalizedSector(area.name) === normalizedSector(searchAreaLabel(point, row.sector)))!.id,
    participants: [], mode: row.mode ?? "specific", kind: row.depth === "deep" ? "deep" : "normal",
    objective: row.what, purpose: row.why,
    quantity: 1, minutes: row.minutes, noise: row.depth === "deep" ? 1 : 0, status: "completed", result: row.result, stockIds: [] }));
  point.preparation = { version: 1, scale, areas, attempts, stock: [], collections: [] };
  return true;
}

export function resizeLocationPreparation(point: Point, scale: LocationScale) {
  prepareLocation(point);
  const prep = point.preparation;
  if (!prep || !Object.hasOwn(locationScaleLabels, scale)) return false;
  if (prep.attempts.length || prep.stock.length || prep.collections.length || point.searches.length) return false;
  prep.scale = scale;
  prep.areas = buildLocationAreas(point, scale);
  return true;
}

export function prepareHex(game: GameState, hexId: string) {
  const hex = game.hexes[hexId];
  if (!hex) return false;
  if (!hex.points.some(p => !isCluePoint(p)) && hex.points.length < 120) {
    const generated = generateHexContent(game, hexId, "locais");
    hex.points.push({ id: createId(), name: generated.publicText.split(/[.;!?]/)[0].trim().slice(0, 120), kind: "local", signal: generated.publicText,
      access: generated.suggestedAccess ?? "", notes: generated.gmGuidance, revealed: false, searches: [],
      lootTable: generated.suggestedLootTable, condition: generated.suggestedCondition, risk: generated.suggestedRisk,
      generatorKind: "locais", generatorRoll: generated.roll, generatorCategory: generated.categoryLabel });
  }
  for (const point of hex.points) {
    if (isCluePoint(point)) continue;
    prepareLocationForExploration(game, hexId, point.id);
  }
  if (!hex.events.length) {
    hex.searchSequence ??= searchSequence(game, hexId);
    const generated = generateHexContent(game, hexId, "eventos");
    hex.events.push({ id: createId(), text: generated.publicText, trigger: "Próxima busca neste hex",
      triggerType: "search", searchBaseline: searchSequence(game, hexId), status: "pending", revealed: false,
      guidance: generated.gmGuidance, generatorKind: "eventos", generatorRoll: generated.roll,
      generatorCategory: generated.categoryLabel });
  }
  return true;
}

/** Adding an area is a declaration of an existing space, never a renamed retry. */
export function declareSearchArea(point: Point, name: string, signal: string) {
  prepareLocation(point);
  const prep = point.preparation;
  if (!prep || !name.trim() || !signal.trim() || name.length > 120 || signal.length > 2000 || prep.areas.length >= 80
    || prep.attempts.some(row => row.status === "pending" || row.status === "ready")
    || prep.areas.some(row => normalizedSector(row.name) === normalizedSector(searchAreaLabel(point, name)))) return false;
  prep.areas.push({ ...prep.areas[0], id: createId(), name: name.trim(), signal: signal.trim(), searchable: false,
    minutes: 30, spacious: false, source: "manual" });
  return true;
}

export function deepSearchLimit(point: Point) {
  return locationScaleDeepSearchLimits[locationScaleOf(point)];
}

export function deepSearchesUsed(point: Point) {
  return point.preparation?.attempts.filter(row => row.kind === "deep").length ?? 0;
}

export function pendingPlayerSearchOperation(game: GameState, hexId: string, pointId: string, areaId: string) {
  return game.playerActions?.operations.find(operation =>
    operation.type === "search"
    && operation.day === game.day
    && operation.scene === (game.scene ?? 1)
    && ["forming", "access"].includes(operation.status)
    && operation.hexId === hexId
    && operation.pointId === pointId
    && operation.areaId === areaId
  );
}

export function searchAreaSessionState(game: GameState, hexId: string, pointId: string, area: SearchArea) {
  const proposed = pendingPlayerSearchOperation(game, hexId, pointId, area.id);
  if (proposed?.status === "forming") return "proposed" as const;
  const point = game.hexes[hexId]?.points.find(candidate => candidate.id === pointId);
  return point ? searchAreaState(point, area) : "available" as const;
}

export function searchAreaState(point: Point, area: SearchArea) {
  if (area.searchable === false) return "narrative" as const;
  const normal = point.preparation?.attempts.find(row => row.areaId === area.id && (row.kind ?? "normal") === "normal");
  const deep = point.preparation?.attempts.find(row => row.areaId === area.id && row.kind === "deep");
  if (normal?.status === "pending" || normal?.status === "ready") return "ongoing" as const;
  if (!normal) return "available" as const;
  if (normal.status === "failed") return "exhausted" as const;
  if (deep?.status === "pending" || deep?.status === "ready") return "deep-ongoing" as const;
  if (deep?.status === "completed" || deep?.status === "failed") return "exhausted" as const;
  if (normal.status === "completed") return deepSearchesUsed(point) < deepSearchLimit(point) ? "deep-available" as const : "searched" as const;
  return "searched" as const;
}

export type StartSearch = { id: string; hexId: string; pointId: string; areaId: string; participants: string[];
  mode: "open" | "specific"; objective: string; purpose: string; catalogKey?: string; quantity?: number; warehouseWorker?: string };
export function warehouseWorkers(game: GameState, hexId: string) {
  return survivorsAtHex(game, hexId).filter(person => person.origin === warehouseOrigin
    && abilityAvailable(game, person.id, `origin:${person.origin}`, warehouseEffect()));
}
export function startSearch(game: GameState, input: StartSearch): string | null {
  const point = pointAt(game, input.hexId, input.pointId);
  const prep = point?.preparation;
  if (prep?.attempts.some(row => row.id === input.id)) return null;
  const available = searchAvailabilityError(game, input.hexId, input.pointId);
  if (available) return available;
  const area = prep?.areas.find(row => row.id === input.areaId);
  if (!prep || !area) return "Prepare o local e escolha uma área existente.";
  const proposed = pendingPlayerSearchOperation(game, input.hexId, input.pointId, input.areaId);
  if (proposed && proposed.id !== input.id) return "Já existe uma busca proposta ou em andamento para esta área.";
  if (area.searchable === false) return "Esta área existe na exploração, mas não possui uma busca de recursos própria.";
  if (!input.id || input.id.length > 120 || input.objective.length > 2400 || input.purpose.length > 2400) return "Confira os dados da busca.";
  if (area.excludedRolls?.length && (!area.exclusionReason?.trim() || new Set(area.excludedRolls).size >= 12)) return "Registre por que os resultados contradizem a ficção e mantenha algum achado plausível.";
  if (prep.attempts.some(row => row.areaId === area.id && (row.kind ?? "normal") === "normal")
    || point!.searches.some(row => row.depth !== "deep" && normalizedSector(searchAreaLabel(point!, row.sector)) === normalizedSector(area.name))) return "Esta área já tem uma busca registrada. Retome a operação existente.";
  if (prep.attempts.length >= 80 || point!.searches.length >= 80) return "O local atingiu o limite de buscas.";
  const present = survivorsAtHex(game, input.hexId).map(person => person.id);
  if (!input.participants.length || new Set(input.participants).size !== input.participants.length
    || input.participants.some(id => !present.includes(id))) return "Escolha os participantes presentes neste hex.";
  const commitmentIssue = timedActionParticipantIssue(game, input.participants, "uma busca");
  if (commitmentIssue) return commitmentIssue;
  if (area.access === "blocked") return "Resolva o bloqueio na ficção antes de iniciar a busca.";
  if (!input.purpose.trim()) return "Declare a finalidade da busca.";
  if (input.mode === "specific" && (!input.objective.trim() || !input.purpose.trim()
    || !content.catalog.some(row => catalogKey(row) === input.catalogKey))) return "Combine o objetivo, a finalidade e o item plausível antes da busca.";
  if (input.mode === "specific" && prep.stock.some(row => row.areaId === area.id && row.item.catalogKey === input.catalogKey)) return "Esse estoque já é conhecido. Resolva o acesso e recolha diretamente, sem outra busca.";
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity !== 1) return "Uma busca específica encontra no máximo 1 unidade. Quantidades maiores devem ser estabelecidas como estoque à vista.";
  if (input.warehouseWorker && (!input.participants.includes(input.warehouseWorker)
    || (!area.spacious && area.minutes !== 60)
    || !warehouseWorkers(game, input.hexId).some(row => row.id === input.warehouseWorker))) return "A habilidade de depósito não está disponível para este participante.";
  const minutes = input.warehouseWorker && area.minutes === 60 ? 30 : area.minutes;
  if (!participantTimePreview(game, input.participants, minutes).ok) return "A busca precisa terminar antes da passagem de dia para este grupo.";
  prep.attempts.push({ id: input.id, areaId: area.id, participants: [...input.participants], mode: input.mode, kind: "normal",
    objective: input.objective.trim(), purpose: input.purpose.trim(), catalogKey: input.catalogKey, quantity,
    minutes, noise: area.noise, warehouseWorker: input.warehouseWorker,
    areaSnapshot: structuredClone(area), status: area.access === "risk" ? "pending" : "ready" });
  return null;
}

export type StartDeepSearch = {
  id: string; hexId: string; pointId: string; areaId: string; participants: string[];
  objective: string; purpose: string; catalogKey: string;
};

export type QuickSearchResource = "water" | "food" | "medicine" | "parts" | "fuel";
export type QuickSearchOption = {
  id: QuickSearchResource;
  label: string;
  purpose: string;
  available: boolean;
  key?: string;
  itemName?: string;
  matches: string[];
  reason: string;
};

const quickSearchDefinitions: { id: QuickSearchResource; label: string; purpose: string }[] = [
  { id: "water", label: "Água", purpose: "Hidratar o grupo durante a viagem" },
  { id: "food", label: "Comida", purpose: "Alimentar o grupo" },
  { id: "medicine", label: "Medicamentos", purpose: "Tratar ferimentos e condições" },
  { id: "parts", label: "Peças", purpose: "Reparar equipamentos e instalações" },
  { id: "fuel", label: "Combustível", purpose: "Abastecer veículos e equipamentos" },
];

function catalogEntryForKey(key: string) {
  return content.catalog.find(item => catalogKey(item) === key);
}

export function quickSearchResourceForKey(key: string): QuickSearchResource | undefined {
  const item = catalogEntryForKey(key);
  if (!item) return undefined;
  if (item.category === "Bebidas") return "water";
  if (item.category === "Alimentos") return "food";
  if (item.category === "Medicamentos e cuidado") return "medicine";
  if (item.category === "Suprimentos abstratos" && item.name === "Peças (1 unidade)") return "parts";
  if (item.category === "Suprimentos abstratos" && item.name === "Combustível (1 unidade)") return "fuel";
  return undefined;
}

function quickSearchPriority(resource: QuickSearchResource, key: string) {
  const item = catalogEntryForKey(key);
  const name = item?.name ?? key;
  if (resource === "water" && /\bágua\b/i.test(name)) return 0;
  if (resource === "medicine" && /kit médico|bolsa de tratamento|caixa clínica/i.test(name)) return 0;
  return 1;
}

export function quickSearchOptions(area: SearchArea): QuickSearchOption[] {
  const keys = deepSearchCandidateKeys(area);
  return quickSearchDefinitions.map(definition => {
    const matchingKeys = keys
      .filter(key => quickSearchResourceForKey(key) === definition.id)
      .sort((a, b) => quickSearchPriority(definition.id, a) - quickSearchPriority(definition.id, b));
    const key = matchingKeys[0];
    const item = key ? catalogEntryForKey(key) : undefined;
    const matches = matchingKeys.map(match => catalogEntryForKey(match)?.name ?? match);
    return {
      ...definition,
      available: Boolean(key),
      ...(key ? { key, itemName: item?.name ?? key } : {}),
      matches,
      reason: key
        ? definition.label + " é plausível nesta área porque a tabela “" + area.table + "” contém " + (matches.length === 1 ? matches[0] : matches.length + " achados compatíveis") + "."
        : definition.label + " não aparece entre os achados previstos para “" + area.name + "” (" + area.table + "). Tente outra área ou use “Outro item justificado na ficção”.",
    };
  });
}
export type VisibleStockSuggestion =
  | { kind: "item"; catalogKey: string; itemName: string; quantity: number; table: string; reason: string }
  | { kind: "none"; table: string; reason: string };

const visibleSuggestionCategories = new Set([
  "Bebidas", "Alimentos", "Medicamentos e cuidado", "Ferramentas, acesso e reparo",
  "Luz, comunicação e informação", "Abrigo, transporte e mochilas", "Trajes e acessórios",
  "Suprimentos abstratos",
]);

function visibleSuggestionCandidates(area: SearchArea) {
  const table = lootDefinitions.find(row => row.table === area.table);
  if (!table) return [];
  return table.entries.flatMap(entry => searchLoot(area, entry.roll)).filter(item => {
    const catalog = catalogEntryForKey(item.catalogKey);
    return Boolean(catalog && visibleSuggestionCategories.has(catalog.category));
  });
}

/** Sugestão leve: 35% em áreas buscáveis e 60% em áreas narrativas. Não altera estado. */
export function suggestVisibleStock(area: SearchArea, random = Math.random): VisibleStockSuggestion {
  const chance = area.searchable === false ? 0.60 : 0.35;
  const candidates = visibleSuggestionCandidates(area);
  if (!candidates.length || random() >= chance) return {
    kind: "none", table: area.table,
    reason: "Nada evidente chama atenção em “" + area.name + "”. O restante depende de busca ou decisão do mestre.",
  };
  const picked = candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
  const catalog = catalogEntryForKey(picked.catalogKey)!;
  const quantity = Math.max(1, Math.min(2, picked.qty));
  return {
    kind: "item", catalogKey: picked.catalogKey, itemName: catalog.name, quantity, table: area.table,
    reason: catalog.name + " é plausível como algo já visível em “" + area.name + "” pela tabela “" + area.table + "”. Esta sugestão não consome busca, tempo ou Barulho.",
  };
}

export function prepareLocationForExploration(game: GameState, hexId: string, pointId: string, random = Math.random): string | null {
  const point = pointAt(game, hexId, pointId);
  if (!point || isCluePoint(point)) return "Este local não está disponível para exploração.";
  prepareLocation(point);
  const prep = point.preparation;
  if (!prep) return "Não foi possível preparar este local.";

  const established: string[] = [];
  for (const area of prep.areas) {
    const apparent = prep.stock.filter(row => row.areaId === area.id && row.attemptId === undefined);
    if (apparent.length) {
      area.visibleOutcome = "item";
      continue;
    }
    if (area.visibleOutcome) continue;
    const suggestion = suggestVisibleStock(area, random);
    if (suggestion.kind === "none") {
      area.visibleOutcome = "none";
      continue;
    }
    const entry = content.catalog.find(row => catalogKey(row) === suggestion.catalogKey);
    if (!entry || prep.stock.length >= 240) {
      area.visibleOutcome = "none";
      continue;
    }
    const id = createId();
    prep.stock.push({
      id,
      areaId: area.id,
      item: itemFromCatalog(entry, suggestion.quantity, "Íntegro", game.day),
      remaining: suggestion.quantity,
      accessible: area.collectible !== false,
    });
    area.visibleOutcome = "item";
    established.push(`${suggestion.quantity} × ${entry.name} em ${area.name}`);
  }
  if (established.length) addLog(game, "busca", `${point.name}: itens aparentes estabelecidos automaticamente — ${established.join(" · ")}.`);
  return null;
}
export function deepSearchCandidateKeys(area: SearchArea) {
  const table = lootDefinitions.find(row => row.table === area.table);
  if (!table) return [];
  return [...new Set(table.entries.flatMap(row => [
    ...row.items.map(item => item.catalogKey),
    ...(row.fallback ?? []).map(item => item.catalogKey),
    ...(row.choices ?? []),
  ]))];
}

export function startDeepSearch(game: GameState, input: StartDeepSearch): string | null {
  const point = pointAt(game, input.hexId, input.pointId);
  const prep = point?.preparation;
  if (prep?.attempts.some(row => row.id === input.id)) return null;
  const available = searchAvailabilityError(game, input.hexId, input.pointId);
  if (available) return available;
  const area = prep?.areas.find(row => row.id === input.areaId);
  if (!point || !prep || !area) return "Prepare o local e escolha uma área existente.";
  const proposed = pendingPlayerSearchOperation(game, input.hexId, input.pointId, input.areaId);
  if (proposed && proposed.id !== input.id) return "Já existe uma busca proposta ou em andamento para esta área.";
  if (area.searchable === false) return "Esta área não possui busca de recursos.";
  const normal = prep.attempts.find(row => row.areaId === area.id && (row.kind ?? "normal") === "normal");
  if (!normal || normal.status !== "completed") return "Conclua a busca normal desta área antes de vasculhar a fundo.";
  if (prep.attempts.some(row => row.areaId === area.id && row.kind === "deep")
    || point.searches.some(row => row.depth === "deep" && normalizedSector(searchAreaLabel(point, row.sector)) === normalizedSector(area.name))) {
    return "Esta área já recebeu uma busca profunda.";
  }
  if (deepSearchesUsed(point) >= deepSearchLimit(point)) {
    return `Este local já usou ${deepSearchLimit(point)} busca(s) profunda(s). Escolha com cuidado onde vasculhar a fundo.`;
  }
  if (!input.id || input.id.length > 120 || !input.objective.trim() || input.objective.length > 2400
    || !input.purpose.trim() || input.purpose.length > 2400) return "Defina o foco da busca profunda.";
  const candidates = deepSearchCandidateKeys(area);
  if (!candidates.includes(input.catalogKey)) return "Escolha um item plausível para esta área.";
  if (prep.stock.some(row => row.areaId === area.id && row.item.catalogKey === input.catalogKey && row.remaining > 0)) {
    return "Esse item já é conhecido nesta área. Recolha o estoque antes de procurar outra coisa.";
  }
  const present = survivorsAtHex(game, input.hexId).map(person => person.id);
  if (!input.participants.length || new Set(input.participants).size !== input.participants.length
    || input.participants.some(id => !present.includes(id))) return "Escolha os participantes presentes neste hex.";
  const commitmentIssue = timedActionParticipantIssue(game, input.participants, "uma busca profunda");
  if (commitmentIssue) return commitmentIssue;
  if (!participantTimePreview(game, input.participants, 30).ok) return "A busca profunda precisa terminar antes da passagem de dia para este grupo.";
  if (prep.attempts.length >= 80 || point.searches.length >= 80) return "O local atingiu o limite de buscas.";
  const snapshot = structuredClone(area);
  snapshot.difficulty = 13;
  snapshot.access = "risk";
  prep.attempts.push({
    id: input.id, areaId: area.id, participants: [...input.participants], mode: "specific", kind: "deep",
    objective: input.objective.trim(), purpose: input.purpose.trim(), catalogKey: input.catalogKey, quantity: 1,
    minutes: 30, noise: Math.min(5, Math.max(1, area.noise + 1)), areaSnapshot: snapshot, status: "pending",
  });
  return null;
}

export type SearchRollInput = { actorId: string; trait: string; edge: Edge; experiences: ("origin" | "free")[]; other: number; mentorId?: string };
export function searchMentors(game: GameState, hexId: string, pointId: string, attemptId: string, actorId: string) {
  const attempt = pointAt(game, hexId, pointId)?.preparation?.attempts.find(row => row.id === attemptId);
  const origin = content.origins.find(row => row.name === "Docente")!;
  return survivorsAtHex(game, hexId).filter(row => row.id !== actorId && row.origin === origin.name
    && row.stress < 6 && attempt?.participants.includes(row.id) && abilityAvailable(game, row.id, `origin:${origin.name}`, origin.effect));
}
export function rollSearchAccess(game: GameState, hexId: string, pointId: string, attemptId: string,
  input: SearchRollInput, die = rollDie): string | null {
  const prep = pointAt(game, hexId, pointId)?.preparation;
  const attempt = prep?.attempts.find(row => row.id === attemptId);
  if (!attempt) return "Busca não encontrada.";
  if (attempt.outcome) return null;
  if (attempt.status !== "pending") return "Esta busca não exige uma rolagem de acesso.";
  const error = searchAvailabilityError(game, hexId, pointId);
  if (error) return error;
  const actor = survivorsAtHex(game, hexId).find(row => row.id === input.actorId && attempt.participants.includes(row.id));
  if (!actor || !Object.hasOwn(actor.attributes, input.trait) || !Number.isInteger(input.other) || Math.abs(input.other) > 20
    || !["none", "advantage", "disadvantage"].includes(input.edge)
    || new Set(input.experiences).size !== input.experiences.length
    || input.experiences.some(row => !["origin", "free"].includes(row)) || actor.hope < input.experiences.length) return "Confira o ator, atributo e custos da rolagem.";
  if (input.mentorId) {
    const mentor = survivorsAtHex(game, hexId).find(row => row.id === input.mentorId && attempt.participants.includes(row.id));
    const origin = content.origins.find(row => row.name === "Docente")!;
    if (!mentor || mentor.id === actor.id || mentor.origin !== origin.name || mentor.stress >= 6
      || !abilityAvailable(game, mentor.id, `origin:${origin.name}`, origin.effect)) return "O apoio de Docente não está disponível para esta ação.";
    if (!recordAbilityUse(game, mentor.id, `origin:${origin.name}`, origin.feature, origin.effect, "stress1")) return "Não foi possível registrar o apoio.";
  }
  const outcome = resolveActionRoll({ hopeDie: die(12), fearDie: die(12), trait: actor.attributes[input.trait],
    experience: input.experiences.length * 2, other: input.other + (input.mentorId ? 1 : 0) + (equipmentModifiers(actor).traits[input.trait] ?? 0),
    symptom: actor.infection === "Sintomático" && ["Agilidade", "Força"].includes(input.trait) ? -1 : 0, edge: input.edge,
    edgeDie: input.edge === "none" ? null : die(6), difficulty: (attempt.areaSnapshot ?? prep!.areas.find(row => row.id === attempt.areaId)!).difficulty });
  const resources = resolveRollResources({ hope: actor.hope, stress: actor.stress, fear: game.fear,
    experienceCost: input.experiences.length, reaction: false, outcome });
  actor.hope = resources.hope!; actor.stress = resources.stress!; game.fear = resources.fear;
  attempt.outcome = outcome; attempt.actorId = actor.id; attempt.status = "ready";
  addLog(game, "dados", `${actor.name}: ${attempt.kind === "deep" ? "busca profunda" : "acesso à busca"} — ${outcome.total}, ${outcome.success ? "sucesso" : "falha"} com ${outcome.with === "Hope" ? "Esperança" : "Medo"}.`, actor.id);
  return null;
}

export function rollSearchLoot(game: GameState, hexId: string, pointId: string, attemptId: string, die = rollDie) {
  const prep = pointAt(game, hexId, pointId)?.preparation;
  const attempt = prep?.attempts.find(row => row.id === attemptId);
  if (!attempt || attempt.mode !== "open" || attempt.status !== "ready" || attempt.outcome?.success === false) return false;
  if (attempt.roll) return true;
  if (searchAvailabilityError(game, hexId, pointId)) return false;
  attempt.roll = die(12);
  const area = attempt.areaSnapshot ?? prep!.areas.find(row => row.id === attempt.areaId)!;
  attempt.effectiveRoll = attempt.roll;
  while (area.excludedRolls?.includes(attempt.effectiveRoll)) attempt.effectiveRoll = attempt.effectiveRoll % 12 + 1;
  if (attempt.effectiveRoll !== attempt.roll) attempt.adjustmentReason = area.exclusionReason;
  return true;
}

export function searchLoot(area: SearchArea, roll: number): LootItem[] {
  const entry = lootDefinitions.find(row => row.table === area.table)?.entries.find(row => row.roll === roll);
  if (!entry) return [];
  if (entry.requirement && !area[entry.requirement]) return entry.fallback ?? [];
  return entry.choices ? [{ catalogKey: entry.choices.find(key => key === `Munição::Munição de ${area.ammunition}`) ?? entry.choices[0], qty: 1 }] : entry.items;
}

export function searchResult(point: Point, attempt: SearchAttempt) {
  if (attempt.outcome?.success === false) return attempt.kind === "deep"
    ? "A busca profunda não encontrou nada útil."
    : "Acesso falhou; nenhum achado foi sorteado.";
  const area = attempt.areaSnapshot ?? point.preparation!.areas.find(row => row.id === attempt.areaId)!;
  const items = attempt.mode === "specific" ? [{ catalogKey: attempt.catalogKey!, qty: attempt.quantity }]
    : attempt.roll ? searchLoot(area, attempt.effectiveRoll ?? attempt.roll) : [];
  return items.map(item => `${item.qty} × ${content.catalog.find(row => catalogKey(row) === item.catalogKey)?.name ?? item.catalogKey}${item.battery === "Descarregada" ? " (sem bateria)" : ""}`).join("; ");
}

/** Commit clock, ability, stock and history together. All validation runs on a clone. */
export function completeSearch(game: GameState, hexId: string, pointId: string, attemptId: string, options: { advanceTime?: boolean } = {}): string | null {
  const draft = structuredClone(game);
  const readyBefore = new Set(Object.entries(draft.hexes).flatMap(([candidateHexId, hex]) =>
    hex.events.filter(event => eventTriggerReady(draft, candidateHexId, event)).map(event => event.id)));
  const point = pointAt(draft, hexId, pointId);
  const prep = point?.preparation;
  const attempt = prep?.attempts.find(row => row.id === attemptId);
  if (!point || !prep || !attempt) return "Busca não encontrada.";
  if (["completed", "failed"].includes(attempt.status)) return null;
  const availability = searchAvailabilityError(draft, hexId, pointId);
  if (availability) return availability;
  if (attempt.participants.some(id => !survivorsAtHex(draft, hexId).some(row => row.id === id))) return "Os participantes mudaram de hex; retome com o grupo presente.";
  const commitmentIssue = timedActionParticipantIssue(draft, attempt.participants, attempt.kind === "deep" ? "uma busca profunda" : "uma busca");
  if (commitmentIssue) return commitmentIssue;
  const area = attempt.areaSnapshot ?? prep.areas.find(row => row.id === attempt.areaId)!;
  if (attempt.status !== "ready" || (attempt.mode === "open" && attempt.outcome?.success !== false && !attempt.roll)) return "Resolva o acesso e o achado antes de confirmar.";
  const timePreview = participantTimePreview(draft, attempt.participants, attempt.minutes);
  if (options.advanceTime !== false && !timePreview.ok) return "A busca precisa terminar antes da passagem de dia para este grupo.";
  if (prep.stock.length >= 240 || point.searches.length >= 80) return "O local atingiu o limite de registros.";
  if (attempt.warehouseWorker && !recordAbilityUse(draft, attempt.warehouseWorker, `origin:${warehouseOrigin}`,
    warehouseOrigin, warehouseEffect(), "free")) return "A habilidade de depósito foi usada em outra operação.";
  const result = searchResult(point, attempt);
  const items = attempt.outcome?.success === false ? [] : attempt.mode === "specific"
    ? [{ catalogKey: attempt.catalogKey!, qty: attempt.quantity }] : searchLoot(area, attempt.effectiveRoll ?? attempt.roll!);
  const timeResult = options.advanceTime === false ? { ok: true, overlapMinutes: 0 } : advanceParticipantTime(draft, attempt.participants, attempt.minutes);
  if (!timeResult.ok) return "Não foi possível avançar o relógio.";
  attempt.stockIds = [];
  for (const found of items) {
    const entry = content.catalog.find(row => catalogKey(row) === found.catalogKey);
    if (!entry) return "O achado não existe no catálogo.";
    const item = itemFromCatalog(entry, found.qty, "Íntegro", draft.day);
    if (found.battery) item.battery = found.battery;
    const id = createId();
    prep.stock.push({ id, areaId: area.id, attemptId: attempt.id, item, remaining: item.qty, accessible: area.collectible !== false,
      ...(area.table === "Ruas / veículos abandonados" && (attempt.effectiveRoll ?? attempt.roll) === 11 ? { requiresFuelContainer: true } : {}) });
    attempt.stockIds.push(id);
  }
  const sequence = searchSequence(draft, hexId);
  point.searches.push({ id: attempt.id, what: attempt.objective || "Achado útil", why: attempt.purpose,
    sector: area.name, minutes: attempt.minutes, result, mode: attempt.mode, table: area.table, roll: attempt.roll,
    depth: attempt.kind === "deep" ? "deep" : "normal" });
  draft.hexes[hexId].searchSequence = sequence + 1;
  draft.noise = Math.min(5, draft.noise + attempt.noise);
  attempt.status = attempt.outcome?.success === false ? "failed" : "completed"; attempt.result = result;
  const timing = timeResult.overlapMinutes ? ` · ${parallelTimeLabel(timeResult as ReturnType<typeof advanceParticipantTime>)}` : "";
  const triggered = Object.entries(draft.hexes).some(([candidateHexId, hex]) =>
    hex.events.some(event => eventTriggerReady(draft, candidateHexId, event) && !readyBefore.has(event.id)));
  const needsAttention = attempt.outcome?.success === false || attempt.outcome?.with === "Fear" || draft.noise >= 3 || triggered;
  if (needsAttention && draft.playerActions) draft.playerActions.policy.paused = true;
  const names = attempt.participants.map(id => draft.survivors.find(person => person.id === id)?.name ?? "Sobrevivente").join(", ");
  const mode = attempt.kind === "deep" ? "busca profunda" : attempt.mode === "open" ? "busca geral" : "busca específica";
  const focus = attempt.mode === "specific" ? ` de ${attempt.objective}` : "";
  const roll = attempt.mode === "open" && attempt.roll ? ` · d12 ${attempt.roll}${attempt.effectiveRoll && attempt.effectiveRoll !== attempt.roll ? ` → ${attempt.effectiveRoll}` : ""}` : "";
  addLog(draft, "busca", `${names}: ${mode}${focus} em ${point.name} / ${area.name} (Hex ${hexId})${roll}. Resultado: ${result || "Nenhum achado útil."} Finalidade: ${attempt.purpose}. ${attempt.minutes} min · Barulho +${attempt.noise}${timing}.${draft.noise >= 3 ? " Barulho elevado: o mestre decide a consequência na cena." : ""}${triggered ? " Um acontecimento ficou pronto." : ""}`, attempt.actorId ?? attempt.participants[0], attempt.participants);
  Object.assign(game, draft);
  return null;
}

export type CollectionLine = { stockId: string; ownerId: string; quantity: number; cartId?: string };
export function collectLocationStock(game: GameState, hexId: string, pointId: string, operationId: string, lines: CollectionLine[]): string | null {
  const draft = structuredClone(game);
  const prep = pointAt(draft, hexId, pointId)?.preparation;
  if (!prep) return "Prepare o local primeiro.";
  if (prep.collections.some(row => row.id === operationId)) return null;
  if (!operationId || !lines.length || lines.length > 240 || prep.collections.length >= 200) return "Escolha os itens a recolher.";
  const error = searchAvailabilityError(draft, hexId, pointId);
  if (error) return error;
  const collected = new Map<string, string[]>();
  for (const line of lines) {
    const stock = prep.stock.find(row => row.id === line.stockId);
    const actor = survivorsAtHex(draft, hexId).find(row => row.id === line.ownerId);
    const shared = line.ownerId === "shared" && draft.shelter.hex === hexId;
    if (!stock || stock.accessible === false || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > stock.remaining || (!actor && !shared)) return "O estoque, o acesso, a quantidade ou o destinatário mudou.";
    const incoming = { ...stock.item, qty: line.quantity };
    expirePhysicalFood(draft, [incoming]);
    const areaName = prep.areas.find(area => area.id === stock.areaId)?.name ?? "Área";
    const details = `${line.quantity} × ${incoming.name} (${stock.attemptId ? "encontrado na busca" : "à vista"} · ${areaName}${incoming.condition && incoming.condition !== "Íntegro" ? ` · ${incoming.condition}` : ""}${incoming.battery === "Descarregada" ? " · sem bateria" : ""}) → ${shared ? "estoque do abrigo" : stock.requiresFuelContainer ? "galão no inventário" : line.cartId ? "carrinho aberto" : "inventário pessoal"}`;
    collected.set(line.ownerId, [...(collected.get(line.ownerId) ?? []), details]);
    if (shared) addStack(draft.shelter.inventory ??= [], incoming);
    else {
      if (line.cartId) {
        const cart = actor!.inventory.find(row => row.id === line.cartId && row.name === "Carrinho dobrável" && row.cartDeployed);
        if (!cart || stock.requiresFuelContainer || incoming.name === "Carrinho dobrável") return "Escolha um carrinho aberto e um item compatível.";
        addStack(cart.cartItems ??= [], incoming);
      } else addStack(actor!.inventory, incoming);
      if (stock.requiresFuelContainer) {
        for (let unit = 0; unit < line.quantity; unit++) {
          const gallon = actor!.inventory.find(item => item.name === "Galão vazio" && !item.storedAmount);
          if (!gallon || !fillReusableContainer(draft, actor!.id, gallon.id, "fuel", 1)) return "Combustível em tanque precisa de um galão vazio para transporte.";
        }
      }
      const stats = survivorStats(actor!);
      if (stats.carried > stats.capacity || (stats.cart && stats.cart.carried > stats.cart.capacity)) return `${actor!.name} não tem capacidade para estes itens. Deixe o excesso no local.`;
    }
    stock.remaining -= line.quantity;
  }
  prep.collections.push({ id: operationId, lines: structuredClone(lines) });
  const remaining = prep.stock.reduce((sum, stock) => sum + stock.remaining, 0);
  for (const [ownerId, items] of collected) {
    const name = draft.survivors.find(person => person.id === ownerId)?.name ?? "Abrigo";
    addLog(draft, "inventário", `${name} recolheu em ${pointAt(draft, hexId, pointId)!.name} (Hex ${hexId}): ${items.join("; ")}. ${remaining ? `${remaining} unidade(s) continuam no local.` : "Todos os achados foram recolhidos."}`, ownerId === "shared" ? undefined : ownerId);
  }
  Object.assign(game, draft);
  return null;
}

export function suggestCollection(game: GameState, hexId: string, pointId: string, participantIds?: string[]): CollectionLine[] {
  const draft = structuredClone(game);
  const lines: CollectionLine[] = [];
  const carriers = () => survivorsAtHex(draft, hexId).filter(row => !participantIds || participantIds.includes(row.id));
  for (const stock of pointAt(draft, hexId, pointId)?.preparation?.stock ?? []) {
    if (stock.accessible === false) continue;
    const remaining = stock.remaining;
    for (let i = 0; i < remaining; i++) {
      if (stock.requiresFuelContainer) {
        const actor = carriers().find(person => {
          const candidate = structuredClone(draft);
          return !collectLocationStock(candidate, hexId, pointId, createId(), [{ stockId: stock.id, ownerId: person.id, quantity: 1 }]);
        });
        if (!actor) break;
        collectLocationStock(draft, hexId, pointId, createId(), [{ stockId: stock.id, ownerId: actor.id, quantity: 1 }]);
        const line = lines.find(row => row.stockId === stock.id && row.ownerId === actor.id);
        if (line) line.quantity++; else lines.push({ stockId: stock.id, ownerId: actor.id, quantity: 1 });
        continue;
      }
      const destinations = carriers().flatMap(person => [{ person, cartId: undefined as string | undefined },
        ...person.inventory.filter(row => row.name === "Carrinho dobrável" && row.cartDeployed && stock.item.name !== "Carrinho dobrável")
          .map(row => ({ person, cartId: row.id }))]);
      const cartFirst = game.explorationPreferences?.transport === "cart-first";
      destinations.sort((a, b) => cartFirst ? Number(Boolean(b.cartId)) - Number(Boolean(a.cartId)) : Number(Boolean(a.cartId)) - Number(Boolean(b.cartId)));
      const destination = destinations.find(({ person, cartId }) => {
        const candidate = structuredClone(person);
        const items = cartId ? candidate.inventory.find(row => row.id === cartId)!.cartItems ??= [] : candidate.inventory;
        addStack(items, { ...stock.item, qty: 1 });
        const stats = survivorStats(candidate);
        return stats.carried <= stats.capacity && (!stats.cart || stats.cart.carried <= stats.cart.capacity);
      });
      if (!destination) break;
      const { person, cartId } = destination;
      const items = cartId ? person.inventory.find(row => row.id === cartId)!.cartItems ??= [] : person.inventory;
      addStack(items, { ...stock.item, qty: 1 });
      const line = lines.find(row => row.stockId === stock.id && row.ownerId === person.id && row.cartId === cartId);
      if (line) line.quantity++; else lines.push({ stockId: stock.id, ownerId: person.id, quantity: 1, ...(cartId ? { cartId } : {}) });
    }
  }
  return lines;
}

/** Physical deposit reuses existing inventory transfers and never converts resources. */
export function depositExpeditionItems(game: GameState, survivorIds: string[]): string | null {
  const draft = structuredClone(game);
  if (!draft.shelter.hex) return "Estabeleça um abrigo antes de guardar os achados.";
  if (!survivorIds.length) return "Escolha quem vai guardar os itens.";
  for (const id of survivorIds) {
    const person = draft.survivors.find(row => row.id === id);
    if (!person || (person.hex ?? draft.partyHex) !== sharedStorageHex(draft)) return "Todos precisam estar no abrigo para guardar os itens.";
    for (const cart of person.inventory.filter(item => item.cartDeployed)) for (const item of [...(cart.cartItems ?? [])]) {
      if (!removeFromCart(person, cart.id, item.id, item.qty)) return "Não foi possível descarregar o carrinho.";
    }
    for (const item of [...person.inventory]) {
      const quantity = item.qty - (item.committedAmmo ?? 0);
      if (item.cartDeployed || quantity <= 0) continue;
      if (!transferItem(draft, id, "shared", item.id, quantity)) return "Não foi possível guardar este item.";
    }
  }
  addLog(draft, "inventário", "Itens carregados guardados fisicamente no abrigo.");
  Object.assign(game, draft);
  return null;
}

export function expireLocationFood(game: GameState) {
  const expired: string[] = [];
  for (const hex of Object.values(game.hexes)) for (const point of hex.points) for (const stock of point.preparation?.stock ?? []) {
    if (!stock.remaining) continue;
    const item = { ...stock.item, qty: stock.remaining };
    expired.push(...expirePhysicalFood(game, [item]).map(text => `${point.name}: ${text}`));
    stock.item.condition = item.condition;
  }
  return expired;
}

export function resolvePreparedSearch(game: GameState, input: StartSearch, _die = rollDie): string | null {
  const draft = structuredClone(game);
  const error = schedulePreparedSearch(draft, input, false, _die);
  if (error) return error;
  const attempt = pointAt(draft, input.hexId, input.pointId)!.preparation!.attempts.find(row => row.id === input.id)!;
  if (["completed", "failed"].includes(attempt.status)) { Object.assign(game, draft); return null; }
  if (attempt.status === "pending") { Object.assign(game, draft); return null; }
  // Equipes separadas aguardam a conclusão; uma equipe única já foi resolvida.
  Object.assign(game, draft);
  return null;
}

export function finishPreparedSearch(game: GameState, hexId: string, pointId: string, attemptId: string, _die = rollDie): string | null {
  const draft = structuredClone(game);
  const attempt = pointAt(draft, hexId, pointId)?.preparation?.attempts.find(row => row.id === attemptId);
  if (!attempt) return "Busca não encontrada.";
  if (["completed", "failed"].includes(attempt.status)) return null;
  if (attempt.status !== "ready") return "Resolva o acesso antes de confirmar.";
  if (!runningActivities(draft).some(a => a.type === "search" && a.attemptId === attemptId)) {
    // Buscas antigas ainda abertas entram na linha do tempo a partir de agora.
    const scheduled = scheduleActivity(draft, { type: "search", pointId, attemptId }, attempt.participants, attempt.minutes,
      `Busca em ${pointAt(draft, hexId, pointId)!.name}`, { id: attemptId, operationId: attemptId });
    if (!scheduled.ok) return scheduled.message;
  }
  completeSingleGroupActivity(draft, attemptId, _die);
  Object.assign(game, draft);
  return null;
}

export function schedulePreparedSearch(game: GameState, input: StartSearch | StartDeepSearch, deep = false, die = rollDie): string | null {
  const draft = structuredClone(game);
  const error = deep ? startDeepSearch(draft, input as StartDeepSearch) : startSearch(draft, input as StartSearch);
  if (error) return error;
  const point = pointAt(draft, input.hexId, input.pointId)!;
  const attempt = point.preparation!.attempts.find(a => a.id === input.id)!;
  if (["completed", "failed"].includes(attempt.status)) return null;
  const scheduled = scheduleActivity(draft, { type: "search", pointId: input.pointId, attemptId: input.id }, input.participants,
    attempt.minutes, `${deep ? "Busca profunda" : "Busca"} em ${point.name}`, { id: input.id, operationId: input.id });
  if (!scheduled.ok) return scheduled.message;
  if (attempt.status === "ready") completeSingleGroupActivity(draft, scheduled.activity.id, die);
  Object.assign(game, draft);
  return null;
}

export function schedulePreparedDeepSearch(game: GameState, input: StartDeepSearch) { return schedulePreparedSearch(game, input, true); }

export function registerVisibleStock(game: GameState, hexId: string, pointId: string, areaId: string,
  id: string, key: string, quantity: number): string | null {
  const point = pointAt(game, hexId, pointId);
  const prep = point?.preparation;
  const area = prep?.areas.find(row => row.id === areaId);
  if (!prep || !area) return "Escolha uma área existente.";
  if (prep.stock.some(row => row.id === id)) return null;
  const entry = content.catalog.find(row => catalogKey(row) === key);
  if (!entry || !id || id.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || prep.stock.length >= 240) return "Confira o item conhecido e a quantidade.";
  prep.stock.push({ id, areaId, item: itemFromCatalog(entry, quantity, "Íntegro", game.day), remaining: quantity, accessible: true });
  area.visibleOutcome = "item";
  addLog(game, "busca", `${point!.name} / ${area.name}: ${quantity} × ${entry.name} estabelecido à vista, sem busca ou tempo adicional.`);
  return null;
}

export function resolveNoVisibleStock(game: GameState, hexId: string, pointId: string, areaId: string): string | null {
  const point = pointAt(game, hexId, pointId);
  const prep = point?.preparation;
  const area = prep?.areas.find(row => row.id === areaId);
  if (!point || !prep || !area) return "Escolha uma área existente.";
  if (area.visibleOutcome === "item" || prep.stock.some(row => row.areaId === areaId && row.attemptId === undefined)) {
    return "Já existe um item aparente estabelecido nesta área.";
  }
  if (area.visibleOutcome === "none") return null;
  area.visibleOutcome = "none";
  addLog(game, "busca", `${point.name} / ${area.name}: nada relevante estabelecido à vista.`);
  return null;
}

registerActivityHandler("search", (game, activity, die) => {
  if (activity.type !== "search") return { ok: false, message: "Busca inválida." };
  const attempt = pointAt(game, activity.hexId, activity.pointId)?.preparation?.attempts.find(a => a.id === activity.attemptId);
  if (!attempt || attempt.status === "pending") return { ok: false, message: "Resolva o acesso da busca antes de concluir este horário." };
  if (attempt.mode === "open" && attempt.outcome?.success !== false && !attempt.roll) rollSearchLoot(game, activity.hexId, activity.pointId, activity.attemptId, die);
  const error = completeSearch(game, activity.hexId, activity.pointId, activity.attemptId, { advanceTime: false });
  if (error) return { ok: false, message: error };
  const completed = pointAt(game, activity.hexId, activity.pointId)!.preparation!.attempts.find(a => a.id === activity.attemptId)!;
  const op = game.playerActions?.operations.find(op => op.id === activity.operationId);
  if (op) {
    if (completed.outcome?.success === false) op.attention = "Falha no acesso: o mestre resolve a consequência narrativa. Nenhum achado foi sorteado.";
    if (completed.outcome?.with === "Fear") op.attention = "Rolagem com Medo: o mestre escolhe a complicação; os achados de um sucesso são preservados.";
  }
  return { ok: true, message: completed.result || "Busca concluída sem achados." };
});
