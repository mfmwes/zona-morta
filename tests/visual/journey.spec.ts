import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.ROAD_PREVIEW_URL || 'http://127.0.0.1:4173' });

async function openPlan(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Planejar viagem', exact: true }).click();
  await page.getByRole('combobox', { name: 'Caminhos permitidos' }).click();
  await page.getByRole('option', { name: 'Somente vias conectadas', exact: true }).click();
  await page.getByRole('combobox', { name: 'Destino da viagem' }).click();
  await page.getByRole('option', { name: 'Vale Seco · Entrada de Vale Seco (10,0)', exact: true }).click();
  await page.getByRole('button', { name: 'Ver trajeto', exact: true }).click();
}

test('connected road detours, plans provisions, moves the actual group and recomputes remaining stages', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads');
  await openPlan(page);
  const planner = page.getByRole('region', { name: 'Planejamento de viagem' });
  await expect(planner).toContainText('22 km · 11 hexes');
  await expect(planner).toContainText('8 necessárias / 4 levadas');
  await expect(page.locator('.map-planned-route')).toBeVisible();
  await expect(page.locator('[data-road-from="5,0"][data-road-to="6,0"]')).toHaveAttribute('data-blocked', 'true');
  await page.screenshot({ path: 'outputs/roads-desktop.png', fullPage: true });
  const before = await page.evaluate(() => window.__qa.game().minutes);
  await page.getByRole('button', { name: 'Viajar próximo hex', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__qa.game().partyHex)).toBe('1,0');
  expect(await page.evaluate(() => window.__qa.game().minutes)).toBe(before + 60);
  await expect(planner).toContainText('20 km · 10 hexes');
  await expect(planner).toContainText('Marcha já registrada hoje: 1 h');
  expect(await page.evaluate(() => window.__qa.game().survivors.every(p => p.food === 1 && p.water === 1))).toBe(true);
});

test('ordinary hex exploration works by default without connected roads', async ({ page }) => {
  await page.goto('/?screen=map');
  await expect(page.locator('[data-road-from]')).toHaveCount(0);
  await expect(page.getByText('Via conectada', { exact: true })).toHaveCount(0);
  await expect(page.getByText('× Passagem bloqueada', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Planejar viagem', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Caminhos permitidos' })).toContainText('Exploração normal entre hexes');
  await page.getByRole('combobox', { name: 'Destino da viagem' }).click();
  await page.getByRole('option').first().click();
  await expect(page.locator('.map-planned-route')).toHaveAttribute('d', /L/);
  await expect(page.getByRole('region', { name: 'Planejamento de viagem' })).toContainText('2 km · 1 hexes');
  await expect(page.getByRole('button', { name: 'Viajar próximo hex', exact: true })).toBeEnabled();
});

test('hiding roads preserves connections, blocks and the planned detour', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads');
  await openPlan(page);
  const before = await page.evaluate(() => JSON.stringify(window.__qa.game().hexes));
  await page.getByRole('button', { name: 'Ocultar vias', exact: true }).click();
  await expect(page.locator('[data-road-from], .map-road-blocked')).toHaveCount(0);
  await expect(page.getByText('Via conectada', { exact: true })).toHaveCount(0);
  await expect(page.locator('.map-planned-route')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Planejamento de viagem' })).toContainText('22 km · 11 hexes');
  expect(await page.evaluate(() => JSON.stringify(window.__qa.game().hexes))).toBe(before);
  await page.screenshot({ path: 'outputs/roads-hidden.png', fullPage: true });
  await page.getByRole('button', { name: 'Mostrar vias', exact: true }).click();
  await expect(page.locator('[data-road-from="5,0"][data-road-to="6,0"]')).toHaveAttribute('data-blocked', 'true');
  await expect(page.locator('.map-road-blocked')).toBeVisible();
});

test('master can unblock a reciprocal connection from the real sector editor', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads');
  await page.getByRole('searchbox', { name: 'Buscar hex por nome ou coordenadas' }).fill('5,0');
  await page.getByRole('button', { name: 'Buscar no mapa', exact: true }).click();
  await page.getByRole('tab', { name: 'Gestão do setor', exact: true }).click();
  await page.getByText('Conexões e região', { exact: true }).click();
  const blocked = page.getByRole('switch', { name: 'Bloquear passagem para 6,0', exact: true });
  await expect(blocked).toBeChecked();
  await blocked.click();
  expect(await page.evaluate(() => window.__qa.game().hexes['6,0'].connections?.find(l => l.to === '5,0')?.blocked)).toBe(false);
  await page.keyboard.press('Escape');
  await openPlan(page);
  await expect(page.getByRole('region', { name: 'Planejamento de viagem' })).toContainText('20 km · 10 hexes');
});

test('mobile planner fits and player projection hides unknown road endpoints and master controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=map&scenario=roads');
  await openPlan(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'outputs/roads-mobile.png', fullPage: true });
  await page.evaluate(() => window.__qa.mutate(g => { g.hexes['3,0'].discovery = 'desconhecido'; g.hexes['3,0'].region = 'Região secreta'; }));
  await page.getByRole('combobox', { name: 'Perfil', exact: true }).selectOption('player');
  await expect(page.getByRole('button', { name: 'Planejar viagem', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-road-from="3,0"], [data-road-to="3,0"]')).toHaveCount(0);
  await expect(page.getByText('Região secreta', { exact: false })).toHaveCount(0);
});
