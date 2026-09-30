import type { GameState, Survivor } from "./game";
import { weaponAmmoType } from "./equipment";
import { ammoTypeFor } from "./inventory";

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
  const ammoReady = !ammoType || covered || Boolean(survivor && survivor.ammo > 0 && ammoTypeFor(survivor) === ammoType);
  return {
    ammoType,
    covered,
    ammoReady,
    spendsAmmo: Boolean(ammoType && !covered),
    noise: noiseValue(noise),
  };
}

/** Applies the concrete costs of an attack action. One compatible load is spent
 * per ammunition type used by that survivor in the scene; weapon noise is
 * generated on every attack action, whether or not it later hits. */
export function applyAttackResources(game: GameState, survivorId: string, weaponName: string, noise?: string | number) {
  const survivor = game.survivors.find(person => person.id === survivorId);
  if (!survivor) return { ok: false, message: "Sobrevivente não encontrado." };
  const state = attackResourceState(game, survivor, weaponName, noise);
  if (!state.ammoReady) return { ok: false, message: state.ammoType ? `Sem carga de ${state.ammoType} disponível.` : "Recursos do ataque indisponíveis." };

  if (state.ammoType && !state.covered) {
    survivor.ammo -= 1;
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
