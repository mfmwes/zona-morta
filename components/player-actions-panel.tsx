"use client";

import { useRef, useState } from "react";
import { Check, Footprints, Handshake, MapPin, Package, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Pick } from "@/components/game-controls";
import { type PlayerActionPolicy } from "@/lib/player-actions-types";
import { playerActionState } from "@/lib/player-actions";
import { createId } from "@/lib/id";
import { hexDistance, type GameState } from "@/lib/game";
import { projectPlayerGame } from "@/lib/collaboration";
import { actionsInContext, type PlayerActionContext } from "@/lib/player-action-context";
import { traitLabel } from "@/lib/terminology";

const labels: Record<string, string> = { open: "Vasculhar", food: "Comida", water: "Água", medicine: "Medicamentos", parts: "Peças", fuel: "Combustível" };
const operationLabels = { search: "Busca", travel: "Viagem", transfer: "Entrega", rest: "Descanso", exception: "Pedido ao mestre" };
export type Send = (payload: Record<string, unknown>) => Promise<void>;

export type MasterActionControls = { canAct: boolean; send: Send; pending?: boolean };
export type MasterActionContext = PlayerActionContext | { kind: "overview" };

export function MasterContextActions({game, controls, context}: {game:GameState; controls:MasterActionControls; context:MasterActionContext}) {
  if (context.kind === "search" || context.kind === "rest") return null;
  return <PlayerActionsPanel game={game} master survivorId={null} canAct={controls.canAct} send={controls.send} context={context} hasPending={controls.pending} />;
}

export type PlayerActionControls = { actorId: string; canAct: boolean; send: Send; pending?: boolean; preview?: boolean };

export function PlayerContextActions({game, controls, context}: {game:GameState; controls:PlayerActionControls; context:PlayerActionContext}) {
  return <PlayerActionsPanel game={controls.preview ? projectPlayerGame(game,controls.actorId) : game} master={false} survivorId={controls.actorId} canAct={controls.canAct} send={controls.send} context={context} hasPending={controls.pending} preview={controls.preview} />;
}

export function PlayerActionsPanel({ game, master, survivorId, canAct, send, context, hasPending = false, preview = false }: {
  game: GameState; master: boolean; survivorId: string | null; canAct: boolean; send: Send; context: MasterActionContext; hasPending?: boolean; preview?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const retry = useRef<{ signature: string; payload: Record<string, unknown> } | null>(null);
  async function perform(input: Record<string, unknown>) {
    if (busy || !canAct) return false;
    const signature = JSON.stringify({ input });
    if (hasPending && retry.current && retry.current.signature !== signature) { setError("Tente novamente a ação pendente antes de iniciar outra."); return false; }
    const payload = (hasPending ? retry.current?.payload : undefined) ?? (master ? input : { ...input, id: createId(), day: game.day });
    setBusy(true); setError(""); setNotice("");
    try { await send(payload); retry.current = null; setCanRetry(false); setNotice("Ação registrada. A mesa recebeu a atualização."); return true; }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível registrar a ação.";
      // Respostas HTTP indicam rejeição; falhas de conexão preservam o identificador para reenvio seguro.
      if (cause instanceof TeamActionError && cause.rejected) { retry.current = null; setCanRetry(false); }
      else { retry.current = { signature, payload }; setCanRetry(true); }
      setError(message); return false;
    } finally { setBusy(false); }
  }
  return <section className="team-actions-panel">

    {!canAct && <p className="team-notice">{preview?"Prévia do jogador: as ações aparecem no contexto, mas sua execução está desativada nesta visualização.":"Aguarde o salvamento das alterações da campanha antes de agir."}</p>}
    {error && <div className="team-error" role="alert"><p>{error}</p>{canRetry && hasPending && <Button size="sm" variant="outline" disabled={busy || !canAct} onClick={() => perform(JSON.parse(retry.current!.signature).input)}>Tentar novamente a mesma ação</Button>}</div>}
    {notice && <p className="team-notice" role="status">{notice}</p>}
    <fieldset disabled={busy || !canAct} className="team-actions-fieldset" aria-busy={busy}>
      {master ? <MasterPermissions game={game} perform={perform} context={context} /> : survivorId && context.kind !== "overview" && <PlayerActivities game={game} actorId={survivorId} perform={perform} context={context} />}
    </fieldset>
  </section>;
}
export class TeamActionError extends Error {
  constructor(message: string, public rejected = false) { super(message); }
}

function MasterPermissions({ game, perform, context }: { game: GameState; perform: (payload: Record<string, unknown>) => Promise<boolean>; context:MasterActionContext }) {
  const state = playerActionState(game);
  const policy = state.policy;
  const [draft, setDraft] = useState<{ source: string; value: PlayerActionPolicy } | null>(null);
  const config = draft?.value ?? policy;
  function change(fn: (value: PlayerActionPolicy) => void) {
    const value = structuredClone(config); fn(value); setDraft({ source: draft?.source ?? JSON.stringify(policy), value });
  }

  const visibleHexes = Object.entries(game.hexes).filter(([, hex]) => hex.discovery !== "desconhecido");
  const [from] = useState(context.kind === "travel" ? context.destination ?? game.partyHex : game.partyHex);
  const [to, setTo] = useState("");
  const routeOptions = visibleHexes.filter(([id]) => {
    const [q, r] = from.split(",").map(Number), [tq, tr] = id.split(",").map(Number);
    return hexDistance(q - tq, r - tr) === 1;
  }).map(([value, h]) => ({ value, label: h.sector?.name ?? `Hex ${value}` }));
  const destination = routeOptions.some(o => o.value === to) ? to : routeOptions[0]?.value ?? "";
  const alerts = state.operations.filter(op => op.attention && op.day === game.day);
  const switches = context.kind === "overview" ? [["paused", "Pausar ações dos jogadores"]] as const
    : context.kind === "inventory" ? [["transfers", "Entregas entre sobreviventes, com confirmação"]] as const
    : context.kind === "supplies" ? [["deposits", "Depósito de itens próprios no abrigo"]] as const
    : context.kind === "scene" ? [["tokens", "Mover o próprio token e marcar posições reveladas"]] as const : [];
  return <>
    {switches.length > 0 && <section className="team-card"><h3><Users size={18} /> {context.kind === "overview" ? "Controle da mesa" : "Liberação para jogadores"}</h3>
      <div className="team-policy-options">{switches.map(([key, label]) => <label key={key}><input type="checkbox" checked={config[key]} onChange={e => change(p => { p[key] = e.target.checked; })} />{label}</label>)}</div>
      {context.kind === "overview" && <p className="subtle">Conflitos suspendem buscas, viagens e descansos. Falhas de acesso, Medo, barulho elevado e novos acontecimentos pausam as ações para você resolver a consequência. A coleta de achados já liberados permanece disponível durante a pausa.</p>}
    </section>}
    {context.kind === "travel" && <section className="team-card"><h3><Footprints size={18} /> Rotas liberadas</h3><p>Autorize cada sentido do trajeto. Os jogadores confirmam participação antes da partida.</p>
      <div className="team-form-row"><p>Partida: <b>{game.hexes[from]?.sector?.name ?? `Hex ${from}`}</b></p><Pick label="Destino adjacente" value={destination} options={routeOptions} onChange={setTo} /><Button variant="outline" disabled={!destination} onClick={() => change(p => { if (!p.routes.some(r => r.from === from && r.to === destination)) p.routes.push({from,to:destination}); })}>Liberar trajeto</Button></div>
      {config.routes.filter(r => r.from === from).map(r => <div className="team-route" key={r.from+'>'+r.to}><span>{game.hexes[r.from]?.sector?.name ?? r.from} → {game.hexes[r.to]?.sector?.name ?? r.to}</span><Button size="sm" variant="ghost" onClick={() => change(p => {p.routes=p.routes.filter(x=>x.from!==r.from || x.to!==r.to);})}>Remover liberação</Button></div>)}
    </section>}
    {context.kind === "supplies" && <section className="team-card"><h3><Package size={18} /> Retiradas do depósito</h3><p>Limite por sobrevivente, por dia. Retirar e devolver não renova a cota. Zero mantém a retirada reservada ao mestre.</p>
      <div className="team-form-row">{(['food','water'] as const).map(resource=><Field key={resource} label={resource==='food'?'Porções de Comida':'Porções de Água'} type="number" value={String(config.supplies[resource])} onChange={value=>change(p=>{p.supplies[resource]=Math.max(0,Math.min(20,Number(value)||0));})}/>)}</div>
      {(game.shelter.inventory??[]).map(item=><Field key={item.id} label={`${item.name} · ${item.qty} no depósito · limite diário`} type="number" value={String(config.supplies.items[item.id]??0)} onChange={value=>change(p=>{p.supplies.items[item.id]=Math.max(0,Math.min(20,Number(value)||0));})}/>)}
    </section>}
    {context.kind !== "overview" || draft ? <div className="team-policy-save"><Button disabled={!draft} onClick={async()=>{if(await perform({type:'policy',policy:config,expectedPolicy:draft?.source??JSON.stringify(policy)})) setDraft(null);}}>Salvar liberações</Button><Button variant="outline" disabled={!draft} onClick={()=>setDraft(null)}>Descartar rascunho</Button><small>As liberações passam a valer após o salvamento.</small></div> : null}
    {context.kind === "overview" && alerts.length > 0 && <section className="team-card"><h3>Pedidos e consequências · {alerts.length}</h3>{alerts.length?alerts.map(op=><div className="team-operation" key={op.id}><b>{operationLabels[op.type]} · {game.survivors.find(p=>p.id===op.initiatorId)?.name}</b><p>{op.attention}</p><p>{op.purpose}</p>{op.result&&<p>{op.result}</p>}<Button size="sm" variant="outline" onClick={()=>perform({type:'review',operationId:op.id})}>Marcar como resolvido</Button></div>):<p className="team-empty">Nenhum pedido ou consequência aguardando avaliação.</p>}<p className="subtle">Após resolver a consequência, desmarque a pausa acima e salve as liberações. Bloqueios e exceções são tratados pelas ferramentas habituais.</p></section>}
  </>;
}

function PlayerActivities({ game, actorId, perform, context }: { game: GameState; actorId: string; context: PlayerActionContext; perform: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const view = game.publicPlayerActions && context ? actionsInContext(game.publicPlayerActions, context) : undefined;
  const actor = game.survivors.find(p=>p.id===actorId);
  const section=context.kind==='supplies'?'inventory':context.kind;
  const [selectedArea,setSelectedArea]=useState('');
  const [objective,setObjective]=useState('open');
  const [purpose,setPurpose]=useState('Encontrar suprimentos para a equipe');
  const [targetId,setTargetId]=useState('');
  const [itemId,setItemId]=useState('');
  const [quantity,setQuantity]=useState('1');
  const [request,setRequest]=useState('');
  const [trait,setTrait]=useState('Instinto');
  const [experiences,setExperiences]=useState<string[]>([]);
  const [marker,setMarker]=useState('Olhem aqui');
  const position=context.kind==='scene'?context.position:undefined;
  const x=String(position?.x??0), y=String(position?.y??0);
  if(!view || !actor) return <p className="team-empty">Atualize a campanha para carregar suas ações disponíveis.</p>;
  const areas=view.areas.filter(a=>a.available && a.access!=='blocked' && a.objectives.length > 0);
  const area=areas.find(a=>a.areaId===selectedArea)??areas[0];
  const goal=area?.objectives.includes(objective)?objective:area?.objectives[0]??'open';
  const peers=view.peers.filter(p=>p.id!==actorId && p.hex===view.hexId);
  const recipient=peers.some(p=>p.id===targetId)?targetId:peers[0]?.id??'';
  const items=actor.inventory.filter(i=>i.qty>(i.committedAmmo??0));
  const item=items.find(i=>i.id===itemId)??items[0];
  const count=Number(quantity), validCount=Number.isInteger(count)&&count>0&&count<=99;
  const ops=view.operations.filter(o=>o.status==='forming'||o.status==='access'||o.status==='scheduled');
  const name=(id:string)=>view.peers.find(p=>p.id===id)?.name??'Sobrevivente';
  return <>
    {view.policy.paused&&<p className="team-notice">Ações pausadas. O mestre está resolvendo a situação da cena.</p>}
    {view.busy&&<p className="team-notice">{view.busy}</p>}

    {ops.filter(op=>!op.individualChoices).length > 0 && <section className="team-card"><h3><Users size={18}/> Operações propostas · {ops.length}</h3>{ops.length?ops.filter(op=>!op.individualChoices).map(op=>{
      const member=op.participantIds.includes(actorId), owner=op.initiatorId===actorId;
      const canJoin=op.status==='forming'&&op.type!=='exception'&&!member&&(op.type!=='transfer'||op.invitedIds.includes(actorId));
      return <div className="team-operation" key={op.id}><b>{operationLabels[op.type]} · {name(op.initiatorId)}{op.type==='search'&&` · ${view.areas.find(a=>a.areaId===op.areaId)?.name??'Área de busca'}`}</b><p>{op.purpose|| (op.type==='rest'?`Descanso ${op.kind==='short'?'curto':'longo'}`:op.type==='travel'?`Destino: ${view.routes.find(r=>r.destination===op.destination)?.name??op.destination}`:'Busca proposta')}</p><small>Confirmados: {op.participantIds.map(name).join(', ')}</small><div className="team-inline-actions">{canJoin&&<Button size="sm" onClick={()=>perform({type:'join',operationId:op.id})}><Check size={14}/>{op.type==='transfer'?'Confirmar recebimento':'Confirmar participação'}</Button>}{(member||op.invitedIds.includes(actorId))&&op.status==='forming'&&<Button size="sm" variant="outline" onClick={()=>perform({type:'leave',operationId:op.id})}>{owner||op.type==='transfer'?'Cancelar proposta':'Sair da operação'}</Button>}{owner&&op.status==='forming'&&['search','travel','rest'].includes(op.type)&&<Button size="sm" disabled={view.policy.paused} onClick={()=>perform({type:'execute',operationId:op.id})}>{op.type==='search'?'Iniciar busca':op.type==='rest'?'Iniciar descanso':'Confirmar partida'}</Button>}</div>
        {op.status==='scheduled'&&<p className="team-notice">Atividade em andamento; aguarde a conclusão na linha do tempo.</p>}{owner&&op.status==='access'&&<div className="team-access-roll"><Pick label="Atributo de acesso" value={trait} options={Object.keys(actor.attributes).map(value=>({value,label:traitLabel(value)}))} onChange={setTrait}/><div className="team-objectives">{[['origin','Experiência de origem'],['free','Experiência livre']].map(([key,label])=><label key={key}><input type="checkbox" checked={experiences.includes(key)} onChange={e=>setExperiences(current=>e.target.checked?[...current,key]:current.filter(v=>v!==key))}/>{label} · +2 por 1 Esperança</label>)}</div><p>Declare a abordagem na mesa. Modificadores e vantagens excepcionais são resolvidos pelo mestre.</p><Button disabled={view.policy.paused||experiences.length>actor.hope} onClick={()=>perform({type:'roll-access',operationId:op.id,trait,experiences})}>Rolar acesso</Button></div>}
      </div>;
    }):<p className="team-empty">Nenhuma operação aguardando participação.</p>}</section>}
    {section==='search'&&<>
      <section className="team-card"><h3><Search size={18}/> Propor uma busca</h3>{area?<><Pick label="Cômodo ou área deste local" value={area.areaId} options={areas.map(a=>({value:a.areaId,label:a.name}))} onChange={setSelectedArea}/><p>{area.signal}</p><div className="team-form-row"><Pick label="Objetivo da busca" value={goal} options={area.objectives.map(value=>({value,label:labels[value]}))} onChange={setObjective}/><Field label="Finalidade da busca" value={purpose} onChange={setPurpose}/></div><p>{area.minutes} min · Barulho +{area.noise} · {area.access==='risk'?'Teste de acesso necessário':'Acesso livre'}. Uma busca do grupo por área.</p><Button disabled={Boolean(view.busy)||view.policy.paused||!purpose.trim()} onClick={()=>perform({type:'search',hexId:area.hexId,pointId:area.pointId,areaId:area.areaId,objective:goal,purpose})}>Propor busca e aguardar participantes</Button><p className="subtle">Depois das confirmações, quem propôs inicia a operação. Uma busca específica encontra no máximo uma unidade, conforme as regras.</p></>:<p className="team-empty">Não há um cômodo disponível para busca neste local. Áreas ocultas, bloqueadas ou já vasculhadas continuam indisponíveis.</p>}</section>
      <section className="team-card"><h3><Package size={18}/> Achados disponíveis</h3><Field label="Quantidade a recolher" type="number" value={quantity} onChange={setQuantity}/>{view.stock.length?view.stock.map(s=><div className="team-stock" key={s.stockId}><span><b>{s.name}</b><small>{s.remaining} unidade(s) no local</small></span><Button size="sm" disabled={!validCount||count>s.remaining||!s.accessible} onClick={()=>perform({type:'collect',hexId:s.hexId,pointId:s.pointId,stockId:s.stockId,quantity:count})}>Recolher para minha mochila</Button></div>):<p className="team-empty">Os achados aparecem aqui após a busca ou quando o mestre libera itens à vista.</p>}<p className="subtle">A capacidade é conferida antes de recolher. O restante permanece no local. A pausa de novas ações não impede recolher achados já liberados.</p></section>
    </>}
    {section==='inventory'&&<>
      <section className="team-card"><h3><Handshake size={18}/> {context.kind==='supplies'?'Depositar meus itens':'Entregar meus itens'}</h3><div className="team-form-row"><Pick label="Item da minha mochila" value={item?.id??''} options={items.map(i=>({value:i.id,label:`${i.name} · ${i.qty-(i.committedAmmo??0)} disponíveis`}))} onChange={setItemId}/><Field label="Quantidade" type="number" value={quantity} onChange={setQuantity}/>{context.kind!=='supplies'&&<Pick label="Destinatário presente" value={recipient} options={peers.map(p=>({value:p.id,label:p.name}))} onChange={setTargetId}/>}</div><div className="team-inline-actions">{context.kind!=='supplies'&&<Button disabled={!view.policy.transfers||!item||!recipient||!validCount||view.policy.paused} onClick={()=>perform({type:'offer',targetId:recipient,itemId:item!.id,quantity:count})}>Oferecer item ao sobrevivente</Button>}{context.kind==='supplies'&&<Button variant="outline" disabled={!view.policy.deposits||!item||!validCount||view.policy.paused} onClick={()=>perform({type:'deposit',itemId:item!.id,quantity:count})}>Depositar no abrigo</Button>}</div><p className="subtle">{context.kind==='supplies'?'Depósito exige presença no local das reservas.':'A entrega só acontece quando o destinatário aceita.'}</p></section>
      {context.kind==='supplies'&&<section className="team-card"><h3>Retirar suprimentos liberados</h3><Field label="Quantidade a retirar" type="number" value={quantity} onChange={setQuantity}/>{view.supplies.filter(s=>s.allowance>0).map(s=><div className="team-stock" key={s.key}><span><b>{s.name}</b><small>{s.available} disponíveis · sua cota restante: {s.allowance}</small></span><Button size="sm" disabled={!validCount||count>Math.min(s.available,s.allowance)||view.policy.paused} onClick={()=>perform({type:'withdraw',resource:s.itemId?'item':s.key,itemId:s.itemId,quantity:count})}>Retirar para minha mochila</Button></div>)}{!view.supplies.some(s=>s.allowance>0)&&<p className="team-empty">Sem retirada liberada disponível na sua posição. Consulte o mestre.</p>}</section>}
    </>}
    {section==='rest'&&<section className="team-card"><h3>Descanso da mesa</h3>{view.operations.some(op=>op.type==='rest'&&op.individualChoices&&op.status==='forming'&&op.invitedIds.includes(actorId))?<p>Há um descanso solicitado. Escolha e confirme suas duas ações na própria ficha, em <b>Seu descanso</b>.</p>:<div className="team-inline-actions"><Button disabled={view.policy.paused||Boolean(view.busy)} onClick={()=>perform({type:'request-rest',kind:'short'})}>Solicitar descanso curto · 1h</Button><Button variant="outline" disabled={view.policy.paused||Boolean(view.busy)} onClick={()=>perform({type:'request-rest',kind:'long'})}>Solicitar descanso longo · 6h</Button></div>}</section>}
    {section==='travel'&&<section className="team-card"><h3><Footprints size={18}/> Propor deslocamento</h3>{view.routes.length?view.routes.map(r=><div className="team-stock" key={r.destination}><span><b>{r.name}</b><small>{r.minutes} min · cada participante confirma sua presença</small></span><Button size="sm" disabled={Boolean(view.busy)||view.policy.paused} onClick={()=>perform({type:'travel',destination:r.destination})}>Propor viagem</Button></div>):<p className="team-empty">O mestre ainda não liberou uma rota de saída deste hex.</p>}<p className="subtle">A partida move apenas os sobreviventes que confirmaram. O tempo e os compromissos são conferidos antes da viagem.</p></section>}
    {section==='scene'&&<section className="team-card"><h3><MapPin size={18}/> Meu token e marcações</h3><p>Selecione uma posição na cena acima para mover seu token ou criar uma marcação. Apenas posições reveladas da cena ativa estão disponíveis.</p>{game.sceneBoard?.scenes.flatMap(scene=>scene.objects.filter(o=>o.kind==='token'&&o.tokenKind==='survivor'&&o.refId===actorId).map(o=><div className="team-operation" key={o.id}><b>{o.label} · {scene.name}</b><p>Posição {o.x}, {o.y}</p><Button size="sm" disabled={!view.policy.tokens||Boolean(o.locked)||view.policy.paused||!position} onClick={()=>perform({type:'token',sceneId:scene.id,objectId:o.id,x:Number(x),y:Number(y),beforeX:o.x,beforeY:o.y})}>Mover para a posição selecionada</Button><div className="team-inline-actions">{[[0,-20,'Acima'],[-20,0,'Esquerda'],[20,0,'Direita'],[0,20,'Abaixo']].map(([dx,dy,label])=><Button size="sm" variant="outline" key={label} disabled={!view.policy.tokens||Boolean(o.locked)||view.policy.paused} onClick={()=>perform({type:'token',sceneId:scene.id,objectId:o.id,x:o.x+Number(dx),y:o.y+Number(dy),beforeX:o.x,beforeY:o.y})}>{label}</Button>)}</div></div>))}<div className="team-form-row"><p>Posição selecionada: {position?`${x}, ${y}`:'clique na cena acima'}</p><Field label="Marcação temporária" value={marker} onChange={setMarker}/></div><div className="team-inline-actions"><Button disabled={!view.policy.tokens||!game.sceneBoard?.activeSceneId||view.policy.paused||!marker.trim()||!position} onClick={()=>perform({type:'marker',sceneId:game.sceneBoard!.activeSceneId,x:Number(x),y:Number(y),label:marker})}>Marcar posição revelada</Button><Button variant="outline" onClick={()=>perform({type:'clear-marker'})}>Remover minha marcação</Button></div><p className="subtle">Uma marcação por jogador. Ela desaparece ao mudar a cena ou o dia.</p></section>}
    <details className="team-card"><summary>Pedido fora das liberações</summary><h3 className="sr-only">Pedido fora das liberações</h3><Field label="O que pretende fazer e por quê?" multiline value={request} onChange={setRequest}/><Button variant="outline" disabled={!request.trim()} onClick={()=>perform({type:'request',text:request})}>Pedir avaliação ao mestre</Button><p className="subtle">Use para objetivos excepcionais, bloqueios e situações que dependam da ficção.</p></details>
    {view.operations.some(o=>o.status==='done')&&<details className="team-card"><summary>Operações concluídas neste dia</summary>{view.operations.filter(o=>o.status==='done').map(o=><p key={o.id}><b>{operationLabels[o.type]}</b> · {o.result??o.purpose??'Concluída'}</p>)}</details>}
  </>;
}
