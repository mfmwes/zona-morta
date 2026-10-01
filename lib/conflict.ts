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
  defeated: boolean;
  conditions: string[];
};

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
};

export function publicConflictScene(
  scene: ConflictScene,
  survivors: Array<{ id: string; name: string; portrait?: string }>,
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
    defeated: threat.defeated,
    conditions: [...threat.conditions],
  }));
  const spotlight = scene.spotlight
    && (scene.spotlight.kind === "survivor"
      ? publicSurvivors.some(person => person.id === scene.spotlight!.id)
      : publicThreats.some(threat => threat.id === scene.spotlight!.id))
    ? { ...scene.spotlight }
    : null;
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
