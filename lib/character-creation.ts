import { content, initialSurvivor, traits, type Survivor } from "./game";

// The browser sends a draft; only approved level-one choices are accepted here.
export function createSurvivorFromDraft(value: unknown): Survivor | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Partial<Survivor>;
  const name = typeof draft.name === "string" ? draft.name.trim() : "";
  const past = typeof draft.past === "string" ? draft.past.trim() : "";
  const freeExperience = typeof draft.freeExperience === "string" ? draft.freeExperience.trim() : "";
  if (!name || name.length > 80 || past.length > 400 || !freeExperience || freeExperience.length > 120) return null;
  const origin = content.origins.find(o => o.name === draft.origin);
  const archetype = content.archetypes.find(a => a.name === draft.archetype);
  const specialty = archetype?.specialties.find(s => s.name === draft.specialty);
  const primary = content.primaries.find(p => p.name === draft.primary);
  if (!origin || !archetype || !specialty || !primary || !content.protections.some(p => p.name === draft.protection)
    || !content.personal.some(p => p.name === draft.personal)) return null;
  const secondary = draft.secondary || "";
  if (secondary && (primary.hands !== "Uma" || !content.secondaries.some(s => s.name === secondary))) return null;
  const attributes = draft.attributes;
  if (!attributes || Object.keys(attributes).length !== traits.length
    || traits.some(trait => !Number.isInteger(attributes[trait]))
    || traits.map(trait => attributes[trait]).sort((a, b) => a - b).join(",") !== "-1,0,0,1,1,2") return null;
  if (!Array.isArray(draft.techniques) || draft.techniques.length !== 2
    || new Set(draft.techniques).size !== 2
    || draft.techniques.some(name => !content.techniques.some(t => t.name === name && archetype.tracks.includes(t.track)))) return null;
  return initialSurvivor({ name, origin: origin.name, past, archetype: archetype.name,
    specialty: specialty.name, attributes, freeExperience, techniques: draft.techniques,
    primary: primary.name, secondary, protection: draft.protection!, personal: draft.personal! });
}
