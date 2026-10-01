import { addLog, displayTime, survivorHex, survivorStats, type GameState } from "./game";
import { rollDie } from "./rolls";
import { consumeShelterComfortRest } from "./shelter-projects";
import { settleSceneAmmunition } from "./combat-resources";
import { localizeRulesText } from "./terminology";
import { endConflictScene } from "./conflict";

export type AbilityCost = "free" | "hope1" | "hope3" | "stress1" | "armor1";
export type AbilityPeriod = "scene" | "day" | "expedition" | "shortRest" | "longRest" | "rest" | "place" | "patient" | null;
export type RestKind = "short" | "long";
export type RestAction = "hp" | "stress" | "armor" | "prepare" | "fiction" | "hp-full" | "stress-full" | "armor-full";
export type RestChoice = { action: RestAction; targetId: string };
export type RestSelection = { survivorId: string; choices: RestChoice[] };

export const restActionLabels: Record<RestAction, string> = {
  hp: "Recuperar PV", stress: "Aliviar Estresse", armor: "Reparar Armadura", prepare: "Preparar", fiction: "Ação de ficção",
  "hp-full": "Recuperar todos os PV", "stress-full": "Limpar todo o Estresse", "armor-full": "Reparar toda a Armadura",
};

export function restActionsFor(kind: RestKind): RestAction[] {
  return kind === "short" ? ["hp", "stress", "armor", "prepare", "fiction"]
    : ["hp-full", "stress-full", "armor-full", "prepare", "fiction"];
}

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
  effect = localizeRulesText(effect);
  const choices: AbilityCost[] = [];
  if (/gaste 1 Esperança/i.test(effect)) choices.push("hope1");
  if (/gaste 3 Esperança/i.test(effect)) choices.push("hope3");
  if (/marque 1 Estresse|e 1 Estresse/i.test(effect)) choices.push("stress1");
  if (/marque 1 espaço da sua Armadura/i.test(effect)) choices.push("armor1");
  if (choices.length === 0 || /sem pagar Esperança/i.test(effect)) choices.push("free");
  return choices;
}

export const costLabels: Record<AbilityCost, string> = {
  free: "Sem custo de recurso", hope1: "1 Esperança", hope3: "3 Esperança", stress1: "1 Estresse", armor1: "1 espaço de Armadura",
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
  return !key || person.abilityUses?.[instanceKey(abilityId, period, context, survivorHex(game, person))] !== key;
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
  if (key) { person.abilityUses ??= {}; person.abilityUses[instanceKey(abilityId, period, context, survivorHex(game, person))] = key; }
  addLog(game, "habilidade", `${person.name} usou ${name}${context.trim() ? ` (${context.trim()})` : ""}; custo registrado: ${costLabels[cost]}. Resolva o efeito descrito na cena.`, person.id);
  return true;
}

export function beginScene(game: GameState) {
  const settled = settleSceneAmmunition(game);
  if (game.conflict?.active) {
    const name = game.conflict.name;
    endConflictScene(game.conflict, game.day, displayTime(game.minutes));
    addLog(game, "conflito", `Conflito encerrado ao iniciar nova cena: ${name}.`);
  }
  game.scene = (game.scene ?? 1) + 1;
  game.noise = 0;
  addLog(game, "cena", `Nova cena: Barulho voltou a 0 e habilidades por cena estão disponíveis.${settled.length ? ` ${settled.reduce((sum, row) => sum + row.units, 0)} unidade(s) de munição foram consumidas da cena anterior.` : ""}`);
}
export function beginExpedition(game: GameState) {
  game.expedition = (game.expedition ?? 1) + 1;
  addLog(game, "expedição", "Nova expedição: habilidades por expedição estão disponíveis.");
}
export function registerRest(game: GameState, kind: RestKind) {
  game.shortRest = (game.shortRest ?? 1) + 1;
  if (kind === "long") game.longRest = (game.longRest ?? 1) + 1;
  addLog(game, "descanso", `Descanso ${kind === "short" ? "curto" : "longo"} concluído: benefícios escolhidos e limites de habilidade foram atualizados.`);
}

export function resolveGroupRest(game: GameState, kind: RestKind, selections: RestSelection[], roll = rollDie) {
  if (!game.survivors.length || selections.length !== game.survivors.length) return { ok: false as const, message: "Defina duas ações para cada sobrevivente." };

  const validActions = new Set(restActionsFor(kind));
  const selectionBySurvivor = new Map(selections.map(selection => [selection.survivorId, selection]));
  if (selectionBySurvivor.size !== game.survivors.length || game.survivors.some(person => {
    const choices = selectionBySurvivor.get(person.id)?.choices;
    return !choices || choices.length !== 2 || choices.some(choice => {
      const target = game.survivors.find(candidate => candidate.id === choice.targetId);
      return !validActions.has(choice.action) || !target || survivorHex(game, target) !== survivorHex(game, person);
    });
  })) return { ok: false as const, message: "Cada sobrevivente precisa de duas ações válidas com alvos presentes no mesmo hex." };

  const preparedByHex = new Map<string, number>();
  for (const person of game.survivors) {
    if (!selectionBySurvivor.get(person.id)!.choices.some(choice => choice.action === "prepare")) continue;
    const hex = survivorHex(game, person);
    preparedByHex.set(hex, (preparedByHex.get(hex) ?? 0) + 1);
  }
  const summaries: string[] = [];

  for (const person of game.survivors) {
    const choices = selectionBySurvivor.get(person.id)!.choices;
    const prepareGain = (preparedByHex.get(survivorHex(game, person)) ?? 0) >= 2 ? 2 : 1;
    const results: string[] = [];
    for (const choice of choices) {
      const target = game.survivors.find(candidate => candidate.id === choice.targetId)!;
      const targetPrefix = target.id === person.id ? "" : `Para ${target.name}: `;
      if (choice.action === "hp") {
        const rolled = Math.max(2, Math.min(5, Math.trunc(roll(4)) + 1));
        const recovered = Math.min(target.hp, rolled); target.hp -= recovered;
        results.push(`${targetPrefix}PV +${recovered} (d4+1 = ${rolled})`);
      } else if (choice.action === "stress") {
        const rolled = Math.max(2, Math.min(5, Math.trunc(roll(4)) + 1));
        const recovered = Math.min(target.stress, rolled); target.stress -= recovered;
        results.push(`${targetPrefix}Estresse −${recovered} (d4+1 = ${rolled})`);
      } else if (choice.action === "armor") {
        const rolled = Math.max(2, Math.min(5, Math.trunc(roll(4)) + 1));
        const repaired = Math.min(target.armorMarked ?? 0, rolled); target.armorMarked = Math.max(0, (target.armorMarked ?? 0) - repaired);
        results.push(`${targetPrefix}Armadura −${repaired} (d4+1 = ${rolled})`);
      } else if (choice.action === "hp-full") {
        const recovered = target.hp; target.hp = 0; results.push(`${targetPrefix}PV +${recovered}`);
      } else if (choice.action === "stress-full") {
        const recovered = target.stress; target.stress = 0; results.push(`${targetPrefix}Estresse −${recovered}`);
      } else if (choice.action === "armor-full") {
        const repaired = target.armorMarked ?? 0; target.armorMarked = 0; results.push(`${targetPrefix}Armadura −${repaired}`);
      } else if (choice.action === "prepare") {
        const gained = Math.min(6 - target.hope, prepareGain); target.hope += gained;
        results.push(`${targetPrefix}Esperança +${gained}${prepareGain === 2 ? " (preparo em equipe)" : ""}`);
      } else {
        results.push(`${targetPrefix}Ação de ficção registrada`);
      }
    }
    summaries.push(`${person.name}: ${results.join("; ")}.`);
    addLog(game, "descanso", `${person.name} — ${results.join("; ")}.`, person.id);
    delete person.restPlan;
  }

  const fearDie = Math.max(1, Math.min(4, Math.trunc(roll(4))));
  const comfortReduction = consumeShelterComfortRest(game);
  const rawFear = fearDie + (kind === "long" ? game.survivors.length : 0);
  const fearGain = Math.max(0, rawFear - comfortReduction);
  const actualFear = Math.min(12 - game.fear, fearGain);
  game.fear += actualFear;
  addLog(game, "descanso", `Descanso ${kind === "short" ? "curto" : "longo"}: Medo +${actualFear}${kind === "long" ? ` (d4 ${fearDie} + ${game.survivors.length} PJ${game.survivors.length === 1 ? "" : "s"}` : ` (d4 ${fearDie}`}${comfortReduction ? ` − ${comfortReduction} Conforto do abrigo` : ""}).`);
  registerRest(game, kind);
  return { ok: true as const, fear: actualFear, summaries };
}
