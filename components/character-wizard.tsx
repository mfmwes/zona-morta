"use client";

import { useMemo, useRef, useState } from "react";
import { Check, UserPlus } from "lucide-react";
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

/** Valores a distribuir entre os seis atributos: +2, +1, +1, 0, 0 e −1. */
const attributePool: [number, number][] = [[2, 1], [1, 2], [0, 2], [-1, 1]];
const signed = (value: number) => value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : "0";
const stepTitles = ["Identidade", "Atuação agora", "Duas técnicas", "Kit inicial"] as const;

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
  const [step, setStep] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  const originData = content.origins.find(o => o.name === origin);
  const archetypeData = content.archetypes.find(a => a.name === archetype);
  const primaryData = content.primaries.find(a => a.name === primary);
  const availableTechniques = useMemo(() => content.techniques.filter(t => archetypeData?.tracks.includes(t.track)), [archetypeData]);
  const distribution = Object.values(attributes).sort((a, b) => a-b).join(",") === "-1,0,0,1,1,2";
  // Cada etapa sabe se está completa; o salvamento continua exigindo todas.
  const stepDone = [
    Boolean(name.trim() && origin),
    Boolean(archetype && specialty && distribution && freeExperience.trim()),
    techniques.length === 2,
    Boolean(primary && protection && personal),
  ];
  const complete = stepDone.every(Boolean);
  const missingHint = [
    "Informe o nome e a origem.",
    !archetype || !specialty ? "Escolha arquétipo e especialização." : !distribution ? "Distribua os atributos." : "Escreva a segunda Experiência.",
    `Escolha ${2 - techniques.length} técnica(s).`,
    "Escolha arma primária, proteção e item pessoal.",
  ][step];
  const usedCount = (value: number) => Object.values(attributes).filter(current => current === value).length;
  function goTo(next: number) {
    setStep(Math.max(0, Math.min(stepTitles.length - 1, next)));
    bodyRef.current?.scrollTo({ top: 0 });
  }

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

  return <Dialog open={open} onOpenChange={value => { if (!saving) { setOpen(value); if (value) setStep(0); } }}>
    <DialogTrigger asChild><Button><UserPlus /> Criar sobrevivente</Button></DialogTrigger>
    <DialogContent className="character-wizard-dialog sm:max-w-[820px]" onInteractOutside={event => { if (saving) event.preventDefault(); }}>
      <DialogHeader>
        <p className="dossier-title">Dossiê de sobrevivente / nível 1</p>
        <DialogTitle>Quem você era. Quem se tornou.</DialogTitle>
        <DialogDescription>Origem e arquétipo são escolhas independentes. Siga as quatro etapas e revise o kit antes de salvar.</DialogDescription>
      </DialogHeader>
      <ol className="wizard-steps" aria-label="Etapas da criação">
        {stepTitles.map((title, index) => <li key={title}>
          <button type="button" className={`wizard-step${index === step ? " is-current" : ""}${stepDone[index] ? " is-done" : ""}`}
            aria-current={index === step ? "step" : undefined} onClick={() => goTo(index)}>
            <span className="wizard-step-number" aria-hidden="true">{stepDone[index] ? <Check size={14} /> : index + 1}</span>
            <span className="wizard-step-title">{title}<span className="sr-only">{stepDone[index] ? " · completa" : " · pendente"}</span></span>
          </button>
        </li>)}
      </ol>
      <div className="wizard-body" ref={bodyRef}>
        {step === 0 && <section className="grid gap-3">
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
        </section>}
        {step === 1 && <section className="grid gap-3">
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
          <fieldset className="wizard-attributes">
            <legend className="field-label">Atributos · toque no valor de cada um</legend>
            <div className="wizard-attribute-pool" role="status" aria-live="polite">
              {attributePool.map(([value, total]) => { const used = usedCount(value); return <span key={value} className={used === total ? "is-ok" : used > total ? "is-over" : ""}>
                <b>{signed(value)}</b> {used}/{total}</span>; })}
              <em className={distribution ? "is-ok" : ""}>{distribution ? "Distribuição correta" : "Use exatamente +2, +1, +1, 0, 0 e −1"}</em>
            </div>
            {traits.map(trait => <div key={trait} className="wizard-attribute-row" role="radiogroup" aria-label={traitLabel(trait)}>
              <span className="wizard-attribute-name">{traitLabel(trait)}</span>
              <div className="wizard-attribute-values">{[-1, 0, 1, 2].map(value => <button key={value} type="button" role="radio" aria-checked={attributes[trait] === value}
                className={attributes[trait] === value ? "is-selected" : undefined} onClick={() => setAttributes({ ...attributes, [trait]: value })}>{signed(value)}</button>)}</div>
            </div>)}
          </fieldset>
          <Field label="Segunda Experiência +2 (custa 1 Esperança ao usar)" value={freeExperience} onChange={setFreeExperience}
            placeholder="Ex.: Conheço os becos do centro" />
        </section>}
        {step === 2 && <section className="grid gap-3">
          <h3 className="section-title">03 / Duas técnicas</h3>
          {!archetypeData && <p className="text-sm subtle">Escolha um arquétipo na etapa 2 para ver as técnicas disponíveis.</p>}
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
        </section>}
        {step === 3 && <section className="grid gap-3">
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
        </section>}
      </div>
      {error && <p role="alert" className="inventory-danger">{error}</p>}
      <DialogFooter className="wizard-footer">
        <p className="wizard-footer-hint" role="status">{stepDone[step] ? (step === stepTitles.length - 1 && !complete ? `Falta concluir: ${stepTitles.filter((_, index) => !stepDone[index]).join(", ")}.` : "Etapa completa.") : missingHint}</p>
        <Button variant="outline" disabled={saving} onClick={() => step === 0 ? setOpen(false) : goTo(step - 1)}>{step === 0 ? "Cancelar" : "Voltar"}</Button>
        {step < stepTitles.length - 1
          ? <Button onClick={() => goTo(step + 1)}>Próximo · {stepTitles[step + 1]}</Button>
          : <Button disabled={!complete || saving} onClick={() => void create()}>{saving ? "Salvando..." : "Salvar dossiê"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
