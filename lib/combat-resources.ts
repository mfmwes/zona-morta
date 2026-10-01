import { ammunitionCount, ammunitionItemType, addLog, type GameState, type Survivor } from "./game";
import { weaponAmmoType } from "./equipment";

function noiseValue(value: string | number | undefined) {
  if (typeof value === "number") return Math.max(0, Math.trunc(value));
  return Math.max(0, Math.trunc(Number(String(value ?? "0").replace("+", "")) || 0));
}

function coveredTypes(game: GameState, survivor: Survivor) {
  if (survivor.ammoSpentScene !== (game.scene ?? 1)) return [] as string[];
  return survivor.ammoSpentTypes?.length
    ? survivor.ammoSpentTypes
    : survivor.ammoSpentType ? [survivor.ammoSpentType] : [];
}

export function attackResourceState(game: GameState, survivor: Survivor | undefined, weaponName: string | undefined, noise?: string | number) {
  const ammoType = weaponName ? weaponAmmoType(weaponName) : null;
  const covered = Boolean(ammoType && survivor && coveredTypes(game, survivor).includes(ammoType));
  const ammoReady = !ammoType || covered || Boolean(survivor && ammunitionCount(survivor.inventory, ammoType, true) > 0);
  return {
    ammoType,
    covered,
    ammoReady,
    spendsAmmo: Boolean(ammoType && !covered),
    noise: noiseValue(noise),
  };
}

/** Applies the concrete costs of an attack action. The first shot with each
 * ammunition type commits one physical inventory unit for the current scene.
 * The committed unit stays visible but locked until beginScene settles it. */
export function applyAttackResources(game: GameState, survivorId: string, weaponName: string, noise?: string | number) {
  const survivor = game.survivors.find(person => person.id === survivorId);
  if (!survivor) return { ok: false, message: "Sobrevivente não encontrado." };
  const state = attackResourceState(game, survivor, weaponName, noise);
  if (!state.ammoReady) return { ok: false, message: state.ammoType ? `Sem carga de ${state.ammoType} disponível.` : "Recursos do ataque indisponíveis." };

  if (state.ammoType && !state.covered) {
    const stack = survivor.inventory.find(item => ammunitionItemType(item) === state.ammoType
      && item.qty - Math.max(0, item.committedAmmo ?? 0) > 0);
    if (!stack) return { ok: false, message: `Sem unidade livre de Munição de ${state.ammoType}.` };
    stack.committedAmmo = Math.max(0, stack.committedAmmo ?? 0) + 1;
    const scene = game.scene ?? 1;
    const prior = survivor.ammoSpentScene === scene
      ? (survivor.ammoSpentTypes?.length ? survivor.ammoSpentTypes : survivor.ammoSpentType ? [survivor.ammoSpentType] : [])
      : [];
    survivor.ammoSpentScene = scene;
    survivor.ammoSpentTypes = [...new Set([...prior, state.ammoType])];
    survivor.ammoSpentType = state.ammoType;
  }
  if (state.noise > 0) game.noise = Math.min(5, game.noise + state.noise);
  return { ok: true, ...state };
}


export function settleSceneAmmunition(game: GameState) {
  const consumed: { survivorId: string; survivorName: string; types: string[]; units: number }[] = [];
  for (const survivor of game.survivors) {
    const types: string[] = [];
    let units = 0;
    for (const item of [...survivor.inventory]) {
      const type = ammunitionItemType(item);
      const committed = Math.max(0, Math.min(item.qty, Math.trunc(item.committedAmmo ?? 0)));
      if (!type || committed < 1) {
        delete item.committedAmmo;
        continue;
      }
      item.qty -= committed;
      units += committed;
      types.push(type);
      delete item.committedAmmo;
      if (item.qty <= 0) survivor.inventory.splice(survivor.inventory.indexOf(item), 1);
    }
    delete survivor.ammoSpentScene;
    delete survivor.ammoSpentType;
    delete survivor.ammoSpentTypes;
    if (units > 0) consumed.push({ survivorId: survivor.id, survivorName: survivor.name, types: [...new Set(types)], units });
  }
  for (const row of consumed) {
    addLog(game, "inventário", `${row.survivorName}: ${row.units} unidade(s) de munição comprometida(s) foram consumidas ao encerrar a cena (${row.types.join(", ")}).`, row.survivorId);
  }
  return consumed;
}
