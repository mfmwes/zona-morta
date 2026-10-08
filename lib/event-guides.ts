import definitions from "./event-guide-definitions.json";
import legacyDefinitions from "./event-guide-legacy-definitions.json";
import type { HexEvent, HexEventActionKind } from "./game";
import type { EventOutcome } from "./event-resolution-types";
import { splitGeneratorText } from "./hex-generators";
export type EventSuggestedOutcome = { summary: string; continuity: string; noise: number; extraMinutes?: number };
type EventTestOption = { trait: string; difficulty: number; when: string };
export type EventApproach = { id: string; label: string; description: string; minutes: number; timeNote?: string;
  test?: EventTestOption & { alternative?: EventTestOption }; outcomes?: Partial<Record<EventOutcome, EventSuggestedOutcome>> };
export type EventGuide = { suggestedAction?: HexEventActionKind | null; roll?: number; title: string; stakes: string; approaches: EventApproach[];
  format: "brief" | "scene"; setup?: string; ignored?: string; returnVisit?: string; observation?: string; application?: string; requirements?: string[]; contextNote?: string; sourceTexts?: string[]; legacy?: boolean;
  outcomes: Record<EventOutcome, EventSuggestedOutcome> };
export const eventGuides = definitions as readonly EventGuide[];
export const legacyEventGuides = legacyDefinitions as readonly EventGuide[];
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export function eventOutcomeSuggestion(guide: EventGuide, approachId: string, outcome: EventOutcome): EventSuggestedOutcome {
  if (approachId === "free") return { summary: "Descreva a intenção e o resultado da solução escolhida pelo grupo.", continuity: "Registre a mudança concreta, as obrigações e o que continua pendente.", noise: 0 };
  return guide.approaches.find(a => a.id === approachId)?.outcomes?.[outcome] ?? guide.outcomes[outcome];
}
export function eventGuide(event: HexEvent): EventGuide {
  const matchesText = (g: EventGuide) => g.sourceTexts?.some(t => normalize(t) === normalize(event.text)
    || normalize(splitGeneratorText(t).publicText) === normalize(event.text));
  const legacy = legacyEventGuides.find(matchesText);
  if (legacy) return structuredClone(legacy);
  const known = eventGuides.find(g => g.roll === event.generatorRoll)
    ?? eventGuides.find(g => normalize(g.title) === normalize(event.text.split('.')[0]));
  // Revised seeds must not introduce their new facts into customized or old scenes.
  if (known && matchesText(known)) return structuredClone(known);
  return { title: event.text.split('.')[0].slice(0,120), format: "brief", stakes: event.guidance || "Defina o que está em jogo, os sinais percebidos e uma possibilidade de recuo antes da decisão.",
    approaches: [{ id: "careful", label: "Observar / preparar", description: "Confirmar sinais e anunciar o risco antes de agir.", minutes: 5 },
      { id: "risk", label: "Intervir", description: "Escolher uma abordagem; propor teste somente quando houver risco e incerteza.", minutes: 5 },
      { id: "alternative", label: "Outra saída / recuar", description: "Manter uma alternativa coerente com o que já foi estabelecido.", minutes: 0 }],
    outcomes: { success: {summary:"A intenção escolhida é alcançada.",continuity:"Registre a mudança concreta que permanece no local.",noise:0},
      complication: {summary:"A intenção é alcançada com um custo ou complicação anunciado.",continuity:"Registre a mudança e a condição adicional.",noise:0},
      failure: {summary:"A intenção não é alcançada; uma alternativa mantém a cena em movimento.",continuity:"Registre o obstáculo que permanece e a próxima possibilidade.",noise:0},
      withdrawn: {summary:"O grupo recua ou escolhe outra saída.",continuity:"Registre o que ficou pendente para uma próxima visita.",noise:0} } };
}
