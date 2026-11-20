/* eslint-disable @typescript-eslint/no-require-imports -- Run the real preference code and first-paint script without a browser. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, filename);
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...args) { return resolve.call(this, name.startsWith('@/') ? path.join(__dirname, '..', name.slice(2)) : name, parent, ...args); };
const appearance = require('../lib/appearance.ts');

function root() {
  return { dataset: {}, removeAttribute(name) { if (name === 'data-visual-style') delete this.dataset.visualStyle; } };
}
function boot(values = {}, blockedKey) {
  const element = root(), removed = [];
  vm.runInNewContext(appearance.appearanceBootstrapScript, {
    document: { documentElement: element },
    localStorage: {
      getItem(key) { if (key === blockedKey) throw new Error('Storage unavailable'); return values[key] ?? null; },
      removeItem(key) { if (key === blockedKey) throw new Error('Storage unavailable'); removed.push(key); },
    },
  });
  return { dataset: element.dataset, removed };
}

test('o documento sempre recebe o Refinado, inclusive para quem tinha outro estilo salvo', () => {
  assert.equal(appearance.visualStyle, 'refinado');
  for (const saved of [undefined, 'current', 'fiel', 'leitura', 'tecnico', '<script>alert(1)</script>']) {
    const { dataset, removed } = boot({ [appearance.visualStyleStorageKey]: saved });
    assert.deepEqual(dataset, { visualStyle: 'refinado' });
    assert.deepEqual(removed, [appearance.visualStyleStorageKey]);
  }
});

test('inicialização restaura claro/noturno antes da hidratação e ignora valores desconhecidos', () => {
  for (const theme of ['light', 'dark']) assert.deepEqual(boot({ [appearance.themeStorageKey]: theme }).dataset, { theme, visualStyle: 'refinado' });
  for (const value of ['invalid', 'DARK', '', '<script>alert(1)</script>']) assert.deepEqual(boot({ [appearance.themeStorageKey]: value }).dataset, { visualStyle: 'refinado' });
});

test('armazenamento bloqueado não impede o estilo nem o tema', () => {
  assert.deepEqual(boot({ [appearance.themeStorageKey]: 'dark' }, appearance.visualStyleStorageKey).dataset, { theme: 'dark', visualStyle: 'refinado' });
  assert.deepEqual(boot({}, appearance.themeStorageKey).dataset, { visualStyle: 'refinado' });
});

test('controle alterna claro e noturno com um clique e não oferece mais seletor de estilo', () => {
  const element = root(); element.dataset.visualStyle = 'refinado';
  const saved = new Map();
  global.document = { documentElement: element };
  global.window = { localStorage: { setItem: (key, value) => saved.set(key, value) } };
  const originalLoad = Module._load;
  Module._load = function (name, parent, main) {
    if (parent?.filename.endsWith('theme-toggle.tsx') && name === '@/hooks/use-campaign-theme') return { useCampaignTheme: () => element.dataset.theme ?? 'light' };
    return originalLoad.call(this, name, parent, main);
  };
  try {
    const { ThemeToggle } = require('../components/theme-toggle.tsx');
    function nodes(node, found = []) { if (Array.isArray(node)) node.forEach(child => nodes(child, found)); else if (node?.props) { found.push(node); nodes(node.props.children, found); } return found; }
    const view = nodes(ThemeToggle());
    const toggle = view.find(node => node.props['aria-label'] === 'Alternar entre modo claro e modo noturno');
    toggle.props.onClick(); assert.equal(element.dataset.theme, 'dark'); assert.equal(saved.get(appearance.themeStorageKey), 'dark');
    toggle.props.onClick(); assert.equal(element.dataset.theme, 'light');
    assert.equal(element.dataset.visualStyle, 'refinado');
    assert.equal(view.filter(node => node.type === 'button').length, 1);
    assert.equal(view.some(node => node.type === 'input'), false);
  } finally { Module._load = originalLoad; delete global.document; delete global.window; }
});
