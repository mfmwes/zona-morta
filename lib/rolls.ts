export type RollKind = "action" | "reaction" | "attack";
export type Edge = "none" | "advantage" | "disadvantage";

export type ActionOutcome = {
  hopeDie: number;
  fearDie: number;
  edgeDie: number | null;
  total: number;
  critical: boolean;
  with: "Hope" | "Fear";
  success: boolean | null;
  edge: Edge;
  difficulty: number | null;
  modifier: number;
};

export function resolveActionRoll(input: {
  hopeDie: number; fearDie: number; trait: number; experience: number;
  other: number; symptom: number; edge: Edge; edgeDie?: number | null;
  difficulty?: number | null;
}): ActionOutcome {
  const edgeDie = input.edge === "none" ? null : (input.edgeDie ?? null);
  const edgeValue = edgeDie === null ? 0 : input.edge === "advantage" ? edgeDie : -edgeDie;
  const modifier = input.trait + input.experience + input.other + input.symptom + edgeValue;
  const total = input.hopeDie + input.fearDie + modifier;
  const critical = input.hopeDie === input.fearDie;
  return {
    hopeDie: input.hopeDie, fearDie: input.fearDie, edgeDie, total, modifier,
    critical, with: critical || input.hopeDie > input.fearDie ? "Hope" : "Fear",
    success: critical ? true : input.difficulty == null ? null : total >= input.difficulty,
    edge: input.edge, difficulty: input.difficulty ?? null,
  };
}

export function resolveAttackHit(outcome: Pick<ActionOutcome, "total" | "critical">, defense: number | null, confirmed = false): boolean | null {
  if (outcome.critical) return true;
  if (defense !== null) return outcome.total >= defense;
  return confirmed ? true : null;
}

export function resolveRollResources(input: {
  hope: number | null; stress: number | null; fear: number;
  experienceCost: number; reaction: boolean; outcome: ActionOutcome;
}) {
  let hope = input.hope === null ? null : Math.max(0, input.hope - input.experienceCost);
  let stress = input.stress;
  let fear = input.fear;
  if (!input.reaction) {
    if (input.outcome.with === "Hope" && hope !== null) hope = Math.min(6, hope + 1);
    if (input.outcome.with === "Fear") fear = Math.min(12, fear + 1);
    if (input.outcome.critical && stress !== null) stress = Math.max(0, stress - 1);
  }
  return { hope, stress, fear };
}

export function parseWeaponDamage(formula: string): { die: number; flat: number } | null {
  const match = formula.trim().match(/^(?:1)?d(\d+)([+-]\d+)?(?:\s+.*)?$/i);
  if (!match) return null;
  const die = Number(match[1]);
  if (!Number.isInteger(die) || die < 2 || die > 100) return null;
  return { die, flat: Number(match[2] ?? 0) };
}

export function resolveWeaponDamage(dice: number[], die: number, flat: number, extra: number, critical: boolean) {
  const criticalBonus = critical ? dice.length * die : 0;
  return { dice, flat, extra, criticalBonus, total: dice.reduce((sum, value) => sum + value, 0) + flat + extra + criticalBonus };
}

export function rollDie(faces: number) {
  const limit = Math.floor(0x100000000 / faces) * faces;
  const array = new Uint32Array(1);
  do { crypto.getRandomValues(array); } while (array[0] >= limit);
  return array[0] % faces + 1;
}
