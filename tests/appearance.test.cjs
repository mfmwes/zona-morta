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
  const element = root();
  vm.runInNewContext(appearance.appearanceBootstrapScript, {
    document: { documentElement: element },
    localStorage: { getItem(key) { if (key === blockedKey) throw new Error('Storage unavailable'); return values[key] ?? null; } },
  });
  return element.dataset;
}

test('primeiro acesso abre no Refinado sem criar uma preferência; quem escolheu o clássico continua nele', () => {
  assert.equal(appearance.defaultVisualStyle, 'refinado');
  assert.deepEqual(boot(), { visualStyle: 'refinado' });
  assert.deepEqual(boot({ [appearance.visualStyleStorageKey]: 'current', [appearance.themeStorageKey]: 'dark' }), { theme: 'dark' });
});

test('inicialização restaura cada estilo nos dois modos antes da hidratação', () => {
  for (const style of ['fiel', 'leitura', 'tecnico', 'refinado']) for (const theme of ['light', 'dark']) {
    assert.deepEqual(boot({ [appearance.visualStyleStorageKey]: style, [appearance.themeStorageKey]: theme }), { visualStyle: style, theme });
  }
});

test('valores desconhecidos ou maliciosos não se tornam atributos do documento', () => {
  for (const value of ['invalid', 'DARK', '', '<script>alert(1)</script>']) {
    assert.deepEqual(boot({ [appearance.visualStyleStorageKey]: value, [appearance.themeStorageKey]: value }), { visualStyle: 'refinado' });
    assert.equal(appearance.isVisualStyle(value), false);
  }
});

test('falha de armazenamento de uma preferência não impede a outra', () => {
  assert.deepEqual(boot({ [appearance.visualStyleStorageKey]: 'tecnico' }, appearance.themeStorageKey), { visualStyle: 'tecnico' });
  assert.deepEqual(boot({ [appearance.themeStorageKey]: 'dark' }, appearance.visualStyleStorageKey), { theme: 'dark', visualStyle: 'refinado' });
});

test('troca de estilo persiste, preserva claro/escuro e permite voltar ao CSS original', () => {
  const element = root(), saved = new Map();
  element.dataset.theme = 'dark';
  global.document = { documentElement: element };
  global.window = { localStorage: { setItem: (key, value) => saved.set(key, value) } };
  try {
    for (const style of ['fiel', 'leitura', 'tecnico', 'refinado']) {
      appearance.setVisualStyle(style);
      assert.equal(element.dataset.visualStyle, style);
      assert.equal(element.dataset.theme, 'dark');
      assert.equal(saved.get(appearance.visualStyleStorageKey), style);
    }
    appearance.setVisualStyle('current');
    assert.deepEqual(element.dataset, { theme: 'dark' });
    assert.equal(saved.get(appearance.visualStyleStorageKey), 'current');
    appearance.setVisualStyle('unknown');
    assert.deepEqual(element.dataset, { theme: 'dark' });
  } finally { delete global.document; delete global.window; }
});

test('estilo continua utilizável quando o navegador bloqueia localStorage', () => {
  const element = root();
  global.document = { documentElement: element };
  global.window = { get localStorage() { throw new Error('Storage blocked'); } };
  try { appearance.setVisualStyle('leitura'); assert.equal(element.dataset.visualStyle, 'leitura'); }
  finally { delete global.document; delete global.window; }
});

test('controles mantêm a alternância direta de modo e oferecem os cinco estilos com rádios', () => {
  const element = root(); element.dataset.visualStyle = 'tecnico';
  global.document = { documentElement: element };
  global.window = { localStorage: { setItem() {} } };
  const originalLoad = Module._load;
  Module._load = function (name, parent, main) {
    if (parent?.filename.endsWith('theme-toggle.tsx')) {
      if (name === 'react') return { useId: () => 'appearance-test', useState: () => [true, () => {}] };
      if (name === '@/hooks/use-campaign-theme') return { useCampaignTheme: () => element.dataset.theme ?? 'light' };
      if (name === '@/hooks/use-visual-style') return { useVisualStyle: () => element.dataset.visualStyle ?? 'current' };
      if (name === '@/components/ui/popover') return { Popover: 'popover', PopoverTrigger: 'trigger', PopoverContent: 'dialog' };
    }
    return originalLoad.call(this, name, parent, main);
  };
  try {
    const { ThemeToggle } = require('../components/theme-toggle.tsx');
    function nodes(node, found = []) { if (Array.isArray(node)) node.forEach(child => nodes(child, found)); else if (node?.props) { found.push(node); nodes(node.props.children, found); } return found; }
    const view = nodes(ThemeToggle());
    const toggle = view.find(node => node.props['aria-label'] === 'Alternar entre modo claro e modo noturno');
    toggle.props.onClick(); assert.equal(element.dataset.theme, 'dark'); assert.equal(element.dataset.visualStyle, 'tecnico');
    toggle.props.onClick(); assert.equal(element.dataset.theme, 'light');
    const radios = view.filter(node => node.type === 'input' && node.props.type === 'radio');
    assert.deepEqual(radios.map(node => node.props.value), ['refinado', 'current', 'fiel', 'leitura', 'tecnico']);
    assert.equal(radios.filter(node => node.props.checked).length, 1);
    assert.equal(radios.find(node => node.props.checked).props.value, 'tecnico');
    radios.find(node => node.props.value === 'fiel').props.onChange(); assert.equal(element.dataset.visualStyle, 'fiel');
    assert.equal(element.dataset.theme, 'light');
  } finally { Module._load = originalLoad; delete global.document; delete global.window; }
});
