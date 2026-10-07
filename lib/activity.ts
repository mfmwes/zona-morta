import { absoluteMinutes, displayTime, type GameState } from "./game";

export type SurvivorTimedCommitment = {
  kind: "shelter-work" | "travel" | "search" | "rest" | "treatment" | "event";
  projectId: string;
  projectName: string;
  endAbsoluteMinute: number;
  until: string;
  label: string;
};

/** Compromissos temporais impedem que o mesmo sobrevivente use as mesmas horas
 * em viagem, busca ou descanso. Hoje o único compromisso persistente é trabalho
 * no abrigo; a função fica centralizada para novas atividades futuras. */
export function survivorTimedCommitment(game: GameState, survivorId: string, exceptActivityId?: string): SurvivorTimedCommitment | null {
  const activity = game.activities?.find(a => a.day === game.day && a.status === "running" && a.id !== exceptActivityId && a.participantIds.includes(survivorId));
  if (activity) {
    const until = displayTime(activity.endMinute);
    return { kind: activity.type, projectId: activity.id, projectName: activity.label, endAbsoluteMinute: (game.day - 1) * 1440 + activity.endMinute, until, label: `${activity.label} até ${until}` };
  }
  const now = absoluteMinutes(game);
  for (const project of game.shelter.projects ?? []) {
    const shift = (project.volunteerShifts ?? [])
      .find(entry => entry.survivorId === survivorId && entry.endAbsoluteMinute > now);
    if (!shift) continue;
    const minuteOfDay = ((shift.endAbsoluteMinute % 1440) + 1440) % 1440;
    const until = displayTime(minuteOfDay);
    return {
      kind: "shelter-work",
      projectId: project.id,
      projectName: project.name,
      endAbsoluteMinute: shift.endAbsoluteMinute,
      until,
      label: `Trabalhando em ${project.name} até ${until}`,
    };
  }
  return null;
}

export function timedActionParticipantIssue(game: GameState, survivorIds: string[], actionLabel = "esta ação", exceptActivityId?: string) {
  for (const id of survivorIds) {
    const person = game.survivors.find(candidate => candidate.id === id);
    const commitment = survivorTimedCommitment(game, id, exceptActivityId);
    if (person && commitment) return `${person.name} está ocupado: ${commitment.label}. Não pode participar de ${actionLabel} nas mesmas horas.`;
  }
  return null;
}


export type ParticipantTimePreview = {
  ok: boolean;
  startMinute: number;
  endMinute: number;
  worldBefore: number;
  worldAfter: number;
  worldAdvance: number;
  overlapMinutes: number;
  fullyParallel: boolean;
};

/** Garante curso temporal individual para os sobreviventes atuais. Campanhas
 * antigas começam sincronizadas no horário em que a primeira ação paralela ocorre. */
export function ensureParallelTime(game: GameState) {
  if (!game.parallelTime || game.parallelTime.day !== game.day) {
    game.parallelTime = {
      day: game.day,
      survivorMinutes: Object.fromEntries(game.survivors.map(person => [person.id, game.minutes])),
    };
    return game.parallelTime;
  }
  const validIds = new Set(game.survivors.map(person => person.id));
  for (const person of game.survivors) {
    const minute = game.parallelTime.survivorMinutes[person.id];
    if (!Number.isInteger(minute) || minute < 0 || minute > game.minutes)
      game.parallelTime.survivorMinutes[person.id] = game.minutes;
  }
  for (const id of Object.keys(game.parallelTime.survivorMinutes)) {
    if (!validIds.has(id)) delete game.parallelTime.survivorMinutes[id];
  }
  return game.parallelTime;
}

export function participantTimePreview(game: GameState, survivorIds: string[], durationMinutes: number): ParticipantTimePreview {
  const ids = [...new Set(survivorIds)];
  if (!ids.length || ids.some(id => !game.survivors.some(person => person.id === id))
    || !Number.isInteger(durationMinutes) || durationMinutes < 0) {
    return { ok: false, startMinute: game.minutes, endMinute: game.minutes, worldBefore: game.minutes,
      worldAfter: game.minutes, worldAdvance: 0, overlapMinutes: 0, fullyParallel: false };
  }
  // Atividades novas sempre começam agora. Não há ações retroativas.
  const startMinute = game.minutes;
  const endMinute = startMinute + durationMinutes;
  if (endMinute >= 1440) {
    return { ok: false, startMinute, endMinute, worldBefore: game.minutes, worldAfter: game.minutes,
      worldAdvance: 0, overlapMinutes: Math.max(0, game.minutes - startMinute), fullyParallel: false };
  }
  const worldAfter = Math.max(game.minutes, endMinute);
  const overlapMinutes = Math.max(0, Math.min(durationMinutes, game.minutes - startMinute));
  return {
    ok: true,
    startMinute,
    endMinute,
    worldBefore: game.minutes,
    worldAfter,
    worldAdvance: worldAfter - game.minutes,
    overlapMinutes,
    fullyParallel: endMinute <= game.minutes,
  };
}

/** Marca até onde um ou mais sobreviventes já comprometeram o próprio tempo. */
export function markParticipantTime(game: GameState, survivorIds: string[], minute: number) {
  const timeline = ensureParallelTime(game);
  for (const id of new Set(survivorIds)) {
    if (!game.survivors.some(person => person.id === id)) continue;
    const current = timeline.survivorMinutes[id] ?? game.minutes;
    timeline.survivorMinutes[id] = Math.max(current, Math.min(game.minutes, Math.max(0, Math.trunc(minute))));
  }
}

/** Quando uma ação global faz o mundo esperar, todos os sobreviventes alcançam
 * o mesmo horário e deixam de ter tempo paralelo pendente. */
export function syncAllParticipantsToCurrentTime(game: GameState) {
  const timeline = ensureParallelTime(game);
  for (const person of game.survivors) timeline.survivorMinutes[person.id] = game.minutes;
}

/** Uma escolha que começa explicitamente "agora" (como iniciar/cancelar turno)
 * abandona qualquer janela retroativa ainda não usada por aquele sobrevivente. */
export function syncParticipantsToCurrentTime(game: GameState, survivorIds: string[]) {
  const timeline = ensureParallelTime(game);
  for (const id of new Set(survivorIds)) {
    if (game.survivors.some(person => person.id === id)) timeline.survivorMinutes[id] = game.minutes;
  }
}

export function resetParallelTime(game: GameState) {
  game.parallelTime = {
    day: game.day,
    survivorMinutes: Object.fromEntries(game.survivors.map(person => [person.id, game.minutes])),
  };
}

export function parallelTimeLabel(preview: ParticipantTimePreview) {
  if (!preview.ok) return "";
  const range = `${displayTime(preview.startMinute)}–${displayTime(preview.endMinute)}`;
  if (!preview.overlapMinutes) return `${range} · relógio +${preview.worldAdvance} min`;
  if (preview.fullyParallel) return `${range} em paralelo · relógio geral permanece ${displayTime(preview.worldBefore)}`;
  return `${range} parcialmente em paralelo · relógio geral +${preview.worldAdvance} min`;
}
