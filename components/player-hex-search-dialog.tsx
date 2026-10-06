"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, Clock3, Package, Search, ShieldAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Pick } from "@/components/game-controls";
import { actionsInContext } from "@/lib/player-action-context";
import { createId } from "@/lib/id";
import { traitLabel } from "@/lib/terminology";
import type { GameState } from "@/lib/game";
import type { PlayerActionControls } from "@/components/player-actions-panel";
import type { PublicSearchAreaState } from "@/lib/player-actions-types";

export type PlayerHexSearchRequest = { hexId: string; pointId: string };

const objectiveLabels: Record<string, string> = {
  open: "Vasculhar por achados",
  food: "Comida",
  water: "Água",
  medicine: "Medicamentos",
  parts: "Peças",
  fuel: "Combustível",
};

const stateLabels: Record<PublicSearchAreaState, string> = {
  available: "Disponível",
  ongoing: "Busca em andamento",
  "deep-available": "Busca profunda disponível",
  "deep-ongoing": "Busca profunda em andamento",
  exhausted: "Esgotada",
  searched: "Vasculhada",
  narrative: "Exploração narrativa",
};

function stateIcon(state: PublicSearchAreaState) {
  if (state === "ongoing" || state === "deep-ongoing") return Clock3;
  if (state === "available" || state === "deep-available") return Search;
  if (state === "narrative") return Circle;
  return CheckCircle2;
}

export function PlayerHexSearchDialog({
  game,
  controls,
  request,
  onClose,
}: {
  game: GameState;
  controls: PlayerActionControls;
  request: PlayerHexSearchRequest;
  onClose: () => void;
}) {
  const context = { kind: "search" as const, hexId: request.hexId, pointId: request.pointId };
  const view = game.publicPlayerActions ? actionsInContext(game.publicPlayerActions, context) : undefined;
  const actor = game.survivors.find(person => person.id === controls.actorId);
  const point = game.hexes[request.hexId]?.points.find(row => row.id === request.pointId);
  const location = view?.locations[0];
  const [selectedArea, setSelectedArea] = useState("");
  const [objective, setObjective] = useState("open");
  const [purpose, setPurpose] = useState("Encontrar suprimentos úteis para o grupo");
  const [trait, setTrait] = useState("Instinto");
  const [experiences, setExperiences] = useState<string[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const preparationRequested = useRef(false);

  const areas = view?.areas ?? [];
  const activeOperation = view?.operations.find(op => ["forming", "access"].includes(op.status));
  const preferredAreaId = activeOperation?.areaId
    ?? areas.find(area => area.state === "available")?.areaId
    ?? areas.find(area => area.state === "deep-available")?.areaId
    ?? areas[0]?.areaId;
  const area = areas.find(row => row.areaId === selectedArea)
    ?? areas.find(row => row.areaId === preferredAreaId)
    ?? areas[0];
  const operation = view?.operations.find(op => ["forming", "access"].includes(op.status) && (!area || op.areaId === area.areaId));
  const stock = view?.stock ?? [];
  const stockUnits = stock.reduce((sum, row) => sum + row.remaining, 0);
  const peers = view?.peers.filter(person => person.hex === view.hexId) ?? [];
  const member = Boolean(operation?.participantIds.includes(controls.actorId));
  const owner = operation?.initiatorId === controls.actorId;
  const deep = area?.state === "deep-available";
  const objectives = useMemo(() => {
    if (!area) return [];
    const values = deep ? area.objectives.filter(value => value !== "open") : area.objectives;
    return values.map(value => ({ value, label: objectiveLabels[value] ?? value }));
  }, [area, deep]);
  const goal = objectives.some(option => option.value === objective)
    ? objective
    : objectives[0]?.value ?? (deep ? "" : "open");
  const count = Number(quantity);
  const validCount = Number.isInteger(count) && count > 0 && count <= 99;

  async function perform(input: Record<string, unknown>, success?: string) {
    if (busy || !controls.canAct) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await controls.send({ ...input, id: createId(), day: game.day });
      if (success) setNotice(success);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a ação.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!location || location.prepared || preparationRequested.current || busy || !controls.canAct) return;
    preparationRequested.current = true;
    void perform({ type: "prepare-search", hexId: request.hexId, pointId: request.pointId }, "Áreas do local organizadas automaticamente.")
      .then(ok => { if (!ok) preparationRequested.current = false; });
    // perform is intentionally driven by the latest projected location state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.prepared, location?.pointId, controls.canAct, request.hexId, request.pointId]);

  function selectArea(id: string) {
    setSelectedArea(id);
    setObjective("open");
    setError("");
    setNotice("");
  }

  const nextAction = !location?.prepared
    ? "Organizando as áreas deste local"
    : operation
      ? operation.status === "access" ? "Resolver o acesso da busca" : "Confirmar participantes e iniciar"
      : stockUnits > 0
        ? "Há achados esperando coleta"
        : area?.state === "available"
          ? `Decida como vasculhar ${area.name}`
          : area?.state === "deep-available"
            ? `Vasculhe ${area.name} a fundo`
            : area?.state === "narrative"
              ? "Explore este espaço pela ficção"
              : "Escolha outra área para continuar";

  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="inventory-dialog hex-search-dialog sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>Explorar {point?.name ?? location?.pointName ?? "local"}</DialogTitle>
        <DialogDescription>
          Escolha uma área, organize quem participa, resolva a busca e recolha os achados. O sistema cuida da preparação e das validações automaticamente.
        </DialogDescription>
      </DialogHeader>

      <div className="hex-location-path">
        <span><small>Setor do mapa · Hex {request.hexId}</small><b>{game.hexes[request.hexId]?.sector?.name ?? "Não revelado"}</b></span>
        <span><small>Local neste setor</small><b>{point?.name ?? location?.pointName ?? "Local"}</b></span>
      </div>

      {!controls.canAct && <p className="team-notice">Aguarde a sincronização da campanha antes de agir.</p>}
      {error && <p className="team-error" role="alert">{error}</p>}
      {notice && <p className="team-notice" role="status">{notice}</p>}

      {!location?.prepared ? <section className="hex-search-step">
        <h3><Clock3 size={18} /> Preparando exploração</h3>
        <p className="text-sm subtle">O sistema está organizando os cômodos e limites de busca deste local. Isso não gasta tempo e não exige liberação do mestre.</p>
        {!busy && <Button variant="outline" onClick={() => {
          preparationRequested.current = false;
          void perform({ type: "prepare-search", hexId: request.hexId, pointId: request.pointId }, "Áreas do local organizadas automaticamente.");
        }}>Tentar novamente</Button>}
      </section> : <>
        <div className="hex-search-location-summary">
          <div>
            <span className="tag">{location.areaCount} áreas internas</span>
            <b>{location.searchedAreas} vasculhada(s) · {location.availableAreas} disponível(is)</b>
            <small>{location.narrativeAreas} narrativa(s){location.stockUnits ? ` · ${location.stockUnits} item(ns) aguardando coleta` : ""}{location.activeSearches ? ` · ${location.activeSearches} busca(s) em andamento` : ""}</small>
          </div>
        </div>

        <nav className="hex-search-flow" aria-label="Fluxo de exploração do local">
          <button type="button" className="is-done"><span>1</span><b>Cômodo</b><small>{area?.name ?? "Escolher"}</small></button>
          <button type="button" className={operation ? "is-active" : area && ["searched", "exhausted", "deep-available"].includes(area.state) ? "is-done" : ""}><span>2</span><b>Buscar</b><small>{operation ? "em andamento" : area ? stateLabels[area.state] : "escolher área"}</small></button>
          <button type="button" className={stockUnits ? "is-active" : ""}><span>3</span><b>Recolher</b><small>{stockUnits ? `${stockUnits} item(ns) no local` : "quando houver achados"}</small></button>
        </nav>

        <section className="hex-search-recommended">
          <div><small>PRÓXIMA AÇÃO</small><b>{nextAction}</b>
            <p>{operation
              ? operation.status === "access" ? "Quem iniciou resolve o teste; o resultado e o custo são registrados para toda a mesa." : "Outros sobreviventes presentes podem confirmar participação antes de começar."
              : stockUnits ? "Recolher não exige uma nova busca. O que não couber continua salvo no local."
              : area?.state === "deep-available" ? "A busca profunda custa 30 minutos, aumenta o Barulho e exige um teste. O sistema só oferece focos plausíveis para esta área."
              : area?.state === "available" ? "Você pode vasculhar livremente ou focar uma categoria plausível. Nenhuma autorização manual do mestre é necessária."
              : "As limitações desta área continuam sendo aplicadas pelo sistema."}</p>
          </div>
        </section>

        <div className="hex-search-workspace">
          <aside className="hex-search-area-panel" aria-label="Áreas internas do local">
            <div className="hex-search-area-panel-head"><b>Áreas do local</b><small>Escolha onde agir</small></div>
            <div className="hex-search-area-list">
              {areas.map(row => {
                const Icon = stateIcon(row.state);
                const remaining = stock.filter(item => item.areaId === row.areaId).reduce((sum, item) => sum + item.remaining, 0);
                return <button type="button" key={row.areaId}
                  className={`hex-search-area-card ${row.areaId === area?.areaId ? "is-active" : ""} is-${row.state}`}
                  aria-pressed={row.areaId === area?.areaId} onClick={() => selectArea(row.areaId)}>
                  <Icon size={16} aria-hidden="true" />
                  <span><b>{row.name}</b><small>{stateLabels[row.state]}{remaining ? ` · ${remaining} item(ns) no local` : ""}</small></span>
                </button>;
              })}
            </div>
          </aside>

          <div className="hex-search-area-detail">
            {area && <section className="hex-search-step hex-search-area-intro">
              <div className="hex-search-area-title">
                <div><span className="tag">{area.searchable ? "Área buscável" : "Exploração narrativa"}</span><h3>{area.name}</h3></div>
                <span className={`hex-search-area-state is-${area.state}`}>{stateLabels[area.state]}</span>
              </div>
              <p className="text-sm">{area.signal}</p>
              <p className="text-xs subtle">{area.searchable
                ? `${area.minutes} min · Barulho +${area.noise} · ${area.access === "open" ? "acesso livre" : area.access === "risk" ? "acesso sob risco" : "acesso bloqueado"}.`
                : "Este espaço existe na exploração, mas não concede uma rolagem própria de recursos."}</p>
            </section>}

            {area && !operation && (area.state === "available" || area.state === "deep-available") && <section className={`hex-search-step ${deep ? "hex-deep-search" : ""}`}>
              <h3>{deep ? <><ShieldAlert size={18} /> Vasculhar a fundo</> : <><Search size={18} /> Iniciar busca</>}</h3>
              {objectives.length ? <>
                <Pick label={deep ? "Foco plausível" : "Objetivo da busca"} value={goal} options={objectives} onChange={setObjective} />
                <Field label="Finalidade da busca" value={purpose} onChange={setPurpose} />
                <p className="text-sm subtle">{deep ? "30 min · Barulho adicional · teste necessário · máximo 1 item." : `${area.minutes} min · Barulho +${area.noise} · ${area.access === "risk" ? "teste de acesso necessário" : "acesso livre"}.`}</p>
                <Button disabled={busy || Boolean(view?.busy) || view?.policy.paused || area.access === "blocked" || !purpose.trim() || !goal}
                  onClick={() => void perform({
                    type: deep ? "deep-search" : "search",
                    hexId: area.hexId,
                    pointId: area.pointId,
                    areaId: area.areaId,
                    objective: goal,
                    purpose,
                  }, deep ? "Busca profunda proposta ao grupo." : "Busca proposta ao grupo.")}>
                  {deep ? "Propor busca profunda" : "Propor busca"}
                </Button>
                <p className="text-xs subtle">Você começa como participante. Outros sobreviventes presentes podem entrar antes de quem propôs iniciar a busca.</p>
              </> : <p className="team-empty">Nenhum foco automático plausível foi encontrado para esta área. Escolha outro cômodo ou resolva um objetivo excepcional pela ficção.</p>}
            </section>}

            {operation && <section className="hex-search-step">
              <h3><Users size={18} /> {operation.depth === "deep" ? "Busca profunda proposta" : "Busca em grupo"}</h3>
              <p className="text-sm">{operation.purpose}</p>
              <p className="text-xs subtle">Confirmados: {operation.participantIds.map(id => view?.peers.find(peer => peer.id === id)?.name ?? "Sobrevivente").join(", ")}</p>
              {operation.status === "forming" && <div className="team-inline-actions">
                {!member && <Button size="sm" onClick={() => void perform({ type: "join", operationId: operation.id }, "Participação confirmada.")}>Participar</Button>}
                {member && <Button size="sm" variant="outline" onClick={() => void perform({ type: "leave", operationId: operation.id }, owner ? "Busca cancelada." : "Você saiu da busca.")}>{owner ? "Cancelar proposta" : "Sair da busca"}</Button>}
                {owner && <Button size="sm" disabled={Boolean(view?.busy) || view?.policy.paused} onClick={() => void perform({ type: "execute", operationId: operation.id }, operation.depth === "deep" ? "Busca profunda iniciada." : "Busca iniciada.")}>Iniciar busca</Button>}
              </div>}
              {operation.status === "access" && owner && actor && <div className="team-access-roll">
                <Pick label="Atributo do teste" value={trait} options={Object.keys(actor.attributes).map(value => ({ value, label: traitLabel(value) }))} onChange={setTrait} />
                <div className="team-objectives">
                  {([["origin", "Experiência de origem"], ["free", "Experiência livre"]] as const).map(([key,label]) => <label key={key}>
                    <input type="checkbox" checked={experiences.includes(key)} onChange={event => setExperiences(current => event.target.checked ? [...current,key] : current.filter(value => value !== key))} />
                    {label} · +2 por 1 Esperança
                  </label>)}
                </div>
                <Button disabled={experiences.length > actor.hope || view?.policy.paused} onClick={() => void perform({ type: "roll-access", operationId: operation.id, trait, experiences }, "Teste resolvido e busca concluída.")}>Rolar acesso e concluir busca</Button>
              </div>}
              {operation.status === "access" && !owner && <p className="team-notice">Aguardando quem iniciou a busca resolver o acesso.</p>}
            </section>}

            {area && !operation && ["searched", "exhausted"].includes(area.state) && <section className="hex-search-step">
              <h3><CheckCircle2 size={18} /> Área já vasculhada</h3>
              <p className="text-sm subtle">Não há outra busca disponível aqui. Achados que ficaram para trás continuam na etapa de coleta.</p>
            </section>}

            {area?.state === "narrative" && <section className="hex-search-narrative-note">
              <Circle size={17} /><span><b>Exploração narrativa</b><small>Use este espaço para pistas, obstáculos e elementos visíveis. Ele não cria uma rolagem extra de saque.</small></span>
            </section>}
          </div>
        </div>

        <section className="hex-search-step hex-search-collection">
          <div className="hex-search-collection-heading">
            <div><p className="dossier-title">ETAPA 3</p><h3>Recolher achados</h3><p className="text-sm subtle">Recolher não exige uma nova busca. Sua capacidade é validada antes de mover o item.</p></div>
            <span className="tag">{stockUnits} item(ns)</span>
          </div>
          {stock.length ? <>
            <Field label="Quantidade a recolher" type="number" value={quantity} onChange={setQuantity} />
            <div className="hex-search-stock-list">
              {stock.map(row => <div key={row.stockId} className={`hex-search-stock-row ${row.accessible ? "" : "is-locked"}`}>
                <span><b>{row.name}</b><small>{areas.find(candidate => candidate.areaId === row.areaId)?.name ?? "Área"}</small></span>
                <strong>{row.remaining}</strong>
                <Button size="sm" disabled={busy || !row.accessible || !validCount || count > row.remaining || view?.policy.paused}
                  onClick={() => void perform({ type: "collect", hexId: row.hexId, pointId: row.pointId, stockId: row.stockId, quantity: count }, "Item recolhido para sua mochila.")}>Recolher</Button>
              </div>)}
            </div>
          </> : <p className="team-empty">Nenhum achado aguardando coleta neste local.</p>}
        </section>
      </>}

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Fechar</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
