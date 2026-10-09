"use client";

import { useRef, useState, type ReactNode } from "react";
import { Backpack, Check, Dice5, Droplets, Heart, Shield, Sparkles, Swords, Utensils, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Survivor } from "@/lib/game";

export type MobileResource = "hp" | "stress" | "hope" | "armorMarked";

type Props = {
  survivor: Survivor;
  day: number;
  hpMax: number;
  armorMax: number;
  down: boolean;
  weapon: { name: string; details: string };
  load: string;
  renderResource: (resource: MobileResource) => ReactNode;
  onAttack: () => void;
  onTest: () => void;
  onSection: (section: string) => void;
  onConsume: (resource: "food" | "water") => void;
  children: ReactNode;
};

export function MobileSurvivorOverview({ survivor, day, hpMax, armorMax, down, weapon, load, renderResource, onAttack, onTest, onSection, onConsume, children }: Props) {
  const [resource, setResource] = useState<MobileResource | null>(null);
  const resourceTrigger = useRef<HTMLButtonElement>(null);
  const resources = [
    { key: "hp" as const, label: "PV marcados", value: survivor.hp, max: hpMax, icon: Heart },
    { key: "stress" as const, label: "Estresse", value: survivor.stress, max: 6, icon: Zap },
    { key: "hope" as const, label: "Esperança", value: survivor.hope, max: 6, icon: Sparkles },
    { key: "armorMarked" as const, label: "Armadura marcada", value: survivor.armorMarked ?? 0, max: armorMax, icon: Shield },
  ];
  return <div className="mobile-survivor-overview">
    <section className="mobile-vitals" aria-label="Recursos do sobrevivente">{resources.map(item => <button type="button" key={item.key} onClick={event => { resourceTrigger.current = event.currentTarget; setResource(item.key); }} aria-label={`Ajustar ${item.label}: ${item.value} de ${item.max}`} aria-haspopup="dialog"><item.icon size={18} aria-hidden="true" /><span>{item.label}</span><strong>{item.value}<small>/{item.max}</small></strong></button>)}</section>
    <Dialog open={resource !== null} onOpenChange={open => { if (!open) setResource(null); }}><DialogContent className="mobile-resource-dialog" onCloseAutoFocus={event => { event.preventDefault(); resourceTrigger.current?.focus(); }}><DialogHeader><DialogTitle>Ajustar {resources.find(item => item.key === resource)?.label}</DialogTitle><DialogDescription>Registre o valor atual. PV e Armadura mostram espaços marcados.</DialogDescription></DialogHeader>{resource && renderResource(resource)}<Button variant="outline" onClick={() => setResource(null)}>Concluir</Button></DialogContent></Dialog>
    <section className="mobile-action-card" aria-label="Ações do sobrevivente"><div><p className="mobile-section-label">Ataque pronto</p><h3>{weapon.name}</h3><p>{weapon.details}</p></div><div className="mobile-action-pair"><Button disabled={down} onClick={onAttack}><Swords size={18} />Atacar</Button><Button variant="outline" onClick={onTest}><Dice5 size={18} />Fazer teste</Button></div><button type="button" className="mobile-text-action" onClick={() => onSection("combate")}>Combate e defesas →</button></section>
    <section className="mobile-daily-card" aria-label={`Alimentação do dia ${day}`}><h3>Hoje · dia {day}</h3><div className="mobile-action-pair">{(["food", "water"] as const).map(key => {
      const consumed = (key === "food" ? survivor.foodConsumedDay : survivor.waterConsumedDay) === day;
      const Icon = consumed ? Check : key === "food" ? Utensils : Droplets;
      return <Button key={key} variant="outline" disabled={consumed || survivor[key] < 1} onClick={() => onConsume(key)}><Icon size={17} />{consumed ? key === "food" ? "Comeu hoje" : "Bebeu hoje" : key === "food" ? "Comer 1 porção" : "Beber 1 porção"}</Button>;
    })}</div><p>{survivor.food} porção(ões) solta(s) de comida · {survivor.water} de água.</p><p>Itens embalados: use Consumir no inventário. Cada necessidade não atendida soma +1 Estresse ao encerrar o dia.</p><button type="button" className="mobile-inventory-link" onClick={() => onSection("inventario")}><Backpack size={18} aria-hidden="true" /><span>Inventário</span><b>Carga {load}</b></button></section>
    {children}
  </div>;
}
