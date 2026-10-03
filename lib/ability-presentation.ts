import { abilityAvailable, abilityPeriod, type AbilityPeriod } from "./abilities";
import { survivorHex, type GameState } from "./game";

const usedLabels: Record<NonNullable<AbilityPeriod>, string> = {
  scene: "Usada nesta cena", day: "Usada hoje", expedition: "Usada nesta expedição",
  shortRest: "Usada neste descanso curto", longRest: "Usada neste descanso longo",
  rest: "Usada neste descanso", place: "Usada neste local", patient: "Usada neste paciente",
};

// Presentation follows the same target and availability as the registration dialog.
// A missing patient or insufficient resources does not mean the ability was consumed.
export function abilityUseState(game: GameState, survivorId: string, abilityId: string, effect: string, context = "") {
  const period = abilityPeriod(effect);
  const person = game.survivors.find(s => s.id === survivorId);
  const currentHex = person ? survivorHex(game, person) : game.partyHex;
  const target = period === "place" && !context.trim() ? `hex ${currentHex}` : context;
  const available = abilityAvailable(game, survivorId, abilityId, effect, target);
  const used = !!person && !!period && (period !== "patient" || !!target.trim()) && !available;
  const label = used && period ? `${usedLabels[period]}${period === "place" || period === "patient" ? ` · ${target.trim()}` : ""}` : null;
  return { period, currentHex, target, available, used, label };
}

export function abilityUseOptions(abilityId: string, name: string, effect: string) {
  const restDivider = name === "Mãos firmes" ? effect.indexOf("\nDurante um descanso curto:") : -1;
  return restDivider >= 0 ? [
    { abilityId: `${abilityId}:cena`, name: `${name} · cena`, effect: effect.slice(0, restDivider), buttonLabel: "Usar na cena", scope: "Cena" },
    { abilityId: `${abilityId}:descanso`, name: `${name} · descanso`, effect: effect.slice(restDivider + 1), buttonLabel: "Usar no descanso", scope: "Descanso" },
  ] : [{ abilityId, name, effect, buttonLabel: undefined, scope: undefined }];
}
