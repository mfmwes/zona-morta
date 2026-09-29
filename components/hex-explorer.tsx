"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Compass, Dice5, Eye, Footprints, House, MapPin, Package, Plus, Route, Search, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ShelterMoveDialog } from "@/components/shelter-move";
import { HexContextMenu } from "@/components/hex-context-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Counter, Field, Pick } from "@/components/game-controls";
import { addLog, content, establishShelter, hexDistance, hexKey, type GameState, type Point } from "@/lib/game";
import { createId } from "@/lib/id";
import { revealSector } from "@/lib/sectors";
import { rollDie } from "@/lib/rolls";
import { normalizedSector, recordSearch, searchError, type SearchInput } from "@/lib/exploration";
import { performHexAction, type HexQuickAction } from "@/lib/hex-actions";

type Edit = (fn: (draft: GameState) => void) => void;
type Generator = "locais" | "comercios" | "eventos";

function labelLines(name: string) {
  if (name.length <= 13) return [name];
  const parts = name.split(" ");
  let first = parts.shift() ?? "";
  while (parts.length && `${first} ${parts[0]}`.length <= 13) first += ` ${parts.shift()}`;
  if (!parts.length) return [first.length > 13 ? `${first.slice(0, 12)}…` : first];
  const rest = parts.join(" ");
  return [first.length > 13 ? `${first.slice(0, 12)}…` : first, rest.length > 13 ? `${rest.slice(0, 12)}…` : rest];
}

function dice100() {
  return rollDie(100);
}

function dice12() {
  return rollDie(12);
}

function pointFromResult(text: string) {
  const first = text.indexOf(".");
  return first >= 0 ? { name: text.slice(0, first).trim(), signal: text.slice(first+1).trim() }
    : { name: text, signal: "" };
}

export function HexExplorer({ game, edit, playerPreview }: { game: GameState; edit: Edit; playerPreview: boolean }) {
  const [selected, setSelected] = useState(game.partyHex);
  const [signsDraft, setSignsDraft] = useState<{ key: string; source: string; value: string } | null>(null);
  const [notesDraft, setNotesDraft] = useState<{ key: string; source: string; value: string } | null>(null);
  const [generated, setGenerated] = useState<{ kind: Generator; roll: number; text: string } | null>(null);
  const [pointName, setPointName] = useState("");
  const [pointSignal, setPointSignal] = useState("");
  const [pointAccess, setPointAccess] = useState("");
  const [pointNotes, setPointNotes] = useState("");
  const [pointRevealed, setPointRevealed] = useState(true);
  const [showPointForm, setShowPointForm] = useState(false);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [searchMode, setSearchMode] = useState<"specific" | "open">("specific");
  const [searchWhat, setSearchWhat] = useState("");
  const [otherSector, setOtherSector] = useState(false);
  const [searchSector, setSearchSector] = useState("");
  const [searchMinutes, setSearchMinutes] = useState(30);
  const [searchResult, setSearchResult] = useState("");
  const [lootTable, setLootTable] = useState("");
  const [rolledLoot, setRolledLoot] = useState<{ table: string; roll: number } | null>(null);
  const [eventTrigger, setEventTrigger] = useState("");
  const [eventRevealed, setEventRevealed] = useState(true);
  const [gmOpen, setGmOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mapOverview, setMapOverview] = useState(false);
  const [relocateOpen, setRelocateOpen] = useState(false);
  const [relocateDestination, setRelocateDestination] = useState<string | null>(null);
  const mapViewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1279px)");
    const update = () => { setCompact(query.matches); if (!query.matches) setSheetOpen(false); };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!compact || mapOverview) return;
    const frame = requestAnimationFrame(() => {
      const node = mapViewport.current;
      if (node) {
        const [q,r] = selected.split(",").map(Number);
        const center = (300 + Math.sqrt(3) * 53 * (q + r/2)) * 1.2;
        node.scrollLeft = Math.max(0, center - node.clientWidth / 2);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [compact, mapOverview, selected]);

  function selectHex(id: string) {
    if (id !== selected) {
      setSelected(id);
      setGenerated(null); setShowPointForm(false); setSearchId(null);
      setSignsDraft(null); setNotesDraft(null);
    }
    if (compact) setSheetOpen(true);
  }

  const area = content.hexes.find(h => hexKey(h.q, h.r) === selected)!;
  const record = game.hexes[selected];
  const sectorName = record.sector?.name ?? "Setor ainda não revelado";
  const signs = signsDraft?.key === selected && signsDraft.source === record.signs ? signsDraft.value : record.signs;
  const notes = notesDraft?.key === selected && notesDraft.source === record.notes ? notesDraft.value : record.notes;
  const setSigns = (value: string) => setSignsDraft({ key: selected, source: record.signs, value });
  const setNotes = (value: string) => setNotesDraft({ key: selected, source: record.notes, value });

  function generate(kind: Generator) {
    const roll = dice100();
    const row = content.generators[kind].find(entry => entry.roll === roll)!;
    setGenerated({ kind, roll, text: row.text });
    if (kind === "eventos") { setEventTrigger(""); }
    else {
      const point = pointFromResult(row.text);
      setPointName(point.name); setPointSignal(point.signal);
      setPointAccess(""); setPointNotes(""); setShowPointForm(true);
    }
  }

  function savePoint() {
    if (!pointName.trim()) return;
    const point: Point = {
      id: createId(), name: pointName.trim(),
      kind: generated?.kind === "comercios" ? "comércio" : "local",
      signal: pointSignal.trim(), access: pointAccess.trim(), notes: pointNotes.trim(),
      revealed: pointRevealed, searches: [],
    };
    edit(draft => {
      draft.hexes[selected].points.push(point);
      addLog(draft, "descoberta", `${draft.hexes[selected].sector?.name ?? `Hex ${selected}`}: ${point.name} registrado.`);
    });
    setGenerated(null); setShowPointForm(false); setPointName(""); setPointSignal(""); setPointAccess(""); setPointNotes("");
  }

  function startSearch(point: Point) {
    if (searchId === point.id) { setSearchId(null); return; }
    setSearchId(point.id);
    setSearchMode("specific"); setSearchWhat(""); setSearchResult("");
    setOtherSector(false); setSearchSector(""); setSearchMinutes(30);
    setLootTable(""); setRolledLoot(null);
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
  const exposedEvents = playerPreview ? record.events.filter(e => e.revealed) : record.events;
  const visible = !playerPreview || record.discovery !== "desconhecido";
  const [partyQ, partyR] = (game.partyHex || "0,0").split(",").map(Number);
  const canTravel = hexDistance(area.q-partyQ, area.r-partyR) === 1;
  const travelMinutes = record.routeHours * 60;
  const canMakeBase = selected === game.partyHex && record.discovery === "explorado" && game.shelter.hex !== selected;

  function runHexAction(id: string, action: HexQuickAction) {
    let result: ReturnType<typeof performHexAction> | null = null;
    edit(draft => { result = performHexAction(draft, id, action); });
    if (!result?.ok) return false;
    toast.success(result.message);
    return true;
  }

  function travel() { runHexAction(selected, { type: "travel" }); }

  function observe() { runHexAction(selected, { type: "observe" }); }

  function openGenerator(id: string, kind: Generator) {
    selectHex(id);
    const roll = dice100();
    const row = content.generators[kind].find(entry => entry.roll === roll)!;
    setGenerated({ kind, roll, text: row.text });
    if (kind === "eventos") {
      setEventTrigger("");
      setShowPointForm(false);
    } else {
      const point = pointFromResult(row.text);
      setPointName(point.name); setPointSignal(point.signal);
      setPointAccess(""); setPointNotes(""); setShowPointForm(true);
    }
  }

  function openManualPoint(id: string) {
    selectHex(id);
    setGenerated(null); setPointName(""); setPointSignal(""); setPointAccess(""); setPointNotes("");
    setShowPointForm(true);
  }

  function openMasterTools(id: string) {
    selectHex(id);
    setGmOpen(true);
  }

  function openRelocation(id: string) {
    selectHex(id);
    setRelocateDestination(id);
    setRelocateOpen(true);
  }

  const detailPanel = <section className="panel panel-pad min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="dossier-title">Hex {selected}</p><h2 className="text-xl font-extrabold mt-1">{record.discovery !== "desconhecido" && visible ? sectorName : "Além do horizonte"}</h2></div>
        <div className="flex flex-wrap gap-2"><span className="tag">{record.discovery}</span>
          {!playerPreview && <span className={record.infestation !== null && record.infestation >= 4 ? "tag tag-danger" : "tag"}>
            Infestação {record.infestation === null ? "?" : `${record.infestation}/5`}
          </span>}
          {selected === game.shelter.hex && <span className="tag">Abrigo</span>}</div>
      </div>
      {(game.formerShelters ?? []).some(site => site.hex === selected) && visible && <p className="character-rule-note mt-3"><Package size={15} aria-hidden="true" className="inline mr-1" /> Antiga base registrada. Se o grupo estiver aqui, abra Abrigo para conferir o depósito e retirar suprimentos.</p>}
      {!visible ? <div className="mt-6 p-4 rounded-md bg-secondary leading-relaxed">Essa área ainda não foi avistada. Seu conteúdo permanece em aberto.</div>
      : <>
        {record.discovery !== "desconhecido" && record.sector?.border && <div className="list-card mt-5 text-sm leading-relaxed">
          <b>{selected === "0,0" ? "Desde o início" : "Sinal da borda"}</b><p className="mt-1">{record.sector.border}</p>
        </div>}
        {record.signs && <p className="mt-3 text-sm"><b>Outros sinais:</b> {record.signs}</p>}
        {!playerPreview && <>
          <div className="mt-4 rounded-md border border-[#b6cfca] bg-[#f1f7f4] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="dossier-title">Próximo passo</p><p className="text-sm mt-1">
                {selected === game.partyHex ? "O grupo está neste setor. Explore os pontos ou escolha um hex vizinho."
                  : canTravel ? record.discovery === "desconhecido"
                    ? "Borda vizinha: aviste o setor antes de entrar. Avistar não gasta tempo."
                    : `Hex vizinho · ${record.routeHours} h de travessia a partir da posição atual.`
                  : "Este hex não é vizinho. Selecione um setor adjacente para traçar o retorno ou a exploração."}</p></div>
              {selected === game.partyHex ? <span className="tag">Você está aqui</span>
                : record.discovery === "desconhecido" ? <Button size="sm" disabled={!canTravel} onClick={observe}>Avistar setor</Button>
                : <Button size="sm" disabled={!canTravel || game.minutes+travelMinutes>=1440} onClick={travel}><Route /> Entrar no hex</Button>}
            </div>
            {!canTravel && selected !== game.partyHex && game.shelter.hex === selected && <p className="text-sm subtle mt-2">O abrigo está aqui. O grupo precisa percorrer os hexes do caminho até ele.</p>}
            {canTravel && record.discovery !== "desconhecido" && game.minutes+travelMinutes>=1440 && <p className="text-sm subtle mt-2">O trajeto cruzaria o fim do dia. Feche o dia ou ajuste a ficção antes de prosseguir.</p>}
          </div>
          {canMakeBase && (game.shelter.hex ? <ShelterMoveDialog game={game} edit={edit} mode="relocate" destination={selected} /> : <Button size="sm" variant="outline" className="mt-3" onClick={() => edit(draft => { establishShelter(draft, selected); })}>
            <House /> Estabelecer abrigo aqui</Button>)}
          <Collapsible open={gmOpen} onOpenChange={setGmOpen} className="mt-4 border-t pt-3">
            <CollapsibleTrigger asChild><Button variant="ghost" className="w-full justify-between text-[#1b6569]">
              <span className="flex items-center gap-2"><Compass size={18} /> Ferramentas do mestre</span>
              <ChevronDown size={18} className={gmOpen ? "rotate-180" : ""} />
            </Button></CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
          <h3 className="section-title mb-3">Estado do setor</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Pick label="Descoberta" value={record.discovery}
              options={selected === game.partyHex || selected === game.shelter.hex
                ? ["explorado"] : ["desconhecido", "avistado", "explorado"]}
              onChange={value => edit(draft => {
                if ((selected === draft.partyHex || selected === draft.shelter.hex) && value !== "explorado") return;
                if (value !== "desconhecido") revealSector(draft, selected);
                draft.hexes[selected].discovery = value as typeof record.discovery;
              })} />
            <Pick label="Travessia" value={String(record.routeHours)} options={["1", "2"]}
              onChange={value => edit(draft => { draft.hexes[selected].routeHours = Number(value) as 1 | 2; })} />
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
          <h3 className="section-title">O que existe aqui?</h3>
          <p className="intro-line mt-1">{record.discovery === "desconhecido"
            ? "Avista o setor primeiro. Depois, B1 e B2 podem criar lugares e B3 responder a uma mudança concreta."
            : "Role só para uma pergunta em aberto. B1 e B2 criam lugares; B3 responde a um acontecimento."}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" disabled={record.discovery === "desconhecido"} onClick={() => generate("locais")}><Dice5 /> B1 Local</Button>
            <Button size="sm" variant="outline" disabled={record.discovery === "desconhecido"} onClick={() => generate("comercios")}><Dice5 /> B2 Comércio</Button>
            <Button size="sm" variant="outline" disabled={record.discovery === "desconhecido"} onClick={() => generate("eventos")}><Dice5 /> B3 Evento</Button>
            <Button size="sm" variant="outline" disabled={record.discovery === "desconhecido"} onClick={() => { setGenerated(null); setPointName(""); setPointSignal(""); setPointAccess(""); setPointNotes(""); setShowPointForm(true); }}><Plus /> Criar ponto</Button>
          </div>
          {generated && <div className="list-card mt-4 text-sm leading-relaxed" aria-live="polite">
            <span className="tag">{generated.kind.toUpperCase()} · {String(generated.roll).padStart(2,"0")}</span>
            <p className="mt-2">{generated.text}</p>
            <p className="text-xs subtle mt-2">O resultado é uma proposta. Adapte à ficção antes de registrar.</p>
          </div>}
          {generated?.kind === "eventos" && <div className="grid gap-2 mt-3">
            <Field label="Gatilho que tornou o evento pertinente" value={eventTrigger} onChange={setEventTrigger} placeholder="Barulho, horário, retorno, abertura..." />
            <label className="flex items-center gap-2 text-sm"><Switch checked={eventRevealed} onCheckedChange={setEventRevealed} /> Revelar aos jogadores</label>
            <Button size="sm" disabled={!eventTrigger.trim()} onClick={() => {
              edit(draft => {
                draft.hexes[selected].events.push({ id: createId(), text: generated.text, trigger: eventTrigger.trim(), revealed: eventRevealed });
                addLog(draft, "evento", `${draft.hexes[selected].sector?.name ?? `Hex ${selected}`}: ${generated.text}`);
              }); setGenerated(null);
            }}>Registrar evento</Button>
          </div>}
          {showPointForm && generated?.kind !== "eventos" && <div className="grid gap-3 mt-4 rounded-md border bg-[#f1f6f2] p-4">
            <h4 className="font-extrabold">Novo ponto de interesse</h4>
            <Field label="Lugar" value={pointName} onChange={setPointName} placeholder="Nome do ponto" />
            <Field label="Primeiro sinal" value={pointSignal} onChange={setPointSignal} multiline placeholder="O que se percebe antes de entrar?" />
            <Field label="Acesso e impedimento" value={pointAccess} onChange={setPointAccess} placeholder="Porta, rota, ocupação, obstáculo..." />
            <Field label="Notas do mestre" value={pointNotes} onChange={setPointNotes} multiline placeholder="Estoque e interiores continuam em aberto se você não os fixar." />
            <label className="flex items-center gap-2 text-sm"><Switch checked={pointRevealed} onCheckedChange={setPointRevealed} /> Visível na prévia dos jogadores</label>
            <div className="flex gap-2"><Button size="sm" disabled={!pointName.trim()} onClick={savePoint}>Registrar ponto</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowPointForm(false); setGenerated(null); }}>Cancelar</Button></div>
          </div>}
            </CollapsibleContent>
          </Collapsible>
        </>}
        <div className="divider" />
        <div className="flex items-center gap-2"><MapPin size={18} /><h3 className="section-title">Pontos descobertos</h3><span className="tag">{exposedPoints.length}</span></div>
        {exposedPoints.length === 0 && <p className="intro-line mt-3">Nenhum ponto registrado ainda. Convites não são achados garantidos.</p>}
        <div className="grid gap-3 mt-3">
          {exposedPoints.map(point => <article key={point.id} className="list-card text-sm leading-relaxed">
            <div className="flex items-start justify-between gap-2"><b className="text-[1rem]">{point.name}</b>
              {!playerPreview && <label className="flex items-center gap-2 text-xs whitespace-nowrap"><Switch size="sm" checked={point.revealed}
                onCheckedChange={checked => edit(draft => { const found = draft.hexes[selected].points.find(p=>p.id===point.id); if(found) found.revealed=checked; })} /> Público</label>}</div>
            {point.signal && <p className="mt-1">{point.signal}</p>}
            {point.access && <p className="mt-2"><b>Acesso:</b> {point.access}</p>}
            {!playerPreview && point.notes && <p className="mt-2 subtle"><b>Reservado:</b> {point.notes}</p>}
            {point.searches.length > 0 && <div className="mt-3 border-t pt-2">
              {point.searches.map(search => <p key={search.id} className="mt-1">
                <b>{search.mode === "open" ? "Busca aberta" : "Busca específica"}:</b>
                {search.mode === "open" ? ` d12 ${search.roll} · ${search.table}` : ` ${search.what}${search.why ? ` para ${search.why}` : ""}`}
                {` · ${search.sector} · ${search.minutes} min. `}<b>Resultado:</b> {search.result}
              </p>)}
            </div>}
            {!playerPreview && <>
              <Button size="sm" variant="ghost" className="mt-2" disabled={selected !== game.partyHex} onClick={() => startSearch(point)}><Search /> Buscar itens</Button>
              {selected !== game.partyHex && <p className="text-xs subtle mt-1">Entre neste hex para buscar. Os registros anteriores continuam disponíveis.</p>}
              {searchId === point.id && <div className="grid gap-3 mt-3 rounded-md border border-[#bbd3ce] bg-[#edf3f0] p-4">
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
                <div><button type="button" className="text-sm font-bold text-[#276f72] underline underline-offset-2"
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
        </div>
        {exposedEvents.length > 0 && <div className="mt-5"><h3 className="section-title mb-2">Eventos registrados</h3>
          {exposedEvents.map(event => <div className="list-card text-sm" key={event.id}>
            <b>{event.trigger}</b><p className="mt-1">{event.text}</p>
          </div>)}
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <div><p className="dossier-title">Cidade / 19 áreas</p><h2 className="section-title mt-1">Mapa de exploração</h2></div>
        <div className="flex items-center gap-2"><span className="tag">1 hex ≈ 2 km</span>
          <Button size="sm" variant="outline" className="map-zoom-toggle" onClick={() => setMapOverview(value => !value)}
            aria-pressed={mapOverview}>{mapOverview ? <ZoomIn /> : <ZoomOut />}{mapOverview ? "Ampliar" : "Ver tudo"}</Button></div>
      </div>
      <div className="map-surface">
        <div ref={mapViewport} className={`map-viewport ${mapOverview ? "overview" : ""}`}>
        <svg viewBox="0 0 600 485" aria-label="Mapa de dezenove hexágonos da campanha" role="img">
          <defs><pattern id="setor-avistado" width="8" height="8" patternUnits="userSpaceOnUse">
            <rect width="8" height="8" fill="#2d4d50" />
            <path d="M-2 8L8-2M2 10L10 2" stroke="#527478" strokeWidth="1" opacity=".58" />
          </pattern></defs>
          {content.hexes.map(hex => {
            const id = hexKey(hex.q, hex.r);
            const state = game.hexes[id];
            const x = 300 + Math.sqrt(3) * 53 * (hex.q + hex.r/2);
            const y = 242 + 1.5 * 53 * hex.r;
            const polygon = Array.from({length: 6}, (_, i) => {
              const a = (Math.PI/180) * (60*i-30);
              return `${x + 51*Math.cos(a)},${y + 51*Math.sin(a)}`;
            }).join(" ");
            const discovered = state.discovery === "explorado";
            const observed = state.discovery === "avistado";
            const nearby = hexDistance(hex.q-partyQ, hex.r-partyR) === 1;
            const fill = discovered ? "#35686a" : observed ? "url(#setor-avistado)" : "#17282d";
            const title = discovered || observed ? state.sector?.name ?? "Setor sem nome" : "Fora do horizonte";
            const shownPoints = playerPreview
              ? state.discovery === "desconhecido" ? 0 : state.points.filter(point => point.revealed).length
              : state.points.length;
            const formerBase = (game.formerShelters ?? []).some(site => site.hex === id);
            const lines = discovered || observed ? labelLines(title) : ["?"];
            return <HexContextMenu key={id} game={game} edit={edit} hexId={id} playerPreview={playerPreview}
              onOpenDetails={() => selectHex(id)}
              onGenerate={kind => openGenerator(id, kind)}
              onCreatePoint={() => openManualPoint(id)}
              onOpenMasterTools={() => openMasterTools(id)}
              onRelocateShelter={() => openRelocation(id)}>
              <g role="button" tabIndex={0} className="map-cell" aria-pressed={id === selected}
                aria-label={`${id}: ${title}${nearby ? ", adjacente ao grupo" : ""}${id === game.shelter.hex ? ", abrigo" : ""}${formerBase ? ", antiga base com depósito" : ""}${id === game.partyHex ? ", grupo" : ""}`}
                onClick={() => selectHex(id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectHex(id); } }}>
                <title>{title} · Hex {id}</title>
                <polygon points={polygon} className={`map-hex ${id === selected ? "selected" : ""} ${nearby ? "nearby" : ""}`}
                  fill={fill} stroke={observed ? "#759897" : "#49666a"} strokeWidth="2" />
                <text x={x} y={y-17} textAnchor="middle" fontSize="10" fill="#c4d8d3" fontFamily="monospace">{id}</text>
                <text x={x} y={lines.length > 1 ? y-1 : y+8} textAnchor="middle" fontSize={discovered || observed ? "11.5" : "17"} fontWeight="700" fill={discovered ? "#f5f8f2" : "#d1e0dc"}>
                  {lines.map((line,index) => <tspan key={index} x={x} dy={index ? 13 : 0}>{line}</tspan>)}
                </text>
                {shownPoints > 0 && <g aria-hidden="true"><circle cx={x+27} cy={y+27} r="10" fill="#eecb98" stroke="#173135" strokeWidth="2" />
                  <text x={x+27} y={y+31} textAnchor="middle" fontSize="11" fill="#173135" fontWeight="800">{shownPoints > 9 ? "9+" : shownPoints}</text></g>}
                {id === game.shelter.hex && <g aria-hidden="true"><circle cx={x+27} cy={y-29} r="13" fill="#a7e1d3" stroke="#173135" strokeWidth="2" />
                  <House x={x+18} y={y-38} width={18} height={18} stroke="#173135" strokeWidth={2.5} /></g>}
                {formerBase && <g aria-hidden="true"><circle cx={x+27} cy={y-29} r="13" fill="#e7d3a2" stroke="#173135" strokeWidth="2" />
                  <Package x={x+18} y={y-38} width={18} height={18} stroke="#173135" strokeWidth={2.5} /></g>}
                {id === game.partyHex && <g aria-hidden="true"><circle cx={x-27} cy={y-29} r="13" fill="#f1c481" stroke="#173135" strokeWidth="2" />
                  <Footprints x={x-36} y={y-38} width={18} height={18} stroke="#173135" strokeWidth={2.5} /></g>}
              </g>
            </HexContextMenu>;
          })}
        </svg>
        </div>
        <div className="map-caption">
          <span><i className="legend-swatch" style={{background:"#35686a"}} /> Explorado</span>
          <span><i className="legend-swatch legend-observed" /> Avistado</span>
          <span><i className="legend-swatch" style={{background:"#17282d"}} /> Desconhecido</span>
          <span><i className="legend-swatch legend-nearby" /> Adjacente</span>
          <span className="flex items-center gap-1"><Footprints size={15} /> Grupo</span>
          {game.shelter.hex && <span className="flex items-center gap-1"><House size={15} /> Abrigo</span>}
          {(game.formerShelters ?? []).length > 0 && <span className="flex items-center gap-1"><Package size={15} /> Antiga base</span>}
          <span className="flex items-center gap-1"><MapPin size={15} /> Número = pontos</span>
        </div>
      </div>
      <p className="map-pan-hint text-sm subtle mt-2">Toque em um hex para abrir os detalhes. {mapOverview
        ? "Use “Ampliar” para ler os setores no mapa." : "Deslize o mapa para os lados ou use “Ver tudo” para conferir a cidade inteira."}</p>
      <p className="intro-line mt-4">O setor ganha nome e sinais quando é avistado. Um hex pode conter vários pontos; seus interiores continuam em aberto até a exploração.</p>
    </section>

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
