export const survivorConditionKinds = [
  "restrained", "vulnerable", "hidden",
  "cold", "heat", "wet",
  "bleeding", "injury", "fracture",
] as const;

export type SurvivorConditionKind = typeof survivorConditionKinds[number];

export const bodyRegions = [
  "head", "torso", "left-arm", "right-arm", "left-leg", "right-leg",
] as const;

export type BodyRegion = typeof bodyRegions[number];

export const wetExposureSources = [
  "common-rain", "heavy-rain", "heavy-splash", "shallow-water", "immersion", "other",
] as const;

export type WetExposureSource = typeof wetExposureSources[number];

export type SurvivorCondition = {
  id: string;
  kind: SurvivorConditionKind;
  /** Frio e Calor usam intensidade 1–3. */
  level?: 1 | 2 | 3;
  /** Lesões e Fraturas podem apontar uma região corporal. */
  bodyRegion?: BodyRegion;
  /** Lesão agravada não pode ignorar Desvantagem pagando Estresse. */
  aggravated?: boolean;
  /** Fratura imobilizada deixa de causar dano automático ao ser forçada. */
  immobilized?: boolean;
  /** Tratamento é necessário para a recuperação de Lesão. */
  treated?: boolean;
  /** Segmentos de recuperação: Lesão usa 1/2; Fratura usa 4. */
  recovery?: number;
  /** O primeiro agravamento de Frio enquanto Molhado recebe +1 nível adicional. */
  wetColdBoostUsed?: boolean;
  /** Origem estruturada da exposição que causou Molhado. */
  wetExposureSource?: WetExposureSource;
  /** Vantagem preparada por um item para o próximo teste de exposição. */
  exposureAdvantageSource?: string;
  /** Vantagem preparada por um item para a próxima recuperação da condição. */
  recoveryAdvantageSource?: string;
  source?: string;
  appliedDay?: number;
  appliedMinute?: number;
};
