import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.ROAD_PREVIEW_URL || 'http://127.0.0.1:4173' });
for (const width of [390, 1440]) test(`integrated controls cross midnight without rest or duplicate consumption at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/?screen=map&scenario=roads');
  await page.evaluate(() => window.__qa.mutate(g => {
    g.minutes = 1410; g.noise = 3; g.npcs = [];
    for (const person of g.survivors) { person.food = 2; person.water = 2; person.hp = 2; person.stress = 4; }
  }));
  const controls = page.getByRole('region', { name: 'Controles da exploração' });
  await expect(controls).toBeVisible();
  await expect(controls).toContainText('Dia 1 · 23:30');
  await expect(page.getByText('Sessão e reservas', { exact: true })).toHaveCount(0);
  await controls.getByRole('button', { name: '+1 h', exact: true }).click();
  await expect(controls).toContainText('Dia 2 · 00:30');
  expect(await page.evaluate(() => window.__qa.game().survivors.every(p => p.hp === 2 && p.stress === 4 && p.food === 1 && p.water === 1))).toBe(true);
  expect(await page.evaluate(() => window.__qa.game().noise)).toBe(3);
  await controls.getByRole('button', { name: '+30 min', exact: true }).click();
  await expect(controls).toContainText('Dia 2 · 01:00');
  expect(await page.evaluate(() => window.__qa.game().survivors.every(p => p.food === 1 && p.water === 1))).toBe(true);
  await controls.getByRole('button', { name: 'Aumentar Medo', exact: true }).click();
  expect(await page.evaluate(() => window.__qa.game().fear)).toBe(1);
  await controls.getByRole('spinbutton', { name: 'Quantidade de Comida', exact: true }).fill('3');
  expect(await page.evaluate(() => window.__qa.game().shelter.food)).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `outputs/map-session-integrated-${width}.png`, fullPage: true });
});

test('players do not receive time and reserve management controls', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads&role=player');
  await expect(page.getByRole('region', { name: 'Controles da exploração' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+1 h', exact: true })).toHaveCount(0);
});
