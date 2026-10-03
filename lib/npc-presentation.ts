import { communityCapabilities, type GameState, type NPC } from "./game";

/** Older campaigns shared every NPC; only an explicit false hides one. */
export function npcVisibleToPlayers(npc: NPC) { return npc.visibleToPlayers !== false; }
export function publicNpcs(npcs: NPC[]) { return npcs.filter(npcVisibleToPlayers); }
/** The GM preview uses the same NPC visibility rule as the server projection. */
export function npcPlayerView(game: GameState): GameState {
  return { ...game, npcs: publicNpcs(game.npcs ?? []) };
}

function sameCapability(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;
}
export function normalizeNpcCapabilities(skills: string[]): string[] {
  const result: string[] = [];
  for (const raw of skills) {
    const clean = raw.trim().replace(/\s+/g, " ");
    if (!clean) continue;
    const value = communityCapabilities.find(capability => sameCapability(clean, capability)) ?? clean;
    if (!result.some(previous => sameCapability(previous, value))) result.push(value);
  }
  return result.slice(0, 20);
}
export function setNpcCapability(skills: string[], capability: string, selected: boolean) {
  const current = normalizeNpcCapabilities(skills);
  return selected ? normalizeNpcCapabilities([...current, capability]) : current.filter(value => !sameCapability(value, capability));
}
