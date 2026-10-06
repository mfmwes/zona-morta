"use client";

import { useRef, useState } from "react";
import { Check, Footprints, Handshake, MapPin, Package, Search, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Pick } from "@/components/game-controls";
import { type PlayerActionPolicy } from "@/lib/player-actions-types";
import { playerActionState } from "@/lib/player-actions";
import { createId } from "@/lib/id";
import { hexDistance, type GameState } from "@/lib/game";
import type { SceneBoardScene } from "@/lib/scene-board";
import { traitLabel } from "@/lib/terminology";

const labels: Record<string, string> = { open: "Vasculhar", food: "Comida", water: "Água", medicine: "Medicamentos", parts: "Peças", fuel: "Combustível" };
const operationLabels = { search: "Busca", travel: "Viagem", transfer: "Entrega", rest: "Descanso", exception: "Pedido ao mestre" };
type Send = (payload: Record<string, unknown>) => Promise<void>;

export function PlayerActionsPanel({ game, master, survivorId, canAct, send }: {
  game: GameState; master: boolean; survivorId: string | null; canAct: boolean; send: Send;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canRetry, setCanRetry] = useState(false);
  const retry = useRef<{ signature: string; payload: Record<string, unknown> } | null>(null);
  async function perform(input: Record<string, unknown>) {
    if (busy || !canAct) return false;
    const signature = JSON.stringify({ input });
    if (retry.current && retry.current.signature !== signature) { setError("Tente novamente a ação pendente antes de iniciar outra."); return false; }
    const payload = retry.current?.payload ?? (master ? input : { ...input, id: createId(), day: game.day });
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
    <header className="team-actions-intro"><ShieldCheck size={26} /><div><h2>Ações da equipe</h2><p>{master ? "Libere atividades uma vez. A equipe executa dentro desses limites; exceções e consequências continuam com você." : "Aja com as liberações do mestre. Você confirma apenas a participação e os recursos do seu sobrevivente."}</p></div></header>
    {!canAct && <p className="team-notice">Aguarde o salvamento das alterações da campanha antes de agir.</p>}
    {error && <div className="team-error" role="alert"><p>{error}</p>{canRetry && <Button size="sm" variant="outline" disabled={busy || !canAct} onClick={() => perform(JSON.parse(retry.current!.signature).input)}>Tentar novamente a mesma ação</Button>}</div>}
    {notice && <p className="team-notice" role="status">{notice}</p>}
    <fieldset disabled={busy || !canAct} className="team-actions-fieldset" aria-busy={busy}>
      {master ? <MasterPermissions game={game} perform={perform} /> : survivorId && <PlayerActivities game={game} actorId={survivorId} perform={perform} />}
    </fieldset>
  </section>;
}
export class TeamActionError extends Error {
  constructor(message: string, public rejected = false) { super(message); }
}

function MasterPermissions({ game, perform }: { game: GameState; perform: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const state = playerActionState(game);
  const policy = state.policy;
  const [draft, setDraft] = useState<{ source: string; value: PlayerActionPolicy } | null>(null);
  const config = draft?.value ?? policy;
  function change(fn: (value: PlayerActionPolicy) => void) {
    const value = structuredClone(config); fn(value); setDraft({ source: draft?.source ?? JSON.stringify(policy), value });
  }
  const prepared = Object.entries(game.hexes).flatMap(([hexId, hex]) => hex.discovery === "explorado" ? hex.points.filter(p => p.revealed && p.preparation).flatMap(point => point.preparation!.areas.map(area => ({ hexId, point, area }))) : []);
  const visibleHexes = Object.entries(game.hexes).filter(([, hex]) => hex.discovery !== "desconhecido");
  const [from, setFrom] = useState(game.partyHex);
  const [to, setTo] = useState("");
  const routeOptions = visibleHexes.filter(([id]) => {
    const [q, r] = from.split(",").map(Number), [tq, tr] = id.split(",").map(Number);
    return hexDistance(q - tq, r - tr) === 1;
  }).map(([value, h]) => ({ value, label: h.sector?.name ?? `Hex ${value}` }));
  const destination = routeOptions.some(o => o.value === to) ? to : routeOptions[0]?.value ?? "";
  const alerts = state.operations.filter(op => op.attention && op.day === game.day);
  return <>
    <section className="team-card"><h3><Users size={18} /> Liberações da campanha</h3>
      <div className="team-policy-options">{([['paused','Pausar ações da equipe'],['transfers','Entregas entre sobreviventes, com confirmação'],['deposits','Depósito de itens próprios no abrigo'],['rest','Conclusão de descanso com confirmação de todos'],['tokens','Mover o próprio token e marcar posições reveladas']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={config[key]} onChange={e => change(p => { p[key] = e.target.checked; })} />{label}</label>)}</div>
      <p className="subtle">Conflitos suspendem buscas, viagens e descansos. Falhas de acesso, Medo, barulho elevado e novos acontecimentos pausam as operações concluídas para você resolver a consequência.</p>
    </section>
    <section className="team-card"><h3><Search size={18} /> Áreas de busca liberadas</h3><p>As áreas precisam estar preparadas e reveladas. A tabela, a dificuldade e os achados não sorteados continuam reservados.</p>
      {prepared.length ? prepared.map(({ hexId, point, area }) => {
        const selected = config.areas.find(a => a.hexId === hexId && a.pointId === point.id && a.areaId === area.id);
        return <div className="team-area-policy" key={hexId + point.id + area.id}>
          <label><input type="checkbox" checked={Boolean(selected)} onChange={e => change(p => { p.areas = p.areas.filter(a => !(a.hexId === hexId && a.pointId === point.id && a.areaId === area.id)); if (e.target.checked) p.areas.push({ hexId, pointId: point.id, areaId: area.id, objectives: ['open'] }); })} /><span><b>{point.name} / {area.name}</b><small>Hex {hexId} · {area.minutes} min · {area.access === 'blocked' ? 'Bloqueado na ficção' : area.access === 'risk' ? 'Exige teste de acesso' : 'Acesso livre'}</small></span></label>
          {selected && <div className="team-objectives">{Object.entries(labels).map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.objectives.includes(key as typeof selected.objectives[number])} onChange={e => change(p => { const target = p.areas.find(a => a.hexId === hexId && a.pointId === point.id && a.areaId === area.id)!; const next = e.target.checked ? [...target.objectives, key as typeof target.objectives[number]] : target.objectives.filter(o => o !== key); target.objectives = next.length ? next : ['open']; })} />{label}</label>)}</div>}
        </div>;
      }) : <p className="team-empty">Prepare e revele um local no mapa para liberar suas áreas aqui.</p>}
    </section>
    <section className="team-card"><h3><Footprints size={18} /> Rotas liberadas</h3><p>Autorize cada sentido do trajeto. Os jogadores confirmam participação antes da partida.</p>
      <div className="team-form-row"><Pick label="Partida" value={from} options={visibleHexes.map(([value,h]) => ({value,label:h.sector?.name ?? `Hex ${value}`}))} onChange={setFrom} /><Pick label="Destino adjacente" value={destination} options={routeOptions} onChange={setTo} /><Button variant="outline" disabled={!destination} onClick={() => change(p => { if (!p.routes.some(r => r.from === from && r.to === destination)) p.routes.push({from,to:destination}); })}>Liberar trajeto</Button></div>
      {config.routes.map(r => <div className="team-route" key={r.from+'>'+r.to}><span>{game.hexes[r.from]?.sector?.name ?? r.from} → {game.hexes[r.to]?.sector?.name ?? r.to}</span><Button size="sm" variant="ghost" onClick={() => change(p => {p.routes=p.routes.filter(x=>x.from!==r.from || x.to!==r.to);})}>Remover liberação</Button></div>)}
    </section>
    <section className="team-card"><h3><Package size={18} /> Retiradas do depósito</h3><p>Limite por sobrevivente, por dia. Retirar e devolver não renova a cota. Zero mantém a retirada reservada ao mestre.</p>
      <div className="team-form-row">{(['food','water'] as const).map(resource=><Field key={resource} label={resource==='food'?'Porções de Comida':'Porções de Água'} type="number" value={String(config.supplies[resource])} onChange={value=>change(p=>{p.supplies[resource]=Math.max(0,Math.min(20,Number(value)||0));})}/>)}</div>
      {(game.shelter.inventory??[]).map(item=><Field key={item.id} label={`${item.name} · ${item.qty} no depósito · limite diário`} type="number" value={String(config.supplies.items[item.id]??0)} onChange={value=>change(p=>{p.supplies.items[item.id]=Math.max(0,Math.min(20,Number(value)||0));})}/>)}
    </section>
    <div className="team-policy-save"><Button disabled={!draft} onClick={async()=>{if(await perform({type:'policy',policy:config,expectedPolicy:draft?.source??JSON.stringify(policy)})) setDraft(null);}}>Salvar liberações</Button><Button variant="outline" disabled={!draft} onClick={()=>setDraft(null)}>Descartar rascunho</Button><small>As liberações passam a valer após o salvamento.</small></div>
    <section className="team-card"><h3>Atenção do mestre · {alerts.length}</h3>{alerts.length?alerts.map(op=><div className="team-operation" key={op.id}><b>{operationLabels[op.type]} · {game.survivors.find(p=>p.id===op.initiatorId)?.name}</b><p>{op.attention}</p><p>{op.purpose}</p>{op.result&&<p>{op.result}</p>}<Button size="sm" variant="outline" onClick={()=>perform({type:'review',operationId:op.id})}>Marcar como resolvido</Button></div>):<p className="team-empty">Nenhum pedido ou consequência aguardando avaliação.</p>}<p className="subtle">Após resolver a consequência, desmarque a pausa e salve as liberações. Bloqueios e exceções são tratados pelas ferramentas habituais.</p></section>
  </>;
}

function PlayerActivities({ game, actorId, perform }: { game: GameState; actorId: string; perform: (payload: Record<string, unknown>) => Promise<boolean> }) {
  const view = game.publicPlayerActions;
  const actor = game.survivors.find(p=>p.id===actorId);
  const [section,setSection]=useState('search');
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
  const [x,setX]=useState('0'),[y,setY]=useState('0');
  if(!view || !actor) return <p className="team-empty">Atualize a campanha para carregar suas ações disponíveis.</p>;
  const areas=view.areas.filter(a=>a.available && a.access!=='blocked' && a.objectives.length > 0);
  const area=areas.find(a=>a.areaId===selectedArea)??areas[0];
  const goal=area?.objectives.includes(objective)?objective:area?.objectives[0]??'open';
  const peers=view.peers.filter(p=>p.id!==actorId && p.hex===view.hexId);
  const recipient=peers.some(p=>p.id===targetId)?targetId:peers[0]?.id??'';
  const items=actor.inventory.filter(i=>i.qty>(i.committedAmmo??0));
  const item=items.find(i=>i.id===itemId)??items[0];
  const count=Number(quantity), validCount=Number.isInteger(count)&&count>0&&count<=99;
  const ops=view.operations.filter(o=>o.status==='forming'||o.status==='access');
  const name=(id:string)=>view.peers.find(p=>p.id===id)?.name??'Sobrevivente';
  return <>
    {view.policy.paused&&<p className="team-notice">Ações pausadas. O mestre está resolvendo a situação da cena.</p>}
    {view.busy&&<p className="team-notice">{view.busy}</p>}
    <nav className="team-section-nav" aria-label="Tipos de ações da equipe">{[['search','Buscas e coleta'],['inventory','Itens e reservas'],['rest','Descanso'],['travel','Viagem'],['scene','Cena visual']].map(([value,label])=><Button key={value} variant={section===value?'default':'outline'} aria-pressed={section===value} onClick={()=>setSection(value)}>{label}</Button>)}</nav>
    <section className="team-card"><h3><Users size={18}/> Operações propostas · {ops.length}</h3>{ops.length?ops.map(op=>{
      const member=op.participantIds.includes(actorId), owner=op.initiatorId===actorId;
      const canJoin=op.status==='forming'&&op.type!=='exception'&&!member&&(op.type!=='transfer'||op.invitedIds.includes(actorId));
      return <div className="team-operation" key={op.id}><b>{operationLabels[op.type]} · {name(op.initiatorId)}</b><p>{op.purpose|| (op.type==='rest'?`Descanso ${op.kind==='short'?'curto':'longo'}`:op.type==='travel'?`Destino: ${view.routes.find(r=>r.destination===op.destination)?.name??op.destination}`:'Busca proposta')}</p><small>Confirmados: {op.participantIds.map(name).join(', ')}</small><div className="team-inline-actions">{canJoin&&<Button size="sm" onClick={()=>perform({type:'join',operationId:op.id})}><Check size={14}/>{op.type==='transfer'?'Confirmar recebimento':'Confirmar participação'}</Button>}{(member||op.invitedIds.includes(actorId))&&op.status==='forming'&&<Button size="sm" variant="outline" onClick={()=>perform({type:'leave',operationId:op.id})}>{owner||op.type==='transfer'?'Cancelar proposta':'Sair da operação'}</Button>}{owner&&op.status==='forming'&&['search','travel','rest'].includes(op.type)&&<Button size="sm" disabled={view.policy.paused} onClick={()=>perform({type:'execute',operationId:op.id})}>{op.type==='search'?'Iniciar busca':op.type==='rest'?'Concluir descanso':'Confirmar partida'}</Button>}</div>
        {owner&&op.status==='access'&&<div className="team-access-roll"><Pick label="Atributo de acesso" value={trait} options={Object.keys(actor.attributes).map(value=>({value,label:traitLabel(value)}))} onChange={setTrait}/><div className="team-objectives">{[['origin','Experiência de origem'],['free','Experiência livre']].map(([key,label])=><label key={key}><input type="checkbox" checked={experiences.includes(key)} onChange={e=>setExperiences(current=>e.target.checked?[...current,key]:current.filter(v=>v!==key))}/>{label} · +2 por 1 Esperança</label>)}</div><p>Declare a abordagem na mesa. Modificadores e vantagens excepcionais são resolvidos pelo mestre.</p><Button disabled={view.policy.paused||experiences.length>actor.hope} onClick={()=>perform({type:'roll-access',operationId:op.id,trait,experiences})}>Rolar acesso e concluir busca</Button></div>}
      </div>;
    }):<p className="team-empty">Nenhuma operação aguardando participação.</p>}</section>
    {section==='search'&&<>
      <section className="team-card"><h3><Search size={18}/> Propor uma busca</h3>{area?<><Pick label="Área liberada neste hex" value={area.areaId} options={areas.map(a=>({value:a.areaId,label:`${a.pointName} / ${a.name}`}))} onChange={setSelectedArea}/><p>{area.signal}</p><div className="team-form-row"><Pick label="Objetivo autorizado" value={goal} options={area.objectives.map(value=>({value,label:labels[value]}))} onChange={setObjective}/><Field label="Finalidade da busca" value={purpose} onChange={setPurpose}/></div><p>{area.minutes} min · Barulho +{area.noise} · {area.access==='risk'?'Teste de acesso necessário':'Acesso livre'}. Uma busca do grupo por área.</p><Button disabled={Boolean(view.busy)||view.policy.paused||!purpose.trim()} onClick={()=>perform({type:'search',hexId:area.hexId,pointId:area.pointId,areaId:area.areaId,objective:goal,purpose})}>Propor busca e aguardar participantes</Button><p className="subtle">Depois das confirmações, quem propôs inicia a operação. Uma busca específica encontra no máximo uma unidade, conforme as regras.</p></>:<p className="team-empty">Não há uma área de busca disponível e liberada neste hex. O mestre prepara os locais e libera as áreas.</p>}</section>
      <section className="team-card"><h3><Package size={18}/> Achados disponíveis</h3><Field label="Quantidade a recolher" type="number" value={quantity} onChange={setQuantity}/>{view.stock.length?view.stock.map(s=><div className="team-stock" key={s.stockId}><span><b>{s.name}</b><small>{s.remaining} unidade(s) no local</small></span><Button size="sm" disabled={!validCount||count>s.remaining||!s.accessible||view.policy.paused} onClick={()=>perform({type:'collect',hexId:s.hexId,pointId:s.pointId,stockId:s.stockId,quantity:count})}>Recolher para minha mochila</Button></div>):<p className="team-empty">Os achados aparecem aqui após a busca ou quando o mestre libera itens à vista.</p>}<p className="subtle">A capacidade é conferida antes de recolher. O restante permanece no local.</p></section>
    </>}
    {section==='inventory'&&<>
      <section className="team-card"><h3><Handshake size={18}/> Entregar ou depositar meus itens</h3><div className="team-form-row"><Pick label="Item da minha mochila" value={item?.id??''} options={items.map(i=>({value:i.id,label:`${i.name} · ${i.qty-(i.committedAmmo??0)} disponíveis`}))} onChange={setItemId}/><Field label="Quantidade" type="number" value={quantity} onChange={setQuantity}/><Pick label="Destinatário presente" value={recipient} options={peers.map(p=>({value:p.id,label:p.name}))} onChange={setTargetId}/></div><div className="team-inline-actions"><Button disabled={!view.policy.transfers||!item||!recipient||!validCount||view.policy.paused} onClick={()=>perform({type:'offer',targetId:recipient,itemId:item!.id,quantity:count})}>Oferecer item ao sobrevivente</Button><Button variant="outline" disabled={!view.policy.deposits||!item||!validCount||view.policy.paused} onClick={()=>perform({type:'deposit',itemId:item!.id,quantity:count})}>Depositar no abrigo</Button></div><p className="subtle">A entrega só acontece quando o destinatário aceita. Depósito exige presença no local das reservas.</p></section>
      <section className="team-card"><h3>Retirar suprimentos liberados</h3><Field label="Quantidade a retirar" type="number" value={quantity} onChange={setQuantity}/>{view.supplies.filter(s=>s.allowance>0).map(s=><div className="team-stock" key={s.key}><span><b>{s.name}</b><small>{s.available} disponíveis · sua cota restante: {s.allowance}</small></span><Button size="sm" disabled={!validCount||count>Math.min(s.available,s.allowance)||view.policy.paused} onClick={()=>perform({type:'withdraw',resource:s.itemId?'item':s.key,itemId:s.itemId,quantity:count})}>Retirar para minha mochila</Button></div>)}{!view.supplies.some(s=>s.allowance>0)&&<p className="team-empty">Sem retirada liberada disponível na sua posição. Consulte o mestre.</p>}</section>
    </>}
    {section==='rest'&&<section className="team-card"><h3>Concluir descanso com a mesa</h3><p>Registre suas duas ações em <b>Sobreviventes → Resumo → Seu descanso</b>. Todos confirmam as escolhas antes da conclusão; ninguém altera a ficha de outro jogador.</p>{actor.restPlan?<><p>Você preparou descanso {actor.restPlan.kind==='short'?'curto (1h)':'longo (6h)'}.</p><Button disabled={!view.policy.rest||view.policy.paused||Boolean(view.busy)} onClick={()=>perform({type:'rest',kind:actor.restPlan!.kind})}>Propor descanso da mesa</Button></>:<p className="team-empty">Prepare primeiro suas escolhas de descanso na ficha.</p>}<p className="subtle">Descanso longo que atravessa o amanhecer continua com o mestre em Encerrar dia. Trabalho individual continua disponível na aba Abrigo.</p></section>}
    {section==='travel'&&<section className="team-card"><h3><Footprints size={18}/> Propor deslocamento</h3>{view.routes.length?view.routes.map(r=><div className="team-stock" key={r.destination}><span><b>{r.name}</b><small>{r.minutes} min · cada participante confirma sua presença</small></span><Button size="sm" disabled={Boolean(view.busy)||view.policy.paused} onClick={()=>perform({type:'travel',destination:r.destination})}>Propor viagem</Button></div>):<p className="team-empty">O mestre ainda não liberou uma rota de saída deste hex.</p>}<p className="subtle">A partida move apenas os sobreviventes que confirmaram. O tempo e os compromissos são conferidos antes da viagem.</p></section>}
    {section==='scene'&&<section className="team-card"><h3><MapPin size={18}/> Meu token e marcações</h3><p>Selecione uma posição na prévia para mover seu token ou criar uma marcação. Apenas posições reveladas da cena ativa estão disponíveis.</p>{game.sceneBoard?.scenes.filter(s=>s.id===game.sceneBoard?.activeSceneId).map(scene=><SceneActionMap key={scene.id} scene={scene} x={Number(x)} y={Number(y)} onPick={(px,py)=>{setX(String(px));setY(String(py));}}/>)}{game.sceneBoard?.scenes.flatMap(scene=>scene.objects.filter(o=>o.kind==='token'&&o.tokenKind==='survivor'&&o.refId===actorId).map(o=><div className="team-operation" key={o.id}><b>{o.label} · {scene.name}</b><p>Posição {o.x}, {o.y}</p><Button size="sm" disabled={!view.policy.tokens||Boolean(o.locked)||view.policy.paused} onClick={()=>perform({type:'token',sceneId:scene.id,objectId:o.id,x:Number(x),y:Number(y),beforeX:o.x,beforeY:o.y})}>Mover para a posição selecionada</Button><div className="team-inline-actions">{[[0,-20,'Acima'],[-20,0,'Esquerda'],[20,0,'Direita'],[0,20,'Abaixo']].map(([dx,dy,label])=><Button size="sm" variant="outline" key={label} disabled={!view.policy.tokens||Boolean(o.locked)||view.policy.paused} onClick={()=>perform({type:'token',sceneId:scene.id,objectId:o.id,x:o.x+Number(dx),y:o.y+Number(dy),beforeX:o.x,beforeY:o.y})}>{label}</Button>)}</div></div>))}<div className="team-form-row"><Field label="Posição X" type="number" value={x} onChange={setX}/><Field label="Posição Y" type="number" value={y} onChange={setY}/><Field label="Marcação temporária" value={marker} onChange={setMarker}/></div><div className="team-inline-actions"><Button disabled={!view.policy.tokens||!game.sceneBoard?.activeSceneId||view.policy.paused||!marker.trim()} onClick={()=>perform({type:'marker',sceneId:game.sceneBoard!.activeSceneId,x:Number(x),y:Number(y),label:marker})}>Marcar posição revelada</Button><Button variant="outline" onClick={()=>perform({type:'clear-marker'})}>Remover minha marcação</Button></div><p className="subtle">Uma marcação por jogador. Ela desaparece ao mudar a cena ou o dia.</p></section>}
    <section className="team-card"><h3>Pedido fora das liberações</h3><Field label="O que pretende fazer e por quê?" multiline value={request} onChange={setRequest}/><Button variant="outline" disabled={!request.trim()} onClick={()=>perform({type:'request',text:request})}>Pedir avaliação ao mestre</Button><p className="subtle">Use para objetivos excepcionais, bloqueios e situações que dependam da ficção.</p></section>
    {view.operations.some(o=>o.status==='done')&&<details className="team-card"><summary>Operações concluídas neste dia</summary>{view.operations.filter(o=>o.status==='done').map(o=><p key={o.id}><b>{operationLabels[o.type]}</b> · {o.result??o.purpose??'Concluída'}</p>)}</details>}
  </>;
}

function SceneActionMap({scene,x,y,onPick}:{scene:SceneBoardScene;x:number;y:number;onPick:(x:number,y:number)=>void}) {
  return <div className="team-scene-preview"><p>Prévia da cena · {scene.name}</p><svg viewBox={`0 0 ${scene.width} ${scene.height}`} role="application" aria-label="Selecionar posição na cena; use as setas do teclado ou clique" tabIndex={0}
    onClick={e=>{const bounds=e.currentTarget.getBoundingClientRect();onPick(Math.round((e.clientX-bounds.left)/bounds.width*scene.width),Math.round((e.clientY-bounds.top)/bounds.height*scene.height));}}
    onKeyDown={e=>{const move:Record<string,[number,number]>={ArrowUp:[0,-20],ArrowDown:[0,20],ArrowLeft:[-20,0],ArrowRight:[20,0]};if(move[e.key]){e.preventDefault();onPick(Math.max(0,Math.min(scene.width-1,x+move[e.key][0])),Math.max(0,Math.min(scene.height-1,y+move[e.key][1])));}}}>
    <rect width={scene.width} height={scene.height} fill={scene.fogEnabled?'#172d30':'var(--card)'}/>
    {scene.fogEnabled&&scene.revealedAreas?.map(a=><rect key={a.id} x={a.x} y={a.y} width={a.width} height={a.height} fill="var(--card)"/>)}
    {scene.objects.map(o=><g key={o.id}><rect x={o.x} y={o.y} width={o.width} height={o.height} rx={o.kind==='token'?20:2} fill={o.kind==='token'?'var(--primary)':'var(--muted)'} stroke="var(--foreground)" strokeWidth="2" transform={`rotate(${o.rotation} ${o.x+o.width/2} ${o.y+o.height/2})`}/><text x={o.x+3} y={o.y+o.height+16} fill="var(--foreground)" fontSize="15">{o.label.slice(0,22)}</text></g>)}
    <circle cx={x} cy={y} r="10" fill="#f4c542" stroke="#172d30" strokeWidth="3"/>
  </svg><small>Clique apenas escolhe a posição. Use o botão para confirmar movimento ou marcação.</small></div>;
}
