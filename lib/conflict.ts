import { createId } from "./id";
import { instantiateThreat, type ThreatInstance, type ThreatTemplate } from "./threats";

export type ConflictParticipantKind = "survivor" | "threat";

export type ConflictParticipantRef = {
  kind: ConflictParticipantKind;
  id: string;
};

export type SpotlightHistoryEntry = ConflictParticipantRef & {
  eventId: string;
  name: string;
  day: number;
  time: string;
};

export type ConflictDamageRequest = {
  id: string;
  targetSurvivorId: string;
  sourceThreatId: string;
  sourceName: string;
  attackName: string;
  damage: number;
  damageType: string;
  tier: SurvivorDamageTier;
  createdDay: number;
  createdTime: string;
  status: "pending" | "resolved";
  resolution?: "hp" | "armor";
  appliedHpMarks?: number;
  armorMarked?: number;
  resolvedDay?: number;
  resolvedTime?: string;
};

export type ConflictScene = {
  id: string;
  name: string;
  active: boolean;
  sceneNumber: number;
  startedDay: number;
  startedTime: string;
  endedDay?: number;
  endedTime?: string;
  survivorIds: string[];
  threats: ThreatInstance[];
  spotlight: ConflictParticipantRef | null;
  spotlightHistory: SpotlightHistoryEntry[];
  /** Sobreviventes que sinalizaram interesse em receber o spotlight. Não representa fila ou iniciativa. */
  spotlightRequests?: string[];
  /** IDs das rolagens de ataque cujo dano já foi confirmado pelo mestre. */
  appliedAttackLogIds?: string[];
  /** Dano de ameaça aguardando decisão do sobrevivente (PV ou Armadura). */
  damageRequests?: ConflictDamageRequest[];
  notes: string;
};

export type PublicConflictSurvivor = {
  id: string;
  name: string;
  portrait?: string;
};

export type PublicConflictThreat = {
  id: string;
  name: string;
  groupName: string;
  defeated: boolean;
  conditions: string[];
};

export type PublicConflictDamageRequest = Omit<ConflictDamageRequest,
  "targetSurvivorId" | "sourceThreatId" | "status" | "resolution" | "appliedHpMarks" | "armorMarked" | "resolvedDay" | "resolvedTime">;

export type PublicConflictScene = {
  id: string;
  name: string;
  active: true;
  sceneNumber: number;
  startedDay: number;
  startedTime: string;
  survivors: PublicConflictSurvivor[];
  threats: PublicConflictThreat[];
  spotlight: ConflictParticipantRef | null;
  spotlightRequested: boolean;
  pendingDamage: PublicConflictDamageRequest[];
};

export function publicConflictScene(
  scene: ConflictScene,
  survivors: Array<{ id: string; name: string; portrait?: string }>,
  viewerSurvivorId?: string | null,
): PublicConflictScene | undefined {
  if (!scene.active) return undefined;
  const survivorById = new Map(survivors.map(person => [person.id, person]));
  const publicSurvivors = scene.survivorIds.flatMap(id => {
    const person = survivorById.get(id);
    return person ? [{ id: person.id, name: person.name, ...(person.portrait ? { portrait: person.portrait } : {}) }] : [];
  });
  const publicThreats = scene.threats.map(threat => ({
    id: threat.id,
    name: threat.name,
    groupName: threat.templateSnapshot.name,
    defeated: threat.defeated,
    conditions: [...threat.conditions],
  }));
  const spotlight = scene.spotlight
    && (scene.spotlight.kind === "survivor"
      ? publicSurvivors.some(person => person.id === scene.spotlight!.id)
      : publicThreats.some(threat => threat.id === scene.spotlight!.id))
    ? { ...scene.spotlight }
    : null;
  const pendingDamage = viewerSurvivorId
    ? (scene.damageRequests ?? []).filter(request => request.status === "pending" && request.targetSurvivorId === viewerSurvivorId)
      .map(request => ({
        id: request.id,
        sourceName: request.sourceName,
        attackName: request.attackName,
        damage: request.damage,
        damageType: request.damageType,
        tier: { ...request.tier },
        createdDay: request.createdDay,
        createdTime: request.createdTime,
      }))
    : [];
  return {
    id: scene.id,
    name: scene.name,
    active: true,
    sceneNumber: scene.sceneNumber,
    startedDay: scene.startedDay,
    startedTime: scene.startedTime,
    survivors: publicSurvivors,
    threats: publicThreats,
    spotlight,
    spotlightRequested: Boolean(viewerSurvivorId && scene.spotlightRequests?.includes(viewerSurvivorId)),
    pendingDamage,
  };
}

function alphabeticLabel(index: number) {
  let value = Math.max(0, Math.trunc(index));
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

export function createConflictScene(input: {
  name: string;
  sceneNumber: number;
  day: number;
  time: string;
  survivorIds?: string[];
}): ConflictScene {
  return {
    id: createId(),
    name: input.name.trim().slice(0, 100) || "Conflito",
    active: true,
    sceneNumber: Math.max(1, Math.trunc(input.sceneNumber || 1)),
    startedDay: Math.max(1, Math.trunc(input.day || 1)),
    startedTime: input.time,
    survivorIds: [...new Set(input.survivorIds ?? [])],
    threats: [],
    spotlight: null,
    spotlightHistory: [],
    spotlightRequests: [],
    appliedAttackLogIds: [],
    damageRequests: [],
    notes: "",
  };
}

export function addThreatInstances(scene: ConflictScene, template: ThreatTemplate, quantity = 1) {
  const count = Math.max(1, Math.min(20, Math.trunc(quantity || 1)));
  const existingSameTemplate = scene.threats.filter(threat => threat.templateId === template.id);
  const allNames = new Set(scene.threats.map(threat => threat.name));
  const added: ThreatInstance[] = [];
  let candidateIndex = 0;

  for (let index = 0; index < count; index++) {
    const needsSuffix = count > 1 || existingSameTemplate.length > 0 || added.length > 0 || allNames.has(template.name);
    let name = template.name;
    if (needsSuffix) {
      do {
        name = `${template.name} ${alphabeticLabel(candidateIndex++)}`;
      } while (allNames.has(name));
    }
    allNames.add(name);
    const instance = instantiateThreat(template, name);
    scene.threats.push(instance);
    added.push(instance);
  }
  return added;
}

export function setConflictSpotlight(
  scene: ConflictScene,
  participant: ConflictParticipantRef | null,
  name: string,
  day: number,
  time: string,
) {
  if (!participant) {
    scene.spotlight = null;
    return false;
  }
  if (scene.spotlight?.kind === participant.kind && scene.spotlight.id === participant.id) return false;
  scene.spotlight = { ...participant };
  scene.spotlightHistory.push({
    eventId: createId(),
    ...participant,
    name: name.trim().slice(0, 100) || "Participante",
    day: Math.max(1, Math.trunc(day || 1)),
    time,
  });
  scene.spotlightHistory = scene.spotlightHistory.slice(-120);
  return true;
}

export function clearConflictSpotlight(scene: ConflictScene) {
  scene.spotlight = null;
}


export function requestConflictSpotlight(scene: ConflictScene, survivorId: string) {
  if (!scene.active || !scene.survivorIds.includes(survivorId)) return false;
  scene.spotlightRequests ??= [];
  if (scene.spotlightRequests.includes(survivorId)) return false;
  scene.spotlightRequests.push(survivorId);
  scene.spotlightRequests = scene.spotlightRequests.slice(-30);
  return true;
}

export function cancelConflictSpotlightRequest(scene: ConflictScene, survivorId: string) {
  const before = scene.spotlightRequests?.length ?? 0;
  scene.spotlightRequests = (scene.spotlightRequests ?? []).filter(id => id !== survivorId);
  return scene.spotlightRequests.length !== before;
}

export function grantConflictSpotlight(
  scene: ConflictScene,
  survivorId: string,
  name: string,
  day: number,
  time: string,
) {
  const changed = setConflictSpotlight(scene, { kind: "survivor", id: survivorId }, name, day, time);
  cancelConflictSpotlightRequest(scene, survivorId);
  return changed;
}


export function setThreatHpMarked(threat: ThreatInstance, marked: number) {
  const max = threat.templateSnapshot.maxHp;
  if (max === null) return;
  threat.hpMarked = Math.max(0, Math.min(max, Math.trunc(marked || 0)));
  threat.defeated = threat.hpMarked >= max;
}

export function setThreatStressMarked(threat: ThreatInstance, marked: number) {
  const max = threat.templateSnapshot.maxStress;
  if (max === null) return;
  threat.stressMarked = Math.max(0, Math.min(max, Math.trunc(marked || 0)));
}


export function applyThreatDamage(scene: ConflictScene, targetId: string, hpMarks: number, resolutionId: string) {
  const marks = Math.max(0, Math.min(3, Math.trunc(hpMarks || 0)));
  if (!scene.active || marks <= 0 || !resolutionId) return { ok: false as const, reason: "invalid" as const };
  scene.appliedAttackLogIds ??= [];
  if (scene.appliedAttackLogIds.includes(resolutionId))
    return { ok: false as const, reason: "already-applied" as const };

  const threat = scene.threats.find(row => row.id === targetId);
  if (!threat || threat.defeated || threat.templateSnapshot.maxHp === null)
    return { ok: false as const, reason: "target-unavailable" as const };

  const before = threat.hpMarked;
  setThreatHpMarked(threat, before + marks);
  scene.appliedAttackLogIds.push(resolutionId);
  scene.appliedAttackLogIds = scene.appliedAttackLogIds.slice(-160);
  return {
    ok: true as const,
    targetId: threat.id,
    targetName: threat.name,
    hpMarks: threat.hpMarked - before,
    totalMarked: threat.hpMarked,
    maxHp: threat.templateSnapshot.maxHp,
    defeated: threat.defeated,
  };
}

export function addThreatCondition(threat: ThreatInstance, condition: string) {
  const normalized = condition.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!normalized) return false;
  if (threat.conditions.some(value => value.toLocaleLowerCase("pt-BR") === normalized.toLocaleLowerCase("pt-BR"))) return false;
  if (threat.conditions.length >= 20) return false;
  threat.conditions.push(normalized);
  return true;
}

export function removeThreatCondition(threat: ThreatInstance, condition: string) {
  const index = threat.conditions.findIndex(value => value === condition);
  if (index < 0) return false;
  threat.conditions.splice(index, 1);
  return true;
}

export type SurvivorDamageTier = {
  key: "none" | "minor" | "major" | "severe";
  label: "Sem dano" | "Menor" | "Maior" | "Severo";
  hpMarks: 0 | 1 | 2 | 3;
};

export function resolveSurvivorDamageTier(majorThreshold: number, severeThreshold: number, damage: number): SurvivorDamageTier {
  const amount = Math.max(0, Math.trunc(damage || 0));
  if (amount <= 0) return { key: "none", label: "Sem dano", hpMarks: 0 };
  if (amount >= severeThreshold) return { key: "severe", label: "Severo", hpMarks: 3 };
  if (amount >= majorThreshold) return { key: "major", label: "Maior", hpMarks: 2 };
  return { key: "minor", label: "Menor", hpMarks: 1 };
}

export function parseThreatDamageFormula(formula: string) {
  const value = formula.trim();
  if (!value || /sem dano/i.test(value)) return { dice: 0, die: 0, flat: 0 };
  const dice = value.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (dice) {
    const count = Math.max(1, Math.min(20, Number(dice[1] || 1)));
    const die = Number(dice[2]);
    const flat = Number(dice[3] ?? 0);
    if (!Number.isInteger(die) || die < 2 || die > 100) return null;
    return { dice: count, die, flat };
  }
  const flat = Number(value);
  if (Number.isFinite(flat)) return { dice: 0, die: 0, flat: Math.trunc(flat) };
  return null;
}


export function queueSurvivorDamage(scene: ConflictScene, input: {
  targetSurvivorId: string;
  sourceThreatId: string;
  sourceName: string;
  attackName: string;
  damage: number;
  damageType: string;
  tier: SurvivorDamageTier;
  day: number;
  time: string;
}) {
  if (!scene.active || input.tier.hpMarks <= 0 || !scene.survivorIds.includes(input.targetSurvivorId)) return null;
  const request: ConflictDamageRequest = {
    id: createId(),
    targetSurvivorId: input.targetSurvivorId,
    sourceThreatId: input.sourceThreatId,
    sourceName: input.sourceName.trim().slice(0, 100),
    attackName: input.attackName.trim().slice(0, 100),
    damage: Math.max(0, Math.trunc(input.damage || 0)),
    damageType: input.damageType.trim().slice(0, 40),
    tier: { ...input.tier },
    createdDay: Math.max(1, Math.trunc(input.day || 1)),
    createdTime: input.time,
    status: "pending",
  };
  scene.damageRequests ??= [];
  scene.damageRequests.push(request);
  scene.damageRequests = scene.damageRequests.slice(-120);
  return request;
}

export function resolveSurvivorDamageRequest(
  scene: ConflictScene,
  requestId: string,
  survivor: { id: string; hp: number; armorMarked?: number },
  stats: { hp: number; armor: number },
  resolution: "hp" | "armor",
  day: number,
  time: string,
) {
  const request = (scene.damageRequests ?? []).find(row => row.id === requestId);
  if (!request || request.status !== "pending" || request.targetSurvivorId !== survivor.id)
    return { ok: false as const, reason: "unavailable" as const };

  const baseMarks = request.tier.hpMarks;
  let armorUsed = 0;
  let hpMarks = baseMarks;
  if (resolution === "armor") {
    const freeArmor = Math.max(0, stats.armor - (survivor.armorMarked ?? 0));
    if (freeArmor < 1) return { ok: false as const, reason: "no-armor" as const };
    survivor.armorMarked = (survivor.armorMarked ?? 0) + 1;
    armorUsed = 1;
    hpMarks = Math.max(0, baseMarks - 1) as 0 | 1 | 2;
  }

  survivor.hp = Math.max(0, Math.min(stats.hp, survivor.hp + hpMarks));
  request.status = "resolved";
  request.resolution = resolution;
  request.appliedHpMarks = hpMarks;
  request.armorMarked = armorUsed;
  request.resolvedDay = Math.max(1, Math.trunc(day || 1));
  request.resolvedTime = time;
  return {
    ok: true as const,
    requestId: request.id,
    sourceName: request.sourceName,
    attackName: request.attackName,
    hpMarks,
    armorUsed,
    totalHpMarked: survivor.hp,
    maxHp: stats.hp,
    armorMarked: survivor.armorMarked ?? 0,
    maxArmor: stats.armor,
  };
}


export type ThreatDamageTier = {
  key: "none" | "minor" | "major" | "severe";
  label: "Sem dano" | "Menor" | "Maior" | "Severo";
  hpMarks: 0 | 1 | 2 | 3;
};

export type ThreatAttackResolution = {
  targetId: string;
  targetName: string;
  hit: boolean;
  damageTier: ThreatDamageTier;
};

export function resolveThreatDamageTier(template: ThreatTemplate, damage: number): ThreatDamageTier {
  const amount = Math.max(0, Math.trunc(damage || 0));
  if (amount <= 0) return { key: "none", label: "Sem dano", hpMarks: 0 };
  if (template.severeThreshold !== null && amount >= template.severeThreshold)
    return { key: "severe", label: "Severo", hpMarks: 3 };
  if (template.majorThreshold !== null && amount >= template.majorThreshold)
    return { key: "major", label: "Maior", hpMarks: 2 };
  return { key: "minor", label: "Menor", hpMarks: 1 };
}

export function resolveThreatAttack(
  threat: ThreatInstance,
  attackTotal: number,
  critical: boolean,
  damage: number,
): ThreatAttackResolution {
  const total = Math.trunc(attackTotal || 0);
  const hit = Boolean(critical) || total >= threat.templateSnapshot.difficulty;
  return {
    targetId: threat.id,
    targetName: threat.name,
    hit,
    damageTier: resolveThreatDamageTier(threat.templateSnapshot, damage),
  };
}

export function removeConflictParticipant(scene: ConflictScene, participant: ConflictParticipantRef) {
  if (participant.kind === "survivor") {
    scene.survivorIds = scene.survivorIds.filter(id => id !== participant.id);
  } else {
    scene.threats = scene.threats.filter(threat => threat.id !== participant.id);
  }
  if (scene.spotlight?.kind === participant.kind && scene.spotlight.id === participant.id) scene.spotlight = null;
}

export function endConflictScene(scene: ConflictScene, day: number, time: string) {
  scene.active = false;
  scene.spotlight = null;
  scene.endedDay = Math.max(1, Math.trunc(day || 1));
  scene.endedTime = time;
}
