import type { HexState } from "./game";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
/** Artwork is chosen only from the visible sector, never its hidden points or events. */
export function mapArtworkIndex(hex: HexState): number | null {
  if (hex.discovery === "desconhecido") return null;
  const name = normalize(hex.sector?.name ?? "");
  if (/ponte/.test(name) && (hex.passage === "road" || hex.connections?.some(link => link.kind === "road"))) return 6;
  const terrain = hex.terrain ?? "urban";
  if (terrain !== "urban") return { rural: 12, forest: 13, mountain: 14, swamp: 15 }[terrain];
  const categories: [RegExp, number][] = [
    [/reservat|agua|bombeamento/, 1], [/praca|monumento/, 2], [/estacao|ferrovi/, 3],
    [/industr|oficina|fabrica|conteiner|deposit/, 4], [/mercado|feira|comerc/, 5],
    [/canal|\brio\b|margem|porto/, 6], [/hospital|clinic|saude/, 7], [/univers|escola|colegio/, 8],
    [/parque|jardim|cemiter|esport/, 9], [/rodovi|viaduto|estrada/, 10], [/obra|construc/, 11],
  ];
  return categories.find(([pattern]) => pattern.test(name))?.[1] ?? 0;
}
