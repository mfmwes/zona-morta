import { survivorHex, type GameState } from "./game";
import { eventStatus } from "./hex-generators";
import type { CampaignAttention, CampaignTarget } from "./campaign-attention";

export const campaignSearchKinds = {
  survivor: "Sobreviventes", npc: "PNJs", sector: "Setores", point: "Locais", event: "Eventos", project: "Obras",
} as const;
export type CampaignSearchKind = keyof typeof campaignSearchKinds;
export type CampaignSearchEntry = { id: string; kind: CampaignSearchKind; title: string; detail: string; target: CampaignTarget };
export function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}
export function matchesSearch(query: string, ...values: string[]) {
  const haystack = searchText(values.join(" "));
  return searchText(query).trim().split(/\s+/).every(word => haystack.includes(word));
}
export function campaignPlaceLabel(game: GameState, hexId: string) {
  return `${game.hexes[hexId]?.sector?.name ?? "Setor"} · Hex ${hexId}`;
}
export function campaignTargetHex(game: GameState, target: CampaignTarget): string | null {
  if (target.tab === "mapa") return target.hexId;
  if (target.tab === "sobreviventes") return survivorHex(game, target.survivorId);
  if (target.tab === "comunidade") return game.npcs.find(npc => npc.id === target.npcId)?.hex ?? null;
  if (target.tab === "abrigo") return game.shelter.hex;
  return null;
}
/** The index includes unrevealed records and must only be available to the master. */
export function campaignSearchEntries(game: GameState, access: { role: string; playerPreview: boolean }): CampaignSearchEntry[] {
  if (access.role !== "mestre" || access.playerPreview) return [];
  const entries: CampaignSearchEntry[] = [];
  for (const person of game.survivors) entries.push({ id: `survivor:${person.id}`, kind: "survivor", title: person.name, detail: campaignPlaceLabel(game, survivorHex(game, person.id)), target: { tab: "sobreviventes", survivorId: person.id } });
  for (const npc of game.npcs) entries.push({ id: `npc:${npc.id}`, kind: "npc", title: npc.name, detail: [npc.role, npc.status, npc.hex ? campaignPlaceLabel(game, npc.hex) : ""].filter(Boolean).join(" · "), target: { tab: "comunidade", npcId: npc.id } });
  for (const [hexId, hex] of Object.entries(game.hexes)) {
    const place = campaignPlaceLabel(game, hexId);
    if (hex.sector) entries.push({ id: `sector:${hexId}`, kind: "sector", title: hex.sector.name, detail: `Hex ${hexId}`, target: { tab: "mapa", hexId } });
    for (const point of hex.points) entries.push({ id: `point:${hexId}:${point.id}`, kind: "point", title: point.name, detail: place, target: { tab: "mapa", hexId, pointId: point.id } });
    for (const event of hex.events) {
      const status = { pending: "Pendente", active: "Em andamento", resolved: "Encerrado", archived: "Arquivado" }[eventStatus(event)];
      entries.push({ id: `event:${hexId}:${event.id}`, kind: "event", title: event.text, detail: `${place} · ${status}`, target: { tab: "mapa", hexId, eventId: event.id } });
    }
  }
  for (const project of game.shelter.projects ?? []) entries.push({ id: `project:${project.id}`, kind: "project", title: project.name, detail: `${game.shelter.name} · ${project.state}`, target: { tab: "abrigo", projectId: project.id } });
  return entries;
}
export function filterCampaignSearch(entries: CampaignSearchEntry[], query: string, kind = "all") {
  if (!query.trim()) return [];
  return entries.filter(entry => (kind === "all" || entry.kind === kind) && matchesSearch(query, entry.title, entry.detail));
}
export function filterCampaignAttention(game: GameState, rows: CampaignAttention[], query: string, type = "all", hex = "all") {
  return rows.filter(row => (type === "all" || row.target.tab === type)
    && (hex === "all" || campaignTargetHex(game, row.target) === hex)
    && matchesSearch(query, row.title, row.detail, campaignTargetHex(game, row.target) ? campaignPlaceLabel(game, campaignTargetHex(game, row.target)!) : ""));
}
