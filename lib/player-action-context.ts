import type { PublicPlayerActions, TeamOperation } from "./player-actions-types";

export type PlayerActionContext =
  | { kind: "search"; hexId: string; pointId: string }
  | { kind: "travel"; destination?: string }
  | { kind: "inventory" | "supplies" | "rest" }
  | { kind: "scene"; position?: { x: number; y: number } };

export function operationInContext(op: Omit<TeamOperation, "itemSnapshot" | "plans">, context: PlayerActionContext) {
  if (context.kind === "search") return op.type === "search" && op.hexId === context.hexId && op.pointId === context.pointId;
  if (context.kind === "travel") return op.type === "travel" && (!context.destination || op.destination === context.destination);
  if (context.kind === "inventory") return op.type === "transfer";
  return context.kind === "rest" && op.type === "rest";
}
export function actionsInContext(view: PublicPlayerActions, context: PlayerActionContext): PublicPlayerActions {
  return { ...view,
    operations: view.operations.filter(op => operationInContext(op, context)),
    areas: context.kind === "search" ? view.areas.filter(a => a.hexId === context.hexId && a.pointId === context.pointId) : [],
    stock: context.kind === "search" ? view.stock.filter(s => s.hexId === context.hexId && s.pointId === context.pointId) : [],
    routes: context.kind === "travel" ? view.routes.filter(r => !context.destination || r.destination === context.destination) : [],
  };
}
