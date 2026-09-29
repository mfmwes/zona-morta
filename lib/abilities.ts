import { addLog, survivorStats, type GameState } from "./game";

export type AbilityCost = "free" | "hope1" | "hope3" | "stress1" | "armor1";
export type AbilityPeriod = "scene" | "day" | "expedition" | "shortRest" | "longRest" | "rest" | "place" | "patient" | null;

export function abilityPeriod(effect: string): AbilityPeriod {
  const text = effect.toLocaleLowerCase("pt-BR");
  if (/uma vez por cena|1x por cena/.test(text)) return "scene";
  if (/uma vez por dia|1x por dia/.test(text)) return "day";
  if (/uma vez por expedição|1x por expedição/.test(text)) return "expedition";
  if (/uma vez por descanso curto|1x por descanso curto/.test(text)) return "shortRest";
  if (/uma vez por descanso longo|1x por descanso longo/.test(text)) return "longRest";
  if (/uma vez por descanso|1x por descanso/.test(text)) return "rest";
  if (/uma vez por (?:hex|local)/.test(text)) return "place";
  if (/uma vez por paciente/.test(text)) return "patient";
  return null;
}

export function abilityCosts(effect: string, isHopeFeature = false): AbilityCost[] {
  if (isHopeFeature) return ["hope3"];
  const choices: AbilityCost[] = [];
  if (/gaste 1 Hope/i.test(effect)) choices.push("hope1");
  if (/gaste 3 Hope/i.test(effect)) choices.push("hope3");
  if (/marque 1 Stress|e 1 Stress/i.test(effect)) choices.push("stress1");
  if (/marque 1 espaço da sua Armadura/i.test(effect)) choices.push("armor1");
  if (choices.length === 0 || /sem pagar Hope/i.test(effect)) choices.push("free");
  return choices;
}

export const costLabels: Record<AbilityCost, string> = {
  free: "Sem custo de recurso", hope1: "1 Hope", hope3: "3 Hope", stress1: "1 Stress", armor1: "1 espaço de Armadura",
};
export const periodLabels: Record<NonNullable<AbilityPeriod>, string> = {
  scene: "1× por cena", day: "1× por dia", expedition: "1× por expedição",
  shortRest: "1× por descanso curto", longRest: "1× por descanso longo", rest: "1× por descanso",
  place: "1× por hex/local", patient: "1× por paciente",
};

function usageKey(game: GameState, period: AbilityPeriod, effect: string) {
  if (period === "place") return "local:já usado";
  if (period === "patient") return /durante um descanso curto/i.test(effect)
    ? `paciente:descanso-curto:${game.shortRest ?? 1}` : `paciente:cena:${game.day}.${game.scene ?? 1}`;
  if (period === "scene") return `cena:${game.day}.${game.scene ?? 1}`;
  if (period === "day") return `dia:${game.day}`;
  if (period === "expedition") return `expedição:${game.expedition ?? 1}`;
  if (period === "shortRest" || period === "rest") return `descanso:${game.shortRest ?? 1}`;
  if (period === "longRest") return `descanso-longo:${game.longRest ?? 1}`;
  return "";
}
function instanceKey(abilityId: string, period: AbilityPeriod, context: string, hex: string) {
  return period === "place" || period === "patient"
    ? `${abilityId}|${context.trim().toLocaleLowerCase("pt-BR") || hex}` : abilityId;
}

export function abilityAvailable(game: GameState, survivorId: string, abilityId: string, effect: string, context = "") {
  const person = game.survivors.find(s => s.id === survivorId);
  if (!person) return false;
  const period = abilityPeriod(effect);
  if (period === "patient" && !context.trim()) return false;
  const key = usageKey(game, period, effect);
  return !key || person.abilityUses?.[instanceKey(abilityId, period, context, game.partyHex)] !== key;
}

export function recordAbilityUse(game: GameState, survivorId: string, abilityId: string, name: string, effect: string,
  cost: AbilityCost, context = "", hopeFeature = false) {
  const person = game.survivors.find(s => s.id === survivorId);
  if (!person || !abilityCosts(effect, hopeFeature).includes(cost) ||
    !abilityAvailable(game, survivorId, abilityId, effect, context)) return false;
  if (cost === "hope1" || cost === "hope3") {
    const amount = cost === "hope3" ? 3 : 1;
    if (person.hope < amount) return false;
    person.hope -= amount;
  } else if (cost === "stress1") {
    if (person.stress >= 6) return false;
    person.stress += 1;
  } else if (cost === "armor1") {
    if ((person.armorMarked ?? 0) >= survivorStats(person).armor) return false;
    person.armorMarked = (person.armorMarked ?? 0) + 1;
  }
  const period = abilityPeriod(effect);
  const key = usageKey(game, period, effect);
  if (key) { person.abilityUses ??= {}; person.abilityUses[instanceKey(abilityId, period, context, game.partyHex)] = key; }
  addLog(game, "habilidade", `${person.name} usou ${name}${context.trim() ? ` (${context.trim()})` : ""}; custo registrado: ${costLabels[cost]}. Resolva o efeito descrito na cena.`, person.id);
  return true;
}

export function beginScene(game: GameState) {
  game.scene = (game.scene ?? 1) + 1;
  game.noise = 0;
  addLog(game, "cena", "Nova cena: Barulho voltou a 0 e habilidades por cena estão disponíveis.");
}
export function beginExpedition(game: GameState) {
  game.expedition = (game.expedition ?? 1) + 1;
  addLog(game, "expedição", "Nova expedição: habilidades por expedição estão disponíveis.");
}
export function registerRest(game: GameState, kind: "short" | "long") {
  game.shortRest = (game.shortRest ?? 1) + 1;
  if (kind === "long") game.longRest = (game.longRest ?? 1) + 1;
  addLog(game, "descanso", `Descanso ${kind === "short" ? "curto" : "longo"} concluído: habilidades correspondentes estão disponíveis. Registre recuperação de recursos conforme as ações escolhidas.`);
}
