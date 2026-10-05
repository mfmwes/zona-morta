"use client";

import { useState } from "react";
import { Dice5, MapPin, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Counter, Field, Pick } from "@/components/game-controls";
import { addLog, content as gameContent, type GameState, type Point } from "@/lib/game";
import { eventTriggerLabels, generateHexContent, type GeneratedHexContent, type HexGeneratorKind } from "@/lib/hex-generators";
import { createId } from "@/lib/id";

type Edit = (fn: (draft: GameState) => void) => void;
export type { HexGeneratorKind } from "@/lib/hex-generators";
export type HexGeneratorRequest = {
  hexId: string;
  kind: HexGeneratorKind | "manual";
  generated?: GeneratedHexContent;
};

function pointFromResult(text: string) {
  const first = text.indexOf(".");
  return first >= 0
    ? { name: text.slice(0, first).trim(), signal: text.slice(first + 1).trim() }
    : { name: text.trim(), signal: "" };
}

function kindLabel(kind: HexGeneratorKind | "manual") {
  if (kind === "locais") return "Gerar local · B1";
  if (kind === "comercios") return "Gerar comércio · B2";
  if (kind === "eventos") return "Gerar evento · B3";
  return "Adicionar local";
}

function triggerText(type: keyof typeof eventTriggerLabels, value: number) {
  return type === "noise" ? `${eventTriggerLabels.noise} ${value}` : eventTriggerLabels[type];
}

export function HexGeneratorDialog({
  game,
  edit,
  request,
  onOpenChange,
}: {
  game: GameState;
  edit: Edit;
  request: HexGeneratorRequest;
  onOpenChange: (open: boolean) => void;
}) {
  const initial = request.generated;
  const initialPoint = request.kind === "eventos" || request.kind === "manual"
    ? { name: "", signal: "" }
    : pointFromResult(initial?.publicText ?? "");

  const [generated, setGenerated] = useState<GeneratedHexContent | undefined>(initial);
  const [result, setResult] = useState(initial?.publicText ?? "");
  const [pointName, setPointName] = useState(initialPoint.name);
  const [pointSignal, setPointSignal] = useState(initialPoint.signal);
  const [pointAccess, setPointAccess] = useState(initial?.suggestedAccess ?? "");
  const [pointNotes, setPointNotes] = useState(initial?.gmGuidance ?? "");
  const [pointCondition, setPointCondition] = useState(initial?.suggestedCondition ?? "");
  const [pointRisk, setPointRisk] = useState(initial?.suggestedRisk ?? "");
  const [pointLootTable, setPointLootTable] = useState(initial?.suggestedLootTable ?? "");
  const [pointRevealed, setPointRevealed] = useState(true);
  const [manualKind, setManualKind] = useState<"local" | "comércio">("local");
  const [eventTriggerType, setEventTriggerType] = useState<keyof typeof eventTriggerLabels>(initial?.suggestedTriggerType ?? "manual");
  const [eventTriggerValue, setEventTriggerValue] = useState(initial?.suggestedTriggerValue ?? 3);
  const [eventGuidance, setEventGuidance] = useState(initial?.gmGuidance ?? "");
  const [eventRevealed, setEventRevealed] = useState(true);

  const record = game.hexes[request.hexId];
  const sectorName = record?.sector?.name ?? `Hex ${request.hexId}`;
  const isGenerated = request.kind !== "manual";

  function applyGenerated(next: GeneratedHexContent) {
    setGenerated(next);
    setResult(next.publicText);
    if (next.kind === "eventos") {
      setEventTriggerType(next.suggestedTriggerType ?? "manual");
      setEventTriggerValue(next.suggestedTriggerValue ?? 3);
      setEventGuidance(next.gmGuidance);
      return;
    }
    const point = pointFromResult(next.publicText);
    setPointName(point.name);
    setPointSignal(point.signal);
    setPointAccess(next.suggestedAccess ?? "");
    setPointNotes(next.gmGuidance);
    setPointCondition(next.suggestedCondition ?? "");
    setPointRisk(next.suggestedRisk ?? "");
    setPointLootTable(next.suggestedLootTable ?? "");
  }

  function reroll() {
    if (request.kind === "manual") return;
    applyGenerated(generateHexContent(game, request.hexId, request.kind));
  }

  function savePoint() {
    if (!pointName.trim()) return;
    const kind: Point["kind"] = request.kind === "comercios"
      ? "comércio"
      : request.kind === "manual"
        ? manualKind
        : "local";
    const point: Point = {
      id: createId(),
      name: pointName.trim(),
      kind,
      signal: pointSignal.trim(),
      access: pointAccess.trim(),
      notes: pointNotes.trim(),
      revealed: pointRevealed,
      ...(generated && request.kind !== "manual" && request.kind !== "eventos" ? {
        generatorKind: request.kind,
        generatorRoll: generated.roll,
        generatorCategory: generated.categoryLabel,
      } : {}),
      ...(pointCondition.trim() ? { condition: pointCondition.trim() } : {}),
      ...(pointRisk.trim() ? { risk: pointRisk.trim() } : {}),
      ...(pointLootTable ? { lootTable: pointLootTable } : {}),
      searches: [],
    };
    edit(draft => {
      draft.hexes[request.hexId].points.push(point);
      addLog(draft, "descoberta", `${draft.hexes[request.hexId].sector?.name ?? `Hex ${request.hexId}`}: ${point.name} registrado.`);
    });
    toast.success(`${point.name} registrado no hex.`);
    onOpenChange(false);
  }

  function saveEvent() {
    if (!result.trim()) return;
    const trigger = triggerText(eventTriggerType, eventTriggerValue);
    edit(draft => {
      draft.hexes[request.hexId].events.push({
        id: createId(),
        text: result.trim(),
        trigger,
        triggerType: eventTriggerType,
        ...(eventTriggerType === "noise" ? { triggerValue: eventTriggerValue } : {}),
        status: "pending",
        guidance: eventGuidance.trim(),
        revealed: eventRevealed,
        ...(generated ? {
          generatorKind: "eventos",
          generatorRoll: generated.roll,
          generatorCategory: generated.categoryLabel,
        } : {}),
      });
      addLog(draft, "evento", `${draft.hexes[request.hexId].sector?.name ?? `Hex ${request.hexId}`}: evento preparado — ${result.trim()}`);
    });
    toast.success("Evento preparado.", { description: `${sectorName} · ${trigger}` });
    onOpenChange(false);
  }

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="inventory-dialog sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{kindLabel(request.kind)}</DialogTitle>
        <DialogDescription>
          Setor do mapa: {sectorName} · Hex {request.hexId}.
          {request.kind === "eventos" ? " Prepare um acontecimento neste setor." : " Registre um lugar dentro deste setor. Depois, o grupo poderá vasculhar suas áreas internas."}
        </DialogDescription>
      </DialogHeader>

      {isGenerated && generated && <div className="list-card text-sm leading-relaxed" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <span className="tag">{kindLabel(request.kind)} · {String(generated.roll).padStart(2, "0")}</span>
            <span className="tag">{generated.categoryLabel}</span>
          </div>
          <Button size="sm" variant="outline" onClick={reroll}><RotateCcw size={15} /> Rolar novamente</Button>
        </div>
        <p className="mt-3">{generated.publicText}</p>
        <p className="text-xs subtle mt-2"><b>Contexto usado:</b> {generated.contextLabel}</p>
        {generated.gmGuidance && <p className="text-xs subtle mt-2"><b>Orientação reservada:</b> {generated.gmGuidance}</p>}
      </div>}

      {request.kind === "eventos" ? <div className="grid gap-3">
        <Field label="Texto que pode chegar aos jogadores" value={result} onChange={setResult} multiline />
        <div className="grid gap-3 sm:grid-cols-2">
          <Pick
            label="Gatilho"
            value={eventTriggerType}
            options={Object.entries(eventTriggerLabels).map(([value, label]) => ({ value, label }))}
            onChange={value => setEventTriggerType(value as keyof typeof eventTriggerLabels)}
          />
          {eventTriggerType === "noise" && <Counter compact label="Barulho mínimo" value={eventTriggerValue} max={5} onChange={setEventTriggerValue} />}
        </div>
        <Field
          label="Orientação do mestre"
          value={eventGuidance}
          onChange={setEventGuidance}
          multiline
          placeholder="Informação que não deve aparecer para os jogadores."
        />
        <div className="character-rule-note">
          O evento será salvo como <b>Pendente</b>. Quando o gatilho for atendido, o sistema sinaliza “Pronto”; o mestre decide quando ativar.
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={eventRevealed} onCheckedChange={setEventRevealed} />
          Mostrar aos jogadores quando o evento for ativado
        </label>
      </div> : <div className="grid gap-3">
        {request.kind === "manual" && <Pick
          label="Tipo do ponto"
          value={manualKind}
          options={[
            { value: "local", label: "Local" },
            { value: "comércio", label: "Comércio" },
          ]}
          onChange={value => setManualKind(value as "local" | "comércio")}
        />}
        <Field label="Nome do local dentro deste setor" value={pointName} onChange={setPointName} placeholder="Ex.: Oficina do Arnaldo" />
        <Field
          label="Primeiro sinal"
          value={pointSignal}
          onChange={setPointSignal}
          multiline
          placeholder="O que se percebe antes de entrar?"
        />
        <Field
          label="Acesso e impedimento"
          value={pointAccess}
          onChange={setPointAccess}
          placeholder="Porta, rota, ocupação, obstáculo..."
        />
        {request.kind !== "manual" && <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Condição" value={pointCondition} onChange={setPointCondition} placeholder="Estado do lugar" />
          <Field label="Risco sugerido" value={pointRisk} onChange={setPointRisk} placeholder="Risco aparente" />
        </div>}
        {request.kind !== "manual" && <Pick
          label="Tabela de achados para vasculhar o local"
          value={pointLootTable}
          placeholder="Sem sugestão"
          options={gameContent.lootTables.map(table => table.name)}
          onChange={setPointLootTable}
        />}
        <Field
          label="Notas do mestre"
          value={pointNotes}
          onChange={setPointNotes}
          multiline
          placeholder="Estoque e interiores continuam em aberto se você não os fixar."
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={pointRevealed} onCheckedChange={setPointRevealed} />
          Visível na prévia dos jogadores
        </label>
      </div>}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        {request.kind === "eventos"
          ? <Button disabled={!result.trim()} onClick={saveEvent}><Dice5 size={16} /> Preparar evento</Button>
          : <Button disabled={!pointName.trim()} onClick={savePoint}><MapPin size={16} /> Registrar local</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
