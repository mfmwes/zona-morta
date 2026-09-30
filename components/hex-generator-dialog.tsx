"use client";

import { useState } from "react";
import { Dice5, MapPin, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Field, Pick } from "@/components/game-controls";
import { addLog, content as gameContent, type GameState, type Point } from "@/lib/game";
import { createId } from "@/lib/id";
import { rollDie } from "@/lib/rolls";

type Edit = (fn: (draft: GameState) => void) => void;
export type HexGeneratorKind = "locais" | "comercios" | "eventos";
export type HexGeneratorRequest = {
  hexId: string;
  kind: HexGeneratorKind | "manual";
  roll?: number;
  text?: string;
};

function pointFromResult(text: string) {
  const first = text.indexOf(".");
  return first >= 0
    ? { name: text.slice(0, first).trim(), signal: text.slice(first + 1).trim() }
    : { name: text.trim(), signal: "" };
}

function kindLabel(kind: HexGeneratorKind | "manual") {
  if (kind === "locais") return "B1 · Local";
  if (kind === "comercios") return "B2 · Comércio";
  if (kind === "eventos") return "B3 · Evento";
  return "Ponto manual";
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
  const generatedPoint = request.kind === "eventos" || request.kind === "manual"
    ? { name: "", signal: "" }
    : pointFromResult(request.text ?? "");

  const [roll, setRoll] = useState<number | null>(request.roll ?? null);
  const [result, setResult] = useState(request.text ?? "");
  const [pointName, setPointName] = useState(generatedPoint.name);
  const [pointSignal, setPointSignal] = useState(generatedPoint.signal);
  const [pointAccess, setPointAccess] = useState("");
  const [pointNotes, setPointNotes] = useState("");
  const [pointRevealed, setPointRevealed] = useState(true);
  const [manualKind, setManualKind] = useState<"local" | "comércio">("local");
  const [eventTrigger, setEventTrigger] = useState("");
  const [eventRevealed, setEventRevealed] = useState(true);

  const record = game.hexes[request.hexId];
  const sectorName = record?.sector?.name ?? `Hex ${request.hexId}`;
  const generated = request.kind !== "manual";

  function reroll() {
    if (request.kind === "manual") return;
    const nextRoll = rollDie(100);
    const row = gameContent.generators[request.kind].find(entry => entry.roll === nextRoll);
    if (!row) return;
    setRoll(nextRoll);
    setResult(row.text);
    if (request.kind !== "eventos") {
      const point = pointFromResult(row.text);
      setPointName(point.name);
      setPointSignal(point.signal);
      setPointAccess("");
      setPointNotes("");
    }
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
    if (!result || !eventTrigger.trim()) return;
    edit(draft => {
      draft.hexes[request.hexId].events.push({
        id: createId(),
        text: result,
        trigger: eventTrigger.trim(),
        revealed: eventRevealed,
      });
      addLog(draft, "evento", `${draft.hexes[request.hexId].sector?.name ?? `Hex ${request.hexId}`}: ${result}`);
    });
    toast.success("Evento registrado.", { description: sectorName });
    onOpenChange(false);
  }

  return <Dialog open onOpenChange={onOpenChange}>
    <DialogContent className="inventory-dialog sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{kindLabel(request.kind)}</DialogTitle>
        <DialogDescription>
          Hex {request.hexId} · {sectorName}. Este fluxo é aberto pelo menu contextual do hex.
        </DialogDescription>
      </DialogHeader>

      {generated && <div className="list-card text-sm leading-relaxed" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="tag">{kindLabel(request.kind)} · {String(roll ?? 0).padStart(2, "0")}</span>
          <Button size="sm" variant="outline" onClick={reroll}><RotateCcw size={15} /> Rolar novamente</Button>
        </div>
        <p className="mt-3">{result}</p>
        <p className="text-xs subtle mt-2">O resultado é uma proposta. Adapte à ficção antes de registrar.</p>
      </div>}

      {request.kind === "eventos" ? <div className="grid gap-3">
        <Field
          label="Gatilho que tornou o evento pertinente"
          value={eventTrigger}
          onChange={setEventTrigger}
          placeholder="Barulho, horário, retorno, abertura..."
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={eventRevealed} onCheckedChange={setEventRevealed} />
          Revelar aos jogadores
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
        <Field label="Lugar" value={pointName} onChange={setPointName} placeholder="Nome do ponto" />
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
          ? <Button disabled={!result || !eventTrigger.trim()} onClick={saveEvent}><Dice5 size={16} /> Registrar evento</Button>
          : <Button disabled={!pointName.trim()} onClick={savePoint}><MapPin size={16} /> Registrar ponto</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
