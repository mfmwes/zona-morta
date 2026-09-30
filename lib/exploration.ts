import { addLog, content, survivorsAtHex, type GameState } from "./game";
import { createId } from "./id";

export type SearchInput = {
  hex: string; pointId: string; sector: string; what: string; result: string; minutes: number;
  mode: "specific" | "open"; table?: string; roll?: number;
};
export const normalizedSector = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function searchError(game: GameState, input: SearchInput): string | null {
  if (survivorsAtHex(game, input.hex).length === 0) return "É preciso haver pelo menos um sobrevivente neste hex antes de procurar itens.";
  const hex = game.hexes[input.hex];
  const point = hex?.points.find(p => p.id === input.pointId);
  if (hex?.discovery !== "explorado" || !point) return "Este ponto precisa estar em um hex explorado.";
  if (!input.sector.trim() || !input.result.trim()) return "Informe o setor e o resultado da busca.";
  if (point.searches.some(search => normalizedSector(search.sector) === normalizedSector(input.sector))) return "Este setor já foi vasculhado.";
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || game.minutes + input.minutes >= 1440) return "A busca precisa terminar antes da passagem de dia.";
  if (input.mode === "specific" && !input.what.trim()) return "Descreva o que procuram e o objetivo.";
  if (input.mode === "open" && (!content.lootTables.some(t => t.name === input.table) || !Number.isInteger(input.roll) || input.roll! < 1 || input.roll! > 12)) return "Role o achado na tabela do local.";
  return null;
}

export function recordSearch(game: GameState, input: SearchInput) {
  if (searchError(game, input)) return false;
  const hex = game.hexes[input.hex];
  const point = hex.points.find(p => p.id === input.pointId)!;
  game.minutes += input.minutes;
  point.searches.push({ id: createId(), what: input.mode === "open" ? "Achado útil" : input.what.trim(), why: "",
    sector: input.sector.trim(), minutes: input.minutes, result: input.result.trim(), mode: input.mode,
    ...(input.mode === "open" ? { table: input.table, roll: input.roll } : {}) });
  addLog(game, "busca", `${hex.sector?.name ?? `Hex ${input.hex}`} / ${point.name}: ${input.mode === "open" ? `busca aberta (${input.table}, d12 ${input.roll})` : input.what.trim()} — ${input.result.trim()}`);
  return true;
}
