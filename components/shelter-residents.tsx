"use client";

import { useState } from "react";
import { EyeOff, House, MapPin, Search, Users, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Counter } from "@/components/game-controls";
import { NpcPortrait } from "@/components/npc-portrait";
import { residentCandidates, residentKey, shelterCommunity, updateShelterResidents, type ShelterResident } from "@/lib/shelter-residents";
import type { GameState } from "@/lib/game";

type Edit = (fn: (draft: GameState) => void) => void;
const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
function Avatar({ person }: { person: ShelterResident }) {
  return <span className="npc-avatar">{person.portrait ? <NpcPortrait src={person.portrait} frame={person.portraitFrame} /> : person.name.slice(0, 1).toUpperCase()}</span>;
}
function location(game: GameState, hex: string) { return game.hexes[hex]?.sector?.name ?? `Hex ${hex}`; }
function homeName(game: GameState, hex: string) {
  return [game.shelter, ...(game.formerShelters ?? [])].find(site => site.hex === hex)?.name ?? location(game, hex);
}

export function ShelterResidents({ game, edit, playerPreview, capacity }: { game: GameState; edit: Edit; playerPreview: boolean; capacity: number }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hex = game.shelter.hex;
  const community = playerPreview ? game.publicShelterCommunity ?? shelterCommunity(game, true) : shelterCommunity(game);
  const people = residentCandidates(game);
  const residents = community.residents;
  const away = residents.filter(person => person.hex !== hex).length;
  const changed = [...selected].some(key => !initial.has(key)) || [...initial].some(key => !selected.has(key));
  function manage() {
    const keys = new Set(people.filter(person => person.home === hex).map(residentKey));
    setInitial(keys); setSelected(new Set(keys)); setSearch(""); setOpen(true);
  }
  function toggle(key: string, checked: boolean) {
    setSelected(previous => { const next = new Set(previous); if (checked) next.add(key); else next.delete(key); return next; });
  }
  function save() {
    if (playerPreview || !hex) return;
    const added = people.filter(person => selected.has(residentKey(person)) && !initial.has(residentKey(person)));
    const removed = [...initial].filter(key => !selected.has(key)).map(key => {
      const separator = key.indexOf(":");
      return { kind: key.slice(0, separator) as "survivor" | "npc", id: key.slice(separator + 1) };
    });
    let applied = false;
    edit(state => { applied = updateShelterResidents(state, hex, added, removed); });
    if (!applied) { toast.error("O abrigo ou as pessoas mudaram. Reabra a lista para conferir."); return; }
    setOpen(false); toast.success("Moradores atualizados.");
  }
  function options(kind: "survivor" | "npc", title: string) {
    const group = people.filter(person => person.kind === kind && fold(`${person.name} ${person.role}`).includes(fold(search.trim())));
    return <fieldset className="resident-choice-group"><legend>{title} <span>{group.length}</span></legend>
      <div className="resident-choice-grid">{group.map(person => {
        const key = residentKey(person), checked = selected.has(key);
        const elsewhere = person.home && person.home !== hex;
        return <label key={key} className={`resident-choice ${checked ? "is-selected" : ""} ${!person.active ? "is-inactive" : ""}`}>
          <input type="checkbox" aria-label={person.name} checked={checked} disabled={!person.active && !initial.has(key)} onChange={event => toggle(key, event.target.checked)} />
          <Avatar person={person} /><span className="resident-choice-copy"><b>{person.name}</b><small>{person.role || "Função não registrada"}</small>
            <small><MapPin size={12} /> {location(game, person.hex)}</small>
            {elsewhere ? <em className="resident-transfer">{checked ? "Será transferido de" : "Morador de"} {homeName(game, person.home!)}</em> : <em>{person.home === hex ? "Vínculo com este abrigo" : "Sem vínculo com um abrigo"}</em>}
            {person.hidden && <small className="resident-private"><EyeOff size={12} /> Somente o mestre</small>}
            {!person.active && <small>Inativo, morto ou desaparecido · fora das contagens</small>}
          </span>
        </label>;
      })}</div>{!group.length && <p className="resident-empty">Nenhuma pessoa encontrada neste grupo.</p>}
    </fieldset>;
  }
  return <>
    <div className="resident-heading"><div><p className="dossier-title">Comunidade</p><h3 className="section-title mt-1">Moradores do abrigo</h3></div>
      {!playerPreview && <Button variant="outline" onClick={manage}><UserRoundPlus size={16} /> Gerenciar moradores</Button>}
      <span className="tag">{community.present}/{capacity} presentes</span>
    </div>
    <div className="shelter-community-counts mt-4"><span><b>{game.shelter.residents + residents.length}</b> moradores</span><span><b>{community.present}</b> presentes agora</span><span><b>{away}</b> moradores fora</span></div>
    <p className="resident-explanation">O vínculo permanece quando a pessoa sai para explorar. As provisões seguem a presença e as regras de consumo diário.</p>
    <div className="shelter-resident-grid resident-roster">{residents.map(person => <article className="list-card resident-card" key={residentKey(person)}>
      <Avatar person={person} /><div><b>{person.name}</b><small>{person.kind === "survivor" ? "Personagem de jogador" : "NPC"}{person.role ? ` · ${person.role}` : ""}</small>
        <span className={`resident-location ${person.hex === hex ? "is-home" : ""}`}>{person.hex === hex ? <House size={13} /> : <MapPin size={13} />}{person.hex === hex ? "No abrigo" : person.exploring ? "Em exploração" : "Em outro local"}</span>
        {person.hex !== hex && <small>{location(game, person.hex)}</small>}
        {person.duty && <small>Função no abrigo: {person.duty}</small>}
        {person.hidden && !playerPreview && <small className="resident-private"><EyeOff size={12} /> Somente o mestre</small>}
      </div>
    </article>)}</div>
    {!residents.length && <p className="resident-empty"><Users size={19} /> Nenhum morador identificado vinculado a este abrigo.</p>}
    <div className="resident-anonymous"><div><b>Moradores não identificados</b><p>Use apenas para pessoas sem ficha, evitando contar alguém duas vezes.</p></div>
      {playerPreview ? <span className="tag">{game.shelter.residents}</span> : <Counter compact label="Quantidade sem ficha" value={game.shelter.residents} max={99} onChange={value => edit(state => { state.shelter.residents = value; })} />}
    </div>
    {!playerPreview && <Dialog open={open} onOpenChange={setOpen}><DialogContent className="resident-dialog z-[100]" overlayClassName="z-[90]">
      <DialogHeader><DialogTitle>Gerenciar moradores</DialogTitle><DialogDescription>Marque quem pertence a {game.shelter.name}. Desmarcar remove apenas o vínculo; as fichas e os locais atuais são preservados.</DialogDescription></DialogHeader>
      <label className="resident-search"><Search size={17} /><input aria-label="Buscar moradores" placeholder="Buscar por nome ou função…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="resident-dialog-list">{options("survivor", "Personagens dos jogadores")}{options("npc", "NPCs")}</div>
      <p className="resident-selection-note">{selected.size} pessoa(s) selecionada(s). Selecionar alguém de outra base transfere seu vínculo de moradia.</p>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={!changed} onClick={save}>Salvar moradores</Button></DialogFooter>
    </DialogContent></Dialog>}
  </>;
}
