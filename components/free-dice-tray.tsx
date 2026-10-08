"use client";
import { useState } from "react";
import { Dice5 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { freeDiceFaces, parseFreeDiceFormula } from "@/lib/free-dice";
export function FreeDiceTray({disabled,onRoll}:{disabled:boolean;onRoll:(formula:string)=>boolean}) {
  const [formula,setFormula]=useState("");const [error,setError]=useState("");
  function add(faces:number){try{const parsed=formula.trim()?parseFreeDiceFormula(formula.replace(/−/g,"-")):null;const next=parsed?`${parsed.formula.replace(/−/g,"-")} + 1d${faces}`:`1d${faces}`;setFormula(parseFreeDiceFormula(next).formula);setError("");}catch(e){setError(e instanceof Error?e.message:"Confira a fórmula.");}}
  function submit(){if(disabled)return;if(onRoll(formula)){setError("");}else setError("Confira a fórmula: até 20 dados e modificador de −999 a +999.");}
  return <details className="table-chat-free-dice" open><summary><Dice5 size={15}/> Dados livres</summary>
    <div className="table-chat-dice-buttons" role="group" aria-label="Adicionar dados à rolagem">{freeDiceFaces.map(f=><button key={f} type="button" disabled={disabled} onClick={()=>add(f)} aria-label={`Adicionar d${f}`} title={`Adicionar um d${f}`}>d{f}</button>)}</div>
    <form onSubmit={e=>{e.preventDefault();submit();}}><label className="sr-only" htmlFor="chat-dice-formula">Fórmula dos dados</label><input id="chat-dice-formula" value={formula} maxLength={120} disabled={disabled} onChange={e=>{setFormula(e.target.value);setError("");}} placeholder="2d6 + 1d8 + 3"/><Button size="sm" type="submit" disabled={disabled||!formula.trim()}>Rolar</Button><button type="button" disabled={disabled||!formula} onClick={()=>{setFormula("");setError("");}}>Limpar</button></form>
    {error&&<p role="alert">{error}</p>}
  </details>;
}
