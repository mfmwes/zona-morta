"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, CheckCircle2, ChevronDown, Compass, Dice5, Eye, Footprints, House, MapPin, Package, Play, Route, Search, Trash2, Undo2, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ShelterMoveDialog } from "@/components/shelter-move";
import { SurvivorMoveDialog } from "@/components/survivor-move-dialog";
import { WorldMapViewport } from "@/components/world-map-viewport";
import { WorldExpansionDialog } from "@/components/world-expansion-dialog";
import { hexCenter, parseHex, passages, terrains, worldHexes, type Terrain, type Passage } from "@/lib/world";
import { MapGroupMarker } from "@/components/map-group-marker";
import { HexContextMenu } from "@/components/hex-context-menu";
import { HexGeneratorDialog, type HexGeneratorKind, type HexGeneratorRequest } from "@/components/hex-generator-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Counter, Field, Pick } from "@/components/game-controls";
import { addLog, content, establishShelter, hexDistance, survivorsAtHex, type GameState, type Point } from "@/lib/game";
import { assignCustomSector, redrawSector, revealSector } from "@/lib/sectors";
import { rollDie } from "@/lib/rolls";
import { normalizedSector, recordSearch, searchError, type SearchInput } from "@/lib/exploration";
import { movementSources, performHexAction, type HexQuickAction } from "@/lib/hex-actions";
import { shelterTravelMinutes } from "@/lib/shelter-projects";
import { eventStatus, eventTriggerLabel, eventTriggerReady, generateHexContent } from "@/lib/hex-generators";

type Edit = (fn: (draft: GameState) => void) => void;

function labelLines(name: string) {
  if (name.length <= 13) return [name];
  const parts = name.split(" ");
  let first = parts.shift() ?? "";
  while (parts.length && `${first} ${parts[0]}`.length <= 13) first += ` ${parts.shift()}`;
  if (!parts.length) return [first.length > 13 ? `${first.slice(0, 12)}…` : first];
  const rest = parts.join(" ");
  return [first.length > 13 ? `${first.slice(0, 12)}…` : first, rest.length > 13 ? `${rest.slice(0, 12)}…` : rest];
}

function travelDurationLabel(minutes: number) {
  const value = Math.max(1, Math.trunc(minutes));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

function dice12() {
  return rollDie(12);
}

export function HexExplorer({ game, edit, playerPreview, teamPeers = [] }: {
  game: GameState;
  edit: Edit;
  playerPreview: boolean;
  teamPeers?: { id: string; name: string; hex?: string; portrait?: string }[];
}) {
  const [selectedId, setSelected] = useState(game.partyHex);
  const selected = game.hexes[selectedId] ? selectedId : game.partyHex;
  const [signsDraft, setSignsDraft] = useState<{ key: string; source: string; value: string } | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ key: string; source: string; value: string } | null>(null);
  const [generatorRequest, setGeneratorRequest] = useState<HexGeneratorRequest | null>(null);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<"specific" | "open">("specific");
  const [searchWhat, setSearchWhat] = useState("");
  const [otherSector, setOtherSector] = useState(false);
  const [searchSector, setSearchSector] = useState("");
  const [searchMinutes, setSearchMinutes] = useState(30);
  const [searchResult, setSearchResult] = useState("");
  const [lootTable, setLootTable] = useState("");
  const [rolledLoot, setRolledLoot] = useState<{ table: string; roll: number } | null>(null);
  const [gmOpen, setGmOpen] = useState(false);
  const [masterRevealState, setMasterRevealState] = useState<"avistado" | "explorado">("avistado");
  const [customSectorName, setCustomSectorName] = useState("");
  const [pendingSectorOverride, setPendingSectorOverride] = useState<{ mode: "random" | "custom"; discovery: "avistado" | "explorado"; name?: string } | null>(null);
  const [compact, setCompact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expansionOpen, setExpansionOpen] = useState(false);
  const [focusHex, setFocusHex] = useState(game.partyHex);
  const [relocateOpen, setRelocateOpen] = useState(false);
  const [relocateDestination, setRelocateDestination] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);
  const [activeGroupHex, setActiveGroupHex] = useState(game.partyHex);


  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const update = () => { setCompact(query.matches); if (!query.matches) setSheetOpen(false); };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function selectHex(id: string) {
    if (id !== selected) {
      setSelected(id);
      setSearchId(null);
      setSignsDraft(null); setNotesDraft(null);
    }
    if (compact) setSheetOpen(true);
  }

  const area = parseHex(selected)!;
  const record = game.hexes[selected];
  const sectorName = record.sector?.name ?? "Setor ainda não revelado";
  const signs = signsDraft?.key === selected && signsDraft.source === record.signs ? signsDraft.value : record.signs;
  const notes = notesDraft?.key === selected && notesDraft.source === record.notes ? notesDraft.value : record.notes;
  const setSigns = (value: string) => setSignsDraft({ key: selected, source: record.signs, value });
  const setNotes = (value: string) => setNotesDraft({ key: selected, source: record.notes, value });

  function startSearch(point: Point) {
    if (searchId === point.id) { setSearchId(null); return; }
    setSearchId(point.id);
    setSearchMode("specific"); setSearchWhat(""); setSearchResult("");
    setOtherSector(false); setSearchSector(""); setSearchMinutes(30);
    setLootTable(point.lootTable ?? ""); setRolledLoot(null);
  }

  function rollLoot() {
    const table = content.lootTables.find(entry => entry.name === lootTable);
    if (!table || rolledLoot) return;
    const roll = dice12();
    setRolledLoot({ table: table.name, roll });
    setSearchResult(table.entries[roll - 1].text);
  }

  function searchInput(point: Point): SearchInput {
    return { hex: selected, pointId: point.id, sector: otherSector ? searchSector : point.name, what: searchWhat,
      result: searchResult, minutes: searchMinutes, mode: searchMode,
      ...(rolledLoot && searchMode === "open" ? { table: rolledLoot.table, roll: rolledLoot.roll } : {}) };
  }

  function saveSearch(point: Point) {
    const input = searchInput(point);
    if (searchError(game, input)) return;
    edit(draft => { recordSearch(draft, input); });
    setSearchId(null); setSearchWhat(""); setSearchSector(""); setSearchResult(""); setRolledLoot(null);
  }

  function searchSectorTaken(point: Point) {
    const sector = otherSector ? searchSector.trim() : point.name;
    return Boolean(sector) && point.searches.some(search => normalizedSector(search.sector) === normalizedSector(sector));
  }

  function canRecordSearch(point: Point) {
    return searchError(game, searchInput(point)) === null;
  }

  const exposedPoints = playerPreview ? record.points.filter(p => p.revealed) : record.points;
  const exposedEvents = playerPreview
    ? record.events.filter(event => event.revealed && ["active", "resolved"].includes(eventStatus(event)))
    : record.events.filter(event => eventStatus(event) !== "archived");
  const archivedEvents = playerPreview ? [] : record.events.filter(event => eventStatus(event) === "archived");
  const visible = !playerPreview || record.discovery !== "desconhecido";
  const [partyQ, partyR] = (game.partyHex || "0,0").split(",").map(Number);
  const canTravel = hexDistance(area.q-partyQ, area.r-partyR) === 1;
  const travelMinutes = shelterTravelMinutes(game, game.partyHex, selected, record.routeHours * 60);
  const actualMembersHere = survivorsAtHex(game, selected);
  const nearbyGroups = movementSources(game, selected);
  const canMakeBase = actualMembersHere.length > 0 && record.discovery === "explorado" && game.shelter.hex !== selected;
  const publicPositions = playerPreview && teamPeers.length > 0
    ? teamPeers
    : game.survivors.map(person => ({ id: person.id, name: person.name, portrait: person.portrait, hex: person.hex ?? game.partyHex }));
  const positionHexes = [...new Set(publicPositions.map(person => person.hex ?? game.partyHex))];
  const publicGroups = positionHexes.map(hex => ({
    hex,
    members: publicPositions.filter(person => (person.hex ?? game.partyHex) === hex),
    main: hex === game.partyHex,
  }));
  const publicMembersHere = publicPositions.filter(person => (person.hex ?? game.partyHex) === selected);
  const activeGroup = publicGroups.find(group => group.hex === activeGroupHex)
    ?? publicGroups.find(group => group.main)
    ?? publicGroups[0];
  const activeSourceHex = activeGroup?.hex ?? game.partyHex;
  const activeTravelMinutes = shelterTravelMinutes(game, activeSourceHex, selected, record.routeHours * 60);
  const [activeQ, activeR] = activeSourceHex.split(",").map(Number);
  const activeAdjacentToSelected = hexDistance(area.q - activeQ, area.r - activeR) === 1;
  const activeCanMoveSelected = activeAdjacentToSelected && record.discovery !== "desconhecido";
  function selectGroup(hex: string) {
    setActiveGroupHex(hex);
    setFocusHex(hex);
    selectHex(hex);
  }

  function runHexAction(id: string, action: HexQuickAction) {
    let result: ReturnType<typeof performHexAction> | null = null;
    edit(draft => { result = performHexAction(draft, id, action); });
    if (!result?.ok) return false;
    toast.success(result.message);
    return true;
  }

  function travel() { runHexAction(selected, { type: "travel" }); }

  function observe() { runHexAction(selected, { type: "observe" }); }

  function openGenerator(id: string, kind: HexGeneratorKind) {
    selectHex(id);
    const generated = generateHexContent(game, id, kind);
    setGeneratorRequest({ hexId: id, kind, generated });
  }

  function openManualPoint(id: string) {
    selectHex(id);
    setGeneratorRequest({ hexId: id, kind: "manual" });
  }

  function openMasterTools(id: string) {
    selectHex(id);
    setGmOpen(true);
  }


  function updateEventStatus(eventId: string, status: "pending" | "active" | "resolved" | "archived") {
    edit(draft => {
      const event = draft.hexes[selected]?.events.find(row => row.id === eventId);
      if (!event) return;
      event.status = status;
      const sector = draft.hexes[selected].sector?.name ?? `Hex ${selected}`;
      const action = status === "active" ? "ativado" : status === "resolved" ? "resolvido" : status === "archived" ? "arquivado" : "reaberto";
      addLog(draft, "evento", `${sector}: evento ${action} — ${event.text}`);
    });
  }

  function deleteEvent(eventId: string) {
    edit(draft => {
      const hex = draft.hexes[selected];
      if (!hex) return;
      hex.events = hex.events.filter(event => event.id !== eventId);
    });
  }


  function applySectorOverride(action: { mode: "random" | "custom"; discovery: "avistado" | "explorado"; name?: string }) {
    let revealedName = "";
    let previousName = "";
    edit(draft => {
      const hex = draft.hexes[selected];
      if (!hex) return;
      previousName = hex.sector?.name ?? "";
      const sector = action.mode === "custom"
        ? assignCustomSector(draft, selected, action.name ?? "")
        : hex.sector ? redrawSector(draft, selected) : revealSector(draft, selected);
      hex.discovery = action.discovery;
      revealedName = sector.name;
      addLog(draft, "mapa", action.mode === "custom"
        ? `O mestre definiu o hex ${selected} como ${sector.name} e o marcou como ${action.discovery}.`
        : `O mestre revelou à distância o hex ${selected} como ${sector.name} (${action.discovery}).`);
    });
    if (!revealedName) return;
    setPendingSectorOverride(null);
    if (action.mode === "custom") setCustomSectorName("");
    toast.success(action.mode === "custom" ? "Setor definido manualmente" : "Setor revelado à distância", {
      description: previousName && previousName !== revealedName
        ? `${previousName} foi substituído por ${revealedName}.`
        : `${revealedName} · ${action.discovery}.`,
    });
  }

  function requestSectorOverride(mode: "random" | "custom") {
    const name = customSectorName.trim();
    if (mode === "custom" && !name) {
      toast.error("Informe um nome para o setor.");
      return;
    }
    const action = { mode, discovery: masterRevealState, ...(mode === "custom" ? { name } : {}) };
    if (record.sector) {
      setPendingSectorOverride(action);
      return;
    }
    applySectorOverride(action);
  }

  function openRelocation(id: string) {
    selectHex(id);
    setRelocateDestination(id);
    setRelocateOpen(true);
  }

  function openMovement(id: string) {
    selectHex(id);
    setMoveDestination(id);
    setMoveOpen(true);
  }

  const detailPanel = <section className="panel panel-pad min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="dossier-title">Hex {selected}</p><h2 className="text-xl font-extrabold mt-1">{record.discovery !== "desconhecido" && visible ? sectorName : "Além do horizonte"}</h2></div>
        <div className="flex flex-wrap gap-2"><span className="tag">{record.discovery}</span>
          {visible && <span className="tag">{terrains[record.terrain ?? "urban"]}{record.passage && record.passage !== "none" ? ` · ${passages[record.passage]}` : ""}</span>}
          {!playerPreview && <span className={record.infestation !== null && record.infestation >= 4 ? "tag tag-danger" : "tag"}>
            Infestação {record.infestation === null ? "?" : `${record.infestation}/5`}
          </span>}
          {selected === game.shelter.hex && <span className="tag">Abrigo</span>}</div>
      </div>
      {publicMembersHere.length > 0 && <div className="hex-presence-card mt-3">
        {selected === game.partyHex ? <Footprints size={17} aria-hidden="true" /> : <Users size={17} aria-hidden="true" />}
        <div><b>{selected === game.partyHex ? "Grupo principal" : publicMembersHere.length === 1 ? "Sobrevivente isolado" : "Subgrupo neste hex"}</b>
          <span>{publicMembersHere.map(person => person.name).join(", ")}</span></div>
      </div>}
      {(game.formerShelters ?? []).some(site => site.hex === selected) && visible && <p className="character-rule-note mt-3"><Package size={15} aria-hidden="true" className="inline mr-1" /> Antiga base registrada. Sobreviventes presentes neste hex podem abrir Abrigo para retirar suprimentos.</p>}
      {!visible ? <div className="mt-6 p-4 rounded-md bg-secondary leading-relaxed">Essa área ainda não foi avistada. Seu conteúdo permanece em aberto.</div>
      : <>
        {record.discovery !== "desconhecido" && record.sector?.border && <div className="list-card mt-5 text-sm leading-relaxed">
          <b>{selected === "0,0" ? "Desde o início" : "Sinal da borda"}</b><p className="mt-1">{record.sector.border}</p>
        </div>}
        {record.signs && <p className="mt-3 text-sm"><b>Outros sinais:</b> {record.signs}</p>}
        {!playerPreview && <>
          <div className="next-step-card mt-4 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="dossier-title">Próximo passo</p><p className="text-sm mt-1">
                {actualMembersHere.length > 0
                  ? `${actualMembersHere.length} sobrevivente(s) estão neste setor. Selecione o grupo desejado no mapa para destacar sua rota.`
                  : activeAdjacentToSelected
                    ? record.discovery === "desconhecido"
                      ? "Este setor está ao lado do grupo ativo. Avistar não gasta tempo."
                      : `O grupo ativo pode chegar aqui em ${travelDurationLabel(activeTravelMinutes)} de travessia${activeTravelMinutes < record.routeHours * 60 ? " com o Quadro de rotas" : ""}.`
                    : nearbyGroups.length > 0
                      ? "Outro grupo está próximo. Selecione o marcador dele antes de planejar este deslocamento."
                      : "Nenhum grupo está em um hex vizinho deste setor."}</p></div>
              <div className="flex flex-wrap gap-2">
                {record.discovery === "desconhecido" && activeAdjacentToSelected && <Button size="sm" onClick={observe}>Avistar setor</Button>}
                {activeCanMoveSelected &&
                  <Button size="sm" disabled={game.minutes+activeTravelMinutes>=1440} onClick={() => openMovement(selected)}><Footprints /> {activeGroupHex === game.partyHex ? "Separar sobreviventes" : "Mover / dividir subgrupo"}</Button>}
                {activeGroupHex === game.partyHex && selected !== game.partyHex && canTravel && record.discovery !== "desconhecido" &&
                  <Button size="sm" variant="outline" disabled={game.minutes+travelMinutes>=1440} onClick={travel}><Route /> Mover grupo principal</Button>}
                {actualMembersHere.length > 0 && <span className="tag">Grupo presente</span>}
              </div>
            </div>
            {activeCanMoveSelected && game.minutes+activeTravelMinutes>=1440 && <p className="text-sm subtle mt-2">O trajeto do grupo ativo cruzaria o fim do dia. Feche o dia ou ajuste a ficção antes de prosseguir.</p>}
          </div>
          {canMakeBase && (game.shelter.hex ? <ShelterMoveDialog game={game} edit={edit} mode="relocate" destination={selected} /> : <Button size="sm" variant="outline" className="mt-3" onClick={() => edit(draft => { establishShelter(draft, selected); })}>
            <House /> Estabelecer abrigo aqui</Button>)}
          <Collapsible open={gmOpen} onOpenChange={setGmOpen} className="mt-4 border-t pt-3">
            <CollapsibleTrigger asChild><Button variant="ghost" className="gm-tools-trigger w-full justify-between">
              <span className="flex items-center gap-2"><Compass size={18} /> Ferramentas do mestre</span>
              <ChevronDown size={18} className={gmOpen ? "rotate-180" : ""} />
            </Button></CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
          <h3 className="section-title mb-3">Estado do setor</h3>
          <div className="grid gap-3 sm:grid-cols-2 mb-3">
            <Pick label="Terreno" value={record.terrain ?? "urban"} options={Object.entries(terrains).map(([value, label]) => ({ value, label }))}
              onChange={value => edit(draft => { draft.hexes[selected].terrain = value as Terrain; })} />
            <Pick label="Via" value={record.passage ?? "none"} options={Object.entries(passages).map(([value, label]) => ({ value, label }))}
              onChange={value => edit(draft => { draft.hexes[selected].passage = value as Passage; })} />
          </div>
          <Button size="sm" variant="outline" className="mb-3" onClick={() => { setSheetOpen(false); setExpansionOpen(true); }}><Plus /> Expandir a partir deste hex</Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Pick label="Descoberta" value={record.discovery}
              options={actualMembersHere.length > 0 || selected === game.shelter.hex
                ? ["explorado"] : ["desconhecido", "avistado", "explorado"]}
              onChange={value => edit(draft => {
                if ((survivorsAtHex(draft, selected).length > 0 || selected === draft.shelter.hex) && value !== "explorado") return;
                if (value !== "desconhecido") revealSector(draft, selected);
                draft.hexes[selected].discovery = value as typeof record.discovery;
              })} />
            <Pick label="Travessia" value={String(record.routeHours)} options={["1", "2"]}
              onChange={value => edit(draft => { draft.hexes[selected].routeHours = Number(value) as 1 | 2; })} />
          </div>
          <div className="hex-master-reveal mt-4 rounded-md border border-dashed p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="dossier-title">Revelação direta do mestre</p>
                <p className="text-sm subtle mt-1">Revele qualquer hex sem proximidade. O procedimento normal de exploração continua sendo o padrão para os jogadores.</p></div>
              {record.sector && <span className="tag">Atual: {record.sector.name}</span>}
            </div>
            <div className="grid gap-3 mt-3 sm:grid-cols-2">
              <Pick label="Estado após revelar" value={masterRevealState} options={["avistado", "explorado"]}
                onChange={value => setMasterRevealState(value as "avistado" | "explorado")} />
              <Field label="Nome personalizado" value={customSectorName} onChange={setCustomSectorName}
                placeholder="Ex.: Hospital São Vicente" />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => requestSectorOverride("random")}><Dice5 size={15} /> Sortear e revelar</Button>
              <Button size="sm" onClick={() => requestSectorOverride("custom")} disabled={!customSectorName.trim()}><MapPin size={15} /> Definir nome</Button>
            </div>
            <p className="text-xs subtle mt-2">Setores personalizados recebem um ID próprio e não retiram opções do sorteio procedural.</p>
          </div>
          {record.infestation === null ? <div className="mt-3 rounded-md border border-dashed border-[#a7c1bd] p-3">
            <p className="text-sm font-bold">Infestação · ?</p>
            <p className="text-sm subtle mt-1">Ainda não definida. Escolha um nível após observar sinais; 0 significa ausência confirmada.</p>
            <div className="mt-3 max-w-xs"><Pick label="Definir infestação" value="" placeholder="Escolher nível 0–5"
              options={["0","1","2","3","4","5"]}
              onChange={value => edit(draft => { draft.hexes[selected].infestation = Number(value); })} /></div>
          </div> : <div className="mt-3"><Counter compact label="Infestação (0–5)" value={record.infestation} max={5}
            onChange={value => edit(draft => { draft.hexes[selected].infestation = value; })} /></div>}
          <div className="flex flex-wrap gap-2 mt-3">
            {record.infestation !== null && <Button size="sm" variant="outline" onClick={() => edit(draft => { draft.hexes[selected].infestation = null; })}>Deixar em aberto</Button>}
            <span className="text-sm subtle self-center">Nível muda por causa duradoura, no máximo 1 por incidente.</span>
          </div>
          <div className="grid gap-3 mt-4">
            <Field label="Sinais adicionais mostrados" value={signs} onChange={setSigns} multiline placeholder="O que o grupo conseguiu observar?" />
            <Field label="Anotações reservadas" value={notes} onChange={setNotes} multiline placeholder="Acessos, posição de ameaças e fatos fixados." />
            <Button size="sm" variant="outline" onClick={() => edit(draft => { draft.hexes[selected].signs = signs.trim(); draft.hexes[selected].notes = notes.trim(); })}>Salvar anotações</Button>
          </div>
          <div className="divider" />
          <div className="character-rule-note">
            <b>Tabelas de conteúdo movidas para o mapa.</b> Use o botão direito do mouse em um hex revelado para abrir B1 Local, B2 Comércio, B3 Evento ou criar um ponto manualmente.
          </div>
            </CollapsibleContent>
          </Collapsible>
        </>}
        <div className="divider" />
        <div className="hex-points-heading"><MapPin size={18} aria-hidden="true" /><h3 className="section-title">Pontos descobertos</h3><span className="tag">{exposedPoints.length}</span></div>
        {exposedPoints.length === 0 && <p className="intro-line mt-3">Nenhum ponto registrado ainda. Convites não são achados garantidos.</p>}
        {exposedPoints.length > 0 && <div key={selected} className="hex-points-list" role="region" aria-label={`Pontos descobertos do hex ${selected}`} tabIndex={0}>
          {exposedPoints.map(point => <article key={point.id} className="hex-point-card list-card text-sm">
            <div className="hex-point-heading"><b>{point.name}</b>
              {!playerPreview && <label className="flex items-center gap-2 text-xs whitespace-nowrap"><Switch size="sm" checked={point.revealed}
                onCheckedChange={checked => edit(draft => { const found = draft.hexes[selected].points.find(p=>p.id===point.id); if(found) found.revealed=checked; })} /> Público</label>}</div>
            {point.signal && <p className="mt-1">{point.signal}</p>}
            {point.access && <p className="mt-2"><b>Acesso:</b> {point.access}</p>}
            {!playerPreview && (point.generatorCategory || point.condition || point.risk || point.lootTable) && <div className="flex flex-wrap gap-2 mt-2">
              {point.generatorCategory && <span className="tag">{point.generatorCategory}</span>}
              {point.condition && <span className="tag">Condição: {point.condition}</span>}
              {point.risk && <span className="tag">Risco: {point.risk}</span>}
              {point.lootTable && <span className="tag">Busca: {point.lootTable}</span>}
            </div>}
            {!playerPreview && point.notes && <p className="mt-2 subtle"><b>Reservado:</b> {point.notes}</p>
            {point.searches.length > 0 && <div className="mt-3 border-t pt-2">
              {point.searches.map(search => <p key={search.id} className="mt-1">
                <b>{search.mode === "open" ? "Busca aberta" : "Busca específica"}:</b>
                {search.mode === "open" ? ` d12 ${search.roll} · ${search.table}` : ` ${search.what}${search.why ? ` para ${search.why}` : ""}`}
                {` · ${search.sector} · ${search.minutes} min. `}<b>Resultado:</b> {search.result}
              </p>)}
            </div>}
            {!playerPreview && <>
              <Button size="sm" variant="ghost" className="mt-2" disabled={actualMembersHere.length === 0} onClick={() => startSearch(point)}><Search /> Buscar itens</Button>
              {actualMembersHere.length === 0 && <p className="text-xs subtle mt-1">É preciso haver pelo menos um sobrevivente neste hex para buscar. Os registros anteriores continuam disponíveis.</p>}
              {searchId === point.id && <div className="hex-search-panel grid gap-3 mt-3 rounded-md border border-[#bbd3ce] bg-[#edf3f0] p-4">
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tipo de busca">
                  <Button size="sm" variant={searchMode === "specific" ? "default" : "outline"} aria-pressed={searchMode === "specific"}
                    onClick={() => { setSearchMode("specific"); setSearchResult(""); setRolledLoot(null); }}>Específica</Button>
                  <Button size="sm" variant={searchMode === "open" ? "default" : "outline"} aria-pressed={searchMode === "open"}
                    onClick={() => { setSearchMode("open"); setSearchResult(""); setSearchMinutes(30); }}>Aberta · d12</Button>
                </div>
                {searchMode === "specific" ? <>
                  <p className="text-sm subtle">Diga o objetivo, confira sinais e risco e registre o resultado. Uma busca específica não usa a tabela d12.</p>
                  <Field label="O que procuram e para quê?" value={searchWhat} onChange={setSearchWhat}
                    placeholder="Ex.: Peças para reparar o portão" />
                  <Field label="Resultado ou pista" value={searchResult} onChange={setSearchResult}
                    placeholder="Ex.: 1 Peças nas caixas; ocupam 1 espaço" />
                </> : <>
                  <p className="text-sm subtle">Escolha a coluna do lugar real. Um d12 indica um achado incidental para todo o grupo.</p>
                  <Pick label="Tipo de local" value={lootTable} options={content.lootTables.map(entry => entry.name)}
                    onChange={value => { setLootTable(value); setRolledLoot(null); setSearchResult(""); }} />
                  {!rolledLoot ? <Button size="sm" variant="outline" disabled={!lootTable} onClick={rollLoot}><Dice5 /> Rolar 1d12</Button>
                    : <div className="list-card"><span className="tag">d12 {rolledLoot.roll} · {rolledLoot.table}</span>
                        <p className="mt-2 font-bold">{content.lootTables.find(entry => entry.name === rolledLoot.table)?.entries[rolledLoot.roll - 1].text}</p>
                        <p className="text-xs subtle mt-2">Se contradiz os sinais, ajuste o achado sem rolar novamente. Resolva acesso e posse na ficção.</p>
                      </div>}
                  {rolledLoot && <Field label="Achado registrado" value={searchResult} onChange={setSearchResult} />}
                </>}
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Tempo da busca">
                  <span className="text-sm font-bold mr-1">Tempo</span>
                  {[30,60].map(minutes => <Button key={minutes} size="sm" variant={searchMinutes === minutes ? "default" : "outline"}
                    aria-pressed={searchMinutes === minutes} onClick={() => setSearchMinutes(minutes)}>
                    {minutes === 30 ? "30 min" : "1 hora"}</Button>)}
                </div>
                <div><button type="button" className="hex-search-sector-link text-sm font-bold text-[#276f72] underline underline-offset-2"
                  onClick={() => { setOtherSector(value => !value); setSearchSector(""); }}>
                  {otherSector ? "Usar este ponto como setor" : "Buscar em outro setor deste ponto"}</button>
                  {otherSector && <div className="mt-2"><Field label="Qual setor diferente?" value={searchSector}
                    onChange={setSearchSector} placeholder="Ex.: depósito dos fundos" /></div>}</div>
                {searchSectorTaken(point) && <p className="text-sm text-red-700">Este setor já foi vasculhado. Escolha outro setor que exista no lugar.</p>}
                {game.minutes + searchMinutes >= 1440 && <p className="text-sm text-red-700">O tempo informado atravessa o fim do dia. Feche o dia antes de registrar.</p>}
                <Button size="sm" disabled={!canRecordSearch(point)} onClick={() => saveSearch(point)}>
                  Registrar {searchMode === "open" ? "achado" : "resultado"} e avançar {searchMinutes} min
                </Button>
              </div>}
            </>}
          </article>)}
        </div>}
        {(exposedEvents.length > 0 || archivedEvents.length > 0) && <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="section-title">Eventos</h3>
            {!playerPreview && <span className="tag">{exposedEvents.length} ativos/pendentes · {archivedEvents.length} arquivados</span>}
          </div>
          <div className="grid gap-2">
            {exposedEvents.map(event => {
              const status = eventStatus(event);
              const ready = !playerPreview && eventTriggerReady(game, selected, event);
              return <div className={`list-card text-sm hex-event-card hex-event-${status}`} key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 items-center">
                      <b>{eventTriggerLabel(event)}</b>
                      {!playerPreview && <span className="tag">{status === "pending" ? ready ? "PRONTO" : "PENDENTE" : status === "active" ? "ATIVO" : "RESOLVIDO"}</span>}
                      {!playerPreview && event.generatorCategory && <span className="tag">{event.generatorCategory}</span>}
                    </div>
                    <p className="mt-1">{event.text}</p>
                    {!playerPreview && event.guidance && <p className="mt-2 subtle"><b>Orientação:</b> {event.guidance}</p>}
                  </div>
                  {!playerPreview && <label className="flex items-center gap-2 text-xs whitespace-nowrap"><Switch size="sm" checked={event.revealed}
                    onCheckedChange={checked => edit(draft => { const found = draft.hexes[selected].events.find(row=>row.id===event.id); if(found) found.revealed=checked; })} /> Público</label>}
                </div>
                {!playerPreview && <div className="flex flex-wrap gap-2 mt-3">
                  {status === "pending" && <Button size="sm" variant={ready ? "default" : "outline"} onClick={() => updateEventStatus(event.id, "active")}><Play size={14} /> Ativar</Button>}
                  {status === "active" && <Button size="sm" variant="outline" onClick={() => updateEventStatus(event.id, "resolved")}><CheckCircle2 size={14} /> Resolver</Button>}
                  {status === "resolved" && <Button size="sm" variant="outline" onClick={() => updateEventStatus(event.id, "active")}><Undo2 size={14} /> Reabrir</Button>}
                  <Button size="sm" variant="ghost" onClick={() => updateEventStatus(event.id, "archived")}><Archive size={14} /> Arquivar</Button>
                </div>}
              </div>;
            })}
          </div>
          {!playerPreview && archivedEvents.length > 0 && <Collapsible className="mt-3">
            <CollapsibleTrigger asChild><Button size="sm" variant="ghost"><Archive size={14} /> Arquivados ({archivedEvents.length})</Button></CollapsibleTrigger>
            <CollapsibleContent className="grid gap-2 mt-2">
              {archivedEvents.map(event => <div className="list-card text-sm" key={event.id}>
                <b>{eventTriggerLabel(event)}</b><p className="mt-1">{event.text}</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => updateEventStatus(event.id, "resolved")}><Undo2 size={14} /> Restaurar</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteEvent(event.id)}><Trash2 size={14} /> Excluir</Button>
                </div>
              </div>)}
            </CollapsibleContent>
          </Collapsible>}
        </div>}
        {!playerPreview && record.discovery !== "desconhecido" && record.sector && record.sector.invites.length > 0 && <div className="mt-5 rounded-md border border-dashed border-[#b2c8c5] p-3">
          <p className="dossier-title mb-2 flex items-center gap-1"><Compass size={14} /> Convites possíveis</p>
          <ul className="space-y-1 text-sm subtle list-disc pl-5">{record.sector.invites.map(x => <li key={x}>{x}</li>)}</ul>
        </div>}
        {!playerPreview && record.notes && <p className="mt-4 text-xs subtle flex gap-2"><Eye size={15} /> Mestre: {record.notes}</p>}
      </>}
    </section>;

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(345px,.75fr)]">
    <section className="panel panel-pad min-w-0 self-start">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div><p className="dossier-title">Mundo / {Object.keys(game.hexes).length} áreas</p><h2 className="section-title mt-1">Mapa de exploração</h2></div>
        <div className="flex flex-wrap items-center gap-2"><span className="tag">1 hex ≈ 2 km</span>
          {!playerPreview && <Button size="sm" variant="outline" onClick={() => setExpansionOpen(true)}><Plus /> Expandir mundo</Button>}</div>
      </div>
      {activeGroup && <div className="map-active-group" role="status" aria-live="polite">
        <span className="map-active-group-icon">{activeGroup.main ? <Footprints size={16} /> : <Users size={16} />}</span>
        <span><small>GRUPO ATIVO</small><b>{activeGroup.members.map(person => person.name).join(", ")}</b></span>
        <em>Hex {activeGroup.hex}</em>
      </div>}
      <div className="map-surface">
        <WorldMapViewport hexes={game.hexes} activeHex={activeSourceHex} selected={selected} focusHex={focusHex} playerPreview={playerPreview} onSelect={selectHex}>
          <defs><pattern id="setor-avistado" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#2d4d50" />
            <path d="M-2 8L8-2M2 10L10 2" stroke="#527478" strokeWidth="1" opacity=".58" />
          </pattern></defs>
          {worldHexes(game.hexes).map(hex => {
            const id = hex.id;
            const state = game.hexes[id];
            const { x, y } = hexCenter(hex);
            const polygon = Array.from({length: 6}, (_, i) => {
              const a = (Math.PI/180) * (60*i-30);
              return `${x + 51*Math.cos(a)},${y + 51*Math.sin(a)}`;
            }).join(" ");
            const discovered = state.discovery === "explorado";
            const observed = state.discovery === "avistado";
            const nearby = hexDistance(hex.q-activeQ, hex.r-activeR) === 1;
            const terrainColors = { urban: "#35686a", rural: "#636544", forest: "#365a3e", mountain: "#505c6d", swamp: "#45625b" };
            const fill = discovered ? terrainColors[state.terrain ?? "urban"] : observed ? "url(#setor-avistado)" : "#17282d";
            const title = discovered || observed ? state.sector?.name ?? "Setor sem nome" : "Fora do horizonte";
            const shownPoints = playerPreview
              ? state.discovery === "desconhecido" ? 0 : state.points.filter(point => point.revealed).length
              : state.points.length;
            const npcsHere = (game.npcs ?? []).filter(npc => npc.active && npc.status !== "Morto" && npc.status !== "Desaparecido" && npc.hex === id);
            const formerBase = (game.formerShelters ?? []).some(site => site.hex === id);
            const membersHere = publicPositions.filter(person => (person.hex ?? game.partyHex) === id);
            const lines = discovered || observed ? labelLines(title) : ["?"];
            return <HexContextMenu key={id} game={game} edit={edit} hexId={id} playerPreview={playerPreview}
              onOpenDetails={() => selectHex(id)}
              onGenerate={kind => openGenerator(id, kind)}
              onCreatePoint={() => openManualPoint(id)}
              onOpenMasterTools={() => openMasterTools(id)}
              onRelocateShelter={() => openRelocation(id)}
              activeGroupHex={activeGroupHex}
              onMoveSurvivors={() => openMovement(id)}>
              <g role="button" tabIndex={0} className="map-cell" aria-pressed={id === selected}
                aria-label={`${id}: ${title}${nearby ? ", adjacente ao grupo ativo" : ""}${id === game.shelter.hex ? ", abrigo" : ""}${formerBase ? ", antiga base com depósito" : ""}${membersHere.length ? `, sobreviventes: ${membersHere.map(person => person.name).join(", ")}` : ""}`}
                onClick={() => selectHex(id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectHex(id); } }}>
                <title>{title} · Hex {id}{discovered || observed ? ` · ${terrains[state.terrain ?? "urban"]}${state.passage && state.passage !== "none" ? ` · ${passages[state.passage]}` : ""}` : ""}</title>
                <polygon points={polygon} className={`map-hex ${id === selected ? "selected" : ""} ${nearby ? "nearby" : ""}`}
                  fill={fill} stroke={observed ? "#759897" : "#49666a"} strokeWidth="2" />
                <text x={x} y={y-17} textAnchor="middle" fontSize="10" fill="#c4d8d3" fontFamily="monospace">{id}</text>
                <text x={x} y={lines.length > 1 ? y-1 : y+8} textAnchor="middle" fontSize={discovered || observed ? "11.5" : "17"} fontWeight="700" fill={discovered ? "#f5f8f2" : "#d1e0dc"}>
                  {lines.map((line,index) => <tspan key={index} x={x} dy={index ? 13 : 0}>{line}</tspan>)}
                </text>
                {shownPoints > 0 && <g className="map-point-marker" aria-hidden="true">
                  <rect x={x+13} y={y+19} width="30" height="18" rx="9" />
                  <MapPin x={x+16} y={y+22} width={12} height={12} strokeWidth={2.4} />
                  <text x={x+34} y={y+31.5} textAnchor="middle" fontSize="9.5" fontWeight="900">{shownPoints > 9 ? "9+" : shownPoints}</text>
                </g>}
                {npcsHere.length > 0 && <g aria-hidden="true"><circle cx={x-27} cy={y+27} r="10" fill="#c7d9e4" stroke="#173135" strokeWidth="2" />
                  <Users x={x-34} y={y+20} width={14} height={14} stroke="#173135" strokeWidth={2.5} />
                  {npcsHere.length > 1 && <text x={x-20} y={y+34} textAnchor="middle" fontSize="9" fill="#173135" fontWeight="800">{npcsHere.length > 9 ? "9+" : npcsHere.length}</text>}</g>}
                {id === game.shelter.hex && <g className="map-shelter-marker" aria-hidden="true">
                  <path d={`M ${x+23} ${y-18} L ${x+27} ${y-12} L ${x+31} ${y-18} Z`} />
                  <circle cx={x+27} cy={y-29} r="14" />
                  <circle className="map-shelter-inner" cx={x+27} cy={y-29} r="10.5" />
                  <House x={x+19} y={y-37} width={16} height={16} strokeWidth={2.4} />
                </g>}
                {formerBase && <g aria-hidden="true"><circle cx={x+27} cy={y-29} r="13" fill="#e7d3a2" stroke="#173135" strokeWidth="2" />
                  <Package x={x+18} y={y-38} width={18} height={18} stroke="#173135" strokeWidth={2.5} /></g>}
                {membersHere.length > 0 && <MapGroupMarker
                  hexId={id}
                  x={x}
                  y={y}
                  members={membersHere}
                  main={id === game.partyHex}
                  active={activeGroupHex === id}
                  onSelect={() => selectGroup(id)}
                />}
              </g>
            </HexContextMenu>;
          })}
        </WorldMapViewport>
        <div className="map-caption">
          <span><i className="legend-swatch" style={{background:"#35686a"}} /> Explorado</span>
          <span><i className="legend-swatch legend-observed" /> Avistado</span>
          <span><i className="legend-swatch" style={{background:"#17282d"}} /> Desconhecido</span>
          <span><i className="legend-swatch legend-nearby" /> Adjacente</span>
          <span className="flex items-center gap-1"><Footprints size={15} /> Pegadas = grupo principal</span>
          <span className="flex items-center gap-1"><Users size={15} /> Retrato = sobrevivente ou subgrupo</span>
          {game.shelter.hex && <span className="flex items-center gap-1"><House size={15} /> Casa = abrigo atual</span>}
          {(game.formerShelters ?? []).length > 0 && <span className="flex items-center gap-1"><Package size={15} /> Antiga base</span>}
          <span className="flex items-center gap-1"><MapPin size={15} /> Pin = locais descobertos</span>
          {(game.npcs ?? []).length > 0 && <span className="flex items-center gap-1"><Users size={15} /> PNJs</span>}
        </div>
      </div>
      <div className="map-group-summary" aria-label="Selecionar grupo ativo">
        {publicGroups.map(group => <button type="button" key={group.hex}
          className={`map-group-chip ${activeGroupHex === group.hex ? "is-active" : ""}`}
          aria-pressed={activeGroupHex === group.hex}
          onClick={() => selectGroup(group.hex)}
          title={`${group.main ? "Grupo principal" : "Subgrupo"} · Hex ${group.hex}: ${group.members.map(person => person.name).join(", ")}`}>
          {group.main ? <Footprints size={13} /> : <Users size={13} />}
          <span><b>{group.main ? "Principal" : group.members.length === 1 ? group.members[0].name : group.members.map(person => person.name.split(" ")[0]).join(" · ")}</b><small>Hex {group.hex}</small></span>
        </button>)}
      </div>
      <p className="text-sm subtle mt-2">Clique ou toque nas pegadas/retratos para escolher o grupo ativo; os hexes adjacentes a ele ficam destacados. Clique em um hex para abrir os detalhes e, no computador, use o botão direito para ações rápidas.</p>
      <p className="intro-line mt-4">O setor ganha nome e sinais quando é avistado. Um hex pode conter vários pontos; seus interiores continuam em aberto até a exploração.</p>
    </section>

    {expansionOpen && !playerPreview && <WorldExpansionDialog game={game} origin={selected} edit={edit} onClose={() => setExpansionOpen(false)}
      onExpanded={id => { setSelected(id); setFocusHex(id); setSearchId(null); setSignsDraft(null); setNotesDraft(null); }} />}
    <AlertDialog open={Boolean(pendingSectorOverride)} onOpenChange={open => { if (!open) setPendingSectorOverride(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Substituir o setor deste hex?</AlertDialogTitle>
          <AlertDialogDescription>
            O hex {selected} já está definido como “{record.sector?.name ?? "setor atual"}”. A substituição altera apenas o setor e o estado de descoberta; pontos, eventos, buscas, infestação e anotações permanecem registrados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => pendingSectorOverride && applySectorOverride(pendingSectorOverride)}>Substituir setor</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {generatorRequest && <HexGeneratorDialog game={game} edit={edit} request={generatorRequest}
      onOpenChange={open => { if (!open) setGeneratorRequest(null); }} />}
    {moveDestination && <SurvivorMoveDialog game={game} edit={edit} destination={moveDestination}
      open={moveOpen} onOpenChange={setMoveOpen}
      preferredSourceHex={activeGroupHex}
      onMoved={destination => { setActiveGroupHex(destination); setSelected(destination); setFocusHex(destination); }} />}
    {relocateDestination && <ShelterMoveDialog game={game} edit={edit} mode="relocate" destination={relocateDestination}
      open={relocateOpen} onOpenChange={setRelocateOpen} hideTrigger />}
    {compact ? <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[88dvh] overflow-y-auto rounded-t-xl p-0">
        <SheetHeader className="sticky top-0 z-10 flex flex-row items-center justify-between border-b bg-background px-4 py-3">
          <div><SheetTitle>Hex {selected}</SheetTitle><SheetDescription className="sr-only">Detalhes do setor selecionado no mapa.</SheetDescription></div>
          <Button size="sm" variant="outline" onClick={() => setSheetOpen(false)}>Fechar</Button>
        </SheetHeader>
        {detailPanel}
      </SheetContent>
    </Sheet> : <div className="hex-detail-desktop">{detailPanel}</div>}
  </div>;
}
