import { survivorHex, type GameState, type Survivor } from "./game";
import type { BodyRegion, SurvivorConditionKind, WetExposureSource } from "./survivor-condition-types";

export type ConditionItemInteraction = "resist" | "recover" | "prevent" | "dry" | "stabilize" | "treat" | "immobilize";

export type ConditionItemEffect = {
  id: string;
  item: string;
  condition: Extract<SurvivorConditionKind, "cold" | "heat" | "wet" | "bleeding" | "injury" | "fracture">;
  interaction: ConditionItemInteraction;
  label: string;
  summary: string;
  action?: "cold-reduce" | "heat-exposure-aid" | "wet-dry" | "bleeding-stabilize" | "injury-treat" | "fracture-immobilize";
  consumable?: boolean;
  requires?: string;
  passiveWhenEquipped?: "protection" | "outfit";
  preventsWetSources?: WetExposureSource[];
  bodyRegions?: BodyRegion[];
};

export const conditionItemEffects: ConditionItemEffect[] = [
  {
    id: "padded-coat-cold",
    item: "Casaco acolchoado",
    condition: "cold",
    interaction: "resist",
    label: "Frio · Resistência",
    summary: "Enquanto equipado como Proteção, concede Vantagem em testes de exposição ao Frio.",
    passiveWhenEquipped: "protection",
  },
  {
    id: "thermal-clothes-cold",
    item: "Roupa térmica",
    condition: "cold",
    interaction: "resist",
    label: "Frio · Proteção adequada",
    summary: "Enquanto vestida e seca, concede Vantagem contra Frio e conta como proteção adequada em frio comum.",
    passiveWhenEquipped: "outfit",
  },
  {
    id: "blanket-cold",
    item: "Cobertor",
    condition: "cold",
    interaction: "recover",
    label: "Frio · Recuperação",
    summary: "Em abrigo plausível durante descanso, reduz Frio em 1 nível. Em Frio 3, é insuficiente sozinho.",
    action: "cold-reduce",
    requires: "Abrigo plausível durante descanso. Frio 3 exige uma fonte de calor ou proteção mais adequada.",
  },
  {
    id: "sleeping-bag-cold",
    item: "Saco de dormir",
    condition: "cold",
    interaction: "recover",
    label: "Frio · Reduz 1 nível",
    summary: "Em local protegido e seco, permite reduzir Frio em 1 nível durante descanso.",
    action: "cold-reduce",
    requires: "Local protegido e seco; use durante descanso.",
  },
  {
    id: "stove-cold",
    item: "Fogareiro",
    condition: "cold",
    interaction: "recover",
    label: "Frio · Fonte de calor",
    summary: "Com Combustível e local adequado, fornece calor para reduzir Frio em 1 nível.",
    action: "cold-reduce",
    requires: "1 unidade de Combustível e local ventilado/seguro.",
  },
  {
    id: "rehydration-heat",
    item: "Sachês de reidratação",
    condition: "heat",
    interaction: "resist",
    label: "Calor · Reidratação",
    summary: "Com 1 porção de Água limpa, concede Vantagem no próximo teste de exposição ao Calor.",
    action: "heat-exposure-aid",
    consumable: true,
    requires: "1 porção de Água limpa.",
  },
  {
    id: "isotonic-heat",
    item: "Bebida isotônica lacrada",
    condition: "heat",
    interaction: "resist",
    label: "Calor · Reidratação",
    summary: "Ao consumir uma porção durante Calor, além de hidratar concede Vantagem no próximo teste de exposição ao Calor.",
  },
  {
    id: "waterproof-jacket-wet",
    item: "Jaqueta impermeável grossa",
    condition: "wet",
    interaction: "prevent",
    label: "Molhado · Proteção forte",
    summary: "Enquanto equipada e íntegra, impede Molhado por chuva comum, chuva forte e respingos fortes. Não impede imersão.",
    passiveWhenEquipped: "protection",
    preventsWetSources: ["common-rain", "heavy-rain", "heavy-splash"],
  },
  {
    id: "raincoat-wet",
    item: "Capa de chuva leve",
    condition: "wet",
    interaction: "prevent",
    label: "Molhado · Protege da chuva",
    summary: "Enquanto vestida e íntegra, impede Molhado por chuva comum. Não impede chuva forte, inundação ou imersão.",
    passiveWhenEquipped: "outfit",
    preventsWetSources: ["common-rain"],
  },
  {
    id: "waterproof-boots-wet",
    item: "Botas impermeáveis",
    condition: "wet",
    interaction: "prevent",
    label: "Molhado · Água rasa",
    summary: "Enquanto vestidas, lama ou água rasa apenas nos pés não são suficientes para aplicar Molhado.",
    passiveWhenEquipped: "outfit",
    preventsWetSources: ["shallow-water"],
  },
  {
    id: "dry-clothes-wet",
    item: "Roupa seca sobressalente",
    condition: "wet",
    interaction: "dry",
    label: "Molhado · Secar",
    summary: "Em local seco e protegido, remove Molhado ao trocar de roupa. O conjunto fica Molhado até ser seco novamente.",
    action: "wet-dry",
    requires: "Local seco e protegido.",
  },
  {
    id: "compression-bleeding",
    item: "Curativo compressivo",
    condition: "bleeding",
    interaction: "stabilize",
    label: "Sangramento · Estabiliza",
    summary: "Estabiliza Sangramento e remove a condição. A unidade é consumida.",
    action: "bleeding-stabilize",
    consumable: true,
  },
  {
    id: "gauze-bleeding",
    item: "Gaze e ataduras",
    condition: "bleeding",
    interaction: "stabilize",
    label: "Sangramento · Estabiliza",
    summary: "Material adequado para estabilizar Sangramento. A unidade é consumida.",
    action: "bleeding-stabilize",
    consumable: true,
  },
  {
    id: "treatment-bag-bleeding",
    item: "Bolsa de tratamento lacrada",
    condition: "bleeding",
    interaction: "stabilize",
    label: "Sangramento · Estabiliza",
    summary: "Pode estabilizar Sangramento. A bolsa é consumida.",
    action: "bleeding-stabilize",
    consumable: true,
  },
  {
    id: "clinical-box-bleeding",
    item: "Caixa clínica completa",
    condition: "bleeding",
    interaction: "stabilize",
    label: "Sangramento · Tratamento completo",
    summary: "Estabiliza Sangramento, consome o conteúdo clínico e deixa um Kit médico de campo reutilizável.",
    action: "bleeding-stabilize",
    consumable: true,
  },
  {
    id: "medical-kit-injury",
    item: "Kit médico de campo",
    condition: "injury",
    interaction: "treat",
    label: "Lesão · Tratamento",
    summary: "Ferramenta reutilizável para tratar Lesão quando houver material de cuidado adequado.",
    action: "injury-treat",
    requires: "1 material de cuidado: Gaze e ataduras ou Bolsa de tratamento lacrada.",
  },
  {
    id: "treatment-bag-injury",
    item: "Bolsa de tratamento lacrada",
    condition: "injury",
    interaction: "treat",
    label: "Lesão · Material de tratamento",
    summary: "Pode tratar uma Lesão quando usada como material de cuidado. A bolsa é consumida.",
    action: "injury-treat",
    consumable: true,
  },
  {
    id: "clinical-box-injury",
    item: "Caixa clínica completa",
    condition: "injury",
    interaction: "treat",
    label: "Lesão · Tratamento completo",
    summary: "Trata uma Lesão; gasta o conteúdo clínico e deixa um Kit médico de campo reutilizável.",
    action: "injury-treat",
    consumable: true,
  },
  {
    id: "splint-injury",
    item: "Tala e faixa",
    condition: "injury",
    interaction: "treat",
    label: "Lesão · Imobiliza membro",
    summary: "Trata uma Lesão de braço ou perna por imobilização. A tala fica comprometida no paciente.",
    action: "injury-treat",
    consumable: true,
    bodyRegions: ["left-arm", "right-arm", "left-leg", "right-leg"],
  },
  {
    id: "splint-fracture",
    item: "Tala e faixa",
    condition: "fracture",
    interaction: "immobilize",
    label: "Fratura · Imobiliza",
    summary: "Imobiliza uma Fratura. O conjunto fica comprometido no paciente e sai do inventário.",
    action: "fracture-immobilize",
    consumable: true,
  },
];

export function itemConditionEffects(name: string) {
  return conditionItemEffects.filter(effect => effect.item === name);
}

export function actionableConditionItemEffects(name: string) {
  return itemConditionEffects(name).filter(effect => Boolean(effect.action));
}

export function equippedConditionSupport(person: Survivor | undefined, kind: SurvivorConditionKind) {
  if (!person) return [];
  return conditionItemEffects.filter(effect => effect.condition === kind && effect.passiveWhenEquipped
    && (effect.passiveWhenEquipped === "protection" ? person.protection === effect.item : person.outfit === effect.item));
}

export function conditionInteractionLabel(interaction: ConditionItemInteraction) {
  return ({
    resist: "Resistência",
    recover: "Recuperação",
    prevent: "Prevenção",
    dry: "Secagem",
    stabilize: "Estabilização",
    treat: "Tratamento",
    immobilize: "Imobilização",
  } as const)[interaction];
}


export type ConditionItemUseTarget = {
  id: string;
  effect: ConditionItemEffect;
  survivorId: string;
  survivorName: string;
  conditionId: string;
};

export function conditionItemUseTargets(game: GameState, ownerId: string, itemName: string, selfOnly = false): ConditionItemUseTarget[] {
  const effects = actionableConditionItemEffects(itemName);
  if (!effects.length) return [];
  const owner = game.survivors.find(person => person.id === ownerId);
  const storageHex = game.shelter.hex ?? game.partyHex;
  const candidates = ownerId === "shared"
    ? game.survivors.filter(person => survivorHex(game, person) === storageHex)
    : game.survivors.filter(person => person.id === ownerId
      || (!selfOnly && owner && survivorHex(game, person) === survivorHex(game, owner)));
  const result: ConditionItemUseTarget[] = [];
  for (const effect of effects) {
    for (const person of candidates) {
      for (const condition of person.conditions ?? []) {
        if (condition.kind !== effect.condition) continue;
        if (effect.bodyRegions?.length && (!condition.bodyRegion || !effect.bodyRegions.includes(condition.bodyRegion))) continue;
        if (condition.kind === "injury" && condition.treated) continue;
        if (condition.kind === "fracture" && condition.immobilized) continue;
        result.push({
          id: `${effect.id}::${person.id}::${condition.id}`,
          effect,
          survivorId: person.id,
          survivorName: person.name,
          conditionId: condition.id,
        });
      }
    }
  }
  return result;
}


export const wetExposureSourceLabels: Record<WetExposureSource, string> = {
  "common-rain": "Chuva comum",
  "heavy-rain": "Chuva forte ou tempestade",
  "heavy-splash": "Respingos fortes",
  "shallow-water": "Lama ou água rasa nos pés",
  immersion: "Imersão, inundação ou submersão",
  other: "Outra fonte",
};

export function wetProtectionFor(person: Survivor | undefined, source: WetExposureSource) {
  if (!person) return null;
  return equippedConditionSupport(person, "wet").find(effect => effect.preventsWetSources?.includes(source)) ?? null;
}
