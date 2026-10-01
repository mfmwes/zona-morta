import { localizeRollLog } from "./terminology";

export function rollInfo(text: string) {
  text = localizeRollLog(text);
  const total = text.match(/=\s*(-?\d+)\s*;/)?.[1] ?? "—";
  const hope = text.match(/Esperança\s+(\d+)/i)?.[1] ?? "—";
  const fear = text.match(/Medo\s+(\d+)/i)?.[1] ?? "—";
  const action = text.match(/^[^:]+:\s*([^:]+):/)?.[1]?.trim() ?? "Rolagem";
  const trait = action.match(/\(([^)]+)\)/)?.[1] ?? "";
  const weapon = action.match(/ataque com\s+(.+?)\s*\(/i)?.[1]?.trim();
  const modifierMatch = text.match(/Medo\s+\d+\s*([+−-])\s*(\d+)/i);
  const modifier = modifierMatch ? `${modifierMatch[1] === "+" ? "+" : "−"}${modifierMatch[2]}` : "";
  const edgeMatch = text.match(/([+−])\s*d6\((\d+)\)/i);
  const edge = edgeMatch ? ` ${edgeMatch[1]} d6` : "";
  const outcome = /Sucesso crítico/i.test(text) ? "CRÍTICO"
    : /Falha com Medo/i.test(text) ? "FALHA COM MEDO"
    : /Falha com Esperança/i.test(text) ? "FALHA COM ESPERANÇA"
    : /Sucesso com Medo/i.test(text) ? "SUCESSO COM MEDO"
    : /Sucesso com Esperança/i.test(text) ? "SUCESSO COM ESPERANÇA"
    : /com Medo/i.test(text) ? "COM MEDO"
    : /com Esperança/i.test(text) ? "COM ESPERANÇA"
    : "";
  const title = weapon ? `Ataque · ${weapon}`
    : /reação/i.test(action) ? `Reação${trait ? ` · ${trait}` : ""}`
    : `Teste${trait ? ` · ${trait}` : ""}`;
  const targetMatch = text.match(/Alvo:\s*(.*?)\.\s*Resultado contra o alvo:\s*(ACERTO|FALHA)/i);
  const target = targetMatch?.[1]?.trim() ?? "";
  const targetResult = targetMatch?.[2]?.toUpperCase() === "ACERTO" ? "ACERTO"
    : targetMatch?.[2]?.toUpperCase() === "FALHA" ? "FALHA" : "";
  return { total, hope, fear, modifier, edge, outcome, title, target, targetResult };
}

