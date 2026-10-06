import { absoluteMinutes, displayTime, type GameState } from "./game";

export type SurvivorTimedCommitment = {
  kind: "shelter-work";
  projectId: string;
  projectName: string;
  endAbsoluteMinute: number;
  until: string;
  label: string;
};

/** Compromissos temporais impedem que o mesmo sobrevivente use as mesmas horas
 * em viagem, busca ou descanso. Hoje o único compromisso persistente é trabalho
 * no abrigo; a função fica centralizada para novas atividades futuras. O relógio
 * paralelo de subgrupos continua fora desta etapa. */
export function survivorTimedCommitment(game: GameState, survivorId: string): SurvivorTimedCommitment | null {
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

export function timedActionParticipantIssue(game: GameState, survivorIds: string[], actionLabel = "esta ação") {
  for (const id of survivorIds) {
    const person = game.survivors.find(candidate => candidate.id === id);
    const commitment = survivorTimedCommitment(game, id);
    if (person && commitment) return `${person.name} está ocupado: ${commitment.label.toLocaleLowerCase("pt-BR")}. Não pode participar de ${actionLabel} nas mesmas horas.`;
  }
  return null;
}
