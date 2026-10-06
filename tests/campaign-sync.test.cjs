/* eslint-disable @typescript-eslint/no-require-imports -- exercise transport with controlled sockets and timers */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
require.extensions['.ts']=(m,p)=>m._compile(ts.transpileModule(fs.readFileSync(p,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,p);
const {startCampaignSync}=require('../lib/campaign-sync.ts');
const {CampaignLive}=require('../worker/campaign-live.ts');

test('avisos durante uma leitura não se perdem; reconexão, foco e limpeza funcionam',async()=>{
  const originals={window:global.window,document:global.document,WebSocket:global.WebSocket,setInterval:global.setInterval,clearInterval:global.clearInterval,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
  const intervals=new Map(),timeouts=new Map(),sockets=[];
  const surface=()=>{const listeners=new Map();return {visibilityState:'visible',listeners,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name),fire(name){listeners.get(name)?.();}};};
  const win=surface(),doc=surface();
  class Socket {static CLOSED=3;constructor(){this.readyState=0;sockets.push(this);}close(){this.readyState=3;this.onclose?.();}}
  global.window=win;global.document=doc;global.WebSocket=Socket;
  global.setInterval=(fn)=>{intervals.set(fn,fn);return fn;};global.clearInterval=id=>intervals.delete(id);
  global.setTimeout=(fn)=>{timeouts.set(fn,fn);return fn;};global.clearTimeout=id=>timeouts.delete(id);
  let calls=0,release;
  const refresh=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  try {
    const stop=startCampaignSync('wss://example.test/api/campaign/live?campanha=one',refresh);
    sockets[0].onopen();assert.equal(calls,1);
    sockets[0].onmessage({data:'{"type":"changed"}'});sockets[0].onmessage({data:'{"type":"changed"}'});
    release();await Promise.resolve();await Promise.resolve();assert.equal(calls,2);
    release();await Promise.resolve();await Promise.resolve();
    doc.fire('visibilitychange');assert.equal(calls,3);release();await Promise.resolve();await Promise.resolve();
    sockets[0].close();assert.equal(timeouts.size,1);
    const reconnect=[...timeouts.values()][0];timeouts.clear();reconnect();assert.equal(sockets.length,2);
    sockets[1].onopen();assert.equal(calls,4);release();await Promise.resolve();await Promise.resolve();
    [...intervals.values()][0]();assert.equal(calls,5);
    stop();release();await Promise.resolve();await Promise.resolve();
    assert.equal(intervals.size,0);assert.equal(timeouts.size,0);assert.equal(win.listeners.size,0);assert.equal(doc.listeners.size,0);
    sockets[1].onmessage({data:'{"type":"changed"}'});assert.equal(calls,5);
  } finally {Object.assign(global,originals);}
});

test('hub avisa todas as conexões sem transmitir estado privado nem aceitar edições pelo socket',async()=>{
  const first=[],second=[];
  const sockets=[{send:data=>first.push(JSON.parse(data))},{send:data=>second.push(JSON.parse(data))}];
  const hub=new CampaignLive({getWebSockets:()=>sockets});
  assert.equal((await hub.fetch(new Request('https://internal/notify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:7})}))).status,204);
  assert.deepEqual(first,[{type:'changed',revision:7}]);assert.deepEqual(second,first);
  hub.webSocketMessage(sockets[0],'{"state":{"fear":99}}');assert.equal(first.length,1);
  hub.webSocketMessage(sockets[0],'ping');assert.deepEqual(first[1],{type:'pong'});
});

test('revisão alvo força releituras imediatas até o estado anunciado ficar visível',async()=>{
  const originals={window:global.window,document:global.document,WebSocket:global.WebSocket,setInterval:global.setInterval,clearInterval:global.clearInterval,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout};
  const surface=()=>({visibilityState:'visible',addEventListener(){},removeEventListener(){}});
  const sockets=[];
  class Socket {static CLOSED=3;constructor(){this.readyState=1;sockets.push(this);}close(){this.readyState=3;}}
  global.window=surface();global.document=surface();global.WebSocket=Socket;
  global.setInterval=()=>1;global.clearInterval=()=>{};global.setTimeout=()=>1;global.clearTimeout=()=>{};
  const observed=[1,2,3], calls=[];
  try {
    const stop=startCampaignSync('wss://example.test/live',async notice=>{calls.push(notice);return observed.shift() ?? 3;});
    sockets[0].onmessage({data:'{"type":"changed","revision":3}'});
    await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(calls.length,3);
    assert.ok(calls.every(call=>call.revision===3));
    stop();
  } finally {Object.assign(global,originals);}
});
