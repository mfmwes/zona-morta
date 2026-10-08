import { rollDie } from "./rolls";
export const freeDiceFaces = [4,6,8,10,12,20,100] as const;
export type FreeDiceRoll = { formula: string; dice: { faces: number; values: number[] }[]; modifier: number; total: number };
export function parseFreeDiceFormula(input: string) {
  const text=input.toLowerCase().replace(/\s+/g,"");
  if (!text || text.length>120 || !/^(?:\d{0,2}d\d{1,3}|\d{1,3})(?:[+-](?:\d{0,2}d\d{1,3}|\d{1,3}))*$/.test(text)) throw new Error("Use uma fórmula como 2d6 + 1d8 + 3.");
  const dice: {count:number;faces:number}[]=[];let modifier=0;
  for (const part of text.match(/[+-]?[^+-]+/g)!) {
    if(part.includes("d")) {
      if(part.startsWith("-")) throw new Error("Use apenas dados positivos; o modificador pode ser negativo.");
      const [count,faces]=part.replace(/^\+/,"").split("d");const n=Number(count||1),f=Number(faces);
      if(n<1 || !freeDiceFaces.includes(f as typeof freeDiceFaces[number])) throw new Error("Escolha d4, d6, d8, d10, d12, d20 ou d100.");
      dice.push({count:n,faces:f});
    } else modifier+=Number(part);
  }
  if(!dice.length || dice.reduce((sum,d)=>sum+d.count,0)>20 || Math.abs(modifier)>999) throw new Error("Role de 1 a 20 dados, com modificador entre −999 e +999.");
  const merged=freeDiceFaces.flatMap(faces=>{const count=dice.filter(d=>d.faces===faces).reduce((n,d)=>n+d.count,0);return count?[{count,faces}]:[];});
  const formula=merged.map(d=>`${d.count}d${d.faces}`).join(" + ")+(modifier?` ${modifier>0?"+":"−"} ${Math.abs(modifier)}`:"");
  return {dice:merged,modifier,formula};
}
export function rollFreeDice(formula:string, random:(faces:number)=>number=rollDie):FreeDiceRoll {
  const parsed=parseFreeDiceFormula(formula.replace(/−/g,"-"));
  const dice=parsed.dice.map(d=>({faces:d.faces,values:Array.from({length:d.count},()=>random(d.faces))}));
  if(dice.some(d=>d.values.some(v=>!Number.isInteger(v)||v<1||v>d.faces))) throw new Error("Resultado de dado inválido.");
  return {formula:parsed.formula,dice,modifier:parsed.modifier,total:dice.reduce((sum,d)=>sum+d.values.reduce((n,v)=>n+v,0),parsed.modifier)};
}
export function freeDiceLog(roll:FreeDiceRoll) { return `Rolagem livre: ${JSON.stringify(roll)}`; }
export function readFreeDiceLog(text:string):FreeDiceRoll|null {
  try {
    if(!text.startsWith("Rolagem livre: ")||text.length>600) return null;
    const r=JSON.parse(text.slice(15)) as FreeDiceRoll;
    const p=parseFreeDiceFormula(r.formula.replace(/−/g,"-"));
    if(r.formula!==p.formula||r.modifier!==p.modifier||!Array.isArray(r.dice)||r.dice.length!==p.dice.length) return null;
    if(r.dice.some((d,i)=>d.faces!==p.dice[i].faces||!Array.isArray(d.values)||d.values.length!==p.dice[i].count||d.values.some(v=>!Number.isInteger(v)||v<1||v>d.faces))) return null;
    return r.total===r.dice.reduce((n,d)=>n+d.values.reduce((n,v)=>n+v,0),r.modifier)?r:null;
  } catch { return null; }
}
