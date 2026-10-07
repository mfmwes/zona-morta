import { absoluteMinutes, addLog, type GameState } from "./game";
import { atSharedStorage, countsAsMedication, discardItem } from "./inventory";
import { shelterTreatmentBonus } from "./shelter-projects";
import { scheduleActivity } from "./activity-timeline";
import { completeSingleGroupActivity } from "./time";
import { rollDie } from "./rolls";
import { registerActivityHandler } from "./activity-handlers";

/** O medicamento é comprometido no início. A limpeza só termina após 30 min. */
export function scheduleExposureTreatment(game: GameState, survivorId: string, medicineId: string, cleanWater: boolean, die = rollDie) {
  const draft = structuredClone(game);
  const person = draft.survivors.find(p => p.id === survivorId);
  if (!person || person.infection !== "Exposto" || person.treatmentAttempted || !cleanWater)
    return { ok: false as const, message: "Confira a Exposição, a água limpa e a tentativa de tratamento." };
  if (absoluteMinutes(draft) + 30 > (person.exposureDeadline ?? 0))
    return { ok: false as const, message: "O tratamento precisa terminar dentro da janela de Exposição." };
  const shared = medicineId === "shared";
  const item = person.inventory.find(item => item.id === medicineId);
  if (shared ? !atSharedStorage(draft, survivorId) || draft.shelter.medications < 1 : !item || !countsAsMedication(item) || item.qty < 1)
    return { ok: false as const, message: "O Medicamentos escolhido não está disponível." };
  const support = shelterTreatmentBonus(draft, survivorId);
  const scheduled = scheduleActivity(draft, { type: "treatment", medicineSource: shared ? "reservas compartilhadas" : item!.name,
    modifier: (person.attributes.Conhecimento ?? 0) + support.bonus }, [survivorId], 30, "Tratamento de Exposição");
  if (!scheduled.ok) return scheduled;
  if (shared) draft.shelter.medications -= 1;
  else if (!discardItem(draft, survivorId, medicineId, 1)) return { ok: false as const, message: "Não foi possível reservar o medicamento." };
  person.treatmentAttempted = true;
  // A rolagem e seus efeitos entram no horário de conclusão.
  const completed = completeSingleGroupActivity(draft, scheduled.activity.id, die);
  Object.assign(game, draft);
  return { ...scheduled, completed };
}

registerActivityHandler("treatment", (game, activity, die) => {
  if (activity.type !== "treatment") return { ok: false, message: "Tratamento inválido." };
  const person = game.survivors.find(p => p.id === activity.participantIds[0]);
  if (!person || person.infection !== "Exposto") return { ok: false, message: "A condição do paciente mudou. Interrompa o tratamento para continuar." };
  const hope = die(12), fear = die(12), total = hope + fear + activity.modifier;
  const success = hope === fear || total >= 13;
  if (success) { person.infection = "Saudável"; person.exposureDeadline = null; }
  if (hope === fear) { person.hope = Math.min(6, person.hope + 1); person.stress = Math.max(0, person.stress - 1); }
  else if (hope > fear) person.hope = Math.min(6, person.hope + 1);
  else game.fear = Math.min(12, game.fear + 1);
  const message = `${person.name}: limpeza de Exposição (${hope} Esperança / ${fear} Medo + ${activity.modifier} = ${total}, Dificuldade 13). ${success ? "Saudável" : "Permanece Exposto"}. Medicamento consumido de ${activity.medicineSource}.`;
  addLog(game, "tratamento", message, person.id);
  return { ok: true, message };
});
