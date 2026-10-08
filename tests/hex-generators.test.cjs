/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, path) => module._compile(ts.transpileModule(fs.readFileSync(path, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, path);

const { defaultState, initialSurvivor, content } = require('../lib/game.ts');
const generators = require('../lib/hex-generators.ts');
const collaboration = require('../lib/collaboration.ts');

function rng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function survivor(name = 'Ana') {
  return initialSurvivor({ name, origin: content.origins[0].name, past: '', archetype: content.archetypes[0].name,
    specialty: content.archetypes[0].specialties[0].name, freeExperience: 'Resgates', techniques: [],
    attributes: { Agilidade: 2, Força: 1, Finesse: 1, Instinto: 0, Presença: 0, Conhecimento: -1 },
    primary: 'Faca resistente', secondary: '', protection: 'Roupa reforçada', personal: 'Mochila urbana' });
}

test('gerador contextual mantém d100 completo e produz metadados úteis', () => {
  for (const kind of ['locais', 'comercios', 'eventos']) {
    assert.equal(content.generators[kind].length, 100);
    assert.deepEqual(content.generators[kind].map(row => row.roll), Array.from({ length: 100 }, (_, index) => index + 1));
  }
  const game = defaultState();
  game.hexes['0,0'].infestation = 3;
  const result = generators.generateHexContent(game, '0,0', 'locais', rng(1));
  assert.ok(result.roll >= 1 && result.roll <= 100);
  assert.ok(result.categoryLabel);
  assert.match(result.contextLabel, /Infestação 3\/5/);
  assert.ok(result.suggestedAccess);
  assert.ok(result.suggestedRisk);
  assert.ok(result.suggestedCondition);
});

test('terreno e infestação alteram o peso dos resultados sem excluir a tabela', () => {
  const forest = defaultState();
  forest.hexes['0,0'].terrain = 'forest';
  // Isola o terreno: defaultState sorteia um setor que também influencia os pesos.
  delete forest.hexes['0,0'].sector;
  const forestRandom = rng(42);
  let openCount = 0;
  for (let i = 0; i < 400; i++) {
    if (generators.generateHexContent(forest, '0,0', 'locais', forestRandom).category === 'aberto') openCount++;
  }
  assert.ok(openCount > 250, `áreas abertas em floresta: ${openCount}`);

  const low = defaultState();
  const high = structuredClone(low);
  low.hexes['0,0'].infestation = 0;
  high.hexes['0,0'].infestation = 5;
  const lowRandom = rng(99);
  const highRandom = rng(99);
  let lowThreats = 0;
  let highThreats = 0;
  for (let i = 0; i < 500; i++) {
    if (generators.generateHexContent(low, '0,0', 'eventos', lowRandom).category === 'ameaca') lowThreats++;
    if (generators.generateHexContent(high, '0,0', 'eventos', highRandom).category === 'ameaca') highThreats++;
  }
  assert.ok(highThreats > lowThreats * 3, `ameaças: infestação 0=${lowThreats}, infestação 5=${highThreats}`);
});

test('orientação do mestre é separada do texto público', () => {
  const split = generators.splitGeneratorText('Distribuidora de água. Galões vazios predominam; pergunte pela origem dos cheios.');
  assert.match(split.publicText, /Galões vazios predominam/);
  assert.doesNotMatch(split.publicText, /pergunte/i);
  assert.match(split.gmGuidance, /pergunte pela origem/i);
});

test('gatilhos estruturados sinalizam prontidão sem ativar automaticamente', () => {
  const game = defaultState();
  game.survivors = [survivor()];
  game.survivors[0].hex = '0,0';
  const enter = { id:'e1', text:'Alguém observa.', trigger:'Ao entrar', revealed:true, triggerType:'enter', status:'pending' };
  assert.equal(generators.eventTriggerReady(game, '0,0', enter), true);
  assert.equal(generators.eventStatus(enter), 'pending');

  const noise = { id:'e2', text:'Passos.', trigger:'Barulho', revealed:true, triggerType:'noise', triggerValue:4, status:'pending' };
  game.noise = 3;
  assert.equal(generators.eventTriggerReady(game, '0,0', noise), false);
  game.noise = 4;
  assert.equal(generators.eventTriggerReady(game, '0,0', noise), true);
});

test('eventos pendentes e orientação reservada não vazam para jogadores', () => {
  const game = defaultState();
  const person = survivor();
  game.survivors = [person];
  const hex = game.hexes['0,0'];
  hex.events.push({ id:'pending', text:'Não deveria aparecer.', trigger:'Ao entrar', triggerType:'enter', status:'pending', revealed:true, guidance:'Segredo do mestre.' });
  hex.events.push({ id:'active', text:'Pessoa à janela.', trigger:'Ao entrar', triggerType:'enter', status:'active', revealed:true, guidance:'Ela está assustada.' });
  const visible = collaboration.projectPlayerGame(game, person.id);
  assert.equal(visible.hexes['0,0'].events.some(event => event.id === 'pending'), false);
  const active = visible.hexes['0,0'].events.find(event => event.id === 'active');
  assert.ok(active);
  assert.equal(active.guidance, '');
  assert.equal(active.trigger, '');
});


test('pista de saída recente tem categoria e gatilho de informação, sem virar ameaça por número',()=>{
 const g=defaultState(),random=rng(123);let result;
 for(let i=0;i<2000;i++){const row=generators.generateHexContent(g,'0,0','eventos',random);if(row.roll===91){result=row;break;}}
 assert.ok(result);assert.equal(result.category,'pista');assert.equal(result.suggestedTriggerType,'manual');assert.match(result.publicText,/Vidro de dentro para fora/);
});

test('setor natural sem estrutura não sorteia instalações artificiais, inclusive com aleatoriedade zero',()=>{
 const game=defaultState(),hex=game.hexes['0,0'];hex.terrain='forest';hex.sector=null;hex.points=[];
 for(const random of [()=>0,rng(777)])for(let i=0;i<300;i++){
  const row=generators.generateHexContent(game,'0,0','eventos',random);
  assert.equal(generators.eventContentCompatible(game,'0,0',row.roll),true);
  assert.notEqual(row.roll,6);assert.notEqual(row.roll,53);
 }
 hex.points.push({name:'Cabana de manutenção',signal:'Instalação existente'});
 assert.equal(generators.eventContentCompatible(game,'0,0',6),true);
});
