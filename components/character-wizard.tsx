"use client";

import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { EmptyItemArt, ItemArt } from "@/components/item-art";
import { AbilityArt } from "@/components/ability-art";
import { traitLabel } from "@/lib/terminology";
import { content, initialSurvivor, traits, type Survivor } from "@/lib/game";

const defaultAttributes: Record<string, number> = {
  Agilidade: 0, Força: -1, Finesse: 1, Instinto: 1, Presença: 2, Conhecimento: 0,
};

export function CharacterWizard({ onCreate }: { onCreate: (survivor: Survivor) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [past, setPast] = useState("");
  const [archetype, setArchetype] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [attributes, setAttributes] = useState<Record<string, number>>(defaultAttributes);
  const [freeExperience, setFreeExperience] = useState("");
  const [techniques, setTechniques] = useState<string[]>([]);
  const [primary, setPrimary] = useState("");
  const [secondary, setSecondary] = useState("");
  const [protection, setProtection] = useState("");
  const [personal, setPersonal] = useState("");

  const originData = content.origins.find(o => o.name === origin);
  const archetypeData = content.archetypes.find(a => a.name === archetype);
  const primaryData = content.primaries.find(a => a.name === primary);
  const availableTechniques = useMemo(() => content.techniques.filter(t => archetypeData?.tracks.includes(t.track)), [archetypeData]);
  const distribution = Object.values(attributes).sort((a, b) => a-b).join(",") === "-1,0,0,1,1,2";
  const complete = name.trim() && origin && archetype && specialty && distribution
    && freeExperience.trim() && techniques.length === 2 && primary && protection && personal;

  async function create() {
    if (!complete || saving) return;
    setSaving(true); setError("");
    try {
      await onCreate(initialSurvivor({
      name: name.trim(), origin, past: past.trim(), archetype, specialty, attributes,
      freeExperience: freeExperience.trim(), techniques, primary,
      secondary: primaryData?.hands === "Uma" ? secondary : "", protection, personal,
      }));
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar. Tente novamente.");
    } finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={value => { if (!saving) setOpen(value); }}>
    <DialogTrigger asChild><Button><UserPlus /> Criar sobrevivente</Button></DialogTrigger>
    <DialogContent className="character-wizard-dialog max-h-[92vh] overflow-y-auto sm:max-w-[820px]" onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      <DialogHeader>
        <p className="dossier-title">Dossiê de sobrevivente / nível 1</p>
        <DialogTitle>Quem você era. Quem se tornou.</DialogTitle>
        <DialogDescription>Origem e arquétipo são escolhas independentes. Siga as quatro partes e revise o kit antes de salvar.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-6">
        <section className="grid gap-3">
          <h3 className="section-title">01 / Identidade</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" value={name} onChange={setName} placeholder="Como os outros chamam você?" />
            <Pick label="Origem anterior ao surto" value={origin} options={content.origins.map(o => o.name)} onChange={setOrigin} />
          </div>
          {originData && <div className="list-card wizard-ability-preview text-sm leading-relaxed">
            <AbilityArt abilityId={`origin:${origin}`} size="small" />
            <div><b>Experiência:</b> {originData.experience} +2 ao gastar 1 Esperança numa rolagem pertinente<br />
              <b>{originData.feature}:</b> {originData.effect}<br />
              <span className="subtle">{originData.past}</span></div>
          </div>}
          <Field label="Pessoa importante, perda ou promessa" value={past} onChange={setPast} placeholder="Uma resposta pode ligar os três." />
        </section>
        <section className="grid gap-3 border-t pt-5">
          <h3 className="section-title">02 / Atuação agora</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Pick label="Arquétipo" value={archetype} options={content.archetypes.map(a => a.name)}
              onChange={value => { setArchetype(value); setSpecialty(""); setTechniques([]); }} />
            <Pick label="Especialização (Fundamento)" value={specialty} disabled={!archetype}
              options={archetypeData?.specialties.map(s => s.name) ?? []} onChange={setSpecialty} />
          </div>
          {archetypeData && <div className="list-card wizard-ability-preview text-sm leading-relaxed">
            <AbilityArt abilityId={`archetype:${archetype}`} size="small" />
            <div><b>Evasão {archetypeData.evasion} · PV {archetypeData.hp} · Trilhas {archetypeData.tracks.join(" e ")}</b><br />
              <b>{archetypeData.feature}:</b> {archetypeData.effect}<br />
              {specialty && <span className="wizard-specialty"><AbilityArt abilityId={`specialty:${specialty}`} size="tiny" /><span><b>{specialty}:</b> {archetypeData.specialties.find(s => s.name === specialty)?.effect}</span></span>}
              <span className="wizard-specialty"><AbilityArt abilityId={`hope:${archetype}`} size="tiny" /><span><b>Habilidade de Esperança:</b> {archetypeData.hopeFeature.split(":")[0]}</span></span></div>
          </div>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {traits.map(trait => <Pick key={trait} label={traitLabel(trait)} value={String(attributes[trait])}
              options={["-1", "0", "1", "2"]} onChange={value => setAttributes({ ...attributes, [trait]: Number(value) })} />)}
          </div>
          <p className={`text-sm ${distribution ? "text-emerald-700" : "text-red-700"}`}>
            {distribution ? "Distribuição correta: +2, +1, +1, 0, 0, −1." : "Distribua exatamente +2, +1, +1, 0, 0 e −1."}
          </p>
          <Field label="Segunda Experiência +2 (custa 1 Esperança ao usar)" value={freeExperience} onChange={setFreeExperience}
            placeholder="Ex.: Conheço os becos do centro" />
        </section>
        <section className="grid gap-3 border-t pt-5">
          <h3 className="section-title">03 / Duas técnicas</h3>
          <p className="intro-line">Escolha duas das trilhas do arquétipo, inclusive ambas da mesma trilha.</p>
          {availableTechniques.map(technique => <label key={technique.name} className="list-card flex gap-3 cursor-pointer">
            <Checkbox className="mt-1" checked={techniques.includes(technique.name)}
              onCheckedChange={() => setTechniques(current => current.includes(technique.name)
                ? current.filter(name => name !== technique.name)
                : current.length < 2 ? [...current, technique.name] : current)} />
            <AbilityArt abilityId={`technique:${technique.name}`} size="small" />
            <span className="text-sm leading-relaxed"><b>{technique.name}</b> <span className="tag ml-1">{technique.track}</span><br />{technique.effect}</span>
          </label>)}
          <p className="text-sm subtle">{techniques.length}/2 técnicas escolhidas.</p>
        </section>
        <section className="grid gap-3 border-t pt-5">
          <h3 className="section-title">04 / Kit inicial</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Pick label="Arma primária" value={primary} options={content.primaries.map(a => a.name)}
              onChange={value => { setPrimary(value); setSecondary(""); }} />
            <Pick label="Secundária opcional" value={secondary} disabled={primaryData?.hands !== "Uma"}
              options={["Nenhuma", ...content.secondaries.map(a => a.name)]}
              onChange={value => setSecondary(value === "Nenhuma" ? "" : value)} placeholder="Nenhuma" />
            <Pick label="Proteção" value={protection} options={content.protections.map(a => a.name)} onChange={setProtection} />
            <Pick label="Item pessoal" value={personal} options={content.personal.map(a => a.name)} onChange={setPersonal} />
          </div>
          <div className="wizard-kit-preview" aria-label="Prévia ilustrada do kit inicial">
            {([ ["Arma", primary, "Armas primárias"], ["Secundária", primaryData?.hands === "Uma" ? secondary : "", "Armas secundárias"],
              ["Proteção", protection, "Proteções"], ["Item pessoal", personal, "Abrigo, transporte e mochilas"] ] as const).map(([label, name, category]) =>
              <div key={label}>{name ? <ItemArt name={name} category={category} /> : <EmptyItemArt />}<span><small>{label}</small><b>{name || "Vazio"}</b></span></div>)}
          </div>
          {primaryData && <p className="text-sm subtle">{primaryData.trait} · {primaryData.range} · {primaryData.damage} físico · Barulho {primaryData.noise}. {primaryData.hands === "Duas" ? "Exige duas mãos." : "Deixa uma mão para secundária."}</p>}
          <div className="wizard-kit-note rounded-md bg-[#e7f1ed] p-3 text-sm leading-relaxed">
            O kit inclui 1 porção de Comida e 1 de Água. Armas que usam munição começam com 1 unidade física compatível no inventário. Até 4 unidades do mesmo tipo ocupam 1 espaço de carga. A proteção vestida e a arma ativa ocupam 0 carga.
          </div>
        </section>
      </div>
      {error && <p role="alert" className="inventory-danger">{error}</p>}
      <DialogFooter className="border-t pt-4"><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>Voltar</Button>
        <Button disabled={!complete || saving} onClick={() => void create()}>{saving ? "Salvando..." : "Salvar dossiê"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
