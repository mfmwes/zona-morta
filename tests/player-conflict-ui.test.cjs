/* eslint-disable @typescript-eslint/no-require-imports -- Render the real TSX components in Node. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) {
  return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args);
};
const {defaultState, initialSurvivor, content} = require('../lib/game.ts');
const {createConflictScene} = require('../lib/conflict.ts');
const {projectPlayerGame} = require('../lib/collaboration.ts');
const {SurvivorConflictHud} = require('../components/survivor-conflict-hud.tsx');
function setup() {
  const game = defaultState();
  const make = name => initialSurvivor({name, origin:content.origins[0].name, past:'', archetype:content.archetypes[0].name, specialty:content.archetypes[0].specialties[0].name, freeExperience:'', techniques:[], attributes:{}, primary:'', secondary:'', protection:'', personal:''});
  game.survivors = [make('Participante'),make('Observador')];
  game.conflict = createConflictScene({name:'Confronto',sceneNumber:game.scene ?? 1,day:game.day,time:'08:00',survivorIds:[game.survivors[0].id]});
  return game;
}
function render(game, person, preview) {
  return renderToStaticMarkup(React.createElement(SurvivorConflictHud, {game,survivor:person,playerMode:!preview,playerPreview:preview,targetId:'',onTargetChange:()=>{},onAttack:()=>{}}));
}
test('a trilha é renderizada no payload real do jogador, participante ou observador, como na prévia', () => {
  const game = setup();
  for (const person of game.survivors) {
    const projected = projectPlayerGame(game,person.id);
    assert.equal(projected.conflict,undefined);
    const live = render(projected,projected.survivors[0],false);
    const preview = render(game,person,true);
    for (const html of [live,preview]) {
      assert.match(html,/TRILHA DE CONFLITO/);
      assert.match(html,/Participante/);
      assert.equal(html.includes('Pedir Spotlight'),person.id === game.survivors[0].id);
    }
  }
});
test('sem conflito ativo, prévia e acesso real não renderizam a trilha', () => {
  const game = setup();game.conflict.active=false;
  const person=game.survivors[0];
  assert.equal(render(game,person,true),'');
  assert.equal(render(projectPlayerGame(game,person.id),person,false),'');
});

test('chat da simulação mostra os mesmos controles e registros do jogador escolhido', () => {
  const {PlayerPreviewSession} = require('../lib/player-preview.ts');
  const {PlayerSimulationContext} = require('../components/player-simulation.tsx');
  const {TableChat} = require('../components/table-chat.tsx');
  const {addLog} = require('../lib/game.ts');
  const game=setup(),person=game.survivors[1];
  addLog(game,'dados','Participante: teste secreto de outro personagem',game.survivors[0].id);
  const session=new PlayerPreviewSession(game,person.id);
  const props={edit:()=>{},role:'jogador',survivorId:person.id,readOnly:false,onClose:()=>{}};
  const preview=renderToStaticMarkup(React.createElement(PlayerSimulationContext.Provider,{value:session},React.createElement(TableChat,{...props,game:session.view})));
  const live=renderToStaticMarkup(React.createElement(TableChat,{...props,game:projectPlayerGame(game,person.id)}));
  for(const html of [preview,live]) {
    assert.match(html,/Falando como/);assert.match(html,/Observador/);
    assert.match(html,/Rolagens rápidas/);assert.match(html,/<textarea/);
    assert.doesNotMatch(html,/teste secreto de outro personagem|Escolher personagem que fala|chat em modo de leitura/);
  }
});
