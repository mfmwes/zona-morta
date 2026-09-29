import { content } from "./game";

export type AbilityArtSheet = "origins-1" | "origins-2" | "archetypes" | "specialties" | "techniques";
export type AbilityArtRef = { sheet: AbilityArtSheet; cell: number };

const specialties = content.archetypes.flatMap(archetype => archetype.specialties);

export function abilityArtFor(abilityId: string): AbilityArtRef | null {
  const separator = abilityId.indexOf(":");
  if (separator < 0) return null;
  const kind = abilityId.slice(0, separator);
  const name = abilityId.slice(separator + 1);

  if (kind === "origin") {
    const index = content.origins.findIndex(origin => origin.name === name);
    return index < 0 ? null : index < 16
      ? { sheet: "origins-1", cell: index }
      : { sheet: "origins-2", cell: index - 16 };
  }
  if (kind === "archetype" || kind === "hope") {
    const index = content.archetypes.findIndex(archetype => archetype.name === name);
    return index < 0 ? null : { sheet: "archetypes", cell: index + (kind === "hope" ? 8 : 0) };
  }
  if (kind === "specialty") {
    const index = specialties.findIndex(specialty => specialty.name === name);
    return index < 0 ? null : { sheet: "specialties", cell: index };
  }
  if (kind === "technique") {
    const index = content.techniques.findIndex(technique => technique.name === name);
    return index < 0 ? null : index < 16
      ? { sheet: "techniques", cell: index }
      : { sheet: "origins-2", cell: index - 2 };
  }
  return null;
}
