/* eslint-disable @typescript-eslint/no-require-imports -- exercises the real loading callbacks with isolated network responses. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { fetchCampaignResource, campaignLoadTimeoutMs } = require('../lib/campaign-loading.ts');

function pending() { return new Promise(() => {}); }
const settle = () => new Promise(resolve => setImmediate(resolve));

function fixture(search = '') {
  const source = fs.readFileSync(require.resolve('../app/page.tsx'), 'utf8');
  const parsed = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const callbacks = {};
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ['loadCampaign', 'loadAccountCharacters'].includes(node.name.getText(parsed))) {
      callbacks[node.name.getText(parsed)] = node.initializer.arguments[0].getText(parsed);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  const state = { loading: true, showLibrary: false, accountCharacters: [] };
  const context = {
    window: { location: { search } }, URLSearchParams, AbortController, Error,
    fetchCampaignResource, apiPath: () => '/api/campaign' + search,
    refreshPresentation() {}, playerSaves: { current: { clear() {} } },
  };
  for (const name of ['charactersRequest', 'presentationVersion', 'current', 'revision', 'roleRef', 'serverActor', 'serverState', 'pending', 'pendingBefore', 'paused']) context[name] = { current: null };
  for (const name of ['loading', 'charactersLoading', 'charactersError', 'accountCharacters', 'needsAuth', 'showLibrary', 'loadError', 'game', 'campaigns', 'presentation', 'status', 'saveError', 'role', 'ownerId', 'survivorId', 'restPeers', 'tab']) {
    context['set' + name[0].toUpperCase() + name.slice(1)] = value => { state[name] = value; };
  }
  const code = Object.entries(callbacks).map(([name, fn]) => `globalThis.${name} = ${fn};`).join('\n');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { ...context, state };
}

test('resposta e corpo JSON pendentes expiram e cancelam a requisição', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const slowBody of [false, true]) {
    let signal;
    const fetch = t.mock.method(globalThis, 'fetch', async (_url, options) => {
      signal = options.signal;
      return slowBody ? { ok: true, status: 200, json: pending } : pending();
    });
    const request = fetchCampaignResource('/api/campaigns');
    const rejected = assert.rejects(request, /demorou para responder/);
    await Promise.resolve();
    t.mock.timers.tick(campaignLoadTimeoutMs);
    await rejected;
    assert.equal(signal.aborted, true);
    fetch.mock.restore();
  }
});

test('biblioteca de sobreviventes lenta não bloqueia campanhas; erro pode ser tentado novamente', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stalled = true;
  const campaigns = [{ id: 'mesa', name: 'Mesa preservada' }];
  t.mock.method(globalThis, 'fetch', async url => {
    if (url === '/api/campaigns') return Response.json({ campaigns });
    return stalled ? pending() : Response.json({ characters: [{ id: 'nina', name: 'Nina' }] });
  });
  const app = fixture();
  await app.loadCampaign();
  assert.equal(app.state.loading, false);
  assert.equal(app.state.showLibrary, true);
  assert.deepEqual(app.state.campaigns, campaigns);
  assert.equal(app.state.charactersLoading, true);
  t.mock.timers.tick(campaignLoadTimeoutMs);
  await settle();
  assert.equal(app.state.charactersLoading, false);
  assert.match(app.state.charactersError, /demorou para responder/);
  assert.deepEqual(app.state.campaigns, campaigns);
  stalled = false;
  await app.loadAccountCharacters();
  assert.equal(app.state.charactersError, '');
  assert.equal(app.state.accountCharacters[0].name, 'Nina');
});

test('carregamento principal travado sai da abertura e uma nova tentativa funciona', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const search of ['', '?campanha=mesa']) {
    let stalled = true;
    const fetch = t.mock.method(globalThis, 'fetch', async url => stalled ? pending() : Response.json(
      url === '/api/campaigns' ? { campaigns: [{ id: 'mesa' }] }
        : url === '/api/characters' ? { characters: [] }
          : { revision: 1, role: 'mestre', ownerId: 'dona', state: { campaignId: 'mesa' } },
    ));
    const app = fixture(search);
    const load = app.loadCampaign();
    t.mock.timers.tick(campaignLoadTimeoutMs);
    await load;
    assert.equal(app.state.loading, false);
    assert.match(app.state.loadError, /demorou para responder/);
    stalled = false;
    await app.loadCampaign();
    await settle();
    assert.equal(app.state.loadError, '');
    if (search) assert.equal(app.state.game.campaignId, 'mesa');
    else assert.equal(app.state.showLibrary, true);
    fetch.mock.restore();
  }
});

test('sessão expirada chega ao login mesmo com corpo vazio e não espera sobreviventes', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 401 }));
  const app = fixture();
  await app.loadCampaign();
  assert.equal(app.state.needsAuth, true);
  assert.equal(app.state.loading, false);
  assert.equal(app.state.loadError, '');
  assert.equal(fetch.mock.callCount(), 1);
});

test('requisição substituída não apaga dados da tentativa mais recente', async t => {
  let resolveOld;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? new Promise(resolve => { resolveOld = resolve; })
    : Response.json({ characters: [{ id: 'nova', name: 'Atual' }] }));
  const app = fixture();
  const old = app.loadAccountCharacters();
  await app.loadAccountCharacters();
  await old;
  resolveOld(Response.json({ characters: [{ id: 'antiga', name: 'Antiga' }] }));
  await settle();
  assert.equal(app.state.accountCharacters[0].name, 'Atual');
  assert.equal(app.state.charactersLoading, false);
  assert.equal(app.state.charactersError, '');
});
