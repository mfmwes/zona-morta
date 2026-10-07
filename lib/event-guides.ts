import definitions from "./event-guide-definitions.json";
import type { HexEvent, HexEventActionKind } from "./game";
import type { EventOutcome } from "./event-resolution-types";
export type EventApproach = { id: string; label: string; description: string; minutes: number; test?: { trait: string; difficulty: number } };
export type EventGuide = { suggestedAction?: HexEventActionKind | null; roll?: number; title: string; stakes: string; approaches: EventApproach[];
  outcomes: Record<EventOutcome, { summary: string; continuity: string; noise: number }> };
export const eventGuides = definitions as readonly EventGuide[];
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function eventGuide(event: HexEvent): EventGuide {
  const known = eventGuides.find(g => g.roll === event.generatorRoll)
    ?? eventGuides.find(g => normalize(g.title) === normalize(event.text.split('.')[0]));
  if (known) return structuredClone(known);
  return { title: event.text.split('.')[0].slice(0,120), stakes: event.guidance || "Defina o que está em jogo, os sinais percebidos e uma possibilidade de recuo antes da decisão.",
    approaches: [{ id: "careful", label: "Observar / preparar", description: "Confirmar sinais e anunciar o risco antes de agir.", minutes: 5 },
      { id: "risk", label: "Intervir", description: "Escolher uma abordagem; propor teste somente quando houver risco e incerteza.", minutes: 5 },
      { id: "alternative", label: "Outra saída / recuar", description: "Manter uma alternativa coerente com o que já foi estabelecido.", minutes: 0 }],
    outcomes: { success: {summary:"A intenção escolhida é alcançada.",continuity:"Registre a mudança concreta que permanece no local.",noise:0},
      complication: {summary:"A intenção é alcançada com um custo ou complicação anunciado.",continuity:"Registre a mudança e a condição adicional.",noise:0},
      failure: {summary:"A intenção não é alcançada; uma alternativa mantém a cena em movimento.",continuity:"Registre o obstáculo que permanece e a próxima possibilidade.",noise:0},
      withdrawn: {summary:"O grupo recua ou escolhe outra saída.",continuity:"Registre o que ficou pendente para uma próxima visita.",noise:0} } };
}
