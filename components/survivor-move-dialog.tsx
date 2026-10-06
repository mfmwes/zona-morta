"use client";
/* eslint-disable @next/next/no-img-element -- survivor portraits are existing small data URLs. */

import { useMemo, useState } from "react";
import { Footprints, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pick } from "@/components/game-controls";
import { survivorHex, survivorsAtHex, type GameState } from "@/lib/game";
import { movementSources, moveSurvivors } from "@/lib/hex-actions";

type Edit = (fn: (draft: GameState) => void) => void;

export function SurvivorMoveDialog({
  game,
  edit,
  destination,
  open,
  onOpenChange,
  preferredSourceHex,
  onMoved,
}: {
  game: GameState;
  edit: Edit;
  destination: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferredSourceHex?: string;
  onMoved?: (destination: string) => void;
}) {
  const sources = useMemo(() => movementSources(game, destination), [game, destination]);
  const [sourceHex, setSourceHex] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const source = sources.find(group => group.hex === sourceHex)
    ?? sources.find(group => group.hex === preferredSourceHex) ?? sources[0];
  const members = source?.members ?? [];
  const selected = selectedIds.length || sourceHex ? selectedIds : members.map(person => person.id);
  const destinationMembers = survivorsAtHex(game, destination);
  const destinationName = game.hexes[destination]?.sector?.name ?? `Hex ${destination}`;
  const travelHours = game.hexes[destination]?.routeHours ?? 1;

  function changeSource(value: string) {
    const next = sources.find(group => group.hex === value);
    setSourceHex(value);
    setSelectedIds(next?.members.map(person => person.id) ?? []);
  }

  function toggle(id: string, checked: boolean) {
    setSelectedIds(current => {
      const base = current.length || sourceHex ? current : members.map(person => person.id);
      return checked ? [...new Set([...base, id])] : base.filter(entry => entry !== id);
    });
  }

  function confirm() {
    if (!selected.length || !source) return;
    const outcome: { value: ReturnType<typeof moveSurvivors> | null } = { value: null };
    edit(draft => { outcome.value = moveSurvivors(draft, destination, selected); });
    if (!outcome.value?.ok) {
      toast.error("Não foi possível mover os sobreviventes.", {
        description: "Confira a origem, o horário e se o destino continua adjacente e revelado.",
      });
      return;
    }
    toast.success("Deslocamento registrado", { description: outcome.value.message });
    onMoved?.(destination);
    onOpenChange(false);
  }

  const sourceOptions = sources.map(group => {
    const sector = game.hexes[group.hex]?.sector?.name ?? `Hex ${group.hex}`;
    const main = group.hex === game.partyHex ? " · grupo principal" : "";
    return { value: group.hex, label: `${sector} · ${group.members.length} sobrevivente(s)${main}` };
  });

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="survivor-move-dialog">
      <DialogHeader>
        <DialogTitle>Mover sobreviventes para {destinationName}</DialogTitle>
        <DialogDescription>
          Escolha quem fará a travessia. Selecionar apenas parte de uma equipe cria um grupo menor; sobreviventes que terminarem no mesmo hex passam a formar um grupo naquele local.
        </DialogDescription>
      </DialogHeader>

      {sources.length === 0 ? <p className="character-rule-note">
        Nenhum grupo está em um hex adjacente a este destino.
      </p> : <>
        {sources.length > 1 && <Pick label="Grupo de origem" value={source?.hex ?? ""} options={sourceOptions} onChange={changeSource} />}

        {source && <div className="survivor-move-route">
          <div><span>ORIGEM</span><b>{game.hexes[source.hex]?.sector?.name ?? `Hex ${source.hex}`}</b><small>Hex {source.hex}</small></div>
          <Footprints size={20} aria-hidden="true" />
          <div><span>DESTINO</span><b>{destinationName}</b><small>{travelHours} h de travessia</small></div>
        </div>}

        <div className="survivor-move-members">
          <div className="survivor-move-members-head">
            <b>Quem vai?</b>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedIds(members.map(person => person.id))}>Todos</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Limpar</Button>
            </div>
          </div>
          {members.map(person => <label key={person.id} className="survivor-move-person">
            <input type="checkbox" checked={selected.includes(person.id)}
              onChange={event => toggle(person.id, event.target.checked)} />
            <span className="survivor-move-avatar">{person.portrait ? <img src={person.portrait} alt="" /> : person.name.charAt(0).toUpperCase()}</span>
            <span><b>{person.name}</b><small>{person.archetype} · {person.infection}</small></span>
            <small>Hex {survivorHex(game, person)}</small>
          </label>)}
        </div>

        {selected.length > 0 && selected.length < members.length && <p className="character-rule-note">
          <Users size={15} aria-hidden="true" className="inline mr-1" /> O grupo será dividido: {selected.length} seguirá para o destino e {members.length - selected.length} permanecerá no hex {source?.hex}.
        </p>}
        {destinationMembers.length > 0 && <p className="character-rule-note">
          Já estão no destino: {destinationMembers.map(person => person.name).join(", ")}. Quem chegar ficará reunido com eles.
        </p>}
        <p className="text-sm subtle">A travessia avança o relógio da campanha uma vez, independentemente de quantos sobreviventes selecionados viajem juntos.</p>
      </>}

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button disabled={!source || selected.length === 0 || game.minutes + travelHours * 60 >= 1440} onClick={confirm}>
          <Footprints size={16} /> Mover {selected.length || ""} sobrevivente{selected.length === 1 ? "" : "s"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
