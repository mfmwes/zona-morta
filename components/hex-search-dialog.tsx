"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Counter, Field, Pick } from "@/components/game-controls";
import { content, displayTime, survivorsAtHex, type GameState } from "@/lib/game";
import { createId } from "@/lib/id";
import { catalogKey } from "@/lib/inventory";
import { searchAvailabilityError } from "@/lib/exploration";
import { collectLocationStock, finishPreparedSearch, declareSearchArea, depositExpeditionItems, lootDefinitions, prepareLocation, registerVisibleStock, resolvePreparedSearch, searchResult, suggestCollection, warehouseWorkers, type CollectionLine } from "@/lib/hex-automation";
import { RollForm } from "@/components/roll-dialog";
import type { SearchArea } from "@/lib/hex-automation-types";
export type HexSearchRequest = { hexId: string; pointId: string; participantIds?: string[] };
export function HexSearchDialog({ game, edit, request, onClose }: { game: GameState; edit: (fn: (draft: GameState) => void) => void; request: HexSearchRequest; onClose: () => void }) {
  const hex = game.hexes[request.hexId];
  const point = hex?.points.find(row => row.id === request.pointId);
  const prep = point?.preparation;
  const people = survivorsAtHex(game, request.hexId);
  const [areaId, setAreaId] = useState("");
  const [mode, setMode] = useState<"open" | "specific">("open");
  const [objective, setObjective] = useState("");
  const [purpose, setPurpose] = useState("Suprimentos úteis para o grupo");
  const [itemKey, setItemKey] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [participants, setParticipants] = useState(() => {
    const present = people.map(row => row.id);
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
  const area = prep?.areas.find(row => row.id === areaId) ?? prep?.areas.find(row => prep.attempts.some(attempt => attempt.areaId === row.id && ["pending", "ready"].includes(attempt.status))) ?? prep?.areas.find(row => prep.stock.some(stock => stock.areaId === row.id && stock.remaining > 0)) ?? prep?.areas.find(row => !prep.attempts.some(attempt => attempt.areaId === row.id)) ?? prep?.areas[0];
  const attempt = prep?.attempts.find(row => row.areaId === area?.id);
  const available = searchAvailabilityError(game, request.hexId, request.pointId);
  const done = attempt && ["completed", "failed"].includes(attempt.status);
  const stock = prep?.stock.filter(row => row.remaining > 0) ?? [];
  const keys = [...new Set(lootDefinitions.find(row => row.table === area?.table)?.entries.flatMap(row => [...row.items.map(item => item.catalogKey), ...(row.fallback?.map(item => item.catalogKey) ?? []), ...(row.choices ?? [])]) ?? [])];
  const chosenKey = itemKey || keys[0] || "";
  const owners = [...people.map(row => ({ value: row.id, label: row.name })), ...(game.shelter.hex === request.hexId ? [{ value: "shared", label: "Estoque do abrigo" }] : [])];
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
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="inventory-dialog hex-search-dialog sm:max-w-2xl">
    <DialogHeader><DialogTitle>Buscar em {point?.name ?? "local removido"}</DialogTitle><DialogDescription>Prepare uma vez. Retome buscas e recolha os achados que ainda estão no local.</DialogDescription></DialogHeader>
    <div className="hex-location-path"><span><small>Setor do mapa · Hex {request.hexId}</small><b>{hex?.sector?.name ?? "Não revelado"}</b></span><span><small>Local neste setor</small><b>{point?.name ?? "Removido"}</b></span></div>
    {available && <p role="alert" className="text-sm text-red-700">{available}</p>}
    {!prep && point && <section className="hex-search-step"><h3>Preparar este local</h3><p className="text-sm subtle">Organiza áreas internas e preserva buscas antigas. Revise acesso e sinais antes de iniciar.</p><Button onClick={() => edit(draft => { const target = draft.hexes[request.hexId].points.find(row => row.id === request.pointId); if (target) prepareLocation(target); })}>Preparar áreas e buscas</Button></section>}
    {prep && area && <>
      <section className="hex-search-step"><h3><span>1</span> Área interna</h3>
        <Pick label="Onde dentro deste local?" value={area.id} options={prep.areas.map(row => ({ value: row.id, label: `${row.name}${prep.attempts.some(search => search.areaId === row.id) ? " · busca registrada" : " · disponível"}` }))} onChange={value => { setAreaId(value); setOperationId(createId()); setWorker(""); setItemKey(""); }} />
        <p className="text-sm">{area.signal}</p><p className="text-xs subtle">Cada área existe antes da busca e pode ser vasculhada uma vez pelo grupo.</p>
        {!attempt && <details><summary className="cursor-pointer text-sm font-bold">Revisar preparação do mestre</summary><div className="grid gap-3 mt-3">
          <Field label="Nome do espaço · antes da busca" value={area.name} onChange={name => configure({ name })} /><Field label="Sinal desta área · confirme na ficção" value={area.signal} onChange={signal => configure({ signal })} /><Pick label="Tabela de achados" value={area.table} options={content.lootTables.map(row => row.name)} onChange={table => configure({ table })} />
          <Pick label="Acesso" value={area.access} options={[{ value: "open", label: "Livre · sem risco relevante" }, { value: "risk", label: "Sob risco · teste antes dos achados" }, { value: "blocked", label: "Bloqueado · resolver na ficção" }]} onChange={value => configure({ access: value as SearchArea["access"] })} />
          {area.access === "risk" && <Pick label="Dificuldade do acesso" value={String(area.difficulty)} options={["12", "13", "15"]} onChange={value => configure({ difficulty: Number(value) as SearchArea["difficulty"] })} />}
          <Pick label="Tempo combinado" value={String(area.minutes)} options={[{ value: "30", label: "30 minutos" }, { value: "60", label: "1 hora · lugar amplo" }]} onChange={value => configure({ minutes: Number(value) as 30 | 60 })} />
          <Counter label="Barulho da ação" value={area.noise} max={5} onChange={noise => configure({ noise })} />
          {["Obras / instalações em reforma", "Galpões / centros de distribuição"].includes(area.table) && <label className="text-sm"><input type="checkbox" checked={area.armedGuard} onChange={event => configure({ armedGuard: event.target.checked })} /> Havia guarda armada neste espaço</label>}
          {area.table === "Ruas / veículos abandonados" && <label className="text-sm"><input type="checkbox" checked={area.compatibleOwner} onChange={event => configure({ compatibleOwner: event.target.checked })} /> Dono ou conflito justifica arma neste espaço</label>}
          {area.table === "Delegacias / quartéis" && <Pick label="Munição plausível" value={area.ammunition} options={["Pistola", "Espingarda", "Carabina"]} onChange={value => configure({ ammunition: value as SearchArea["ammunition"] })} />}
          <label className="text-sm"><input type="checkbox" checked={area.spacious ?? false} onChange={event => configure({ spacious: event.target.checked })} /> Lugar amplo com indícios de achado</label><label className="text-sm"><input type="checkbox" checked={area.collectible !== false} onChange={event => configure({ collectible: event.target.checked })} /> Achados podem ser recolhidos após o acesso</label>
          <details><summary>Resultados que contradizem fatos já estabelecidos</summary><p className="text-xs subtle">Marque antes de rolar. O sistema usa o próximo resultado plausível e conserva o dado original.</p><div className="flex flex-wrap gap-2">{content.lootTables.find(row => row.name === area.table)?.entries.map(row => <label key={row.roll} title={row.text}><input type="checkbox" checked={area.excludedRolls?.includes(row.roll) ?? false} onChange={event => configure({ excludedRolls: event.target.checked ? [...(area.excludedRolls ?? []), row.roll] : (area.excludedRolls ?? []).filter(value => value !== row.roll) })} /> {row.roll}</label>)}</div><Field label="Fato que justifica a exclusão" value={area.exclusionReason ?? ""} onChange={exclusionReason => configure({ exclusionReason })} /></details>
        </div></details>}
        <details><summary className="cursor-pointer text-sm font-bold">Declarar outra área que existe no local</summary><Field label="Nome da área interna" value={newArea} onChange={setNewArea} /><Field label="Sinal que distingue este espaço" value={newSignal} onChange={setNewSignal} /><Button variant="outline" disabled={!newArea.trim() || !newSignal.trim()} onClick={() => act(draft => declareSearchArea(draft.hexes[request.hexId].points.find(row => row.id === request.pointId)!, newArea, newSignal) ? null : "A área já existe ou há uma busca em andamento. Declare um espaço distinto antes da busca.", "Área declarada")}>Registrar espaço distinto</Button></details>
      </section>
      <details className="hex-search-step"><summary className="cursor-pointer text-sm font-bold">Registrar algo à vista · sem busca</summary>
        <Pick label="Item conhecido" value={visibleKey} options={content.catalog.map(row => ({ value: catalogKey(row), label: row.name }))} onChange={setVisibleKey} />
        <Counter label="Quantidade à vista" value={visibleQuantity} min={1} max={99} onChange={setVisibleQuantity} />
        <Button variant="outline" onClick={() => act(draft => registerVisibleStock(draft, request.hexId, request.pointId, area.id, visibleId, visibleKey, visibleQuantity), "Item conhecido registrado")}>Registrar estoque à vista</Button>
        <Button size="sm" variant="ghost" onClick={() => setVisibleId(createId())}>Registrar outro achado distinto</Button>
      </details>
      {!attempt && <section className="hex-search-step"><h3><span>2</span> Iniciar busca</h3>
        <div className="flex flex-wrap gap-2">{[{ label: "Água", pattern: /água|suco|isotônica/i, purpose: "Beber durante a viagem" }, { label: "Comida", pattern: /ração|conserva|bolacha|cereal|fruta|raíz|arroz/i, purpose: "Alimentar o grupo" }, { label: "Medicamentos", pattern: /tratamento|clínica|antissepsia/i, purpose: "Tratar ferimentos" }, { label: "Peças", pattern: /Peças/i, purpose: "Reparar equipamentos" }, { label: "Combustível", pattern: /Combustível/i, purpose: "Abastecer equipamentos" }].map(option => {
          const key = keys.find(key => option.pattern.test(key));
          return <Button key={option.label} size="sm" variant="outline" disabled={!key} onClick={() => { setMode("specific"); setObjective(option.label); setPurpose(option.purpose); setItemKey(key!); setQuantity(1); }}>{option.label}</Button>;
        })}</div>
        <Pick label="Objetivo do grupo" value={mode} options={[{ value: "open", label: "Vasculhar por achados · d12 do grupo" }, { value: "specific", label: "Procurar um item combinado" }]} onChange={value => setMode(value as "open" | "specific")} />
        {mode === "open" && <Field label="Finalidade geral da busca" value={purpose} onChange={setPurpose} />}
        {mode === "specific" && <><Field label="O que procuram?" value={objective} onChange={setObjective} /><Field label="Para quê?" value={purpose} onChange={setPurpose} /><Pick label="Item plausível combinado" value={chosenKey} options={content.catalog.filter(row => keys.includes(catalogKey(row)) || itemKey === catalogKey(row)).map(row => ({ value: catalogKey(row), label: row.name }))} onChange={setItemKey} /><details><summary className="cursor-pointer text-sm">Outro item justificado na ficção</summary><Pick label="Catálogo completo" value={chosenKey} options={content.catalog.map(row => ({ value: catalogKey(row), label: `${row.category} · ${row.name}` }))} onChange={setItemKey} /></details><Counter label="Quantidade prometida" value={quantity} min={1} max={99} onChange={setQuantity} /></>}
        <fieldset><legend className="field-label">Participantes presentes</legend><div className="flex flex-wrap gap-3">{people.map(person => <label key={person.id} className="text-sm"><input type="checkbox" checked={participants.includes(person.id)} onChange={event => setParticipants(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} /> {person.name}</label>)}</div><Button variant="ghost" size="sm" onClick={() => edit(draft => { draft.explorationPreferences = { ...draft.explorationPreferences, autoPrepare: draft.explorationPreferences?.autoPrepare ?? false, participantIds: participants }; })}>Usar estes participantes como padrão</Button></fieldset>
        {(area.spacious || area.minutes === 60) && warehouseWorkers(game, request.hexId).some(row => participants.includes(row.id)) && <Pick label="Habilidade de depósito · 1× por expedição" value={worker || "none"} options={[{ value: "none", label: "Guardar a habilidade para depois" }, ...warehouseWorkers(game, request.hexId).filter(row => participants.includes(row.id)).map(row => ({ value: row.id, label: `${row.name} · ${area.minutes === 60 ? "reduzir para 30 min" : "identificar melhor área; sem achado extra"}` }))]} onChange={value => setWorker(value === "none" ? "" : value)} />}
        {worker && area.minutes === 30 && <p className="text-sm">Melhores indícios conhecidos: {(prep.areas.find(row => !prep.attempts.some(attempt => attempt.areaId === row.id) && row.access === "open") ?? area).name} · {(prep.areas.find(row => !prep.attempts.some(attempt => attempt.areaId === row.id) && row.access === "open") ?? area).signal}. Confirme esses indícios com o mestre antes de começar.</p>}
        <p className="text-sm subtle">{worker && area.minutes === 60 ? 30 : area.minutes} min · Barulho +{area.noise} · {area.access === "open" ? "Acesso livre" : area.access === "risk" ? `Teste ${area.difficulty}` : "Acesso bloqueado"}.</p>
        <Button disabled={Boolean(available) || !participants.length || area.access === "blocked"} onClick={() => { setAreaId(area.id); act(draft => resolvePreparedSearch(draft, { id: operationId, ...request, areaId: area.id, participants, mode, objective, purpose, catalogKey: chosenKey, quantity, warehouseWorker: worker || undefined })); }}>{area.access === "risk" ? "Iniciar busca e resolver acesso" : `Resolver busca · +${worker && area.minutes === 60 ? 30 : area.minutes} min`}</Button>
      </section>}
      {attempt && !done && <section className="hex-search-step"><h3><span>2</span> Retomar busca</h3><p className="text-sm">{attempt.mode === "open" ? "Busca aberta do grupo" : `${attempt.objective} · ${attempt.purpose}`} · {attempt.minutes} min · Barulho +{attempt.noise}</p>
        {attempt.status === "pending" && <><Pick label="Quem executa o acesso?" value={actorId || attempt.participants[0]} options={people.filter(row => attempt.participants.includes(row.id)).map(row => ({ value: row.id, label: row.name }))} onChange={setActorId} /><RollForm key={`${attempt.id}:${actorId}`} game={game} edit={edit} request={{ survivorId: actorId || attempt.participants[0], kind: "action", trait: "Instinto", search: { ...request, attemptId: attempt.id, difficulty: area.difficulty } }} onCompleted={() => toast.success("Acesso registrado na busca")} /></>}
        {attempt.outcome && <div role="status" className="list-card text-sm"><b>{attempt.outcome.success ? "Sucesso" : "Falha"} · {attempt.outcome.total} · {attempt.outcome.with === "Hope" ? "Esperança" : "Medo"}</b>{attempt.outcome.with === "Fear" && <p>O mestre escolhe a complicação. Um sucesso mantém os achados prometidos.</p>}</div>}
        {attempt.status === "ready" && <>
          {(attempt.roll || attempt.mode === "specific" || attempt.outcome?.success === false) && <div className="list-card"><p className="text-sm">{attempt.roll ? `d12 ${attempt.roll} · ${area.table}` : "Resultado combinado"}</p><b>{searchResult(point!, attempt)}</b></div>}
          <p className="text-sm subtle">Ao confirmar: {displayTime(game.minutes)} → {displayTime(game.minutes + attempt.minutes)}. O estoque fica no local até a coleta.</p>
          <Button disabled={Boolean(available)} onClick={() => { setAreaId(area.id); act(draft => finishPreparedSearch(draft, request.hexId, request.pointId, attempt.id), "Busca concluída; estoque salvo"); }}>{attempt.mode === "open" && attempt.outcome?.success !== false && !attempt.roll ? `Concluir busca e sortear achado · +${attempt.minutes} min` : "Confirmar resultado e tempo"}</Button>
        </>}
      </section>}
      {done && <section className="hex-search-step"><h3>Busca concluída nesta área</h3><p className="text-sm">{attempt.result}</p>{attempt.adjustmentReason && <p className="text-xs subtle">d12 original {attempt.roll} → resultado {attempt.effectiveRoll}: {attempt.adjustmentReason}</p>}<p className="text-xs subtle">O registro e o estoque continuam salvos ao sair desta tela.</p></section>}
    </>}
    {stock.length > 0 && <Pick label="Transporte preferido da campanha" value={game.explorationPreferences?.transport ?? "personal-first"} options={[{ value: "personal-first", label: "Usar inventários, depois carrinhos abertos" }, { value: "cart-first", label: "Usar carrinhos abertos, depois inventários" }]} onChange={value => edit(draft => { draft.explorationPreferences = { autoPrepare: draft.explorationPreferences?.autoPrepare ?? false, participantIds: draft.explorationPreferences?.participantIds ?? [], transport: value as "personal-first" | "cart-first" }; setCollection(null); })} />}
    {stock.length > 0 && <section className="hex-search-step"><h3>Achados disponíveis no local</h3><p className="text-sm subtle">Recolher itens acessíveis não exige outra busca. O excesso permanece aqui.</p>
      {stock.map(row => <div key={row.id} className="flex justify-between gap-3 text-sm"><span>{row.item.name}{row.requiresFuelContainer ? " · exige galão vazio" : ""}{row.item.condition === "Estragado" ? " · estragado" : ""}</span><b>{row.remaining} {row.accessible === false ? "com posse ou acesso pendente" : "disponível(is)"}</b>{row.accessible === false && <Button size="sm" variant="outline" onClick={() => edit(draft => { const found = draft.hexes[request.hexId].points.find(point => point.id === request.pointId)?.preparation?.stock.find(stock => stock.id === row.id); if (found) found.accessible = true; })}>Liberar após resolver na ficção</Button>}</div>)}
      {!collection ? <Button variant="outline" disabled={Boolean(available)} onClick={() => { setCollection(suggestCollection(game, request.hexId, request.pointId, participants)); setCollectionId(createId()); }}>Sugerir distribuição pela capacidade</Button> : <>
        {collection.map((line, index) => <div key={`${line.stockId}:${index}`} className="grid gap-2 border rounded p-2"><b className="text-sm">{stock.find(row => row.id === line.stockId)?.item.name}{line.cartId ? " · no carrinho" : ""}</b><Pick label="Quem carrega?" value={line.ownerId} options={owners} onChange={ownerId => setCollection(current => current!.map((row, i) => i === index ? { ...row, ownerId, cartId: undefined } : row))} /><Pick label="Como transportar?" value={line.cartId || "personal"} options={[{ value: "personal", label: "Inventário pessoal" }, ...people.find(person => person.id === line.ownerId)?.inventory.filter(item => item.name === "Carrinho dobrável" && item.cartDeployed).map(item => ({ value: item.id, label: "Carrinho aberto · até 4 espaços" })) ?? []]} onChange={value => setCollection(current => current!.map((row, i) => i === index ? { ...row, cartId: value === "personal" ? undefined : value } : row))} /><Counter label="Quantidade a recolher" value={line.quantity} max={stock.find(row => row.id === line.stockId)?.remaining ?? 0} onChange={quantity => setCollection(current => current!.map((row, i) => i === index ? { ...row, quantity } : row))} /></div>)}
        {stock.map(row => <Button key={row.id} size="sm" variant="ghost" onClick={() => setCollection(current => [...current!, { stockId: row.id, ownerId: owners[0]?.value ?? "", quantity: 1 }])}>Adicionar {row.item.name} à coleta</Button>)}
        <Button disabled={Boolean(available) || !collection.some(row => row.quantity > 0)} onClick={() => { if (act(draft => collectLocationStock(draft, request.hexId, request.pointId, collectionId, collection.filter(row => row.quantity > 0)), "Itens entregues aos inventários")) { setCollection(null); setCollectionId(createId()); } }}>Confirmar coleta</Button><Button variant="ghost" onClick={() => setCollection(null)}>Refazer distribuição</Button>
      </>}
    </section>}
    {game.shelter.hex === request.hexId && people.length > 0 && <details><summary className="cursor-pointer text-sm font-bold">Guardar itens carregados no abrigo</summary><p className="text-sm subtle">Guarda os inventários dos participantes. Descarrega os carrinhos. Equipamentos vestidos e munição comprometida permanecem nas fichas.</p><ul className="text-sm list-disc pl-5">{people.filter(row => participants.includes(row.id)).map(row => <li key={row.id}>{row.name}: {row.inventory.filter(item => !item.cartDeployed && item.qty > (item.committedAmmo ?? 0)).map(item => `${item.qty - (item.committedAmmo ?? 0)} × ${item.name}`).join(", ") || "nenhum item solto"}{row.inventory.some(item => item.cartDeployed && item.cartItems?.length) ? " · inclui a carga do carrinho" : ""}</li>)}</ul><Button variant="outline" onClick={() => act(draft => depositExpeditionItems(draft, participants), "Itens guardados no abrigo")}>Guardar inventários dos participantes</Button></details>}
    {game.noise >= 3 && <p role="status" className="text-sm text-amber-800">Barulho {game.noise}/5: {game.noise >= 5 ? "anuncie a ameaça e a oportunidade de saída antes da próxima ação exposta" : "há sinais de investigação"}. O mestre conduz a consequência.</p>}
    <DialogFooter><Button variant="outline" onClick={onClose}>Fechar · progresso salvo</Button></DialogFooter>
  </DialogContent></Dialog>;
}
