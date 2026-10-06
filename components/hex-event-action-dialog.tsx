"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Counter, Field, Pick } from "@/components/game-controls";
import { NpcCapabilities } from "@/components/npc-capabilities";
import { content, survivorsAtHex, type GameState, type HexEventActionKind, type NPC } from "@/lib/game";
import { applyEventAction, eventActionError, hexEventActionLabels, prepareEventAction, type EventActionResult, type HexEventAction } from "@/lib/hex-event-actions";
import { threatLibrary } from "@/lib/threats";
import { prepareSuggestedEventAction } from "@/lib/hex-event-actions";

export type HexEventActionRequest = { hexId: string; eventId: string; type: HexEventActionKind; suggested?: boolean };

export function HexEventActionDialog({ game, edit, request, onClose }: {
  game: GameState;
  edit: (fn: (draft: GameState) => void) => void;
  request: HexEventActionRequest;
  onClose: () => void;
}) {
  const event = game.hexes[request.hexId]?.events.find(row => row.id === request.eventId);
  const [action, setAction] = useState<HexEventAction | null>(() => event
    ? (request.suggested ? prepareSuggestedEventAction : prepareEventAction)(game, request.hexId, event, request.type) : null);
  const submitting = useRef(false);
  if (!action) return null;
  function patch<T extends HexEventAction>(current: T, values: Partial<T>) { setAction({ ...current, ...values }); }

  const error = eventActionError(game, request.hexId, request.eventId, action);
  const hex = game.hexes[request.hexId];
  const existing = action.type === "npc"
    ? (game.npcs ?? []).filter(npc => npc.hex === request.hexId).map(npc => ({ value: npc.id, label: npc.name }))
    : action.type === "threat" ? []
      : (hex?.points ?? []).filter(point => action.type !== "clue" || point.clueTargetHex).map(point => ({ value: point.id, label: point.name }));
  const linking = action.type !== "threat" && Boolean(action.existingId);
  const library = action.type === "threat" ? threatLibrary(game.threats) : [];
  const template = action.type === "threat" ? library.find(row => row.id === action.templateId) : undefined;

  function confirm() {
    if (!action || error || submitting.current) return;
    submitting.current = true;
    const results: EventActionResult[] = [];
    edit(draft => { results.push(applyEventAction(draft, request.hexId, request.eventId, action)); });
    const result = results[0];
    if (!result?.ok) {
      submitting.current = false;
      toast.error(result?.message ?? "Não foi possível registrar a ação.");
      return;
    }
    toast.success(result.message, action.type === "threat" ? { description: "Participantes e ataques ficam na aba Conflito." } : undefined);
    onClose();
  }

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="inventory-dialog sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{hexEventActionLabels[action.type]}</DialogTitle>
        <DialogDescription>Setor do mapa: {hex?.sector?.name ?? "Setor ainda não revelado"} · Hex {request.hexId}. Revise os dados e confirme a ação do evento.</DialogDescription>
      </DialogHeader>
      <div className="list-card text-sm"><b>Evento de origem</b><p className="mt-1">{event?.text ?? "Evento removido"}</p>
        {event?.guidance && <p className="subtle mt-2"><b>Orientação reservada:</b> {event.guidance}</p>}
      </div>
      {action.type !== "threat" && existing.length > 0 && <Pick label="Criar ou vincular um cadastro existente" value={action.existingId ?? "__new"}
        options={[{ value: "__new", label: "Criar novo" }, ...existing]}
        onChange={value => patch(action, { existingId: value === "__new" ? undefined : value })} />}
      {linking && <p className="text-sm subtle">O vínculo usa o cadastro escolhido com seus dados e sua visibilidade atuais.</p>}

      {!linking && action.type === "point" && <div className="grid gap-3">
        <Field label="Nome do local dentro deste setor" value={action.name} onChange={name => patch(action, { name })} />
        <Pick label="Tipo do local" value={action.kind} options={["local", "comércio"]} onChange={kind => patch(action, { kind: kind as "local" | "comércio" })} />
        <Field label="Sinal público" multiline value={action.signal} onChange={signal => patch(action, { signal })} />
        <Field label="Acesso reservado" value={action.access} onChange={access => patch(action, { access })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Condição" value={action.condition} onChange={condition => patch(action, { condition })} />
          <Field label="Risco reservado" value={action.risk} onChange={risk => patch(action, { risk })} />
        </div>
        <Pick label="Tabela de achados para vasculhar o local" value={action.lootTable || "__none"} options={[{ value: "__none", label: "Sem sugestão" }, ...content.lootTables.map(row => row.name)]}
          onChange={value => patch(action, { lootTable: value === "__none" ? "" : value })} />
        <Field label="Notas reservadas" multiline value={action.notes} onChange={notes => patch(action, { notes })} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={action.revealed} onCheckedChange={revealed => patch(action, { revealed })} /> Mostrar este local aos jogadores</label>
      </div>}
      {!linking && action.type === "npc" && <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do PNJ" value={action.name} onChange={name => patch(action, { name })} />
          <Field label="Papel ou profissão" value={action.role} onChange={role => patch(action, { role })} />
        </div>
        <Field label="Descrição pública" multiline value={action.description} onChange={description => patch(action, { description })} />
        <Field label="Notas públicas" multiline value={action.publicNotes} onChange={publicNotes => patch(action, { publicNotes })} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Pick label="Estado" value={action.status} options={["Bem", "Ferido", "Grave", "Morto", "Desaparecido"]} onChange={status => patch(action, { status: status as NPC["status"] })} />
          <Pick label="Infecção" value={action.infection} options={["Saudável", "Exposto", "Infectado", "Sintomático", "Terminal"]} onChange={infection => patch(action, { infection: infection as NPC["infection"] })} />
          <Pick label="Disposição" value={action.disposition} options={["Hostil", "Desconfiado", "Neutro", "Aliado", "Leal"]} onChange={disposition => patch(action, { disposition: disposition as NPC["disposition"] })} />
        </div>
        <NpcCapabilities skills={action.skills} onChange={skills => patch(action, { skills })} />
        <Field label="Notas reservadas" multiline value={action.notes} onChange={notes => patch(action, { notes })} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={action.visibleToPlayers} onCheckedChange={visibleToPlayers => patch(action, { visibleToPlayers })} /> Mostrar este PNJ aos jogadores</label>
      </div>}
      {!linking && action.type === "clue" && <div className="grid gap-3">
        <Field label="Nome da pista" value={action.name} onChange={name => patch(action, { name })} />
        <Field label="Texto público da pista" multiline value={action.text} onChange={text => patch(action, { text })} />
        <Pick label="Destino reservado da pista" value={action.targetHex} options={Object.entries(game.hexes)
          .filter(([id]) => id !== request.hexId).map(([id, target]) => ({ value: id, label: `${id} · ${target.sector?.name ?? "setor ainda não revelado"}` }))}
          onChange={targetHex => patch(action, { targetHex })} />
        <p className="text-xs subtle">A pista ficará nos locais e pistas deste setor. O destino continua reservado; escreva no texto público apenas o que os jogadores descobrem.</p>
        <Field label="Notas reservadas" multiline value={action.notes} onChange={notes => patch(action, { notes })} />
        <label className="flex items-center gap-2 text-sm"><Switch checked={action.revealed} onCheckedChange={revealed => patch(action, { revealed })} /> Mostrar esta pista aos jogadores</label>
      </div>}
      {action.type === "threat" && <div className="grid gap-3">
        {action.conflictId ? <p className="text-sm"><b>Adicionar ao conflito:</b> {game.conflict?.id === action.conflictId ? game.conflict.name : "conflito alterado"}</p>
          : <><Field label="Nome do novo conflito" value={action.sceneName} onChange={sceneName => patch(action, { sceneName })} />
            <p className="text-sm subtle">Ao confirmar, iniciaremos uma cena com os {survivorsAtHex(game, request.hexId).length} sobrevivente(s) presentes neste hex.</p></>}
        <Pick label="Ficha da ameaça" value={action.templateId} options={library.map(row => ({ value: row.id, label: `${row.name} · Patamar ${row.tier} · ${row.role}` }))}
          onChange={templateId => patch(action, { templateId })} />
        {template && <div className="list-card text-sm"><b>{template.name}</b><p>{template.description}</p>
          <p className="mt-2">Dificuldade {template.difficulty} · PV {template.maxHp ?? "—"} · Estresse {template.maxStress ?? "—"}</p>
          {template.attack && <p>Ataque: {template.attack.name} · {template.attack.damage} {template.attack.damageType}</p>}
        </div>}
        <Counter compact label="Quantidade de ameaças" value={action.quantity} min={1} max={20} onChange={quantity => patch(action, { quantity })} />
        <Field label="Notas reservadas das ameaças" multiline value={action.notes} onChange={notes => patch(action, { notes })} />
        <p className="character-rule-note">Os nomes das ameaças aparecerão para os jogadores no conflito. Ataques, dano e spotlight continuam sob controle da mesa.</p>
      </div>}
      <p className="text-xs subtle">A confirmação mantém o estado atual do evento. Você pode ativá-lo, resolvê-lo ou arquivá-lo depois.</p>
      {error && <p role="status" className="text-sm text-red-700">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button disabled={Boolean(error)} onClick={confirm}>{linking ? "Confirmar vínculo" : action.type === "threat" && !action.conflictId ? "Iniciar conflito e adicionar ameaças" : "Confirmar criação"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
