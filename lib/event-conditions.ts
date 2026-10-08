import { survivorHex, type GameState } from "./game";
import type { EventCondition } from "./event-resolution-types";

export function movementCondition(conditions: EventCondition[] | undefined) {
  return conditions?.find(c => c.preventsMovement === true
    || (c.preventsMovement === undefined && c.name.trim().toLocaleLowerCase("pt-BR") === "restrito"));
}

export function eventMovementIssue(game: GameState, ids: string[]) {
  const members = game.survivors.filter(p => ids.includes(p.id));
  for (const p of members) {
    const condition = movementCondition(p.eventConditions);
    if (condition) return `${p.name} está ${condition.name}: ${condition.clear} Encerre a condição na ficha antes de viajar.`;
  }
  const source = members[0] ? survivorHex(game, members[0]) : "";
  const entireGroup = game.survivors.filter(p=>survivorHex(game,p)===source).every(p=>ids.includes(p.id));
  for (const npc of game.npcs ?? []) {
    if (!npc.active || npc.hex !== source || ["Morto","Desaparecido"].includes(npc.status)) continue;
    const accompanies = npc.accompaniesSurvivorIds ?? [];
    if (!(accompanies.length ? accompanies.every(id=>ids.includes(id)) : npc.accompaniesParty && source===game.partyHex && entireGroup)) continue;
    const condition = movementCondition(npc.eventConditions);
    if (condition) return `${npc.name} acompanha este grupo e está ${condition.name}: ${condition.clear} Liberte o PNJ ou ajuste sua companhia antes de viajar.`;
  }
  return "";
}
