import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { ShelterPanel } from '@/components/campaign-views';
import { SceneBoard } from '@/components/scene-board';
import { HexExplorer } from '@/components/hex-explorer';
import { TableChat } from '@/components/table-chat';
import { MapSessionBar } from '@/components/map-session-bar';
import { ThemeToggle } from '@/components/theme-toggle';
import { Users, House, Layers } from 'lucide-react';
import { SurvivorPanel } from '@/components/survivor-panel';
import { PlayerConflictScene, ConflictSceneManager } from '@/components/conflict-scene-manager';
import { NpcPanel } from '@/components/npc-panel';
import { PlayerAttention } from '@/components/player-attention';
import { PlayerSimulationContext } from '@/components/player-simulation';
import { RuleText } from '@/components/rule-text';
import { ChoiceCard } from '@/components/choice-card';
import { RuntimeErrorBoundary } from '@/components/runtime-error-boundary';
import { projectPlayerGame, applyPlayerChange, playerEditPayload } from '@/lib/collaboration';
import { applyPlayerAction } from '@/lib/player-actions';
import { playerTeamPeers } from '@/lib/player-preview';
import { resolveSurvivorDamageRequest, requestConflictSpotlight, cancelConflictSpotlightRequest } from '@/lib/conflict';
import { survivorStats, type GameState } from '@/lib/game';
import { createId } from '@/lib/id';
import { previewFixture } from './fixture';
import '@/app/globals.css';
import '@/app/visual-system.css';
import '@/app/hex-discovered-points.css';
import '@/app/hex-sector-layout.css';
import '@/app/chat.css';
import '@/app/scene-board.css';
import '@/app/conflict-workflow.css';
import '@/app/community-scene-workflow.css';
import '@/app/player-actions.css';
import '@/app/search-session.css';
import '@/app/activity-timeline.css';
import '@/app/event-guides.css';
import '@/app/campaign-usability.css';
import '@/app/mobile-navigation.css';
import '@/app/mobile-experience.css';
import '@/app/condition-screen.css';
import '@/app/appearance-fonts.css';
import '@/app/appearance.css';
import '@/app/usability-upgrade.css';
import '@/app/map-concept.css';
import './preview.css';
import '@/app/map-workspace.css';
import '@/app/campaign-navigation.css';

declare global { interface Window { __qa: { game: () => GameState; mutate: (fn: (draft: GameState) => void) => void } } }
const query = new URLSearchParams(location.search);
function Preview() {
  const [full, setFull] = useState(() => previewFixture({base:query.has('base'),conflict:query.get('screen')==='conflict',rest:query.get('scenario')==='rest',roads:query.get('scenario')==='roads',objects:Number(query.get('objects')||3)}));
  const current = useRef(full);
  const [role,setRole] = useState(query.get('role') ?? 'master');
  const [screen,setScreen] = useState(query.get('screen') ?? 'scene');
  const [focus,setFocus] = useState({key:0,section:'resumo',rest:false});
  const [checked,setChecked] = useState(false);
  const [chatOpen,setChatOpen] = useState(false);
  const player=role==='player', actor=full.survivors[0], game=player?projectPlayerGame(full,actor.id):full;
  const [mobile,setMobile] = useState(innerWidth<=760);
  React.useEffect(()=>{const listener=()=>setMobile(innerWidth<=760);window.addEventListener('resize',listener);return()=>window.removeEventListener('resize',listener);},[]);
  function commit(next: GameState) { current.current=next;setFull(next); }
  function mutate(fn: (draft: GameState) => void) { const next=structuredClone(current.current);fn(next);commit(next); }
  React.useEffect(()=>{window.__qa={game:()=>structuredClone(current.current),mutate};});
  function edit(fn: (draft: GameState) => void) {
    if(!player){mutate(fn);return;}
    const before=projectPlayerGame(current.current,actor.id),after=structuredClone(before);fn(after);
    const payload=playerEditPayload(before,after);
    const next=payload&&applyPlayerChange(current.current,actor.id,payload.before,payload.after,payload.fearDelta,payload.logs,payload.noiseDelta,payload.shelterWorkActions);
    if(next)commit(next);else toast.error('Ação indisponível para o jogador.');
  }
  const controls={actorId:actor.id,canAct:true,send:async(payload:Record<string,unknown>)=>{
    const result=applyPlayerAction(current.current,actor.id,{...payload,id:payload.id??createId(),day:payload.day??full.day});
    if(!result.ok)throw new Error(result.error);commit(result.state);
  }};
  const simulation={spotlight:(action:'request'|'cancel')=>mutate(d=>{if(d.conflict){if(action==='request')requestConflictSpotlight(d.conflict,actor.id);else cancelConflictSpotlightRequest(d.conflict,actor.id);}}),
    damage:(id:string,resolution:'hp'|'armor')=>{const next=structuredClone(current.current),person=next.survivors[0];const result=resolveSurvivorDamageRequest(next.conflict!,id,person,survivorStats(person),resolution,next.day,'08:00');if(!result.ok)throw new Error('Este impacto não pode ser resolvido agora.');commit(next);return result;},
    target:()=>{throw new Error('Use a tela do mestre para preparar ataques nesta prévia.');}};
  return <PlayerSimulationContext.Provider value={simulation}><div className={`qa-preview${screen==='map'?' is-map':''}`}><div className="qa-controls"><b>Prévia isolada · dados de exemplo</b>
    <label>Perfil <select aria-label="Perfil" value={role} onChange={e=>setRole(e.target.value)}><option value="master">Mestre</option><option value="player">Jogador</option></select></label>
    <label>Tela <select aria-label="Tela" value={screen} onChange={e=>setScreen(e.target.value)}><option value="map">Mapa e exploração</option><option value="scene">Cena visual</option><option value="sheet">Ficha</option><option value="shelter">Abrigo</option><option value="conflict">Conflito</option><option value="npcs">PNJs</option><option value="reading">Leitura e seleção</option></select></label>
    <label>Tema <select aria-label="Tema" defaultValue="dark" onChange={e=>document.documentElement.dataset.theme=e.target.value}><option value="dark">Escuro</option><option value="light">Claro</option></select></label>
    <label>Estilo <select aria-label="Estilo" defaultValue="tecnico" onChange={e=>document.documentElement.dataset.visualStyle=e.target.value}><option>tecnico</option><option>fiel</option><option>leitura</option></select></label>
    <button onClick={()=>location.reload()}>Reiniciar exemplo</button>{query.has('chat')&&<button aria-expanded={chatOpen} onClick={()=>setChatOpen(!chatOpen)}>Chat</button>}<small>Nenhum dado é enviado à campanha real.</small>
  </div><div className={`app-shell compact-navigation${query.has('chat')?(chatOpen?' chat-open':' chat-closed'):''}${screen==='map'?' map-mode qa-map-mode':''}`}><aside className="rail"><b title="Zona Morta">ZM</b><div className="campaign-navigation-dock"><nav className="rail-nav"><button title="Ficha" aria-current={screen==='sheet'?'page':undefined} onClick={()=>setScreen('sheet')}><Users size={17}/><span>Ficha</span></button><button title="Abrigo" aria-current={screen==='shelter'?'page':undefined} onClick={()=>setScreen('shelter')}><House size={17}/><span>Abrigo</span></button><button title="Cena visual" aria-current={screen==='scene'?'page':undefined} onClick={()=>setScreen('scene')}><Layers size={17}/><span>Cena visual</span></button></nav><div className="rail-presentation-slot campaign-utility-controls"><ThemeToggle placement="campaign"/></div></div></aside><main className="workspace"><div className="page"><div className="campaign-page-heading mb-6"><h1 className="page-title">{screen==='map'?'Mapa e exploração':screen==='shelter'?'Abrigo':screen==='sheet'?'Meu sobrevivente':screen==='scene'?'Cena visual':screen==='conflict'?'Conflito':'Zona Morta'}</h1><p className="intro-line mt-2">Explore as alterações com uma campanha de exemplo.</p></div>
    {player&&<PlayerAttention game={game} actorId={actor.id} onOpen={target=>{if(target==='conflict')setScreen('conflict');else if(target==='map')toast.info('Abra o local da busca no mapa da campanha.');else{setFocus({key:focus.key+1,section:target==='inventory'?'inventario':'resumo',rest:target==='rest'});setScreen('sheet');}}}/>}
    <RuntimeErrorBoundary key={`${role}:${screen}`}>
      {screen==='map'&&<HexExplorer game={game} edit={edit} playerPreview={player} mobile={mobile} teamPeers={playerTeamPeers(full)} playerActions={player?controls:undefined} sessionControls={!player?<MapSessionBar game={game} edit={edit}/>:undefined}/>}
      {screen==='scene'&&<SceneBoard game={game} edit={edit} playerPreview={player} playerActions={player?controls:undefined}/>}
      {screen==='shelter'&&<ShelterPanel game={game} edit={edit} playerPreview={player} playerSurvivorId={actor.id} playerActions={player?controls:undefined}/>}
      {screen==='sheet'&&<SurvivorPanel key={focus.key} initialSection={focus.section} initialRestFocus={focus.rest} game={game} edit={edit} playerPreview={player} playerMode={player} mobile={mobile} restPeers={playerTeamPeers(full)} playerActions={player?controls:undefined} onOpenConflict={()=>setScreen('conflict')}/>}
      {screen==='npcs'&&<NpcPanel game={game} edit={edit} playerPreview={player}/>}
      {screen==='conflict'&&(player?<PlayerConflictScene game={game} edit={edit} selfId={actor.id} playerActions={controls}/>:<ConflictSceneManager game={game} edit={edit} mobile={mobile}/>)}
      {screen==='reading'&&<section className="panel panel-pad qa-reading"><h2 className="section-title">Ações e efeitos</h2><div className="choice-card-grid"><ChoiceCard title="Nina" description="Participa desta etapa" checked={checked} onChange={setChecked}/><ChoiceCard title="Rafael de Albuquerque" description="Ocupado em outra atividade" checked={false} disabled onChange={()=>{}}/></div><RuleText text={'Gatilho: Ao ajudar alguém em perigo.\nEfeito: Descreva como sua experiência ajuda o grupo a atravessar o obstáculo.\nCusto: Marque 1 Estresse. Duração: Até o fim da cena.\nComo remover: Encerre a ação quando o perigo passar.'}/></section>}
    </RuntimeErrorBoundary>
  </div></main>{query.has('chat')&&<>{chatOpen&&<button type="button" className="table-chat-backdrop" aria-label="Fechar chat" onClick={()=>setChatOpen(false)}/>}<div id="table-chat"><TableChat game={game} edit={edit} role={player?'jogador':'mestre'} survivorId={player?actor.id:null} onClose={()=>setChatOpen(false)}/></div></>}</div><Toaster/></div></PlayerSimulationContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
