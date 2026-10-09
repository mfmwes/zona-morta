"use client";
import { isCluePoint } from "@/lib/hex-event-links";
import { hasMultipleSurvivorGroups } from "@/lib/game";

import { timedActionParticipantIssue } from "@/lib/activity";

import { MasterContextActions, PlayerContextActions, type MasterActionControls, type PlayerActionControls } from "@/components/player-actions-panel";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, CheckCircle2, ChevronDown, Compass, Dice5, Eye, Footprints, House, MapPin, Package, Play, Route, Search, Trash2, Undo2, Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { addLog, establishShelter, hexDistance, survivorsAtHex, type GameState } from "@/lib/game";
import { assignCustomSector, redrawSector, revealSector } from "@/lib/sectors";
import { searchAreaLabel, searchAvailabilityError } from "@/lib/exploration";
import { HexSearchDialog, type HexSearchRequest } from "@/components/hex-search-dialog";
import { PlayerHexSearchDialog, type PlayerHexSearchRequest } from "@/components/player-hex-search-dialog";
import { movementSources, performHexAction, type HexQuickAction } from "@/lib/hex-actions";
import { shelterTravelMinutes } from "@/lib/shelter-projects";
import { eventStatus, eventTriggerLabel, eventTriggerReady, generateHexContent } from "@/lib/hex-generators";
import { HexEventGuideDialog } from "@/components/hex-event-guide-dialog";
import { eventOutcomeLabels } from "@/lib/event-resolution-types";
import { HexEventActionDialog, type HexEventActionRequest } from "@/components/hex-event-action-dialog";
import { eventActionLinkLabels, eventActionUsed, hexEventActionLabels, suggestedEventActionKind } from "@/lib/hex-event-actions";
import type { HexEventActionKind } from "@/lib/game";
import { prepareHex, prepareLocationForExploration, searchAreaState } from "@/lib/hex-automation";

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

export function HexExplorer({ mobile = false, initialTarget, game, edit, playerPreview, teamPeers = [], playerActions, masterActions }: {
  mobile?: boolean;
  initialTarget?: {hexId:string;eventId?:string;pointId?:string;areaId?:string};
  game: GameState;
  edit: Edit;
  playerPreview: boolean;
  playerActions?: PlayerActionControls; masterActions?: MasterActionControls;
  teamPeers?: { id: string; name: string; hex?: string; portrait?: string }[];
}) {
  const mobileSelectionTrigger = useRef<HTMLButtonElement>(null);
  const [selectedId, setSelected] = useState(initialTarget?.hexId??game.partyHex);
  const selected = game.hexes[selectedId] ? selectedId : game.partyHex;
  const [signsDraft, setSignsDraft] = useState<{ key: string; source: string; value: string } | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ key: string; source: string; value: string } | null>(null);
  const [guideEventId,setGuideEventId]=useState<string|null>(initialTarget?.eventId??null);
  const [generatorRequest, setGeneratorRequest] = useState<HexGeneratorRequest | null>(null);
  const [eventActionRequest, setEventActionRequest] = useState<HexEventActionRequest | null>(null);
  const [searchRequest, setSearchRequest] = useState<HexSearchRequest | null>(initialTarget?.pointId?{hexId:initialTarget.hexId,pointId:initialTarget.pointId,areaId:initialTarget.areaId}:null);
  const [playerSearchRequest, setPlayerSearchRequest] = useState<PlayerHexSearchRequest | null>(null);
  const [gmOpen, setGmOpen] = useState(false);
  const [masterRevealState, setMasterRevealState] = useState<"avistado" | "explorado">("avistado");
  const [customSectorName, setCustomSectorName] = useState("");
  const [pendingSectorOverride, setPendingSectorOverride] = useState<{ mode: "random" | "custom"; discovery: "avistado" | "explorado"; name?: string } | null>(null);
  const [compact, setCompact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [expansionOpen, setExpansionOpen] = useState(false);
  const [focusHex, setFocusHex] = useState(initialTarget?.hexId??game.partyHex);
  const [relocateOpen, setRelocateOpen] = useState(false);
  const [relocateDestination, setRelocateDestination] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDestination, setMoveDestination] = useState<string | null>(null);
  const [activeGroupHex, setActiveGroupHex] = useState(game.partyHex);


  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const update = () => { setCompact(query.matches); if (!query.matches && playerPreview) setSheetOpen(false); };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [playerPreview]);

  function selectHex(id: string, openDetails = true) {
    if (id !== selected) {
      setSelected(id);
      setSignsDraft(null); setNotesDraft(null);
      setGmOpen(false);
    }
    if (openDetails && (mobile || compact || !playerPreview)) setSheetOpen(true);
  }

  const area = parseHex(selected)!;
  const record = game.hexes[selected];
  const sectorName = record.sector?.name ?? "Setor ainda não revelado";
  const signs = signsDraft?.key === selected && signsDraft.source === record.signs ? signsDraft.value : record.signs;
  const notes = notesDraft?.key === selected && notesDraft.source === record.notes ? notesDraft.value : record.notes;
  const setSigns = (value: string) => setSignsDraft({ key: selected, source: record.signs, value });
  const setNotes = (value: string) => setNotesDraft({ key: selected, source: record.notes, value });

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
  const mainTravelIssue = timedActionParticipantIssue(game, survivorsAtHex(game, game.partyHex).map(p=>p.id));
  const activeTravelMinutes = shelterTravelMinutes(game, activeSourceHex, selected, record.routeHours * 60);
  const [activeQ, activeR] = activeSourceHex.split(",").map(Number);
  const activeAdjacentToSelected = hexDistance(area.q - activeQ, area.r - activeR) === 1;
  const activeCanMoveSelected = activeAdjacentToSelected && record.discovery !== "desconhecido";
  function selectGroup(hex: string) {
    setActiveGroupHex(hex);
    setFocusHex(hex);
    selectHex(hex, false);
  }

  function runHexAction(id: string, action: HexQuickAction) {
    const outcome: { value: ReturnType<typeof performHexAction> | null } = { value: null };
    edit(draft => { outcome.value = performHexAction(draft, id, action); });
    if (!outcome.value?.ok) return false;
    toast.success(outcome.value.message);
    return true;
  }

  function travel() {
    if (runHexAction(selected, { type: "travel" })) {
      setFocusHex(hasMultipleSurvivorGroups(game) ? activeSourceHex : selected);
    }
  }

  function observe() { runHexAction(selected, { type: "observe" }); }

  function openGenerator(id: string, kind: HexGeneratorKind) {
    selectHex(id);
    setSheetOpen(false);
    const generated = generateHexContent(game, id, kind);
    setGeneratorRequest({ hexId: id, kind, generated });
  }

  function openManualPoint(id: string) {
    selectHex(id);
    setSheetOpen(false);
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
      if(event.resolutions?.some(r=>r.status==="scheduled")){toast.error("Conclua ou interrompa a resolução em andamento.");return;}
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
      if(hex.events.find(event=>event.id===eventId)?.resolutions?.some(r=>r.status==="scheduled")){toast.error("Interrompa a resolução antes de excluir o evento.");return;}
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
    if (!playerPreview) setSheetOpen(false);
    setMoveOpen(true);
  }

  const explorationPanel = <>
        {!visible ? <div className="mt-4 p-4 rounded-md bg-secondary">Essa área ainda não foi avistada. Seu conteúdo permanece em aberto.</div> : <>
        {playerPreview && record.discovery !== "desconhecido" && record.sector?.border && <div className="list-card mt-5 text-sm leading-relaxed"><b>{selected === "0,0" ? "Desde o início" : "Sinal da borda"}</b><p className="mt-1">{record.sector.border}</p></div>}
        {playerPreview && record.signs && <p className="mt-3 text-sm"><b>Outros sinais:</b> {record.signs}</p>}
        {playerActions && <details className="hex-player-travel mt-3"><summary><Footprints size={15} /> {selected === game.publicPlayerActions?.hexId ? "Viagens a partir deste hex" : "Viajar para este hex"}</summary><PlayerContextActions key={selected+"travel"} game={game} controls={playerActions} context={{kind:"travel",destination:selected === game.publicPlayerActions?.hexId?undefined:selected}} /></details>}
        <div className="hex-sector-locations-bar"><div className="hex-points-heading"><MapPin size={18} aria-hidden="true" /><h3 className="section-title">Locais e pistas neste setor</h3><span className="tag">{exposedPoints.length}</span></div>
          {!playerPreview && record.discovery !== "desconhecido" && <div className="hex-sector-actions"><Button size="sm" variant="ghost" onClick={() => { edit(draft => { prepareHex(draft, selected); }); toast.success("Hex preparado; conteúdo reservado para revisão"); }}><Package size={15} /> Preparar hex</Button><Button size="sm" variant="outline" onClick={() => openManualPoint(selected)}><Plus size={15} /> Adicionar local</Button></div>}
        </div>
        {exposedPoints.length === 0 && <p className="intro-line mt-3">Nenhum local ou pista registrado neste setor.</p>}
        {exposedPoints.length > 0 && <div key={selected} className="hex-points-list" role="region" aria-label={`Locais e pistas do setor ${selected}`} tabIndex={0}>
          {exposedPoints.map(point => {
            const prep = point.preparation;
            const searchable = prep?.areas.filter(area => area.searchable !== false) ?? [];
            const activeAttempts = prep?.attempts.filter(attempt => ["pending", "ready"].includes(attempt.status)) ?? [];
            const stockRemaining = prep?.stock.filter(row => row.remaining > 0).reduce((sum, row) => sum + row.remaining, 0) ?? 0;
            const searched = prep && point
              ? searchable.filter(area => ["deep-available", "deep-ongoing", "searched", "exhausted"].includes(searchAreaState(point, area))).length
              : point.searches.length;
            const deepAvailable = prep && point ? searchable.filter(area => searchAreaState(point, area) === "deep-available").length : 0;
            const availableSearch = prep && point ? searchable.filter(area => searchAreaState(point, area) === "available").length : 0;
            const searchIssue = searchAvailabilityError(game, selected, point.id);
            const actionLabel = activeAttempts.length ? "Retomar busca"
              : stockRemaining ? "Recolher achados"
              : !prep ? "Preparar e buscar"
              : availableSearch ? "Escolher cômodo e buscar"
              : deepAvailable ? "Continuar exploração"
              : "Revisar local";
            const statusLabel = activeAttempts.length ? `${activeAttempts.length} busca(s) em andamento`
              : stockRemaining ? `${stockRemaining} item(ns) aguardando coleta`
              : searchable.length ? `${searched}/${searchable.length} áreas vasculhadas`
              : prep ? "Exploração narrativa" : "Ainda não preparado";
            return <article key={point.id} className="hex-point-card list-card text-sm">
              <div className="hex-point-heading"><div><p className="dossier-title">{isCluePoint(point) ? "Pista" : point.kind === "comércio" ? "Comércio neste setor" : "Local neste setor"}</p><b>{point.name}</b></div>
                {!playerPreview && <label className="flex items-center gap-2 text-xs whitespace-nowrap"><Switch size="sm" checked={point.revealed}
                  onCheckedChange={checked => edit(draft => { const found = draft.hexes[selected].points.find(p=>p.id===point.id); if(found) found.revealed=checked; })} /> Público</label>}</div>
              {playerPreview && playerActions && game.publicPlayerActions?.hexId === selected && !isCluePoint(point) && (() => {
                const location = game.publicPlayerActions?.locations.find(row => row.hexId === selected && row.pointId === point.id);
                const playerActionLabel = !location?.prepared ? "Explorar local"
                  : location.activeSearches ? "Retomar busca"
                  : location.stockUnits ? "Recolher achados"
                  : location.availableAreas ? "Escolher cômodo e buscar"
                  : "Revisar local";
                const playerStatus = !location?.prepared ? "O sistema organiza as áreas ao abrir"
                  : location.activeSearches ? `${location.activeSearches} busca(s) em andamento`
                  : location.apparentStockUnits ? `${location.apparentStockUnits} item(ns) aparente(s) à vista`
                  : location.stockUnits ? `${location.stockUnits} item(ns) aguardando coleta`
                  : `${location.searchedAreas}/${location.areaCount} áreas vasculhadas`;
                return <div className="hex-point-session-flow">
                  <div className="hex-point-session-state"><span className={location?.activeSearches ? "is-active" : location?.stockUnits ? "has-stock" : ""}><Search size={14} /> {playerStatus}</span></div>
                  <Button size="sm" variant={location?.activeSearches || location?.stockUnits ? "default" : "outline"}
                    onClick={() => { setSheetOpen(false); setPlayerSearchRequest({ hexId: selected, pointId: point.id }); }}>
                    <Search size={15} /> {playerActionLabel}
                  </Button>
                </div>;
              })()}
              {playerPreview && point.signal && <p className="mt-1">{point.signal}</p>}
              {!playerPreview && point.clueTargetHex && <Button size="sm" variant="outline" className="mt-2"
                disabled={!game.hexes[point.clueTargetHex]} onClick={() => { setFocusHex(point.clueTargetHex!); selectHex(point.clueTargetHex!); }}>
                <Route size={14} /> Destino da pista: {point.clueTargetHex} · {game.hexes[point.clueTargetHex]?.sector?.name ?? "setor ainda não revelado"}
              </Button>}

              {!playerPreview && !isCluePoint(point) && <div className="hex-point-session-flow">
                <div className="hex-point-session-state">
                  <span className={activeAttempts.length ? "is-active" : stockRemaining ? "has-stock" : ""}><Search size={14} /> {statusLabel}</span>
                  {deepAvailable > 0 && !activeAttempts.length && !stockRemaining && <small>{deepAvailable} cômodo(s) com busca profunda disponível</small>}
                </div>
                <Button size="sm" variant={activeAttempts.length || stockRemaining ? "default" : "outline"} disabled={Boolean(searchIssue)} title={actionLabel}
                  onClick={() => { edit(draft => { prepareLocationForExploration(draft, selected, point.id); }); setSheetOpen(false); setSearchRequest({ hexId: selected, pointId: point.id, participantIds: activeGroup?.hex === selected ? activeGroup.members.map(row => row.id) : [] }); }}>
                  <Search size={15} /> {activeAttempts.length ? "Retomar busca" : stockRemaining ? "Recolher achados" : "Explorar local"}
                </Button>
                {searchIssue && <p className="hex-point-session-issue">{searchIssue}</p>}
              </div>}

              {!playerPreview && (point.signal || point.access || point.generatorCategory || point.condition || point.risk || point.lootTable || point.notes) && <details className="hex-point-master-details">
                <summary>Detalhes do mestre</summary>
                <div>
                  {point.signal && <p><b>Sinal:</b> {point.signal}</p>}
                  {point.access && <p><b>Acesso:</b> {point.access}</p>}
                  {(point.generatorCategory || point.condition || point.risk || point.lootTable) && <div className="flex flex-wrap gap-2">
                    {point.generatorCategory && <span className="tag">{point.generatorCategory}</span>}
                    {point.condition && <span className="tag">Condição: {point.condition}</span>}
                    {point.risk && <span className="tag">Risco: {point.risk}</span>}
                    {point.lootTable && <span className="tag">Tabela de achados: {point.lootTable}</span>}
                  </div>}
                  {point.notes && <p className="subtle"><b>Reservado:</b> {point.notes}</p>}
                </div>
              </details>}

              {!playerPreview && point.searches.length > 0 && <Collapsible className="mt-3 border-t pt-2">
                <CollapsibleTrigger asChild><Button size="sm" variant="ghost"><ChevronDown size={14} /> Histórico de buscas ({point.searches.length})</Button></CollapsibleTrigger>
                <CollapsibleContent className="grid gap-2 pt-2">{point.searches.map(search => <div key={search.id} className="hex-search-history text-sm">
                  <b>{searchAreaLabel(point, search.sector)}</b><p>{search.result}</p>
                  <p className="text-xs subtle mt-1">{search.mode === "open" ? `Achado por d12 ${search.roll} · ${search.table}` : `${search.what}${search.why ? ` para ${search.why}` : ""}`} · {search.minutes} min</p>
                </div>)}</CollapsibleContent>
              </Collapsible>}
            </article>;
          })}
        </div>}
        {(exposedEvents.length > 0 || archivedEvents.length > 0) && <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="section-title">Eventos</h3>
            {!playerPreview && <span className="tag">{exposedEvents.filter(event => ["active", "pending"].includes(eventStatus(event))).length} ativos/pendentes · {archivedEvents.length} arquivados</span>}
          </div>
          <div className="grid gap-2">
            {exposedEvents.map(event => {
              const status = eventStatus(event);
              const suggestedAction = suggestedEventActionKind(event);
              const ready = !playerPreview && eventTriggerReady(game, selected, event);
              return <div className={`list-card text-sm hex-event-card hex-event-${status}`} key={event.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 items-center">
                      <b>{playerPreview ? "Evento" : eventTriggerLabel(event)}</b>
                      {!playerPreview && <span className="tag">{status === "pending" ? ready ? "PRONTO" : "PENDENTE" : status === "active" ? "ATIVO" : "RESOLVIDO"}</span>}
                      {!playerPreview && event.generatorCategory && <span className="tag">{event.generatorCategory}</span>}
                    </div>
                    <p className="mt-1">{event.text}</p>

                  </div>
                  {!playerPreview && <label className="flex items-center gap-2 text-xs whitespace-nowrap"><Switch size="sm" checked={event.revealed}
                    onCheckedChange={checked => edit(draft => { const found = draft.hexes[selected].events.find(row=>row.id===event.id); if(found) found.revealed=checked; })} /> Público</label>}
                </div>
                {!playerPreview && <div className="flex flex-wrap gap-2 mt-3">
                  {["pending", "active", "resolved"].includes(status) && suggestedAction && <Button size="sm" variant="outline" disabled={eventActionUsed(game, selected, event, suggestedAction)} onClick={() => { setSheetOpen(false); setEventActionRequest({ hexId: selected, eventId: event.id, type: suggestedAction, suggested: true }); }}>Preparar elemento sugerido</Button>}
                  {status === "pending" && <Button size="sm" variant={ready ? "default" : "outline"} onClick={() => updateEventStatus(event.id, "active")}><Play size={14} /> Ativar</Button>}
                  <Button size="sm" onClick={()=>{setSheetOpen(false);setGuideEventId(event.id);}}><CheckCircle2 size={14}/> {["pending","active"].includes(status)?"Conduzir evento":"Ver desfecho"}</Button>
                  {status === "resolved" && <Button size="sm" variant="outline" onClick={() => updateEventStatus(event.id, "active")}><Undo2 size={14} /> Reabrir</Button>}
                  <Button size="sm" variant="ghost" onClick={() => updateEventStatus(event.id, "archived")}><Archive size={14} /> Arquivar</Button>
                </div>}
                {!playerPreview && ["active", "pending", "resolved"].includes(status) && <Collapsible className="mt-3">
                  <CollapsibleTrigger asChild><Button size="sm" variant="outline"><Plus size={14} /> Criar a partir deste evento <ChevronDown size={14} /></Button></CollapsibleTrigger>
                  <CollapsibleContent><p className="text-xs subtle mt-2">Registre um elemento neste setor. Cada ação abre um formulário para revisar antes de confirmar.</p>
                  <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Ações do evento">
                  {(Object.keys(hexEventActionLabels) as HexEventActionKind[]).map(type => {
                    const used = eventActionUsed(game, selected, event, type);
                    return <Button key={type} size="sm" variant="outline" disabled={used}
                      title={used ? "Esta ação já foi registrada para o evento." : "Preparar e revisar antes de confirmar"}
                      onClick={() => { setSheetOpen(false); setEventActionRequest({ hexId: selected, eventId: event.id, type }); }}>
                      {used ? <CheckCircle2 size={14} /> : <Plus size={14} />}{hexEventActionLabels[type]}
                    </Button>;
                  })}
                  </div></CollapsibleContent>
                </Collapsible>}
                {!playerPreview && Boolean(event.resolutions?.length) && <details className="hex-event-resolution-summary"><summary>{event.resolutions!.at(-1)!.status==="scheduled"?"Resolução em andamento":`Desfecho · ${eventOutcomeLabels[event.resolutions!.at(-1)!.outcome]}`}</summary><p>{event.resolutions!.at(-1)!.summary}</p><p className="subtle">{event.resolutions!.at(-1)!.continuity}</p></details>}
                {!playerPreview && event.actionLinks && <div className="flex flex-wrap gap-2 mt-2" aria-label="Vínculos do evento">
                  {eventActionLinkLabels(game, selected, event).map(label => <span key={label} className="tag">{label}</span>)}
                </div>}
              </div>;
            })}
          </div>
          {!playerPreview && archivedEvents.length > 0 && <Collapsible className="mt-3">
            <CollapsibleTrigger asChild><Button size="sm" variant="ghost"><Archive size={14} /> Arquivados ({archivedEvents.length})</Button></CollapsibleTrigger>
            <CollapsibleContent className="grid gap-2 mt-2">
              {archivedEvents.map(event => <div className="list-card text-sm" key={event.id}>
                <b>{eventTriggerLabel(event)}</b><p className="mt-1">{event.text}</p>
                {eventActionLinkLabels(game, selected, event).map(label => <span key={label} className="tag mt-2 mr-2">{label}</span>)}
                <div className="flex flex-wrap gap-2 mt-2">
                  <Button size="sm" variant="outline" onClick={() => updateEventStatus(event.id, "resolved")}><Undo2 size={14} /> Restaurar</Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteEvent(event.id)}><Trash2 size={14} /> Excluir</Button>
                </div>
              </div>)}
            </CollapsibleContent>
          </Collapsible>}
        </div>}

        {!playerPreview && <div className="hex-sector-notes">
          <details key={selected+"signs"}><summary><Eye size={14} /> Sinais adicionais <span>{signs || "Sem sinais adicionais"}</span></summary><div className="hex-sector-note-editor"><Field label="Sinais adicionais mostrados" value={signs} onChange={setSigns} multiline placeholder="O que o grupo conseguiu observar?" /><Button size="sm" variant="outline" onClick={() => edit(draft => { draft.hexes[selected].signs = signs.trim(); })}>Salvar sinais</Button></div></details>
          <details key={selected+"notes"}><summary><Archive size={14} /> Notas reservadas <span>Só mestre</span></summary><div className="hex-sector-note-editor"><Field label="Anotações reservadas" value={notes} onChange={setNotes} multiline placeholder="Acessos, posição de ameaças e fatos fixados." /><Button size="sm" variant="outline" onClick={() => edit(draft => { draft.hexes[selected].notes = notes.trim(); })}>Salvar notas</Button></div></details>
          {masterActions && <details key={selected+"routes"} className="hex-player-travel"><summary><Footprints size={15} /> Liberar rotas</summary><MasterContextActions game={game} controls={masterActions} context={{kind:"travel",destination:selected}} /></details>}
        </div>}
        </>}
  </>;

  const detailPanel = <section className={`panel panel-pad min-w-0${playerPreview ? "" : " hex-sector-compact"}`}>
    {playerPreview ? <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="dossier-title">Setor do mapa · Hex {selected}</p><h2 className="text-xl font-extrabold mt-1">{record.discovery !== "desconhecido" && visible ? sectorName : "Além do horizonte"}</h2></div>
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
    </> : <header className="hex-sector-header">
      <div className="hex-sector-heading">
        <div className="hex-sector-heading-title"><h2 className="text-xl font-extrabold">{record.discovery !== "desconhecido" && visible ? sectorName : "Além do horizonte"}</h2><p className="dossier-title">Hex {selected}</p></div>
        <div className="hex-sector-tags"><span className="tag">{record.discovery}</span>
          {visible && <span className="tag">{terrains[record.terrain ?? "urban"]}{record.passage && record.passage !== "none" ? ` · ${passages[record.passage]}` : ""}</span>}
          {!playerPreview && <Button size="sm" variant="ghost" className={`hex-sector-infestation ${record.infestation !== null && record.infestation >= 4 ? "tag-danger" : ""}`} onClick={() => setGmOpen(true)} aria-label="Editar infestação na gestão do setor">
            Infestação {record.infestation === null ? "desconhecida" : record.infestation === 0 ? "0 · Ausência confirmada" : `${record.infestation}/5`}
          </Button>}
          {selected === game.shelter.hex && <span className="tag">Abrigo</span>}
        </div>
        {!playerPreview && <Button size="sm" variant="ghost" className="hex-sector-close" onClick={() => setSheetOpen(false)}>Fechar</Button>}
      </div>
      <div className="hex-sector-context">
        <div className="hex-sector-signal">
          {record.discovery !== "desconhecido" && record.sector?.border && <p><Eye size={15} aria-hidden="true" /><span><b>{selected === "0,0" ? "Desde o início" : "Sinal da borda"}:</b> {record.sector.border}</span></p>}
          {!playerPreview && <p className="subtle text-sm">{actualMembersHere.length > 0 ? `${actualMembersHere.length} sobrevivente(s) neste setor.`
            : activeAdjacentToSelected ? record.discovery === "desconhecido" ? "Avistar este setor não gasta tempo." : `Travessia: ${travelDurationLabel(activeTravelMinutes)}${activeTravelMinutes < record.routeHours * 60 ? " com o Quadro de rotas" : ""}.`
            : nearbyGroups.length > 0 ? "Selecione o grupo próximo no mapa para planejar o deslocamento." : "Nenhum grupo em um hex vizinho."}</p>}
        </div>
        {!playerPreview && <div className="hex-sector-actions">
          {record.discovery === "desconhecido" && activeAdjacentToSelected && <Button size="sm" onClick={observe}>Avistar setor</Button>}
          {activeSourceHex === game.partyHex && selected !== game.partyHex && canTravel && record.discovery !== "desconhecido" &&
            <Button size="sm" className="hex-sector-move-button" disabled={game.minutes+travelMinutes>=1440 || Boolean(mainTravelIssue) || Boolean(game.conflict?.active)} onClick={travel} aria-label={`Mover grupo principal · ${travelDurationLabel(travelMinutes)}`}><Route /><span>Mover grupo · {travelDurationLabel(travelMinutes)}</span></Button>}
          {activeCanMoveSelected && <Button size="sm" variant="outline" className="hex-sector-move-button" disabled={game.minutes+activeTravelMinutes>=1440} onClick={() => openMovement(selected)}><Footprints /><span>{activeGroupHex === game.partyHex ? "Separar sobreviventes" : "Mover / dividir subgrupo"}</span></Button>}
          {canMakeBase && (game.shelter.hex ? <ShelterMoveDialog game={game} edit={edit} mode="relocate" destination={selected} /> : <Button size="sm" variant="outline" onClick={() => edit(draft => { establishShelter(draft, selected); })}><House /> Estabelecer abrigo aqui</Button>)}
        </div>}
      </div>
      {!playerPreview && activeCanMoveSelected && game.minutes+activeTravelMinutes>=1440 && <p className="text-sm subtle mt-2">O trajeto do grupo ativo cruzaria o fim do dia. Feche o dia ou ajuste a ficção antes de prosseguir.</p>}
      {publicMembersHere.length > 0 && (playerPreview ? <div className="hex-presence-card mt-3"><Footprints size={17} aria-hidden="true" /><div><b>{selected === game.partyHex ? "Grupo principal" : "Sobreviventes neste hex"}</b><span>{publicMembersHere.map(person => person.name).join(", ")}</span></div></div> : <details className="hex-sector-presence"><summary><Users size={14} />{selected === game.partyHex ? "Grupo principal" : "Sobreviventes neste hex"} · {publicMembersHere.length}</summary><p>{publicMembersHere.map(person => person.name).join(", ")}</p></details>)}
      {(game.formerShelters ?? []).some(site => site.hex === selected) && visible && <p className="character-rule-note mt-2"><Package size={15} aria-hidden="true" className="inline mr-1" /> Antiga base registrada. Sobreviventes presentes neste hex podem abrir Abrigo para retirar suprimentos.</p>}
    </header>}
    {playerPreview ? explorationPanel : <Tabs value={!playerPreview && gmOpen ? "management" : "exploration"} onValueChange={value => setGmOpen(value === "management")} className="hex-sector-tabs">
      {!playerPreview && <TabsList variant="line" className="hex-sector-tabs-list"><TabsTrigger value="exploration"><Compass size={15} /> Exploração</TabsTrigger><TabsTrigger value="management"><Archive size={15} /> Gestão do setor</TabsTrigger></TabsList>}
      <TabsContent value="exploration" forceMount className="hex-sector-exploration data-[state=inactive]:hidden">
        {explorationPanel}
      </TabsContent>
      {!playerPreview && <>
        <TabsContent value="management" forceMount className="data-[state=inactive]:hidden">
          <div className="hex-sector-management">
            <section className="hex-sector-management-group">
          <h3 className="section-title mb-3">Estado do setor do mapa</h3>
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
          {record.infestation === null ? <div className="mt-3">
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

            </section>
            <section className="hex-sector-management-group">
          <div className="hex-master-reveal">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="dossier-title">Revelação direta do mestre</p>
                <p className="text-sm subtle mt-1">Revele este hex sem exigência de proximidade.</p></div>
              {record.sector && <span className="tag">Atual: {record.sector.name}</span>}
            </div>
            <div className="grid gap-3 mt-3">
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

            </section>
            <section className="hex-sector-management-group"><h3 className="section-title mb-3">Preparação do setor</h3>
              {record.discovery !== "desconhecido" ? <div className="hex-content-tools">

            <label className="flex items-center gap-2 text-sm mt-2"><Switch size="sm" checked={game.explorationPreferences?.autoPrepare ?? false} onCheckedChange={autoPrepare => edit(draft => { draft.explorationPreferences = { ...draft.explorationPreferences, autoPrepare, participantIds: draft.explorationPreferences?.participantIds ?? [] }; })} /> Preparar conteúdo reservado ao entrar em novos hexes</label>
            <div className="hex-sector-generators" role="group" aria-label="Adicionar conteúdo ao setor">
              <Button size="sm" onClick={() => { edit(draft => { prepareHex(draft, selected); }); setGmOpen(false); toast.success("Hex preparado; conteúdo reservado para revisão"); }}><Package size={15} /> Preparar hex</Button>
              <Button size="sm" variant="outline" onClick={() => openGenerator(selected, "locais")}><Dice5 size={15} /> Gerar local</Button>
              <Button size="sm" variant="outline" onClick={() => openGenerator(selected, "comercios")}><Dice5 size={15} /> Gerar comércio</Button>
              <Button size="sm" variant="outline" onClick={() => openGenerator(selected, "eventos")}><Dice5 size={15} /> Gerar evento</Button>
              <Button size="sm" variant="ghost" onClick={() => openManualPoint(selected)}><Plus size={15} /> Adicionar local</Button>
            </div>
              </div> : <p className="text-sm subtle">Avistar ou revelar o setor permite preparar seu conteúdo.</p>}
              {record.discovery !== "desconhecido" && record.sector && record.sector.invites.length > 0 && <details className="hex-sector-invites"><summary><Compass size={14} /> Convites possíveis</summary><ul className="space-y-1 text-sm subtle list-disc pl-5 mt-2">{record.sector.invites.map(x => <li key={x}>{x}</li>)}</ul></details>}
            </section>
          </div>
        </TabsContent>
      </>}
    </Tabs>}
  </section>;

  return <div className={playerPreview ? "grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(345px,.75fr)]" : "grid gap-5"}>
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
              activeGroupHex={activeSourceHex}
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
                  active={activeSourceHex === id}
                  onSelect={() => selectGroup(id)}
                />}
              </g>
            </HexContextMenu>;
          })}
        </WorldMapViewport>
        <div className="map-caption" hidden={mobile}>
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
          className={`map-group-chip ${activeSourceHex === group.hex ? "is-active" : ""}`}
          aria-pressed={activeSourceHex === group.hex}
          onClick={() => selectGroup(group.hex)}
          title={`${group.main ? "Grupo principal" : "Subgrupo"} · Hex ${group.hex}: ${group.members.map(person => person.name).join(", ")}`}>
          {group.main ? <Footprints size={13} /> : <Users size={13} />}
          <span><b>{group.main ? "Principal" : group.members.length === 1 ? group.members[0].name : group.members.map(person => person.name.split(" ")[0]).join(" · ")}</b><small>Hex {group.hex} · {game.publicActivities?.some(a=>a.participantIds.some(id=>group.members.some(p=>p.id===id))) || game.activities?.some(a=>a.status==="running"&&a.participantIds.some(id=>group.members.some(p=>p.id===id))) ? "em atividade" : "disponível"}</small></span>
        </button>)}
      </div>
      <p hidden={mobile} className="text-sm subtle mt-2">Clique ou toque nas pegadas/retratos para escolher o grupo ativo; os hexes adjacentes a ele ficam destacados. Clique em um hex para abrir os detalhes e, no computador, use o botão direito para ações rápidas.</p>
      {mobile && <><button ref={mobileSelectionTrigger} type="button" className="mobile-sector-selection" onClick={() => setSheetOpen(true)} aria-haspopup="dialog"><span><small>Hex {selected} · {record.discovery}</small><b>{visible ? sectorName : "Setor desconhecido"}</b></span><span>Detalhes →</span></button><details className="mobile-map-help"><summary>Como usar o mapa</summary><p>Toque em um setor para abrir locais e ações. Use as pegadas ou retratos para selecionar o grupo. Arraste para navegar e use os controles de zoom.</p></details></>}
      <p hidden={mobile} className="intro-line mt-4">O setor ganha nome e sinais quando é avistado. Um hex pode conter vários locais; suas áreas internas continuam em aberto até a exploração.</p>
    </section>

    {expansionOpen && !playerPreview && <WorldExpansionDialog game={game} origin={selected} edit={edit} onClose={() => setExpansionOpen(false)}
      onExpanded={id => { setSelected(id); setFocusHex(id); setSignsDraft(null); setNotesDraft(null); }} />}
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

    {guideEventId && !playerPreview && <HexEventGuideDialog key={`${selected}:${guideEventId}`} game={game} hexId={selected} eventId={guideEventId} controls={masterActions} edit={edit} onClose={()=>{setGuideEventId(null);setSheetOpen(true);}}/>}
    {eventActionRequest && !playerPreview && <HexEventActionDialog key={`${eventActionRequest.hexId}:${eventActionRequest.eventId}:${eventActionRequest.type}`}
      game={game} edit={edit} request={eventActionRequest} onClose={() => { setEventActionRequest(null); if (compact || !playerPreview) setSheetOpen(true); }} />}
    {searchRequest && !playerPreview && <HexSearchDialog key={`${searchRequest.hexId}:${searchRequest.pointId}`}
      game={game} edit={edit} request={searchRequest} onClose={() => { setSearchRequest(null); if (compact || !playerPreview) setSheetOpen(true); }} />}
    {playerSearchRequest && playerPreview && playerActions && <PlayerHexSearchDialog key={`${playerSearchRequest.hexId}:${playerSearchRequest.pointId}`}
      game={game} controls={playerActions} request={playerSearchRequest}
      onClose={() => { setPlayerSearchRequest(null); if (compact || !playerPreview) setSheetOpen(true); }} />}
    {generatorRequest && !playerPreview && <HexGeneratorDialog game={game} edit={edit} request={generatorRequest}
      onOpenChange={open => { if (!open) { setGeneratorRequest(null); if (compact || !playerPreview) setSheetOpen(true); } }} />}
    {moveDestination && <SurvivorMoveDialog game={game} edit={edit} destination={moveDestination}
      open={moveOpen} onOpenChange={open => { setMoveOpen(open); if (!open && !playerPreview) setSheetOpen(true); }}
      preferredSourceHex={activeGroupHex}
      onMoved={destination => { setActiveGroupHex(destination); setSelected(destination); setFocusHex(destination); }} />}
    {relocateDestination && <ShelterMoveDialog game={game} edit={edit} mode="relocate" destination={relocateDestination}
      open={relocateOpen} onOpenChange={setRelocateOpen} hideTrigger />}
    {!playerPreview && !compact && !mobile ? <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
      <DialogContent showCloseButton={false} className="hex-sector-dialog">
        <DialogTitle className="sr-only">Setor do mapa · Hex {selected}</DialogTitle>
        <DialogDescription className="sr-only">Exploração, locais e ferramentas de gestão do setor selecionado.</DialogDescription>
        {detailPanel}
      </DialogContent>
    </Dialog> : compact || mobile ? <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent onCloseAutoFocus={mobile ? event => { event.preventDefault(); mobileSelectionTrigger.current?.focus(); } : undefined} side="bottom" showCloseButton={false} className={`max-h-[88dvh] overflow-y-auto rounded-t-xl p-0${mobile ? " mobile-sector-sheet" : ""}`}>
        <SheetHeader className={playerPreview || mobile ? "sticky top-0 z-10 flex flex-row items-center justify-between border-b bg-background px-4 py-3" : "sr-only"}>
          <div><SheetTitle>Hex {selected}</SheetTitle><SheetDescription className="sr-only">Detalhes do setor selecionado no mapa.</SheetDescription></div>
          {(playerPreview || mobile) && <Button size="sm" variant="outline" onClick={() => setSheetOpen(false)}>Voltar ao mapa</Button>}
        </SheetHeader>
        {detailPanel}
      </SheetContent>
    </Sheet> : <div className="hex-detail-desktop">{detailPanel}</div>}
  </div>;
}
