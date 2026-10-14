import { addLog, survivorStats, type GameState, type Survivor } from "./game";
import { createId } from "./id";
import type { BodyRegion, SurvivorCondition, SurvivorConditionKind } from "./survivor-condition-types";

export type ConditionCategory = "Tático" | "Ambiental" | "Físico";
export type ConditionTone = "neutral" | "danger" | "warning" | "cold" | "heat" | "nature";

export const bodyRegionLabels: Record<BodyRegion, string> = {
  head: "Cabeça",
  torso: "Tronco",
  "left-arm": "Braço esquerdo",
  "right-arm": "Braço direito",
  "left-leg": "Perna esquerda",
  "right-leg": "Perna direita",
};

export const conditionDefinitions: Record<SurvivorConditionKind, {
  label: string;
  category: ConditionCategory;
  tone: ConditionTone;
  summary: string;
  effect: string;
  clear: string;
  bodyRegion?: boolean;
  levels?: boolean;
}> = {
  restrained: {
    label: "Restringido",
    category: "Tático",
    tone: "warning",
    summary: "Não pode se deslocar livremente.",
    effect: "Você não pode viajar nem mudar de posição de forma significativa até se libertar. Outras ações continuam possíveis quando a ficção permitir.",
    clear: "Liberte-se da causa que impede o movimento.",
  },
  vulnerable: {
    label: "Vulnerável",
    category: "Tático",
    tone: "danger",
    summary: "Ações contra você recebem Vantagem.",
    effect: "Quando alguém fizer uma rolagem contra você, essa rolagem recebe Vantagem. Outras fontes de Vantagem não acumulam dados adicionais.",
    clear: "Termina quando a situação que deixou você exposto for resolvida.",
  },
  hidden: {
    label: "Escondido",
    category: "Tático",
    tone: "neutral",
    summary: "Difícil de atingir até agir ou ser revelado.",
    effect: "Rolagens contra você têm Desvantagem. Quando você realiza uma ação que revele sua posição, a condição termina. O mestre decide quando a ficção revela você sem uma ação.",
    clear: "Realize uma ação reveladora, seja descoberto ou abandone a cobertura.",
  },
  cold: {
    label: "Frio",
    category: "Ambiental",
    tone: "cold",
    summary: "Exposição ao frio em três níveis.",
    effect: "Nível 1: Desvantagem quando o frio atrapalhar precisão ou manipulação fina. Nível 2: também pode impor Desvantagem em esforço físico; Falha com Medo nesse esforço marca 1 Estresse. Nível 3: um novo gatilho de exposição sem proteção marca 1 PV.",
    clear: "Aquecimento e abrigo reduzem a intensidade. Um descanso longo seguro e aquecido pode remover a condição.",
    levels: true,
  },
  heat: {
    label: "Calor",
    category: "Ambiental",
    tone: "heat",
    summary: "Exposição ao calor em três níveis.",
    effect: "Nível 1+: exige 1 porção adicional de Água no dia. Nível 2+: esforço físico relevante pode ter Desvantagem; Falha com Medo nesse esforço marca 1 Estresse. Nível 3: novo gatilho de exposição sem hidratação/resfriamento marca 1 PV.",
    clear: "Sombra, resfriamento e hidratação reduzem a intensidade.",
    levels: true,
  },
  wet: {
    label: "Molhado",
    category: "Ambiental",
    tone: "nature",
    summary: "Acelera a primeira piora causada pelo Frio.",
    effect: "Na primeira vez em que Frio piorar enquanto você estiver Molhado, ele aumenta 2 níveis em vez de 1. O bônus acontece uma vez por aplicação de Molhado.",
    clear: "Seque roupas e corpo em condições adequadas. Um descanso longo remove Molhado.",
  },
  bleeding: {
    label: "Sangramento",
    category: "Físico",
    tone: "danger",
    summary: "Ferimento ativo que precisa ser estabilizado.",
    effect: "Se o Sangramento chegar ao fim de uma cena perigosa ou de uma atividade prolongada sem ser estabilizado, marque 1 PV. O Sangramento continua ativo depois do dano.",
    clear: "Estabilize com primeiros socorros. Remover Sangramento não cura a ferida que o causou.",
  },
  injury: {
    label: "Lesão",
    category: "Físico",
    tone: "warning",
    summary: "Desvantagem quando a região lesionada for relevante.",
    effect: "Quando a Lesão for relevante para uma ação, ela impõe Desvantagem. Uma Lesão normal pode ser forçada: marque 1 Estresse antes da rolagem para ignorar essa Desvantagem. Se ainda assim houver Falha com Medo, a Lesão fica Agravada. Lesão Agravada não pode ser forçada dessa forma.",
    clear: "Tratamento + 1 descanso longo remove uma Lesão normal; uma Lesão Agravada exige tratamento + 2 descansos longos.",
    bodyRegion: true,
  },
  fracture: {
    label: "Fratura",
    category: "Físico",
    tone: "danger",
    summary: "Restrição séria da região fraturada.",
    effect: "Ações que dependam da região têm Desvantagem e algumas podem ser impossíveis. Fratura de braço impede uso normal de equipamento de duas mãos. Fratura de perna aumenta em 50% o tempo de viagem a pé. Forçar uma Fratura custa 1 Estresse e ainda mantém Desvantagem; Falha com Medo usando uma Fratura não imobilizada marca 1 PV.",
    clear: "Imobilize a Fratura e complete 4 descansos longos para encerrar sua relevância mecânica.",
    bodyRegion: true,
  },
};

export function survivorConditions(person: Survivor | undefined) {
  return person?.conditions ?? [];
}

export function findCondition(person: Survivor | undefined, kind: SurvivorConditionKind) {
  return survivorConditions(person).find(condition => condition.kind === kind);
}

export function hasCondition(person: Survivor | undefined, kind: SurvivorConditionKind) {
  return Boolean(findCondition(person, kind));
}

function bodySuffix(condition: SurvivorCondition) {
  return condition.bodyRegion ? ` · ${bodyRegionLabels[condition.bodyRegion]}` : "";
}

export function conditionLabel(condition: SurvivorCondition) {
  const definition = conditionDefinitions[condition.kind];
  if (condition.kind === "cold" || condition.kind === "heat") return `${definition.label} ${condition.level ?? 1}`;
  if (condition.kind === "injury" && condition.aggravated) return `Lesão agravada${bodySuffix(condition)}`;
  if (condition.kind === "fracture" && condition.immobilized) return `Fratura imobilizada${bodySuffix(condition)}`;
  return `${definition.label}${bodySuffix(condition)}`;
}

export function conditionSummary(condition: SurvivorCondition) {
  if (condition.kind === "fracture") return `${conditionDefinitions.fracture.summary} Recuperação ${condition.recovery ?? 0}/4.`;
  if (condition.kind === "injury") {
    const needed = condition.aggravated ? 2 : 1;
    return `${conditionDefinitions.injury.summary} ${condition.treated ? `Tratada · recuperação ${condition.recovery ?? 0}/${needed}.` : "Ainda precisa de tratamento."}`;
  }
  return conditionDefinitions[condition.kind].summary;
}

export function conditionDetails(condition: SurvivorCondition) {
  const definition = conditionDefinitions[condition.kind];
  return {
    label: conditionLabel(condition),
    category: definition.category,
    tone: definition.tone,
    summary: conditionSummary(condition),
    effect: definition.effect,
    clear: definition.clear,
  };
}

export function applySurvivorCondition(game: GameState, survivorId: string, kind: SurvivorConditionKind, options: {
  level?: 1 | 2 | 3;
  bodyRegion?: BodyRegion;
  source?: string;
} = {}) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const definition = conditionDefinitions[kind];
  if (!person) return { ok: false as const, message: "Sobrevivente não encontrado." };
  if (definition.bodyRegion && !options.bodyRegion) return { ok: false as const, message: "Escolha a região corporal." };
  person.conditions ??= [];
  const same = person.conditions.find(condition => condition.kind === kind
    && (!definition.bodyRegion || condition.bodyRegion === options.bodyRegion));
  if (same) {
    if (definition.levels) {
      same.level = Math.max(same.level ?? 1, options.level ?? 1) as 1 | 2 | 3;
      addLog(game, "condição", `${person.name}: ${conditionLabel(same)} atualizada.`, person.id);
      return { ok: true as const, condition: same };
    }
    return { ok: false as const, message: "Esta condição já está ativa." };
  }
  const condition: SurvivorCondition = {
    id: createId(),
    kind,
    ...(definition.levels ? { level: options.level ?? 1 } : {}),
    ...(definition.bodyRegion ? { bodyRegion: options.bodyRegion } : {}),
    ...(kind === "injury" || kind === "fracture" ? { recovery: 0 } : {}),
    ...(options.source?.trim() ? { source: options.source.trim() } : {}),
    appliedDay: game.day,
    appliedMinute: game.minutes,
  };
  person.conditions.push(condition);
  addLog(game, "condição", `${person.name}: ${conditionLabel(condition)} aplicada${condition.source ? ` (${condition.source})` : ""}.`, person.id);
  return { ok: true as const, condition };
}

export function removeSurvivorCondition(game: GameState, survivorId: string, conditionId: string, reason = "encerrada") {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId);
  if (!person || !condition) return false;
  const label = conditionLabel(condition);
  person.conditions = person.conditions!.filter(entry => entry.id !== conditionId);
  if (!person.conditions.length) delete person.conditions;
  addLog(game, "condição", `${person.name}: ${label} ${reason}.`, person.id);
  return true;
}

export type ExposureRollOutcome = "success-hope" | "success-fear" | "failure-hope" | "failure-fear";

export function resolveExposureRoll(game: GameState, survivorId: string, conditionId: string, outcome: ExposureRollOutcome) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId && (entry.kind === "cold" || entry.kind === "heat"));
  if (!person || !condition) return { ok: false as const, message: "Exposição não encontrada." };
  if (outcome === "success-hope" || outcome === "success-fear") {
    addLog(game, "condição", `${person.name} resistiu à exposição de ${conditionDefinitions[condition.kind].label.toLocaleLowerCase("pt-BR")}; intensidade mantida em ${condition.level ?? 1}.`, person.id);
    return { ok: true as const, level: condition.level ?? 1 };
  }
  let increase = 1;
  if (condition.kind === "cold") {
    const wet = findCondition(person, "wet");
    if (wet && !wet.wetColdBoostUsed) {
      increase = 2;
      wet.wetColdBoostUsed = true;
    }
  }
  const before = condition.level ?? 1;
  condition.level = Math.min(3, before + increase) as 1 | 2 | 3;
  if (outcome === "failure-fear") person.stress = Math.min(6, person.stress + 1);
  addLog(game, "condição", `${person.name}: ${conditionDefinitions[condition.kind].label} ${before} → ${condition.level}${increase === 2 ? " por estar Molhado" : ""}${outcome === "failure-fear" ? " · +1 Estresse" : ""}.`, person.id);
  return { ok: true as const, level: condition.level };
}

export function reduceExposure(game: GameState, survivorId: string, conditionId: string) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId && (entry.kind === "cold" || entry.kind === "heat"));
  if (!person || !condition) return false;
  const before = condition.level ?? 1;
  if (before <= 1) return removeSurvivorCondition(game, survivorId, condition.id, "removida após recuperação");
  condition.level = (before - 1) as 1 | 2;
  addLog(game, "condição", `${person.name}: ${conditionDefinitions[condition.kind].label} ${before} → ${condition.level} após recuperação.`, person.id);
  return true;
}

export function severeExposureTrigger(game: GameState, survivorId: string, conditionId: string) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId && (entry.kind === "cold" || entry.kind === "heat") && (entry.level ?? 1) >= 3);
  if (!person || !condition) return false;
  const max = survivorStats(person).hp;
  person.hp = Math.min(max, person.hp + 1);
  addLog(game, "condição", `${person.name}: exposição grave por ${conditionDefinitions[condition.kind].label.toLocaleLowerCase("pt-BR")} marcou 1 PV (${person.hp}/${max}).`, person.id);
  return true;
}

export function bleedingTrigger(game: GameState, survivorId: string, context = "gatilho de Sangramento") {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  if (!person || !hasCondition(person, "bleeding")) return false;
  const max = survivorStats(person).hp;
  person.hp = Math.min(max, person.hp + 1);
  addLog(game, "condição", `${person.name}: ${context}; Sangramento marcou 1 PV (${person.hp}/${max}).`, person.id);
  return true;
}

export function setInjuryTreated(game: GameState, survivorId: string, conditionId: string, treated = true) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId && entry.kind === "injury");
  if (!person || !condition) return false;
  condition.treated = treated;
  if (!treated) condition.recovery = 0;
  addLog(game, "condição", `${person.name}: ${conditionLabel(condition)} ${treated ? "recebeu tratamento" : "voltou a precisar de tratamento"}.`, person.id);
  return true;
}

export function setInjuryAggravated(game: GameState, survivorId: string, conditionId: string, aggravated = true) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId && entry.kind === "injury");
  if (!person || !condition) return false;
  condition.aggravated = aggravated;
  condition.recovery = 0;
  addLog(game, "condição", `${person.name}: ${conditionLabel(condition)}.`, person.id);
  return true;
}

export function setFractureImmobilized(game: GameState, survivorId: string, conditionId: string, immobilized = true) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId && entry.kind === "fracture");
  if (!person || !condition) return false;
  condition.immobilized = immobilized;
  if (!immobilized) condition.recovery = 0;
  addLog(game, "condição", `${person.name}: ${conditionLabel(condition)}.`, person.id);
  return true;
}

export function processLongRestConditions(game: GameState, survivorIds: string[]) {
  const summaries: string[] = [];
  for (const survivorId of survivorIds) {
    const person = game.survivors.find(candidate => candidate.id === survivorId);
    if (!person?.conditions?.length) continue;
    const next: SurvivorCondition[] = [];
    for (const condition of person.conditions) {
      if (condition.kind === "wet") {
        summaries.push(`${person.name}: Molhado removido após o descanso longo.`);
        continue;
      }
      if (condition.kind === "injury" && condition.treated) {
        const needed = condition.aggravated ? 2 : 1;
        condition.recovery = Math.min(needed, (condition.recovery ?? 0) + 1);
        if (condition.recovery >= needed) {
          summaries.push(`${person.name}: ${conditionLabel(condition)} recuperada após tratamento e descanso.`);
          continue;
        }
        summaries.push(`${person.name}: ${conditionLabel(condition)} recuperação ${condition.recovery}/${needed}.`);
      } else if (condition.kind === "fracture" && condition.immobilized) {
        condition.recovery = Math.min(4, (condition.recovery ?? 0) + 1);
        if (condition.recovery >= 4) {
          summaries.push(`${person.name}: ${conditionLabel(condition)} deixou de ser mecanicamente relevante após 4 descansos longos.`);
          continue;
        }
        summaries.push(`${person.name}: ${conditionLabel(condition)} recuperação ${condition.recovery}/4.`);
      }
      next.push(condition);
    }
    person.conditions = next;
    if (!next.length) delete person.conditions;
  }
  for (const summary of summaries) addLog(game, "condição", summary);
  return summaries;
}

export function conditionTravelMultiplier(person: Survivor | undefined) {
  return survivorConditions(person).some(condition => condition.kind === "fracture"
    && (condition.bodyRegion === "left-leg" || condition.bodyRegion === "right-leg")) ? 1.5 : 1;
}

export function groupTravelMultiplier(game: GameState, survivorIds: string[]) {
  return Math.max(1, ...survivorIds.map(id => conditionTravelMultiplier(game.survivors.find(person => person.id === id))));
}

export function survivorMovementCondition(person: Survivor | undefined) {
  return findCondition(person, "restrained");
}

export function twoHandedFractureIssue(person: Survivor | undefined) {
  const fracture = survivorConditions(person).find(condition => condition.kind === "fracture"
    && (condition.bodyRegion === "left-arm" || condition.bodyRegion === "right-arm"));
  return fracture ? `${conditionLabel(fracture)} impede o uso normal de equipamento de duas mãos.` : "";
}

export function dailyExtraWater(person: Survivor | undefined) {
  return hasCondition(person, "heat") ? 1 : 0;
}

export function conditionCanDisadvantageRoll(condition: SurvivorCondition) {
  if (condition.kind === "heat") return (condition.level ?? 1) >= 2;
  return ["cold", "injury", "fracture"].includes(condition.kind);
}

export function conditionRollGuidance(condition: SurvivorCondition) {
  if (condition.kind === "cold") {
    const level = condition.level ?? 1;
    return level === 1 ? "Aplique Desvantagem se o frio atrapalhar precisão ou manipulação fina."
      : "Aplique Desvantagem se o frio atrapalhar precisão, coordenação ou esforço físico relevante.";
  }
  if (condition.kind === "heat") return (condition.level ?? 1) >= 2
    ? "Aplique Desvantagem em esforço físico relevante." : "O efeito atual é o consumo adicional de Água; não impõe Desvantagem por si só.";
  if (condition.kind === "injury") return condition.aggravated
    ? "Quando a região for relevante, aplique Desvantagem. A Lesão agravada não pode ser forçada."
    : "Quando a região for relevante, aplique Desvantagem; você pode marcar 1 Estresse para ignorá-la nesta ação.";
  if (condition.kind === "fracture") return "Quando a região for relevante, aplique Desvantagem. Forçar custa 1 Estresse e não remove a Desvantagem.";
  return conditionDefinitions[condition.kind].effect;
}

export function useConditionDuringRoll(game: GameState, survivorId: string, conditionId: string, input: {
  forced?: boolean;
  failedWithFear?: boolean;
  stressAlreadyPaid?: boolean;
}) {
  const person = game.survivors.find(candidate => candidate.id === survivorId);
  const condition = person?.conditions?.find(entry => entry.id === conditionId);
  if (!person || !condition) return false;
  if (input.forced && (condition.kind === "injury" || condition.kind === "fracture")) {
    if (!input.stressAlreadyPaid) {
      if (person.stress >= 6) return false;
      person.stress += 1;
    }
    if (condition.kind === "injury" && input.failedWithFear && !condition.aggravated) {
      condition.aggravated = true;
      condition.recovery = 0;
    }
    if (condition.kind === "fracture" && input.failedWithFear && !condition.immobilized) {
      person.hp = Math.min(survivorStats(person).hp, person.hp + 1);
    }
  } else if (input.failedWithFear && ((condition.kind === "cold" && (condition.level ?? 1) >= 2)
    || (condition.kind === "heat" && (condition.level ?? 1) >= 2))) {
    person.stress = Math.min(6, person.stress + 1);
  }
  return true;
}
