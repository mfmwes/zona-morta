"use client";

import { Binoculars, Boxes, CookingPot, Hammer, Radio, Sparkles, Sprout, Stethoscope, Wrench, Zap, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { communityCapabilities, type CommunityCapability } from "@/lib/game";
import { normalizeNpcCapabilities, setNpcCapability } from "@/lib/npc-presentation";

const details: Record<CommunityCapability, { icon: LucideIcon; description: string }> = {
  Medicina: { icon: Stethoscope, description: "Cuidados e tratamentos" },
  Mecânica: { icon: Wrench, description: "Reparos e ferramentas" },
  Construção: { icon: Hammer, description: "Obras e estruturas" },
  Eletricidade: { icon: Zap, description: "Energia e instalações" },
  Cultivo: { icon: Sprout, description: "Plantio e produção" },
  Cozinha: { icon: CookingPot, description: "Preparo de alimentos" },
  Vigilância: { icon: Binoculars, description: "Guarda e observação" },
  Comunicação: { icon: Radio, description: "Rádio e contatos" },
  Logística: { icon: Boxes, description: "Estoques e transporte" },
};

export function NpcCapabilityChips({ skills }: { skills: string[] }) {
  const selected = normalizeNpcCapabilities(skills);
  return <span className="npc-capability-chips" aria-label="Capacidades registradas">{selected.map(skill => {
    const Icon = details[skill as CommunityCapability]?.icon ?? Sparkles;
    return <span key={skill}><Icon size={13} aria-hidden="true" />{skill}</span>;
  })}</span>;
}

export function NpcCapabilities({ skills, onChange }: { skills: string[]; onChange: (value: string[]) => void }) {
  const selected = normalizeNpcCapabilities(skills);
  const [custom] = useState(() => selected.filter(skill => !communityCapabilities.includes(skill as CommunityCapability)));
  function option(skill: string, Icon: LucideIcon, description: string) {
    const checked = selected.includes(skill);
    return <label key={skill} className={`npc-capability-option ${checked ? "is-selected" : ""}`}>
      <input type="checkbox" aria-label={skill} checked={checked} onChange={event => onChange(setNpcCapability(skills, skill, event.target.checked))} />
      <span className="npc-capability-icon"><Icon size={21} aria-hidden="true" /></span>
      <span className="npc-capability-copy"><b>{skill}</b><small>{description}</small></span>
    </label>;
  }
  return <fieldset className="npc-capabilities">
    <legend>Capacidades <span>{selected.length} selecionada(s)</span></legend>
    <p>Marque o que esta pessoa sabe fazer. Você pode escolher mais de uma opção.</p>
    <div className="npc-capabilities-grid">{communityCapabilities.map(skill => option(skill, details[skill].icon, details[skill].description))}</div>
    {custom.length > 0 && <div className="npc-capabilities-legacy"><p>Outras capacidades já registradas</p>
      <div className="npc-capabilities-grid">{custom.map(skill => option(skill, Sparkles, "Capacidade da campanha"))}</div></div>}
  </fieldset>;
}
