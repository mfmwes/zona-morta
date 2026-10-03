import { survivorHex, type GameState } from "./game";
import { npcVisibleToPlayers } from "./npc-presentation";
import type { PortraitFrame } from "./portrait-frame";

export type ResidentRef = { kind: "survivor" | "npc"; id: string };
export type ShelterResident = ResidentRef & {
  name: string; portrait?: string; portraitFrame?: PortraitFrame; role: string;
  hex: string; home?: string; duty?: string; active: boolean; hidden: boolean; exploring: boolean;
};
export const residentKey = (person: ResidentRef) => `${person.kind}:${person.id}`;
export function residentCandidates(game: GameState): ShelterResident[] {
  return [
    ...game.survivors.map(person => ({ kind: "survivor" as const, id: person.id, name: person.name,
      portrait: person.portrait, role: person.archetype, hex: survivorHex(game, person), home: person.home,
      active: true, hidden: false, exploring: true })),
    ...game.npcs.map(person => ({ kind: "npc" as const, id: person.id, name: person.name,
      portrait: person.portrait, portraitFrame: person.portraitFrame, role: person.role,
      hex: person.hex, home: person.home, duty: person.duty, active: person.active && person.status !== "Morto" && person.status !== "Desaparecido",
      hidden: !npcVisibleToPlayers(person), exploring: Boolean(person.accompaniesParty || person.accompaniesSurvivorIds?.length) })),
  ];
}
export function shelterCommunity(game: GameState, publicOnly = false) {
  const hex = game.shelter.hex;
  const people = residentCandidates(game).filter(person => person.active && (!publicOnly || !person.hidden));
  return {
    residents: hex ? people.filter(person => person.home === hex) : [],
    present: game.shelter.residents + people.filter(person => person.hex === (hex ?? game.partyHex)).length,
  };
}
/** Only change explicit membership choices; never move people or change survival bookkeeping. */
export function updateShelterResidents(game: GameState, hex: string, added: ResidentRef[], removed: ResidentRef[]) {
  if (game.shelter.hex !== hex) return false;
  const find = (ref: ResidentRef) => ref.kind === "survivor" ? game.survivors.find(person => person.id === ref.id)
    : ref.kind === "npc" ? game.npcs.find(person => person.id === ref.id) : undefined;
  const candidates = residentCandidates(game);
  if (added.some(ref => !candidates.some(person => residentKey(person) === residentKey(ref) && person.active))) return false;
  for (const ref of removed) {
    const person = find(ref);
    if (person?.home === hex) delete person.home;
  }
  for (const ref of added) find(ref)!.home = hex;
  return true;
}
