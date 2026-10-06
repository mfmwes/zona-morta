import definitions from "./loot-definitions.json";
import { addLog, content, survivorStats, survivorsAtHex, type GameState, type Point } from "./game";
import { createId } from "./id";
import { addStack, catalogKey, fillReusableContainer, itemFromCatalog, removeFromCart, sharedStorageHex, transferItem } from "./inventory";
import { expirePhysicalFood } from "./provisions";
import { normalizedSector, searchAreaLabel, searchAvailabilityError } from "./exploration";
import { advanceCampaignTime } from "./time";
import { abilityAvailable, recordAbilityUse } from "./abilities";
import { generateHexContent, suggestedLootTable } from "./hex-generators";
import { equipmentModifiers } from "./equipment";
import { resolveActionRoll, resolveRollResources, rollDie, type Edge } from "./rolls";
import type { SearchAttempt, SearchArea } from "./hex-automation-types";

type LootItem = { catalogKey: string; qty: number; battery?: "Carregada" | "Descarregada" };
type LootDefinition = { roll: number; items: LootItem[]; choices?: string[];
  requirement?: "armedGuard" | "compatibleOwner"; fallback?: LootItem[] };
export const lootDefinitions = definitions as { table: string; entries: LootDefinition[] }[];
export const searchSequence = (game: GameState, hexId: string) => game.hexes[hexId]?.searchSequence
  ?? game.hexes[hexId]?.points.reduce((total, point) => total + point.searches.length, 0) ?? 0;
const pointAt = (game: GameState, hexId: string, pointId: string) => game.hexes[hexId]?.points.find(p => p.id === pointId);
const warehouseOrigin = "Trabalhador(a) de depósito";
const warehouseEffect = () => content.origins.find(row => row.name === warehouseOrigin)?.effect ?? "";
const areaModels: Record<string, { name: string; signal: string; minutes: 30 | 60 }[]> = {
  "Residências / condomínios": [{ name: "Cozinha", signal: "Bancada e armários em um cômodo separado da entrada.", minutes: 30 }],
  "Mercados / depósitos de alimentos": [{ name: "Depósito dos fundos", signal: "Porta de serviço separa o estoque das prateleiras do salão.", minutes: 30 }],
  "Restaurantes / cozinhas": [{ name: "Despensa", signal: "Armário de estoque separado das bancadas de preparo.", minutes: 30 }],
  "Farmácias / consultórios": [{ name: "Sala de atendimento", signal: "Porta interna leva a um espaço de atendimento separado do balcão.", minutes: 30 }],
  "Hospitais / laboratórios": [{ name: "Ala de atendimento", signal: "Corredor separado da recepção leva às salas de atendimento.", minutes: 60 }, { name: "Manutenção", signal: "Acesso técnico independente leva a ferramentas e instalações.", minutes: 30 }],
  "Escolas / escritórios": [{ name: "Arquivo", signal: "Sala de arquivos separada dos espaços de circulação.", minutes: 30 }],
  "Oficinas / postos de serviço": [{ name: "Estoque de ferramentas", signal: "Compartimento de ferramentas separado das vagas de trabalho.", minutes: 30 }],
  "Delegacias / quartéis": [{ name: "Almoxarifado", signal: "Porta interna distingue o estoque da recepção.", minutes: 30 }],
  "Lojas de roupa / lavanderias": [{ name: "Depósito", signal: "Espaço de estoque separado da área de exposição.", minutes: 30 }],
  "Artigos esportivos / caça": [{ name: "Depósito", signal: "Área interna de estoque separada do balcão.", minutes: 30 }],
  "Galpões / centros de distribuição": [{ name: "Estoque", signal: "Prateleiras de carga ficam em uma ala separada da triagem.", minutes: 60 }, { name: "Manutenção", signal: "Oficina técnica separada das prateleiras de carga.", minutes: 30 }],
};

/** Preparation is private and idempotent. Historical searches never grant stock. */
export function prepareLocation(point: Point) {
  if (point.preparation || point.clueTargetHex) return false;
  const table = content.lootTables.find(row => row.name === point.lootTable)?.name ?? suggestedLootTable(point.name, "especial")!;
  const large = /galp|armaz|complex|hospital|supermerc|depósito|univers|fábrica/i.test(point.name);
  const models = areaModels[table] ?? [];
  const names = [...new Set(["Área principal", ...models.map(row => row.name),
    ...point.searches.map(row => searchAreaLabel(point, row.sector))])];
  const areas: SearchArea[] = names.slice(0, 80).map(name => ({ id: createId(), name, table,
    signal: name === "Área principal" ? point.signal : models.find(row => row.name === name)?.signal ?? "Área registrada em uma busca anterior.",
    minutes: models.find(row => row.name === name)?.minutes ?? (large ? 60 : 30), access: point.risk?.startsWith("alto") || point.risk?.startsWith("médio") ? "risk" : "open", difficulty: 12, noise: 0,
    armedGuard: false, compatibleOwner: false, ammunition: "Pistola", spacious: large }));
  const seenAreas = new Set<string>();
  const historical = point.searches.filter(row => {
    const area = areas.find(area => normalizedSector(area.name) === normalizedSector(searchAreaLabel(point, row.sector)));
    if (!area || seenAreas.has(area.id)) return false;
    seenAreas.add(area.id); return true;
  });
  const attempts: SearchAttempt[] = historical.map(row => ({ id: row.id,
    areaId: areas.find(area => normalizedSector(area.name) === normalizedSector(searchAreaLabel(point, row.sector)))!.id,
    participants: [], mode: row.mode ?? "specific", objective: row.what, purpose: row.why,
    quantity: 1, minutes: row.minutes, noise: 0, status: "completed", result: row.result, stockIds: [] }));
  point.preparation = { version: 1, areas, attempts, stock: [], collections: [] };
  return true;
}

export function prepareHex(game: GameState, hexId: string) {
  const hex = game.hexes[hexId];
  if (!hex) return false;
  if (!hex.points.some(p => !p.clueTargetHex) && hex.points.length < 120) {
    const generated = generateHexContent(game, hexId, "locais");
    hex.points.push({ id: createId(), name: generated.publicText.split(/[.;!?]/)[0].trim().slice(0, 120), kind: "local", signal: generated.publicText,
      access: generated.suggestedAccess ?? "", notes: generated.gmGuidance, revealed: false, searches: [],
      lootTable: generated.suggestedLootTable, condition: generated.suggestedCondition, risk: generated.suggestedRisk,
      generatorKind: "locais", generatorRoll: generated.roll, generatorCategory: generated.categoryLabel });
  }
  hex.points.forEach(prepareLocation);
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
  prep.areas.push({ ...prep.areas[0], id: createId(), name: name.trim(), signal: signal.trim() });
  return true;
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
  if (!input.id || input.id.length > 120 || input.objective.length > 2400 || input.purpose.length > 2400) return "Confira os dados da busca.";
  if (area.excludedRolls?.length && (!area.exclusionReason?.trim() || new Set(area.excludedRolls).size >= 12)) return "Registre por que os resultados contradizem a ficção e mantenha algum achado plausível.";
  if (prep.attempts.some(row => row.areaId === area.id) || point!.searches.some(row => normalizedSector(searchAreaLabel(point!, row.sector)) === normalizedSector(area.name))) return "Esta área já tem uma busca registrada. Retome a operação existente.";
  if (prep.attempts.length >= 80 || point!.searches.length >= 80) return "O local atingiu o limite de buscas.";
  const present = survivorsAtHex(game, input.hexId).map(person => person.id);
  if (!input.participants.length || new Set(input.participants).size !== input.participants.length
    || input.participants.some(id => !present.includes(id))) return "Escolha os participantes presentes neste hex.";
  if (area.access === "blocked") return "Resolva o bloqueio na ficção antes de iniciar a busca.";
  if (!input.purpose.trim()) return "Declare a finalidade da busca.";
  if (input.mode === "specific" && (!input.objective.trim() || !input.purpose.trim()
    || !content.catalog.some(row => catalogKey(row) === input.catalogKey))) return "Combine o objetivo, a finalidade e o item plausível antes da busca.";
  if (input.mode === "specific" && prep.stock.some(row => row.areaId === area.id && row.item.catalogKey === input.catalogKey)) return "Esse estoque já é conhecido. Resolva o acesso e recolha diretamente, sem outra busca.";
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) return "Escolha uma quantidade de 1 a 99.";
  if (input.warehouseWorker && (!input.participants.includes(input.warehouseWorker)
    || (!area.spacious && area.minutes !== 60)
    || !warehouseWorkers(game, input.hexId).some(row => row.id === input.warehouseWorker))) return "A habilidade de depósito não está disponível para este participante.";
  const minutes = input.warehouseWorker && area.minutes === 60 ? 30 : area.minutes;
  if (game.minutes + minutes >= 1440) return "A busca precisa terminar antes da passagem de dia.";
  prep.attempts.push({ id: input.id, areaId: area.id, participants: [...input.participants], mode: input.mode,
    objective: input.objective.trim(), purpose: input.purpose.trim(), catalogKey: input.catalogKey, quantity,
    minutes, noise: area.noise, warehouseWorker: input.warehouseWorker,
    areaSnapshot: structuredClone(area), status: area.access === "risk" ? "pending" : "ready" });
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
  addLog(game, "dados", `${actor.name}: acesso à busca — ${outcome.total}, ${outcome.success ? "sucesso" : "falha"} com ${outcome.with === "Hope" ? "Esperança" : "Medo"}.`, actor.id);
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
  if (attempt.outcome?.success === false) return "Acesso falhou; nenhum achado foi sorteado.";
  const area = attempt.areaSnapshot ?? point.preparation!.areas.find(row => row.id === attempt.areaId)!;
  const items = attempt.mode === "specific" ? [{ catalogKey: attempt.catalogKey!, qty: attempt.quantity }]
    : attempt.roll ? searchLoot(area, attempt.effectiveRoll ?? attempt.roll) : [];
  return items.map(item => `${item.qty} × ${content.catalog.find(row => catalogKey(row) === item.catalogKey)?.name ?? item.catalogKey}${item.battery === "Descarregada" ? " (sem bateria)" : ""}`).join("; ");
}

/** Commit clock, ability, stock and history together. All validation runs on a clone. */
export function completeSearch(game: GameState, hexId: string, pointId: string, attemptId: string): string | null {
  const draft = structuredClone(game);
  const point = pointAt(draft, hexId, pointId);
  const prep = point?.preparation;
  const attempt = prep?.attempts.find(row => row.id === attemptId);
  if (!point || !prep || !attempt) return "Busca não encontrada.";
  if (["completed", "failed"].includes(attempt.status)) return null;
  const availability = searchAvailabilityError(draft, hexId, pointId);
  if (availability) return availability;
  if (attempt.participants.some(id => !survivorsAtHex(draft, hexId).some(row => row.id === id))) return "Os participantes mudaram de hex; retome com o grupo presente.";
  const area = attempt.areaSnapshot ?? prep.areas.find(row => row.id === attempt.areaId)!;
  if (attempt.status !== "ready" || (attempt.mode === "open" && attempt.outcome?.success !== false && !attempt.roll)) return "Resolva o acesso e o achado antes de confirmar.";
  if (draft.minutes + attempt.minutes >= 1440) return "A busca precisa terminar antes da passagem de dia.";
  if (prep.stock.length >= 240 || point.searches.length >= 80) return "O local atingiu o limite de registros.";
  if (attempt.warehouseWorker && !recordAbilityUse(draft, attempt.warehouseWorker, `origin:${warehouseOrigin}`,
    warehouseOrigin, warehouseEffect(), "free")) return "A habilidade de depósito foi usada em outra operação.";
  const result = searchResult(point, attempt);
  const items = attempt.outcome?.success === false ? [] : attempt.mode === "specific"
    ? [{ catalogKey: attempt.catalogKey!, qty: attempt.quantity }] : searchLoot(area, attempt.effectiveRoll ?? attempt.roll!);
  if (!advanceCampaignTime(draft, attempt.minutes).ok) return "Não foi possível avançar o relógio.";
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
    sector: area.name, minutes: attempt.minutes, result, mode: attempt.mode, table: area.table, roll: attempt.roll });
  draft.hexes[hexId].searchSequence = sequence + 1;
  draft.noise = Math.min(5, draft.noise + attempt.noise);
  attempt.status = attempt.outcome?.success === false ? "failed" : "completed"; attempt.result = result;
  addLog(draft, "busca", `${point.name} / ${area.name}: ${result} · ${attempt.minutes} min.${draft.noise >= 3 ? " Barulho elevado: o mestre decide a consequência na cena." : ""}`);
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
  for (const line of lines) {
    const stock = prep.stock.find(row => row.id === line.stockId);
    const actor = survivorsAtHex(draft, hexId).find(row => row.id === line.ownerId);
    const shared = line.ownerId === "shared" && draft.shelter.hex === hexId;
    if (!stock || stock.accessible === false || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > stock.remaining || (!actor && !shared)) return "O estoque, o acesso, a quantidade ou o destinatário mudou.";
    const incoming = { ...stock.item, qty: line.quantity };
    expirePhysicalFood(draft, [incoming]);
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
  addLog(draft, "inventário", `Achados recolhidos de ${pointAt(draft, hexId, pointId)!.name}; o restante continua no local.`);
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

export function resolvePreparedSearch(game: GameState, input: StartSearch, die = rollDie): string | null {
  const draft = structuredClone(game);
  const error = startSearch(draft, input);
  if (error) return error;
  const attempt = pointAt(draft, input.hexId, input.pointId)!.preparation!.attempts.find(row => row.id === input.id)!;
  if (["completed", "failed"].includes(attempt.status)) return null;
  if (attempt.status === "pending") { Object.assign(game, draft); return null; }
  if (attempt.mode === "open") rollSearchLoot(draft, input.hexId, input.pointId, input.id, die);
  const completion = completeSearch(draft, input.hexId, input.pointId, input.id);
  if (completion) return completion;
  Object.assign(game, draft);
  return null;
}

export function finishPreparedSearch(game: GameState, hexId: string, pointId: string, attemptId: string, die = rollDie): string | null {
  const draft = structuredClone(game);
  const attempt = pointAt(draft, hexId, pointId)?.preparation?.attempts.find(row => row.id === attemptId);
  if (attempt?.mode === "open" && attempt.status === "ready" && attempt.outcome?.success !== false) rollSearchLoot(draft, hexId, pointId, attemptId, die);
  const error = completeSearch(draft, hexId, pointId, attemptId);
  if (error) return error;
  Object.assign(game, draft);
  return null;
}

export function registerVisibleStock(game: GameState, hexId: string, pointId: string, areaId: string,
  id: string, key: string, quantity: number): string | null {
  const point = pointAt(game, hexId, pointId);
  const prep = point?.preparation;
  if (!prep || !prep.areas.some(row => row.id === areaId)) return "Escolha uma área existente.";
  if (prep.stock.some(row => row.id === id)) return null;
  const entry = content.catalog.find(row => catalogKey(row) === key);
  if (!entry || !id || id.length > 120 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || prep.stock.length >= 240) return "Confira o item conhecido e a quantidade.";
  prep.stock.push({ id, areaId, item: itemFromCatalog(entry, quantity, "Íntegro", game.day), remaining: quantity, accessible: true });
  addLog(game, "busca", `${point!.name}: ${quantity} × ${entry.name} estabelecido à vista, sem busca ou tempo adicional.`);
  return null;
}
