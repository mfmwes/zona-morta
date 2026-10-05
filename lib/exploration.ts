import { addLog, content, survivorsAtHex, type GameState, type Point } from "./game";
import { createId } from "./id";
import { advanceCampaignTime } from "./time";

export type SearchInput = {
  hex: string; pointId: string; sector: string; what: string; result: string; minutes: number;
  mode: "specific" | "open"; table?: string; roll?: number;
};
export const normalizedSector = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

/** `sector` nas buscas antigas representa uma área interna, não o setor do mapa. */
export function searchAreaLabel(point: Point, area: string) {
  return normalizedSector(area) === normalizedSector(point.name) ? "Área principal" : area;
}

export function searchAvailabilityError(game: GameState, hexId: string, pointId: string): string | null {
  const hex = game.hexes[hexId];
  const point = hex?.points.find(p => p.id === pointId);
  if (!point) return "Este local não está mais registrado no hex.";
  if (hex.discovery !== "explorado") return "Explore este hex antes de buscar nos locais.";
  if (survivorsAtHex(game, hexId).length === 0) return "É preciso haver pelo menos um sobrevivente neste hex antes de procurar itens.";
  return null;
}

export function searchAreaError(point: Point, area: string): string | null {
  if (!area.trim()) return "Informe a área interna que será vasculhada.";
  if (point.searches.some(search => normalizedSector(search.sector) === normalizedSector(area))) return "Esta área interna já foi vasculhada. Escolha outra área que exista neste local.";
  return null;
}

export function searchError(game: GameState, input: SearchInput): string | null {
  const availabilityError = searchAvailabilityError(game, input.hex, input.pointId);
  if (availabilityError) return availabilityError;
  const point = game.hexes[input.hex].points.find(p => p.id === input.pointId)!;
  const areaError = searchAreaError(point, input.sector);
  if (areaError) return areaError;
  if (!input.result.trim()) return "Registre o resultado da busca, inclusive quando nada for encontrado.";
  if (!Number.isInteger(input.minutes) || input.minutes < 1 || game.minutes + input.minutes >= 1440) return "A busca precisa terminar antes da passagem de dia.";
  if (input.mode === "specific" && !input.what.trim()) return "Descreva o que procuram e o objetivo.";
  if (input.mode === "open" && (!content.lootTables.some(t => t.name === input.table) || !Number.isInteger(input.roll) || input.roll! < 1 || input.roll! > 12)) return "Role o achado na tabela do local.";
  return null;
}

export function recordSearch(game: GameState, input: SearchInput) {
  if (searchError(game, input)) return false;
  const hex = game.hexes[input.hex];
  const point = hex.points.find(p => p.id === input.pointId)!;
  if (!advanceCampaignTime(game, input.minutes).ok) return false;
  point.searches.push({ id: createId(), what: input.mode === "open" ? "Achado útil" : input.what.trim(), why: "",
    sector: input.sector.trim(), minutes: input.minutes, result: input.result.trim(), mode: input.mode,
    ...(input.mode === "open" ? { table: input.table, roll: input.roll } : {}) });
  addLog(game, "busca", `${hex.sector?.name ?? `Hex ${input.hex}`} / ${point.name}: ${input.mode === "open" ? `busca aberta (${input.table}, d12 ${input.roll})` : input.what.trim()} — ${input.result.trim()}`);
  return true;
}
