/** Display labels are independent from the keys used by saved campaigns. */
export function traitLabel(trait: string): string {
  return trait === "Finesse" ? "Acuidade" : trait;
}

export function traitStorageKey(trait: string): string {
  return trait === "Acuidade" ? "Finesse" : trait;
}

export function dualityLabel(outcome: "Hope" | "Fear"): string {
  return outcome === "Hope" ? "Esperança" : "Medo";
}

/** Normalize rule text when reading older catalog entries and ability descriptions. */
export function localizeRulesText(text: string): string {
  const labels: Record<string, string> = {
    hope: "Esperança", fear: "Medo", stress: "Estresse", hp: "PV", evasion: "Evasão",
    finesse: "Acuidade", experience: "Experiência", experiences: "Experiências",
  };
  return text.replace(/\b(Hope|Fear|Stress|HP|Evasion|Finesse|Experiences?)\b/gi, term => labels[term.toLowerCase()]);
}

/** Historical rolls keep names and player-written Experiences as originally entered. */
export function localizeRollLog(text: string): string {
  const divider = text.indexOf(":");
  const actor = divider < 0 ? "" : text.slice(0, divider);
  const details = divider < 0 ? text : text.slice(divider);
  return actor + details
    .replace(/\(Finesse\)(?=:)/g, "(Acuidade)")
    .replace(/(:\s*)Hope(?=\s+\d+\s*\+)/g, "$1Esperança")
    .replace(/(\+\s*)Fear(?=\s+\d+)/g, "$1Medo")
    .replace(/\b(Total|Sucesso|Falha) com (Hope|Fear)\b/g, (_, result: string, term: "Hope" | "Fear") => `${result} com ${dualityLabel(term)}`)
    .replace(/(·\s*)Experiences:/g, "$1Experiências:")
    .replace(/(−\d+\s+)Hope(?=\))/g, "$1Esperança")
    .replace(/reação sem ganho de Hope\/Fear/g, "reação sem ganho de Esperança/Medo");
}
