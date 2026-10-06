/* eslint-disable @typescript-eslint/no-require-imports -- exercise the real persistence boundary with a D1 stub */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, filename);
let stored, writes;
const database = {
  prepare(sql) {
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() {
        if (sql.startsWith('SELECT revision, body')) {
          assert.equal(args[0], 'opened-campaign');
          return { revision: 7, body: JSON.stringify(stored) };
        }
        return null;
      },
      async run() {
        if (sql.startsWith('UPDATE campaign_states')) writes.push({ args, body: JSON.parse(args[0]) });
        if (sql.startsWith('INSERT OR IGNORE INTO campaign_states')) writes.push({ args, body: JSON.parse(args[1]) });
        return { meta: { changes: 1 } };
      },
    };
  },
};
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === 'cloudflare:workers') return { env: { DB: database } };
  if (name === '@/lib/auth') return {};
  if (name.startsWith('@/')) return originalLoad.call(this, path.join(__dirname, '..', name.slice(2) + '.ts'), parent, main);
  return originalLoad.call(this, name, parent, main);
};
const { readCampaign, writeCampaign } = require('../db/state.ts');
Module._load = originalLoad;
const { defaultState } = require('../lib/game.ts');
const { projectPlayerGame } = require('../lib/collaboration.ts');
const { createConflictScene } = require('../lib/conflict.ts');

test('leitura de campanha legada ou importada usa o ID aberto também na projeção do jogador', async () => {
  stored = defaultState(); stored.campaignId = 'imported-campaign';
  stored.conflict = createConflictScene({ name: 'Conflito existente', sceneNumber: 1, day: 1, time: '08:00', survivorIds: ['new-survivor'] });
  const result = await readCampaign('opened-campaign');
  assert.equal(result.revision, 7);
  assert.equal(result.state.campaignId, 'opened-campaign');
  assert.equal(projectPlayerGame(result.state, 'new-survivor').campaignId, 'opened-campaign');
  assert.deepEqual(result.state.conflict.survivorIds, ['new-survivor']);
  assert.equal(stored.campaignId, 'imported-campaign');
});

test('salvamentos novos e CAS persistem o ID do registro sem alterar o objeto recebido', async () => {
  const state = defaultState(); state.campaignId = 'imported-campaign'; writes = [];
  assert.equal(await writeCampaign('opened-campaign', state, 7), 8);
  assert.equal(writes[0].args[2], 'opened-campaign');
  assert.equal(writes[0].args[3], 7);
  assert.equal(writes[0].body.campaignId, 'opened-campaign');
  assert.equal(await writeCampaign('opened-campaign', state, 0), 1);
  assert.equal(writes[1].args[0], 'opened-campaign');
  assert.equal(writes[1].body.campaignId, 'opened-campaign');
  assert.equal(state.campaignId, 'imported-campaign');
});
