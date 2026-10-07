import { z } from "zod";
import { addLog, type GameState, type ShelterProject } from "./game";
import { cancelSurvivorWorkShift, projectDefinition } from "./shelter-projects";

const id = z.string().min(1).max(120);
const base = { id, day: z.number().int().min(1), expectedFingerprint: z.string().regex(/^[a-f0-9]{64}$/) };
export const masterRemovalCommandSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("remove-shelter-project"), shelterHex: z.string().regex(/^-?\d+,-?\d+$/), projectId: id }).strict(),
  z.object({ ...base, type: z.literal("delete-scene"), sceneId: id, expectedActiveSceneId: id.nullable() }).strict(),
]);
export type MasterRemovalCommand = z.infer<typeof masterRemovalCommandSchema>;

// Hash the reviewed snapshot: large scenes still fit in a small command.
export async function removalFingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function projectRemovalLabel(project: ShelterProject) {
  if (project.state === "Planejado") return "Cancelar solicitação";
  if (project.state === "Em construção" && project.repairProgress === undefined) return "Cancelar obra";
  return projectDefinition(project.key)?.kind === "upgrade" ? "Remover melhoria" : "Demolir estrutura";
}

export async function applyMasterRemoval(game: GameState, command: MasterRemovalCommand) {
  if (command.day !== game.day) return { ok: false, message: "O dia mudou. Revise a confirmação." };
  if (command.type === "remove-shelter-project") {
    const project = game.shelter.projects?.find(entry => entry.id === command.projectId);
    if (game.shelter.hex !== command.shelterHex || !project || await removalFingerprint(project) !== command.expectedFingerprint)
      return { ok: false, message: "O abrigo ou a construção mudou. Feche a confirmação e revise novamente." };
    for (const shift of [...(project.volunteerShifts ?? [])]) cancelSurvivorWorkShift(project, shift.survivorId, game);
    game.shelter.projects = game.shelter.projects!.filter(entry => entry.id !== project.id);
    game.shelter.disabledProjectKeys = (game.shelter.disabledProjectKeys ?? []).filter(key => key !== project.key);
    if (project.key === "refrigeration") game.shelter.coldStorage = false;
    const action = projectRemovalLabel(project);
    addLog(game, "abrigo", `${action}: ${project.name}. ${project.slotId ? "Espaço liberado. " : ""}Equipe e turnos liberados. Materiais já gastos não foram devolvidos.`);
    return { ok: true, message: project.state === "Planejado" ? "Solicitação cancelada." : "Construção removida." };
  }
  const board = game.sceneBoard;
  const scene = board?.scenes.find(entry => entry.id === command.sceneId);
  if (!board || !scene || (board.activeSceneId ?? null) !== command.expectedActiveSceneId || await removalFingerprint(scene) !== command.expectedFingerprint)
    return { ok: false, message: "A cena ou sua apresentação mudou. Feche a confirmação e revise novamente." };
  board.scenes = board.scenes.filter(entry => entry.id !== scene.id);
  if (board.activeSceneId === scene.id) delete board.activeSceneId;
  if (game.playerActions) game.playerActions.markers = game.playerActions.markers.filter(marker => marker.sceneId !== scene.id);
  addLog(game, "cena", `Cena visual excluída: ${scene.name}.`);
  return { ok: true, message: "Cena excluída." };
}
