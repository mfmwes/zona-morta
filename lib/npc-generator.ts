import type { Infection, NPC, NpcDisposition, NpcStatus } from "./game";

export const encounterContexts = ["Abrigo", "Estrada", "Residencial", "Comercial", "Hospitalar", "Industrial", "Rural", "Outro"] as const;
export const encounterTones = ["Aleatório", "Neutro", "Aliado", "Tenso", "Hostil"] as const;
export type EncounterContext = typeof encounterContexts[number];
export type EncounterTone = typeof encounterTones[number];
export type GeneratedNpc = Omit<NPC, "id" | "foodConsumedDay" | "waterConsumedDay">;

const firstNames = ["Ana", "Beatriz", "Caio", "Camila", "Davi", "Elisa", "Fábio", "Gabriela", "Heitor", "Íris", "Joana", "Kaique", "Lia", "Marcelo", "Nara", "Otávio", "Paula", "Rafael", "Samira", "Tiago", "Valéria", "Yara"];
const surnames = ["Alves", "Barbosa", "Cardoso", "Dias", "Esteves", "Ferreira", "Gomes", "Lima", "Mendes", "Nascimento", "Oliveira", "Pereira", "Queiroz", "Ramos", "Santos", "Teixeira"];
const professionPool = [
  { role: "Enfermeira", skills: ["Medicina"], contexts: ["Hospitalar", "Abrigo"] },
  { role: "Técnico de enfermagem", skills: ["Medicina", "Logística"], contexts: ["Hospitalar", "Abrigo"] },
  { role: "Mecânica", skills: ["Mecânica"], contexts: ["Industrial", "Estrada", "Comercial"] },
  { role: "Eletricista", skills: ["Eletricidade"], contexts: ["Industrial", "Comercial", "Abrigo"] },
  { role: "Agricultor", skills: ["Cultivo"], contexts: ["Rural", "Residencial"] },
  { role: "Cozinheira", skills: ["Cozinha"], contexts: ["Abrigo", "Comercial", "Residencial"] },
  { role: "Vigia", skills: ["Vigilância"], contexts: ["Estrada", "Comercial", "Abrigo"] },
  { role: "Radioamador", skills: ["Comunicação"], contexts: ["Estrada", "Abrigo", "Residencial"] },
  { role: "Motorista", skills: ["Logística", "Mecânica"], contexts: ["Estrada", "Industrial"] },
  { role: "Pedreira", skills: ["Construção"], contexts: ["Industrial", "Residencial", "Abrigo"] },
  { role: "Almoxarife", skills: ["Logística"], contexts: ["Comercial", "Industrial", "Abrigo"] },
];
const needs = ["precisa de água para seguir", "procura remédios básicos", "quer um lugar seguro para dormir", "pede notícias de alguém da família", "precisa reparar uma ferramenta", "busca uma rota sem infectados"];
const concerns = ["não confia em ruídos vindos da rua", "teme voltar ao local de onde saiu", "quer confirmar uma informação antes de se comprometer", "está tentando proteger outra pessoa", "não quer deixar seus pertences para trás"];
const offers = ["conhece uma entrada lateral", "traz uma informação sobre o setor", "pode ajudar com uma tarefa prática", "tem um contato que pode responder no rádio", "sabe onde procurar materiais"];
const secrets = ["esconde um acordo feito antes do colapso", "não contou toda a razão de estar neste setor", "reconhece um nome mencionado pelos sobreviventes", "guardou uma pista que pode mudar a negociação", "está avaliando se o abrigo merece confiança"];

function pick<T>(items: T[], random: () => number) { return items[Math.min(items.length - 1, Math.floor(random() * items.length))]; }
function weighted<T>(items: { value: T; weight: number }[], random: () => number) {
  const max = items.reduce((sum, item) => sum + item.weight, 0);
  let cursor = random() * max;
  for (const item of items) { cursor -= item.weight; if (cursor <= 0) return item.value; }
  return items[items.length - 1].value;
}
function disposition(tone: EncounterTone, random: () => number): NpcDisposition {
  if (tone === "Aliado") return weighted([{ value: "Aliado" as const, weight: 4 }, { value: "Leal" as const, weight: 1 }, { value: "Neutro" as const, weight: 1 }], random);
  if (tone === "Hostil") return weighted([{ value: "Hostil" as const, weight: 4 }, { value: "Desconfiado" as const, weight: 2 }], random);
  if (tone === "Tenso") return weighted([{ value: "Desconfiado" as const, weight: 4 }, { value: "Neutro" as const, weight: 2 }, { value: "Hostil" as const, weight: 1 }], random);
  if (tone === "Neutro") return weighted([{ value: "Neutro" as const, weight: 5 }, { value: "Desconfiado" as const, weight: 2 }, { value: "Aliado" as const, weight: 1 }], random);
  return weighted([{ value: "Neutro" as const, weight: 4 }, { value: "Desconfiado" as const, weight: 2 }, { value: "Aliado" as const, weight: 2 }, { value: "Hostil" as const, weight: 1 }], random);
}

export function generateNpcDrafts(options: { quantity: number; context: EncounterContext; tone: EncounterTone; hex: string; home?: string }, random = Math.random): GeneratedNpc[] {
  const quantity = Math.max(1, Math.min(6, Math.trunc(options.quantity)));
  const drafts: GeneratedNpc[] = [];
  for (let index = 0; index < quantity; index++) {
    const matching = professionPool.filter(entry => entry.contexts.includes(options.context));
    const profession = pick(matching.length ? matching : professionPool, random);
    const extra = pick(["Logística", "Comunicação", "Vigilância", "Construção", "Cozinha"], random);
    const skills = [...new Set(random() > .48 ? profession.skills : [...profession.skills, extra])].slice(0, 3);
    const status = weighted<NpcStatus>([{ value: "Bem", weight: 82 }, { value: "Ferido", weight: 14 }, { value: "Grave", weight: 3 }, { value: "Desaparecido", weight: 1 }], random);
    const infection = weighted<Infection>([{ value: "Saudável", weight: 78 }, { value: "Exposto", weight: 12 }, { value: "Infectado", weight: 7 }, { value: "Sintomático", weight: 3 }], random);
    const name = `${pick(firstNames, random)} ${pick(surnames, random)}`;
    const immediateNeed = pick(needs, random);
    const concern = pick(concerns, random);
    const offer = pick(offers, random);
    const secret = pick(secrets, random);
    drafts.push({
      name, visibleToPlayers: false, role: profession.role, description: `${profession.role} encontrado(a) em contexto ${options.context.toLowerCase()}; mantém os olhos atentos ao entorno.`,
      notes: `Segredo gerado: ${secret}.`, publicNotes: `${immediateNeed.charAt(0).toUpperCase()}${immediateNeed.slice(1)}. ${offer.charAt(0).toUpperCase()}${offer.slice(1)}.`,
      hex: options.hex, home: options.context === "Abrigo" ? options.home : undefined,
      status, infection, disposition: disposition(options.tone, random), skills, duty: "", active: status !== "Desaparecido",
      immediateNeed, concern, offer, accompaniesParty: false, accompaniesSurvivorIds: [],
    });
  }
  return drafts;
}
