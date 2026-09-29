import content from "./content.json";

// Starting choices remain deliberately small. Equipment found in play uses the full catalogue.
const entries = (category: string) => content.catalog.filter(item => item.category === category);
type Entry = (typeof content.catalog)[number];
const field = (entry: Entry, name: string) => entry.fields.find(f => f.label === name)?.value ?? "";
const stored = (entry: Entry) => Number(field(entry, "Guarda").match(/^\d+/)?.[0] ?? 1);

export const primaryWeapons = entries("Armas primárias").map(entry => ({
  name: entry.name, trait: field(entry, "Atributo"), range: field(entry, "Alcance"),
  damage: field(entry, "Dano"), hands: field(entry, "Mãos"), noise: field(entry, "Barulho"),
  stored: stored(entry), note: field(entry, "Observação"),
}));
export const secondaryWeapons = entries("Armas secundárias").map(entry => ({
  name: entry.name, trait: field(entry, "Atributo"), range: field(entry, "Alcance"),
  damage: field(entry, "Dano"), stored: stored(entry), effect: field(entry, "Efeito"),
}));
export const protections = entries("Proteções").map(entry => {
  const [major, severe] = field(entry, "Limiar Maior / Severo").split("/").map(Number);
  return { name: entry.name, major, severe, armor: Number(field(entry, "Armadura (espaços)")),
    stored: stored(entry), effect: field(entry, "Efeito") };
});
export const getPrimary = (name: string) => primaryWeapons.find(item => item.name === name);
export const getSecondary = (name: string) => secondaryWeapons.find(item => item.name === name);
export const getProtection = (name: string) => protections.find(item => item.name === name);

export function weaponAmmoType(name: string): string | null {
  const types: Record<string, string> = {
    "Pistola": "Pistola", "Revólver": "Pistola", "Pistola compacta": "Pistola",
    "Espingarda": "Espingarda", "Carabina": "Carabina", "Rifle de caça": "Carabina", "Fuzil de patrulha": "Carabina",
    "Arco simples": "Flechas", "Besta leve": "Virotes", "Arma de pressão": "Chumbinhos",
  };
  return types[name] ?? null;
}

type Kit = { primary: string; secondary: string; protection: string; kitCondition?: Partial<Record<string, string>> };
export function equipmentModifiers(kit: Kit) {
  const effect = getProtection(kit.protection)?.effect ?? "";
  const adjustment = (name: string) => Number(effect.match(new RegExp(`([+−-]\\d+) (?:em )?${name}`))?.[1]?.replace("−", "-") ?? 0);
  const secondaryActive = getPrimary(kit.primary)?.hands !== "Duas";
  const shield = secondaryActive && (kit.secondary === "Tampa resistente" ||
    (kit.secondary === "Escudo improvisado" && (kit.kitCondition?.secondary ?? "Íntegro") === "Íntegro"));
  return {
    evasion: adjustment("Evasion"),
    traits: { Agilidade: adjustment("Agilidade"), Finesse: adjustment("Finesse") } as Record<string, number>,
    armor: shield ? 1 : 0,
    primaryDamage: secondaryActive && kit.secondary === "Faca pequena" && getPrimary(kit.primary)?.range === "Corpo a corpo" ? 1 : 0,
  };
}
