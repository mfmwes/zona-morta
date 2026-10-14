import { survivorHex, type GameState, type Survivor } from "./game";
import type { SurvivorConditionKind } from "./survivor-condition-types";

export type ConditionItemInteraction = "resist" | "recover" | "stabilize" | "treat" | "immobilize";

export type ConditionItemEffect = {
  id: string;
  item: string;
  condition: Extract<SurvivorConditionKind, "cold" | "heat" | "bleeding" | "injury" | "fracture">;
  interaction: ConditionItemInteraction;
  label: string;
  summary: string;
  action?: "cold-recovery-aid" | "cold-reduce" | "heat-exposure-aid" | "bleeding-stabilize" | "injury-treat" | "fracture-immobilize";
  consumable?: boolean;
  requires?: string;
  passiveWhenEquipped?: "protection" | "outfit";
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
    summary: "Em abrigo plausível, prepara Vantagem para a próxima recuperação de Frio durante descanso.",
    action: "cold-recovery-aid",
    requires: "Abrigo plausível e uso durante descanso.",
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
