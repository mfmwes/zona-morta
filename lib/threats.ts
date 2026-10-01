import content from "./content.json";
import { createId } from "./id";

export type ThreatFeatureKind = "Passiva" | "Ação" | "Reação" | "Outro";

export type ThreatFeature = {
  id: string;
  name: string;
  kind: ThreatFeatureKind;
  effect: string;
};

export type ThreatAttack = {
  name: string;
  bonus: number;
  range: string;
  damage: string;
  damageType: string;
};

export type ThreatTemplate = {
  id: string;
  name: string;
  tier: number;
  role: string;
  description: string;
  motivations: string;
  difficulty: number;
  majorThreshold: number | null;
  severeThreshold: number | null;
  maxHp: number | null;
  maxStress: number | null;
  attack: ThreatAttack | null;
  features: ThreatFeature[];
  tags: string[];
  source: "base" | "custom";
};

export type ThreatInstance = {
  id: string;
  templateId: string;
  name: string;
  hpMarked: number;
  stressMarked: number;
  conditions: string[];
  notes: string;
  defeated: boolean;
};

type LegacyAdversary = {
  name: string;
  intro: string;
  stats: string;
  attack?: string;
  features: string[];
};

function slug(value: string) {
  return value.toLocaleLowerCase("pt-BR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function numberOrNull(value: string | undefined) {
  if (!value || value === "—") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : null;
}

function parseIntro(intro: string) {
  const tierMatch = intro.match(/Patamar\s+(\d+)\s+([^\.]+)\./i);
  const motivationMarker = intro.match(/Motivações e Táticas:\s*(.+)$/i);
  const description = intro
    .replace(/Patamar\s+\d+\s+[^\.]+\.\s*/i, "")
    .replace(/\s*Motivações e Táticas:\s*.+$/i, "")
    .trim();
  return {
    tier: tierMatch ? Math.max(1, Math.trunc(Number(tierMatch[1]))) : 1,
    role: tierMatch?.[2]?.trim() || "Padrão",
    description,
    motivations: motivationMarker?.[1]?.trim() || "",
  };
}

function parseStats(stats: string) {
  const difficulty = Number(stats.match(/^\s*(\d+)/)?.[1] ?? 10);
  const thresholds = stats.match(/Limiares\s+([^|]+)/i)?.[1]?.trim() ?? "—";
  const [majorRaw, severeRaw] = thresholds.split("/").map(value => value.trim());
  const hp = stats.match(/PV\s+([^|]+)/i)?.[1]?.trim();
  const stress = stats.match(/Estresse\s+([^|]+)/i)?.[1]?.trim();
  return {
    difficulty: Number.isFinite(difficulty) ? difficulty : 10,
    majorThreshold: numberOrNull(majorRaw),
    severeThreshold: numberOrNull(severeRaw),
    maxHp: numberOrNull(hp),
    maxStress: numberOrNull(stress),
  };
}

function parseAttack(attack?: string): ThreatAttack | null {
  if (!attack) return null;
  const parts = attack.split("|").map(part => part.trim());
  if (parts.length < 4) return null;
  const bonusMatch = parts[0].match(/[+-]?\d+/);
  const damageMatch = parts[3].match(/^(.+?)\s+(físico|mágico|mental)$/i);
  return {
    bonus: bonusMatch ? Number(bonusMatch[0]) : 0,
    name: parts[1] || "Ataque",
    range: parts[2] || "Corpo a corpo",
    damage: damageMatch?.[1]?.trim() || parts[3] || "sem dano",
    damageType: damageMatch?.[2]?.toLocaleLowerCase("pt-BR") || (/sem dano/i.test(parts[3]) ? "sem dano" : "físico"),
  };
}

function parseFeature(text: string, index: number): ThreatFeature {
  const [head, ...effectParts] = text.split(/\s+—\s+/);
  const kindMatch = head.match(/\b(Passiva|Ação|Reação)\b/i);
  const name = head.replace(/\s*\((?:[^)]*)\)\s*$/, "").trim();
  const effect = effectParts.join(" — ").replace(/^\s*(?:Passiva|Ação|Reação):\s*/i, "").trim();
  const kind = kindMatch
    ? ({ passiva: "Passiva", "ação": "Ação", "reação": "Reação" } as Record<string, ThreatFeatureKind>)[kindMatch[1].toLocaleLowerCase("pt-BR")] ?? "Outro"
    : (/^Passiva:/i.test(effectParts[0] ?? "") ? "Passiva" : /^Ação:/i.test(effectParts[0] ?? "") ? "Ação" : /^Reação:/i.test(effectParts[0] ?? "") ? "Reação" : "Outro");
  return {
    id: `feature-${index + 1}-${slug(name || "caracteristica")}`,
    name: name || `Característica ${index + 1}`,
    kind,
    effect: effect || text,
  };
}

function fromLegacy(adversary: LegacyAdversary): ThreatTemplate {
  const intro = parseIntro(adversary.intro);
  return {
    id: `base:${slug(adversary.name)}`,
    name: adversary.name,
    tier: intro.tier,
    role: intro.role,
    description: intro.description,
    motivations: intro.motivations,
    ...parseStats(adversary.stats),
    attack: parseAttack(adversary.attack),
    features: adversary.features.map(parseFeature),
    tags: [/infectado/i.test(adversary.name + " " + adversary.intro) ? "Infectado" : "", /ambiente/i.test(adversary.name + " " + adversary.intro) ? "Ambiente" : ""].filter(Boolean),
    source: "base",
  };
}

const baseTemplates = (content.adversaries as LegacyAdversary[]).map(fromLegacy);

export function defaultThreatTemplates() {
  return structuredClone(baseTemplates);
}

export function threatLibrary(value?: ThreatTemplate[]) {
  return value === undefined ? defaultThreatTemplates() : value;
}

export function baseThreatTemplate(id: string) {
  const found = baseTemplates.find(template => template.id === id);
  return found ? structuredClone(found) : null;
}

export function createThreatTemplate(): ThreatTemplate {
  return {
    id: createId(),
    name: "Nova ameaça",
    tier: 1,
    role: "Padrão",
    description: "",
    motivations: "",
    difficulty: 10,
    majorThreshold: null,
    severeThreshold: null,
    maxHp: 3,
    maxStress: 2,
    attack: {
      name: "Ataque",
      bonus: 0,
      range: "Corpo a corpo",
      damage: "1d6+1",
      damageType: "físico",
    },
    features: [],
    tags: [],
    source: "custom",
  };
}

export function duplicateThreatTemplate(template: ThreatTemplate): ThreatTemplate {
  return {
    ...structuredClone(template),
    id: createId(),
    name: `${template.name} (cópia)`,
    source: "custom",
    features: template.features.map(feature => ({ ...feature, id: createId() })),
  };
}

export function instantiateThreat(template: ThreatTemplate, name?: string): ThreatInstance {
  return {
    id: createId(),
    templateId: template.id,
    name: name?.trim() || template.name,
    hpMarked: 0,
    stressMarked: 0,
    conditions: [],
    notes: "",
    defeated: false,
  };
}

export function sanitizeThreatTemplate(template: ThreatTemplate): ThreatTemplate {
  const maxHp = template.maxHp === null ? null : Math.max(1, Math.min(99, Math.trunc(template.maxHp)));
  const maxStress = template.maxStress === null ? null : Math.max(0, Math.min(99, Math.trunc(template.maxStress)));
  const major = template.majorThreshold === null ? null : Math.max(1, Math.min(999, Math.trunc(template.majorThreshold)));
  const severe = template.severeThreshold === null ? null : Math.max(1, Math.min(999, Math.trunc(template.severeThreshold)));
  return {
    ...template,
    name: template.name.trim().slice(0, 100) || "Ameaça sem nome",
    tier: Math.max(1, Math.min(4, Math.trunc(template.tier || 1))),
    role: template.role.trim().slice(0, 60) || "Padrão",
    description: template.description.trim().slice(0, 2000),
    motivations: template.motivations.trim().slice(0, 1200),
    difficulty: Math.max(1, Math.min(99, Math.trunc(template.difficulty || 1))),
    majorThreshold: major,
    severeThreshold: severe !== null && major !== null && severe < major ? major : severe,
    maxHp,
    maxStress,
    attack: template.attack ? {
      name: template.attack.name.trim().slice(0, 100) || "Ataque",
      bonus: Math.max(-20, Math.min(20, Math.trunc(template.attack.bonus || 0))),
      range: template.attack.range.trim().slice(0, 80) || "Corpo a corpo",
      damage: template.attack.damage.trim().slice(0, 80) || "sem dano",
      damageType: template.attack.damageType.trim().slice(0, 40) || "físico",
    } : null,
    features: template.features.slice(0, 20).map((feature, index) => ({
      id: feature.id || createId(),
      name: feature.name.trim().slice(0, 100) || `Característica ${index + 1}`,
      kind: ["Passiva", "Ação", "Reação", "Outro"].includes(feature.kind) ? feature.kind : "Outro",
      effect: feature.effect.trim().slice(0, 2000),
    })),
    tags: [...new Set(template.tags.map(tag => tag.trim()).filter(Boolean))].slice(0, 12).map(tag => tag.slice(0, 40)),
    source: template.source === "base" ? "base" : "custom",
  };
}
