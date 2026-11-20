import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.OVERVIEW_PREVIEW_URL || 'http://127.0.0.1:4173' });

for (const [width, height] of [[1366, 768], [1440, 900], [1920, 925]]) {
  test(`overview keeps all five panels in the viewport at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?screen=overview&base=1');
    await expect(page.getByText('Equipe agora', { exact: true })).toBeVisible();
    const cards = page.locator('.master-overview-card');
    // Três cartões na grade ("Em andamento" fica dentro de "Equipe agora") + sessão e retomada.
    await expect(cards).toHaveCount(5);
    for (const card of await cards.all()) {
      const box = (await card.boundingBox())!;
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `outputs/overview-validated-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Explorar mapa', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Mesa de exploração' })).toBeVisible();
    await expect(page.locator('.overview-mode')).toHaveCount(0);
  });
}

test('sparse overview cards follow their content and narrow team cards keep names on one line', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?screen=overview');
  const attention = page.locator('.master-overview-attention');
  await expect(attention.getByRole('button', { name: 'Abrir registro', exact: true })).toBeVisible();
  // Sem caixa esticada: o cartão termina logo após a última pendência.
  const gap = await attention.evaluate(card => card.getBoundingClientRect().bottom - card.querySelector('.master-overview-list')!.getBoundingClientRect().bottom);
  expect(gap).toBeLessThan(40);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.setViewportSize({ width: 900, height: 1000 });
  const name = page.locator('.overview-person-link').first();
  await expect(name).toBeVisible();
  expect((await name.boundingBox())!.height).toBeLessThan(40);
});

test('crowded overview keeps filters and all attention records accessible inside the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?screen=overview');
  await page.evaluate(() => window.__qa.mutate(g => {
    g.survivors = Array.from({ length: 20 }, (_, i) => ({ ...structuredClone(g.survivors[0]), id: `crowd-${i}`, name: `Sobrevivente ${i}`, hex: i % 2 ? '1,0' : '0,0' }));
    for (const h of Object.values(g.hexes)) h.events = [];
    g.hexes['0,0'].events = Array.from({ length: 15 }, (_, i) => ({ id: `event-${i}`, text: `Ocorrência ${i}`, trigger: '', status: 'active', revealed: true }));
  }));
  const attention = page.locator('.master-overview-attention');
  await expect(attention.getByLabel('Buscar pendências', { exact: true })).toBeVisible();
  await attention.getByRole('button', { name: 'Ver todas as 15 pendências', exact: true }).click();
  await expect(attention.getByRole('button', { name: 'Abrir registro', exact: true })).toHaveCount(15);
  await attention.getByLabel('Buscar pendências', { exact: true }).fill('Ocorrência 14');
  await expect(attention.getByRole('button', { name: 'Abrir registro', exact: true })).toHaveCount(1);
  await expect(attention).toContainText('1 de 15 pendências');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await attention.getByRole('button', { name: 'Abrir registro', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Mesa de exploração' })).toBeVisible();
});

test('session and recap remain usable without increasing the desktop page height', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/?screen=overview');
  await page.getByRole('button', { name: 'Iniciar sessão', exact: true }).click();
  // Formulário aberto: o cartão não rola por dentro (o título "Sessões da mesa" fica visível) e os cartões não se sobrepõem.
  const sessions = page.locator('.campaign-sessions');
  await expect(sessions.getByText('Sessões da mesa', { exact: true })).toBeInViewport();
  expect(await sessions.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.scrollTop === 0)).toBe(true);
  expect(await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('.master-overview-card')].map(el => el.getBoundingClientRect()).filter(b => b.height > 0);
    return boxes.every((a, i) => boxes.every((b, j) => i === j || a.bottom <= b.top + 1 || b.bottom <= a.top + 1 || a.right <= b.left + 1 || b.right <= a.left + 1));
  })).toBe(true);
  await page.getByRole('textbox', { name: 'Nome da sessão', exact: true }).fill('Hospital');
  await page.getByRole('button', { name: 'Confirmar início', exact: true }).click();
  await expect(page.getByText('Em andamento: Hospital', { exact: true })).toBeVisible();
  await page.locator('.overview-utilities > section:last-child > details > summary').click();
  await expect(page.getByText('Onde paramos', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
});

test('mobile overview preserves readable controls, disclosures and navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=overview&base=1');
  await page.getByRole('combobox', { name: 'Tema', exact: true }).selectOption('light');
  await expect(page.getByText('Equipe agora', { exact: true })).toBeVisible();
  await page.getByText('Sessão da mesa', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Iniciar sessão', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Explorar mapa', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Mesa de exploração' })).toBeVisible();
});
