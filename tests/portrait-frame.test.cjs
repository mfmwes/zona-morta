/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript');
require.extensions['.ts']=(module,path)=>module._compile(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,path);
const {validPortraitFrame,portraitFrame,dragPortraitFrame}=require('../lib/portrait-frame.ts');
const {defaultState}=require('../lib/game.ts');
const {projectPlayerGame}=require('../lib/collaboration.ts');
test('enquadramento legado e validação de zoom/posição',()=>{
 assert.deepEqual(portraitFrame(),{zoom:1,x:50,y:50});
 for(const value of [null,{}, {zoom:NaN,x:50,y:50},{zoom:6,x:50,y:50},{zoom:2,x:-1,y:50},{zoom:2,x:50,y:Infinity}])assert.equal(validPortraitFrame(value),false);
 assert.equal(validPortraitFrame({zoom:5,x:0,y:100}),true);
});
test('arraste respeita proporção, zoom e bordas sem espaço vazio',()=>{
 assert.deepEqual(dragPortraitFrame({zoom:1,x:50,y:50},50,90,180,.5),{zoom:1,x:50,y:0});
 assert.deepEqual(dragPortraitFrame({zoom:2,x:50,y:50},90,-90,180,1),{zoom:2,x:0,y:100});
 assert.deepEqual(dragPortraitFrame({zoom:1,x:50,y:50},-90,50,180,2),{zoom:1,x:100,y:50});
});
test('jogadores recebem o mesmo enquadramento somente de NPCs visíveis',()=>{
 const game=defaultState(); const frame={zoom:3,x:30,y:10};
 const base={name:'Gilberto',portrait:'https://example.com/full.jpg',portraitFrame:frame,hex:'0,0',role:'',description:'',notes:'',status:'Bem',infection:'Saudável',disposition:'Aliado',skills:[],active:true};
 game.npcs=[{...base,id:'visible'},{...base,id:'hidden',visibleToPlayers:false}];
 const view=projectPlayerGame(game,'self');assert.equal(view.npcs.length,1);assert.deepEqual(view.npcs[0].portraitFrame,frame);assert.equal(view.npcs[0].portrait,base.portrait);
 assert.equal(game.npcs.length,2);
});
