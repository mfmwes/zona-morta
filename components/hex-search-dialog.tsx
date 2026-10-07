"use client";
import { useState } from "react";
import { CheckCircle2, Clock3, Eye, EyeOff, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Counter, Field, Pick } from "@/components/game-controls";
import { SearchCapacity, searchRoomLabel, SearchRooms, SearchStockRow, SearchTabs, type SearchTab } from "@/components/search-session";
import { previewSearchCollection } from "@/lib/search-collection-preview";
import { content, survivorsAtHex, type GameState } from "@/lib/game";
import { createId } from "@/lib/id";
import { catalogKey } from "@/lib/inventory";
import { searchAvailabilityError } from "@/lib/exploration";
import { collectLocationStock, deepSearchLimit, deepSearchesUsed, finishPreparedSearch, declareSearchArea, depositExpeditionItems, locationScaleLabels, locationScaleOf, lootDefinitions, pendingPlayerSearchOperation, prepareLocationForExploration, quickSearchOptions, registerVisibleStock, resolveNoVisibleStock, resizeLocationPreparation, resolvePreparedSearch, searchAreaSessionState, searchAreaState, searchResult, startDeepSearch, suggestCollection, suggestVisibleStock, warehouseWorkers, type CollectionLine, type VisibleStockSuggestion } from "@/lib/hex-automation";
import { RollForm } from "@/components/roll-dialog";
import type { LocationScale, SearchArea } from "@/lib/hex-automation-types";
import { parallelTimeLabel, participantTimePreview, survivorTimedCommitment } from "@/lib/activity";
export type HexSearchRequest = { hexId: string; pointId: string; participantIds?: string[] };
export function HexSearchDialog({ game, edit, request, onClose }: { game: GameState; edit: (fn: (draft: GameState) => void) => void; request: HexSearchRequest; onClose: () => void }) {
  const hex = game.hexes[request.hexId];
  const point = hex?.points.find(row => row.id === request.pointId);
  const prep = point?.preparation;
  const people = survivorsAtHex(game, request.hexId);
  const commitmentById = new Map(people.map(person => [person.id, survivorTimedCommitment(game, person.id)]));
  const [tab, setTab] = useState<SearchTab>("explore");
  const [areaId, setAreaId] = useState("");
  const [mode, setMode] = useState<"open" | "specific">("open");
  const [objective, setObjective] = useState("");
  const [purpose, setPurpose] = useState("Suprimentos úteis para o grupo");
  const [itemKey, setItemKey] = useState("");
  const quantity = 1;
  const [participants, setParticipants] = useState(() => {
    const present = people.filter(row => !commitmentById.get(row.id)).map(row => row.id);
    const candidates = (request.participantIds?.length ? request.participantIds : present).filter(id => present.includes(id));
    const preferred = game.explorationPreferences?.participantIds.filter(id => candidates.includes(id));
    return preferred?.length ? preferred : candidates;
  });
  const [worker, setWorker] = useState("");
  const [actorId, setActorId] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newSignal, setNewSignal] = useState("");
  const [operationId, setOperationId] = useState(createId);
  const [collection, setCollection] = useState<CollectionLine[] | null>(null);
  const [collectionId, setCollectionId] = useState(createId);
  const [visibleId, setVisibleId] = useState(createId);
  const [visibleKey, setVisibleKey] = useState(catalogKey(content.catalog[0]));
  const [visibleQuantity, setVisibleQuantity] = useState(1);
  const [visibleSuggestion, setVisibleSuggestion] = useState<VisibleStockSuggestion | null>(null);
  const [deepItemKey, setDeepItemKey] = useState("");
  const [deepOperationId, setDeepOperationId] = useState(createId);
  const [deepActorId, setDeepActorId] = useState("");
  const area = prep?.areas.find(row => row.id === areaId)
    ?? prep?.areas.find(row => Boolean(pendingPlayerSearchOperation(game, request.hexId, request.pointId, row.id)))
    ?? prep?.areas.find(row => prep.attempts.some(attempt => attempt.areaId === row.id && ["pending", "ready"].includes(attempt.status)))
    ?? prep?.areas.find(row => prep.stock.some(stock => stock.areaId === row.id && stock.remaining > 0))
    ?? prep?.areas.find(row => row.searchable !== false && !prep.attempts.some(attempt => attempt.areaId === row.id))
    ?? prep?.areas[0];
  const attempt = prep?.attempts.find(row => row.areaId === area?.id && (row.kind ?? "normal") === "normal");
  const deepAttempt = prep?.attempts.find(row => row.areaId === area?.id && row.kind === "deep");
  const playerProposal = area ? pendingPlayerSearchOperation(game, request.hexId, request.pointId, area.id) : undefined;
  const available = searchAvailabilityError(game, request.hexId, request.pointId);
  const done = attempt && ["completed", "failed"].includes(attempt.status);
  const stock = prep?.stock.filter(row => row.remaining > 0) ?? [];
  const keys = [...new Set(lootDefinitions.find(row => row.table === area?.table)?.entries.flatMap(row => [...row.items.map(item => item.catalogKey), ...(row.fallback?.map(item => item.catalogKey) ?? []), ...(row.choices ?? [])]) ?? [])];
  const chosenKey = itemKey || keys[0] || "";
  const apparentStock = prep?.stock.filter(row => row.areaId === area?.id && row.attemptId === undefined) ?? [];
  const visibleResolved = Boolean(area?.visibleOutcome || apparentStock.length);
  const deepKeys = keys.filter(key => !prep?.stock.some(row => row.areaId === area?.id && row.item.catalogKey === key && row.remaining > 0));
  const deepChosenKey = deepItemKey || deepKeys[0] || "";
  const deepChosenName = content.catalog.find(row => catalogKey(row) === deepChosenKey)?.name ?? deepChosenKey;
  const owners = [...people.map(row => ({ value: row.id, label: row.name })), ...(game.shelter.hex === request.hexId ? [{ value: "shared", label: "Estoque do abrigo" }] : [])];
  const scale = point ? locationScaleOf(point) : "medium";
  const deepUsed = point ? deepSearchesUsed(point) : 0;
  const deepLimit = point ? deepSearchLimit(point) : 0;
  const canResize = Boolean(point && prep && !prep.attempts.length && !prep.stock.length && !prep.collections.length && !point.searches.length);
  const normalMinutes = area ? (worker && area.minutes === 60 ? 30 : area.minutes) : 30;
  const normalTimePreview = participantTimePreview(game, participants, normalMinutes);
  const attemptTimePreview = attempt ? participantTimePreview(game, attempt.participants, attempt.minutes) : null;
  const deepTimePreview = participantTimePreview(game, participants, 30);
  const deepAttemptTimePreview = deepAttempt ? participantTimePreview(game, deepAttempt.participants, deepAttempt.minutes) : null;
  const selectedAreaState = point && area ? searchAreaSessionState(game, request.hexId, request.pointId, area) : "available";
  const stockUnits = stock.reduce((sum, row) => sum + row.remaining, 0);
  const collectionLines = collection ?? [];
  const selectedLines = collectionLines.filter(row => row.quantity > 0);
  const collectionPreview = collectionLines.some(line => !Number.isInteger(line.quantity) || line.quantity < 0)
    ? { error: "Use quantidades inteiras a partir de zero.", state: undefined }
    : previewSearchCollection(game, request.hexId, request.pointId, selectedLines);
  function updateCollection(stockId: string, index: number, patch: Partial<CollectionLine>) {
    setCollection(current => {
      const lines = current ?? [];
      const existing = lines.map((line, i) => ({ line, i })).filter(row => row.line.stockId === stockId)[index];
      if (existing) return lines.map((line, i) => i === existing.i ? { ...line, ...patch } : line);
      return [...lines, { stockId, ownerId: owners[0]?.value ?? "", quantity: 0, ...patch }];
    });
  }

  function act(fn: (draft: GameState) => string | null, message?: string) {
    let error: string | null = null;
    edit(draft => { error = fn(draft); });
    if (error) toast.error(error); else if (message) toast.success(message);
    return !error;
  }
  function configure(patch: Partial<SearchArea>) {
    if (!area || attempt) return;
    edit(draft => {
      const current = draft.hexes[request.hexId]?.points.find(row => row.id === request.pointId)?.preparation;
      const target = current?.areas.find(row => row.id === area.id);
      if (target && !current!.attempts.some(row => row.areaId === area.id) && (!patch.name || !current!.areas.some(row => row.id !== area.id && row.name.trim().toLocaleLowerCase("pt-BR") === patch.name!.trim().toLocaleLowerCase("pt-BR")))) Object.assign(target, patch);
    });
  }
  function selectArea(value: string) {
    setAreaId(value);
    setOperationId(createId());
    setWorker("");
    setItemKey("");
    setDeepItemKey("");
    setDeepOperationId(createId());
    setDeepActorId("");
    setVisibleSuggestion(null);
  }
  function changeScale(value: LocationScale) {
    if (!point || !canResize) return;
    let changed = false;
    edit(draft => {
      const target = draft.hexes[request.hexId]?.points.find(row => row.id === request.pointId);
      if (target) changed = resizeLocationPreparation(target, value);
    });
    if (changed) {
      setAreaId("");
      setOperationId(createId());
      toast.success(`Porte alterado para ${locationScaleLabels[value]}`, { description: "As áreas foram reorganizadas antes da primeira busca." });
    } else toast.error("O porte só pode ser alterado antes da primeira busca ou estoque registrado.");
  }
  function rerollVisibleSuggestion() {
    if (!area || visibleResolved) return;
    setVisibleSuggestion(suggestVisibleStock(area));
  }
  function acceptVisibleSuggestion() {
    if (!area || visibleSuggestion?.kind !== "item") return;
    const id = visibleId;
    if (act(draft => registerVisibleStock(draft, request.hexId, request.pointId, area.id, id,
      visibleSuggestion.catalogKey, visibleSuggestion.quantity), "Item aparente estabelecido")) {
      setVisibleId(createId());
      setVisibleSuggestion(null);
    }
  }
  function acceptNoVisibleStock() {
    if (!area) return;
    if (act(draft => resolveNoVisibleStock(draft, request.hexId, request.pointId, area.id), "Nada à vista estabelecido")) {
      setVisibleSuggestion(null);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="inventory-dialog hex-search-dialog search-session-dialog">
    <DialogHeader><DialogTitle>Explorar {point?.name ?? "local removido"}</DialogTitle><DialogDescription>Hex {request.hexId} · {hex?.sector?.name ?? "Local"} · Exploração e distribuição do grupo.</DialogDescription></DialogHeader>
    <SearchTabs value={tab} units={stockUnits} onChange={setTab} />
    <div className="search-session-body">
    {available && <p role="alert" className="text-sm text-red-700">{available}</p>}
    {!prep && point && <section className="hex-search-step"><h3>Preparar este local</h3><p className="text-sm subtle">Organiza áreas internas, resolve a camada de itens aparentes uma única vez e preserva buscas antigas.</p><Button onClick={() => edit(draft => { prepareLocationForExploration(draft, request.hexId, request.pointId); })}>Preparar exploração</Button></section>}
    {prep && area && <>
      {tab === "explore" && <div className="hex-search-workspace search-session-workspace">
        <SearchRooms rooms={prep.areas.map(row => ({ id: row.id, name: row.name, state: searchRoomLabel(searchAreaSessionState(game, request.hexId, request.pointId, row)), units: stock.filter(item => item.areaId === row.id).reduce((sum, item) => sum + item.remaining, 0) }))} selected={area.id} onChange={selectArea} />
        <div className="hex-search-area-detail">
          <section className="hex-search-step hex-search-area-intro">
            <div className="hex-search-area-title"><div><h3>{area.name}</h3></div>
              <span className={`hex-search-area-state is-${selectedAreaState}`}>
                {selectedAreaState === "proposed" ? "Busca proposta"
                  : selectedAreaState === "exhausted" ? "Esgotada"
                  : selectedAreaState === "deep-available" ? "Profunda disponível"
                  : selectedAreaState === "deep-ongoing" ? "Profunda em andamento"
                  : selectedAreaState === "searched" ? "Vasculhada"
                  : selectedAreaState === "ongoing" ? "Em andamento"
                  : area.searchable === false ? "Sem d12 próprio" : "Disponível"}
              </span>
            </div>
            <p className="text-sm">{area.signal}</p>
            <p className="text-xs subtle">{area.searchable === false ? "Exploração narrativa · sem rolagem de recursos" : `${area.minutes} min · Barulho +${area.noise} · ${area.access === "open" ? "acesso livre" : area.access === "risk" ? "acesso sob risco" : "acesso bloqueado"}`}</p>

          </section>

          {playerProposal?.status === "forming" && <section className="hex-search-step hex-search-player-proposal">
            <h3><Clock3 size={18} /> Busca proposta pelos jogadores</h3>
            <p className="text-sm"><b>{game.survivors.find(person => person.id === playerProposal.initiatorId)?.name ?? "Sobrevivente"}</b> propôs {playerProposal.depth === "deep" ? "uma busca profunda" : "uma busca"} neste cômodo.</p>
            <p className="text-sm subtle">{playerProposal.purpose || "Sem finalidade registrada"} · objetivo: {playerProposal.objective === "open" ? "vasculhar por achados" : playerProposal.objectiveLabel || quickSearchOptions(area).find(option => option.id === playerProposal.objective)?.label || playerProposal.objective || "não informado"}.</p>
            <p className="text-xs subtle">Participantes confirmados: {playerProposal.participantIds.map(id => game.survivors.find(person => person.id === id)?.name ?? "Sobrevivente").join(", ") || "nenhum"}. A área fica reservada até o grupo iniciar ou cancelar a proposta.</p>
          </section>}

          <span id="hex-search-action" className="hex-scroll-anchor" aria-hidden="true" />
          {area.searchable === false && <div className="hex-search-narrative-note"><Eye size={17} /><span><b>Área de exploração</b><small>Use-a para pistas, obstáculos, cenas e itens à vista. Ela não aumenta a quantidade de rolagens de saque do local.</small></span></div>}

          {area.searchable !== false && !attempt && !playerProposal && <section className="hex-search-step"><h3><Search size={18} /> Iniciar busca</h3>
            <Pick label="Objetivo do grupo" value={mode} options={[{ value: "open", label: "Vasculhar por achados · d12 do grupo" }, { value: "specific", label: "Procurar um item combinado" }]} onChange={value => setMode(value as "open" | "specific")} />
            {mode === "open" && <Field label="Finalidade geral da busca" value={purpose} onChange={setPurpose} />}
            {mode === "specific" && <><Field label="O que procuram?" value={objective} onChange={setObjective} /><Field label="Para quê?" value={purpose} onChange={setPurpose} /><Pick label="Item plausível combinado" value={chosenKey} options={content.catalog.filter(row => keys.includes(catalogKey(row)) || itemKey === catalogKey(row)).map(row => ({ value: catalogKey(row), label: row.name }))} onChange={setItemKey} /><details><summary className="cursor-pointer text-sm">Outro item justificado na ficção</summary><Pick label="Catálogo completo" value={chosenKey} options={content.catalog.map(row => ({ value: catalogKey(row), label: `${row.category} · ${row.name}` }))} onChange={setItemKey} /></details><p className="text-xs subtle">Busca específica encontra no máximo <b>1 unidade</b>. Se a ficção já estabelece uma quantidade maior, registre-a como item à vista.</p></>}
            <fieldset><legend className="field-label">Participantes presentes</legend><div className="flex flex-wrap gap-3">{people.map(person => { const commitment = commitmentById.get(person.id); return <label key={person.id} className="text-sm" title={commitment?.label}><input type="checkbox" disabled={Boolean(commitment)} checked={participants.includes(person.id)} onChange={event => setParticipants(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} /> {person.name}{commitment ? ` · ocupado até ${commitment.until}` : ""}</label>; })}</div><Button variant="ghost" size="sm" onClick={() => edit(draft => { draft.explorationPreferences = { ...draft.explorationPreferences, autoPrepare: draft.explorationPreferences?.autoPrepare ?? false, participantIds: participants }; })}>Usar estes participantes como padrão</Button></fieldset>
            {(area.spacious || area.minutes === 60) && warehouseWorkers(game, request.hexId).some(row => participants.includes(row.id)) && <Pick label="Habilidade de depósito · 1× por expedição" value={worker || "none"} options={[{ value: "none", label: "Guardar a habilidade para depois" }, ...warehouseWorkers(game, request.hexId).filter(row => participants.includes(row.id)).map(row => ({ value: row.id, label: `${row.name} · ${area.minutes === 60 ? "reduzir para 30 min" : "identificar melhor área; sem achado extra"}` }))]} onChange={value => setWorker(value === "none" ? "" : value)} />}
            {worker && area.minutes === 30 && <p className="text-sm">Melhores indícios conhecidos: {(prep.areas.find(row => row.searchable !== false && !prep.attempts.some(attempt => attempt.areaId === row.id) && row.access === "open") ?? area).name} · {(prep.areas.find(row => row.searchable !== false && !prep.attempts.some(attempt => attempt.areaId === row.id) && row.access === "open") ?? area).signal}. Confirme esses indícios com o mestre antes de começar.</p>}
            <p className="text-sm subtle">{normalMinutes} min · Barulho +{area.noise} · {area.access === "open" ? "Acesso livre" : area.access === "risk" ? `Teste ${area.difficulty}` : "Acesso bloqueado"}.{normalTimePreview.ok && normalTimePreview.overlapMinutes > 0 ? ` ${parallelTimeLabel(normalTimePreview)}.` : ""}</p>
            <Button disabled={Boolean(available) || !participants.length || area.access === "blocked"} onClick={() => { setAreaId(area.id); act(draft => resolvePreparedSearch(draft, { id: operationId, ...request, areaId: area.id, participants, mode, objective, purpose, catalogKey: chosenKey, quantity, warehouseWorker: worker || undefined })); }}>{area.access === "risk" ? "Iniciar busca e resolver acesso" : `Resolver busca · +${worker && area.minutes === 60 ? 30 : area.minutes} min`}</Button>
          </section>}

          {attempt && !done && <section className="hex-search-step"><h3><Clock3 size={18} /> Retomar busca</h3><p className="text-sm">{attempt.mode === "open" ? "Busca aberta do grupo" : `${attempt.objective} · ${attempt.purpose}`} · {attempt.minutes} min · Barulho +{attempt.noise}</p>
            {attempt.status === "pending" && <><Pick label="Quem executa o acesso?" value={actorId || attempt.participants[0]} options={people.filter(row => attempt.participants.includes(row.id)).map(row => ({ value: row.id, label: row.name }))} onChange={setActorId} /><RollForm key={`${attempt.id}:${actorId}`} game={game} edit={edit} request={{ survivorId: actorId || attempt.participants[0], kind: "action", trait: "Instinto", search: { ...request, attemptId: attempt.id, difficulty: area.difficulty } }} onCompleted={() => toast.success("Acesso registrado na busca")} /></>}
            {attempt.outcome && <div role="status" className="list-card text-sm"><b>{attempt.outcome.success ? "Sucesso" : "Falha"} · {attempt.outcome.total} · {attempt.outcome.with === "Hope" ? "Esperança" : "Medo"}</b>{attempt.outcome.with === "Fear" && <p>O mestre escolhe a complicação. Um sucesso mantém os achados prometidos.</p>}</div>}
            {attempt.status === "ready" && <>
              {(attempt.roll || attempt.mode === "specific" || attempt.outcome?.success === false) && <div className="list-card"><p className="text-sm">{attempt.roll ? `d12 ${attempt.roll} · ${area.table}` : "Resultado combinado"}</p><b>{searchResult(point!, attempt)}</b></div>}
              <p className="text-sm subtle">{attemptTimePreview?.ok ? `Ao confirmar: ${parallelTimeLabel(attemptTimePreview)}.` : "Esta busca não cabe mais no dia deste grupo."} O estoque fica no local até a coleta.</p>
              <Button disabled={Boolean(available)} onClick={() => { setAreaId(area.id); act(draft => finishPreparedSearch(draft, request.hexId, request.pointId, attempt.id), "Busca concluída; estoque salvo"); }}>{attempt.mode === "open" && attempt.outcome?.success !== false && !attempt.roll ? `Concluir busca e sortear achado · +${attempt.minutes} min` : "Confirmar resultado e tempo"}</Button>
            </>}
          </section>}
          {done && <section className="hex-search-step"><h3><CheckCircle2 size={18} /> Busca normal concluída nesta área</h3><p className="text-sm"><b>{attempt.mode === "open" ? `Busca geral${attempt.roll ? ` · d12 ${attempt.roll}` : ""}` : "Busca específica"}</b> · {attempt.result || "Nenhum achado útil."}</p>{stockUnits > 0 && <Button size="sm" variant="outline" onClick={() => setTab("finds")}>Ver achados</Button>}{attempt.adjustmentReason && <p className="text-xs subtle">d12 original {attempt.roll} → resultado {attempt.effectiveRoll}: {attempt.adjustmentReason}</p>}<p className="text-xs subtle">O registro e o estoque continuam salvos ao sair desta tela.</p></section>}

          {attempt?.status === "completed" && !deepAttempt && point && searchAreaState(point, area) === "deep-available" && <section className="hex-search-step hex-deep-search">
            <div className="hex-deep-search-heading"><div><h3><Search size={18} /> Vasculhar a fundo</h3><p className="text-sm subtle">Uma segunda camada limitada pelo porte do local. Não há novo d12 de saque.</p></div><span className="tag">Profundas {deepUsed}/{deepLimit}</span></div>
            <div className="hex-deep-search-costs">
              <span>30 min</span><span>Barulho +{Math.min(5, Math.max(1, area.noise + 1))}</span><span>Dificuldade 13</span><span>máx. 1 item</span>
            </div>
            {deepTimePreview.ok && deepTimePreview.overlapMinutes > 0 && <p className="text-sm subtle">{parallelTimeLabel(deepTimePreview)}.</p>}
            <p className="text-sm">Escolha algo plausível que o grupo procura em armários presos, fundos de móveis, compartimentos ou outros pontos que a busca normal não cobriu. Um teste de ação decide se ainda havia algo útil ali.</p>
            {deepKeys.length > 0 ? <>
              <Pick label="Foco da busca profunda" value={deepChosenKey}
                options={content.catalog.filter(row => deepKeys.includes(catalogKey(row))).map(row => ({ value: catalogKey(row), label: row.name }))}
                onChange={setDeepItemKey} />
              <fieldset><legend className="field-label">Participantes</legend><div className="flex flex-wrap gap-3">{people.map(person => { const commitment = commitmentById.get(person.id); return <label key={person.id} className="text-sm" title={commitment?.label}><input type="checkbox" disabled={Boolean(commitment)} checked={participants.includes(person.id)} onChange={event => setParticipants(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} /> {person.name}{commitment ? ` · ocupado até ${commitment.until}` : ""}</label>; })}</div></fieldset>
              <Button disabled={Boolean(available) || !participants.length || !deepChosenKey} onClick={() => {
                if (act(draft => startDeepSearch(draft, { id: deepOperationId, ...request, areaId: area.id, participants,
                  objective: deepChosenName, purpose: "Vasculhar a fundo algo que passou despercebido", catalogKey: deepChosenKey }), "Busca profunda preparada")) {
                  setDeepActorId("");
                }
              }}><Search size={16} /> Iniciar busca profunda</Button>
            </> : <p className="text-sm subtle">Não há outro tipo de achado plausível nesta tabela que ainda não esteja conhecido na área.</p>}
          </section>}

          {deepAttempt && ["pending", "ready"].includes(deepAttempt.status) && <section className="hex-search-step hex-deep-search">
            <div className="hex-deep-search-heading"><div><h3><ShieldAlert size={18} /> Busca profunda em andamento</h3><p className="text-sm subtle">{deepAttempt.objective} · 30 min · Barulho +{deepAttempt.noise}{deepAttemptTimePreview?.ok && deepAttemptTimePreview.overlapMinutes > 0 ? ` · ${parallelTimeLabel(deepAttemptTimePreview)}` : ""}</p></div><span className="tag">Instinto · 13</span></div>
            {deepAttempt.status === "pending" && <>
              <Pick label="Quem conduz a busca profunda?" value={deepActorId || deepAttempt.participants[0]}
                options={people.filter(row => deepAttempt.participants.includes(row.id)).map(row => ({ value: row.id, label: row.name }))}
                onChange={setDeepActorId} />
              <RollForm key={`deep:${deepAttempt.id}:${deepActorId}`} game={game} edit={edit}
                request={{ survivorId: deepActorId || deepAttempt.participants[0], kind: "action", trait: "Instinto",
                  search: { ...request, attemptId: deepAttempt.id, difficulty: 13 } }}
                onCompleted={() => toast.success("Teste da busca profunda registrado")} />
            </>}
            {deepAttempt.outcome && <div role="status" className="list-card text-sm"><b>{deepAttempt.outcome.success ? "Sucesso" : "Falha"} · {deepAttempt.outcome.total} · {deepAttempt.outcome.with === "Hope" ? "Esperança" : "Medo"}</b>
              <p className="mt-1">{deepAttempt.outcome.success ? `Achado possível: ${deepChosenName || deepAttempt.objective}.` : "Nenhum item extra será criado, mas tempo e Barulho ainda serão consumidos."}</p>
              {deepAttempt.outcome.with === "Fear" && <p className="mt-1">O mestre recebe Medo normalmente e pode introduzir uma complicação coerente.</p>}
            </div>}
            {deepAttempt.status === "ready" && <>
              <p className="text-sm subtle">{deepAttemptTimePreview?.ok ? `Ao confirmar: ${parallelTimeLabel(deepAttemptTimePreview)}.` : "Esta busca profunda não cabe mais no dia deste grupo."} Esta área ficará esgotada para novas buscas.</p>
              <Button disabled={Boolean(available)} onClick={() => act(draft => finishPreparedSearch(draft, request.hexId, request.pointId, deepAttempt.id), "Busca profunda concluída")}>Confirmar resultado · +30 min</Button>
            </>}
          </section>}

          {deepAttempt && ["completed", "failed"].includes(deepAttempt.status) && <section className="hex-search-step hex-deep-search-complete">
            <h3><CheckCircle2 size={18} /> Área esgotada</h3>
            <p className="text-sm">{deepAttempt.result || (deepAttempt.status === "failed" ? "A busca profunda não encontrou nada útil." : "Busca profunda concluída.")}</p>
            <p className="text-xs subtle">A área já recebeu a busca normal e a busca profunda. Itens que ficaram para trás continuam disponíveis no estoque do local.</p>
          </section>}
          <details className="search-session-settings"><summary>Preparação e ajustes · mestre</summary>
      <details className="hex-location-preparation">
        <summary>Porte do local <span>Porte {locationScaleLabels[scale]} · {prep.areas.length} áreas</span></summary>
        <div>
          <p className="text-xs subtle">Essas opções estruturam o local, mas não precisam ser revisadas durante toda busca.</p>
          {canResize ? <div className="hex-search-scale-controls">
            <Pick label="Porte antes da primeira busca" value={scale}
              options={(Object.entries(locationScaleLabels) as [LocationScale, string][]).map(([value,label]) => ({ value, label }))}
              onChange={value => changeScale(value as LocationScale)} />
            <Button size="sm" variant="outline" onClick={() => changeScale(scale)}>{prep.scale === undefined ? "Aplicar estrutura contextual" : "Atualizar áreas contextuais"}</Button>
          </div> : <p className="text-xs subtle">A estrutura foi fixada porque já existem buscas, achados ou histórico neste local.</p>}
        </div>
      </details>

            {!attempt && !playerProposal && <details><summary className="cursor-pointer text-sm font-bold">Revisar preparação do mestre</summary><div className="grid gap-3 mt-3">
              <label className="text-sm"><input type="checkbox" checked={area.searchable !== false} onChange={event => configure({ searchable: event.target.checked })} /> Esta área permite busca de recursos</label>
              <Field label="Nome do espaço" value={area.name} onChange={name => configure({ name })} />
              <Field label="Sinal desta área · confirme na ficção" value={area.signal} onChange={signal => configure({ signal })} />
              {area.searchable !== false && <Pick label="Tabela de achados desta área" value={area.table} options={content.lootTables.map(row => row.name)} onChange={table => configure({ table })} />}
              <Pick label="Acesso" value={area.access} options={[{ value: "open", label: "Livre · sem risco relevante" }, { value: "risk", label: "Sob risco · teste antes dos achados" }, { value: "blocked", label: "Bloqueado · resolver na ficção" }]} onChange={value => configure({ access: value as SearchArea["access"] })} />
              {area.access === "risk" && <Pick label="Dificuldade do acesso" value={String(area.difficulty)} options={["12", "13", "15"]} onChange={value => configure({ difficulty: Number(value) as SearchArea["difficulty"] })} />}
              {area.searchable !== false && <><Pick label="Tempo combinado" value={String(area.minutes)} options={[{ value: "30", label: "30 minutos" }, { value: "60", label: "1 hora · lugar amplo" }]} onChange={value => configure({ minutes: Number(value) as 30 | 60 })} />
              <Counter label="Barulho da ação" value={area.noise} max={5} onChange={noise => configure({ noise })} /></>}
              {["Obras / instalações em reforma", "Galpões / centros de distribuição"].includes(area.table) && area.searchable !== false && <label className="text-sm"><input type="checkbox" checked={area.armedGuard} onChange={event => configure({ armedGuard: event.target.checked })} /> Havia guarda armada neste espaço</label>}
              {area.table === "Ruas / veículos abandonados" && area.searchable !== false && <label className="text-sm"><input type="checkbox" checked={area.compatibleOwner} onChange={event => configure({ compatibleOwner: event.target.checked })} /> Dono ou conflito justifica arma neste espaço</label>}
              {area.table === "Delegacias / quartéis" && area.searchable !== false && <Pick label="Munição plausível" value={area.ammunition} options={["Pistola", "Espingarda", "Carabina"]} onChange={value => configure({ ammunition: value as SearchArea["ammunition"] })} />}
              {area.searchable !== false && <><label className="text-sm"><input type="checkbox" checked={area.spacious ?? false} onChange={event => configure({ spacious: event.target.checked })} /> Lugar amplo com indícios de achado</label>
              <label className="text-sm"><input type="checkbox" checked={area.collectible !== false} onChange={event => configure({ collectible: event.target.checked })} /> Achados podem ser recolhidos após o acesso</label>
              <details><summary>Resultados que contradizem fatos já estabelecidos</summary><p className="text-xs subtle">Marque antes de rolar. O sistema usa o próximo resultado plausível e conserva o dado original.</p><div className="flex flex-wrap gap-2">{content.lootTables.find(row => row.name === area.table)?.entries.map(row => <label key={row.roll} title={row.text}><input type="checkbox" checked={area.excludedRolls?.includes(row.roll) ?? false} onChange={event => configure({ excludedRolls: event.target.checked ? [...(area.excludedRolls ?? []), row.roll] : (area.excludedRolls ?? []).filter(value => value !== row.roll) })} /> {row.roll}</label>)}</div><Field label="Fato que justifica a exclusão" value={area.exclusionReason ?? ""} onChange={exclusionReason => configure({ exclusionReason })} /></details></>}
            </div></details>}
          <details className="hex-search-step"><summary className="cursor-pointer text-sm font-bold">Itens à vista · sem busca</summary>
            <p className="text-xs subtle">Esta camada é independente da busca. Ela serve para estabelecer objetos evidentes na cena sem gastar tempo ou Barulho.</p>

            <div className="hex-visible-generator">
              {visibleResolved ? <div className="hex-visible-resolved">
                {area.visibleOutcome === "none" && !apparentStock.length ? <><EyeOff size={18} /><span><b>Nada à vista</b><small>O mestre já estabeleceu que este cômodo não tem um achado evidente.</small></span></>
                  : <><Eye size={18} /><span><b>Item aparente já estabelecido</b><small>{apparentStock.length
                    ? apparentStock.map(row => `${row.remaining} × ${row.item.name}`).join(" · ")
                    : "Existe um achado aparente registrado nesta área."}</small></span></>}
              </div> : visibleSuggestion ? <div className={"hex-visible-suggestion " + (visibleSuggestion.kind === "item" ? "has-item" : "is-empty")}>
                <div className="hex-visible-suggestion-main">
                  {visibleSuggestion.kind === "item" ? <Sparkles size={19} /> : <EyeOff size={19} />}
                  <span>
                    <b>{visibleSuggestion.kind === "item" ? `${visibleSuggestion.quantity} × ${visibleSuggestion.itemName}` : "Nada evidente"}</b>
                    <small>{visibleSuggestion.reason}</small>
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {visibleSuggestion.kind === "item"
                    ? <Button size="sm" onClick={acceptVisibleSuggestion}>Aceitar</Button>
                    : <Button size="sm" onClick={acceptNoVisibleStock}>Aceitar nada à vista</Button>}
                  <Button size="sm" variant="outline" onClick={rerollVisibleSuggestion}><RefreshCw size={14} /> Rerrolar</Button>
                  {visibleSuggestion.kind === "item" && <Button size="sm" variant="ghost" onClick={acceptNoVisibleStock}><EyeOff size={14} /> Nada à vista</Button>}
                </div>
              </div> : <div className="hex-visible-generator-start">
                <div><Sparkles size={18} /><span><b>Sugestão procedural leve</b><small>Áreas buscáveis têm 35% de chance; áreas narrativas, 60%. Armas, munição e proteção não são sugeridas gratuitamente.</small></span></div>
                <Button size="sm" variant="outline" onClick={rerollVisibleSuggestion}><Sparkles size={14} /> Sugerir item aparente</Button>
              </div>}
            </div>

            <details className="hex-visible-manual"><summary>Registrar manualmente</summary>
              <p className="text-xs subtle">Use quando a ficção já estabelece um objeto específico ou uma quantidade conhecida. O registro manual também define que há item aparente nesta área.</p>
              <Pick label="Item conhecido" value={visibleKey} options={content.catalog.map(row => ({ value: catalogKey(row), label: row.name }))} onChange={setVisibleKey} />
              <Counter label="Quantidade à vista" value={visibleQuantity} min={1} max={99} onChange={setVisibleQuantity} />
              <Button variant="outline" onClick={() => {
                if (act(draft => registerVisibleStock(draft, request.hexId, request.pointId, area.id, visibleId, visibleKey, visibleQuantity), "Item conhecido registrado")) {
                  setVisibleId(createId()); setVisibleSuggestion(null);
                }
              }}>Registrar estoque à vista</Button>
            </details>
          </details>

          <details className="hex-search-add-area"><summary>+ Declarar outra área</summary><p className="text-xs subtle">Novas áreas começam como exploração narrativa para não criar loot extra automaticamente. O mestre pode habilitar uma busca ao revisar a preparação.</p>
            <Field label="Nome da área interna" value={newArea} onChange={setNewArea} />
            <Field label="Sinal que distingue este espaço" value={newSignal} onChange={setNewSignal} />
            <Button size="sm" variant="outline" disabled={!newArea.trim() || !newSignal.trim()} onClick={() => {
              if (act(draft => declareSearchArea(draft.hexes[request.hexId].points.find(row => row.id === request.pointId)!, newArea, newSignal) ? null : "A área já existe ou há uma busca em andamento. Declare um espaço distinto antes da busca.", "Área declarada")) {
                setNewArea(""); setNewSignal("");
              }
            }}>Registrar espaço</Button>
          </details>
          </details>
        </div>
      </div>}
    </>}
    {tab === "finds" && <section className="search-session-finds">
      <div className="search-session-finds-heading"><div><h3>Recolher achados</h3><p>Defina os destinos e confirme uma única coleta. Quantidade zero deixa o item no local.</p></div>
        <Button size="sm" variant="outline" disabled={Boolean(available) || !owners.length || !stock.length} onClick={() => { setCollection(suggestCollection(game, request.hexId, request.pointId, participants)); setCollectionId(createId()); }}>Sugerir distribuição</Button>
      </div>
      {people.length > 0 && <div className="search-session-capacities">{people.map(person => <SearchCapacity key={person.id} person={person} preview={collectionPreview.state?.survivors.find(row => row.id === person.id)} />)}</div>}
      {stock.length ? <div className="search-session-stock-list">{stock.map(row => {
        const assignments = collectionLines.filter(line => line.stockId === row.id);
        const displayed = assignments.length ? assignments : [{ stockId: row.id, ownerId: owners[0]?.value ?? "", quantity: 0 }];
        return <SearchStockRow key={row.id} name={row.item.name} category={row.item.category} source={row.attemptId ? "search" : "apparent"}
          room={prep?.areas.find(candidate => candidate.id === row.areaId)?.name ?? "Área"} remaining={row.remaining} condition={row.item.condition} battery={row.item.battery} fuel={row.requiresFuelContainer} locked={row.accessible === false}>
          {row.accessible === false ? <Button size="sm" variant="outline" onClick={() => edit(draft => { const found = draft.hexes[request.hexId].points.find(point => point.id === request.pointId)?.preparation?.stock.find(stock => stock.id === row.id); if (found) found.accessible = true; })}>Liberar acesso</Button>
            : <>
              {displayed.map((line, index) => <div key={index} className="search-session-assignment">
                <label>Destino<select aria-label={`Destino de ${row.item.name} · ${index + 1}`} value={line.ownerId} onChange={event => updateCollection(row.id, index, { ownerId: event.target.value, cartId: undefined })} disabled={!owners.length}>
                  {owners.map(owner => <option key={owner.value} value={owner.value}>{owner.label}</option>)}
                </select></label>
                <label>Transporte<select aria-label={`Transporte de ${row.item.name} · ${index + 1}`} value={line.cartId ?? "personal"} onChange={event => updateCollection(row.id, index, { cartId: event.target.value === "personal" ? undefined : event.target.value })}>
                  <option value="personal">{line.ownerId === "shared" ? "Estoque do abrigo" : row.requiresFuelContainer ? "Galão no inventário" : "Inventário"}</option>
                  {!row.requiresFuelContainer && row.item.name !== "Carrinho dobrável" && people.find(person => person.id === line.ownerId)?.inventory.filter(item => item.name === "Carrinho dobrável" && item.cartDeployed).map(item => <option key={item.id} value={item.id}>Carrinho aberto</option>)}
                </select></label>
                <label>Quantidade<input type="number" inputMode="numeric" aria-label={`Quantidade de ${row.item.name} · ${index + 1}`} value={line.quantity} min={0} max={row.remaining} onChange={event => updateCollection(row.id, index, { quantity: Number(event.target.value) })} /></label>
                {assignments.length > 1 && <Button size="sm" variant="ghost" aria-label={`Remover destino ${index + 1} de ${row.item.name}`} onClick={() => setCollection(current => { let position = -1; return (current ?? []).filter(entry => entry.stockId !== row.id || ++position !== index); })}>Remover</Button>}
              </div>)}
              {owners.length > 1 && <button className="search-session-split" type="button" onClick={() => setCollection(current => [...(current ?? []), ...(!assignments.length ? displayed : []), { stockId: row.id, ownerId: owners[0]?.value ?? "", quantity: 0 }])}>+ Dividir com outro destino</button>}
            </>}
        </SearchStockRow>;
      })}</div> : <p className="team-empty">Nenhum achado aguardando coleta neste local.</p>}
      {stock.length > 0 && <>
        <details className="search-session-settings"><summary>Preferência de transporte da sugestão</summary>
          <Pick label="Preferência da campanha" value={game.explorationPreferences?.transport ?? "personal-first"} options={[{ value: "personal-first", label: "Inventários, depois carrinhos abertos" }, { value: "cart-first", label: "Carrinhos abertos, depois inventários" }]} onChange={value => edit(draft => { draft.explorationPreferences = { autoPrepare: draft.explorationPreferences?.autoPrepare ?? false, participantIds: draft.explorationPreferences?.participantIds ?? [], transport: value as "personal-first" | "cart-first" }; })} />
          <p>A preferência será usada na próxima sugestão. Revise os destinos antes de confirmar.</p>
        </details>
        {collectionPreview.error && <p className="team-error" role="alert">{collectionPreview.error}</p>}
        <div className="search-session-confirm"><span>{selectedLines.reduce((sum, row) => sum + row.quantity, 0)} unidade(s) selecionada(s) · {Math.max(0, stockUnits - selectedLines.reduce((sum, row) => sum + row.quantity, 0))} ficam no local</span>
          <Button disabled={Boolean(available) || Boolean(collectionPreview.error) || !selectedLines.length} onClick={() => { if (act(draft => collectLocationStock(draft, request.hexId, request.pointId, collectionId, selectedLines), "Itens entregues aos destinos selecionados")) { setCollection(null); setCollectionId(createId()); } }}>Confirmar coleta</Button>
          {collection && <Button variant="ghost" size="sm" onClick={() => setCollection(null)}>Limpar seleção</Button>}
        </div>
      </>}
    </section>}
    {tab === "finds" && game.shelter.hex === request.hexId && people.length > 0 && <details><summary className="cursor-pointer text-sm font-bold">Guardar itens carregados no abrigo</summary><p className="text-sm subtle">Guarda os inventários dos participantes. Descarrega os carrinhos. Equipamentos vestidos e munição comprometida permanecem nas fichas.</p><ul className="text-sm list-disc pl-5">{people.filter(row => participants.includes(row.id)).map(row => <li key={row.id}>{row.name}: {row.inventory.filter(item => !item.cartDeployed && item.qty > (item.committedAmmo ?? 0)).map(item => `${item.qty - (item.committedAmmo ?? 0)} × ${item.name}`).join(", ") || "nenhum item solto"}{row.inventory.some(item => item.cartDeployed && item.cartItems?.length) ? " · inclui a carga do carrinho" : ""}</li>)}</ul><Button variant="outline" onClick={() => act(draft => depositExpeditionItems(draft, participants), "Itens guardados no abrigo")}>Guardar inventários dos participantes</Button></details>}
    {game.noise >= 3 && <p role="status" className="text-sm text-amber-800">Barulho {game.noise}/5: {game.noise >= 5 ? "anuncie a ameaça e a oportunidade de saída antes da próxima ação exposta" : "há sinais de investigação"}. O mestre conduz a consequência.</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Fechar · progresso salvo</Button></DialogFooter>
  </DialogContent></Dialog>;
}
