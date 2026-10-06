import type { InventoryItem } from "./game";
import type { ActionOutcome } from "./rolls";

export type LocationScale = "small" | "medium" | "large" | "complex";

export type SearchArea = {
  id: string; name: string; signal: string; table: string; minutes: 30 | 60;
  access: "open" | "risk" | "blocked"; difficulty: 12 | 13 | 15; noise: number;
  armedGuard: boolean; compatibleOwner: boolean; ammunition: "Pistola" | "Espingarda" | "Carabina";
  /** Áreas narrativas existem no local, mas não concedem uma rolagem d12 própria. */
  searchable?: boolean;
  /** Ajuda o mestre a distinguir o que veio da preparação do que foi declarado depois. */
  source?: "generated" | "manual" | "historical";
  excludedRolls?: number[]; exclusionReason?: string; collectible?: boolean; spacious?: boolean;
};
export type SearchAttempt = {
  id: string; areaId: string; participants: string[]; mode: "open" | "specific";
  /** Ausente em campanhas antigas = busca normal. Busca profunda existe no máximo uma vez por área. */
  kind?: "normal" | "deep";
  objective: string; purpose: string; catalogKey?: string; quantity: number;
  minutes: number; noise: number; warehouseWorker?: string;
  status: "pending" | "ready" | "completed" | "failed";
  outcome?: ActionOutcome; actorId?: string; roll?: number; result?: string;
  stockIds?: string[];
  areaSnapshot?: SearchArea; effectiveRoll?: number; adjustmentReason?: string;
};
export type LocationStock = { id: string; areaId: string; attemptId?: string; item: InventoryItem; remaining: number; accessible?: boolean; requiresFuelContainer?: boolean };
export type LocationPreparation = {
  version: 1;
  /** Ausente em preparações antigas. O sistema infere o porte quando necessário. */
  scale?: LocationScale;
  areas: SearchArea[]; attempts: SearchAttempt[]; stock: LocationStock[];
  collections: { id: string; lines: { stockId: string; ownerId: string; quantity: number; cartId?: string }[] }[];
};
