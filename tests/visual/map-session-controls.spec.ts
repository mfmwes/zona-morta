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
  await controls.getByText('Ajustar compartilhado', { exact: true }).click();
  await controls.getByRole('spinbutton', { name: 'Quantidade de Comida compartilhada', exact: true }).fill('3');
  expect(await page.evaluate(() => window.__qa.game().shelter.food)).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `outputs/map-session-integrated-${width}.png`, fullPage: true });
});

test('map reserve totals follow the selected group and shared adjustments leave backpacks unchanged', async ({ page }) => {
  await page.goto('/?screen=map');
  await page.evaluate(() => window.__qa.mutate(g => {
    g.shelter.hex = '0,0'; g.shelter.food = 3; g.shelter.water = 4; g.shelter.parts = 6;
    g.survivors[0].food = 2; g.survivors[0].water = 1;
    g.survivors[1].hex = '1,0'; g.survivors[1].food = 7; g.survivors[1].water = 5;
  }));
  const controls = page.getByRole('region', { name: 'Controles da exploração' });
  await expect(controls.getByLabel('Comida disponível ao grupo ativo', { exact: true })).toHaveText('5');
  await controls.getByText('Ajustar compartilhado', { exact: true }).click();
  await controls.getByRole('spinbutton', { name: 'Quantidade de Comida compartilhada', exact: true }).fill('4');
  await expect(controls.getByLabel('Comida disponível ao grupo ativo', { exact: true })).toHaveText('6');
  expect(await page.evaluate(() => window.__qa.game().survivors.map(p => p.food))).toEqual([2, 7]);
  await controls.getByText('Ajustar compartilhado', { exact: true }).click();
  await page.getByRole('button', { name: /Rafael de Albuquerque.*Hex 1,0/ }).click();
  await expect(controls.getByLabel('Comida disponível ao grupo ativo', { exact: true })).toHaveText('7');
  await expect(controls.getByLabel('Água disponível ao grupo ativo', { exact: true })).toHaveText('5');
  await expect(controls).toContainText('Abrigo distante: 4 comida · 4 água · 6 peças');
  await expect(controls.getByText('Ajustar compartilhado', { exact: true })).toHaveCount(0);
});

test('players do not receive time and reserve management controls', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads&role=player');
  await expect(page.getByRole('region', { name: 'Controles da exploração' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '+1 h', exact: true })).toHaveCount(0);
});

test('fractured leg duration in the sector matches actual arrival and prevents crossing midnight', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads');
  await page.evaluate(() => window.__qa.mutate(g => {
    g.minutes = 480;
    g.survivors[0].conditions = [{ id: 'fracture', kind: 'fracture', bodyRegion: 'left-leg' }];
  }));
  await page.getByRole('searchbox', { name: 'Buscar hex por nome ou coordenadas' }).fill('1,0');
  await page.getByRole('button', { name: 'Buscar no mapa', exact: true }).click();
  const travel = page.getByRole('button', { name: 'Mover grupo principal · 1h30', exact: true });
  await expect(travel).toBeEnabled();
  await expect(page.getByText('Travessia: 1h30.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__qa.mutate(g => { g.minutes = 1360; }));
  await expect(travel).toBeDisabled();
  await page.evaluate(() => window.__qa.mutate(g => { g.minutes = 480; }));
  await travel.click();
  expect(await page.evaluate(() => ({ minute: window.__qa.game().minutes, hex: window.__qa.game().partyHex }))).toEqual({ minute: 570, hex: '1,0' });
});

test('scarce shared food is kept for the survivor without personal supplies at midnight', async ({ page }) => {
  await page.goto('/?screen=map');
  await page.evaluate(() => window.__qa.mutate(g => {
    g.minutes = 1410; g.npcs = []; g.shelter.residents = 0; g.shelter.food = 1;
    g.survivors[0].food = 1; g.survivors[1].food = 0;
    for (const p of g.survivors) { p.water = 2; p.stress = 0; }
  }));
  await page.getByRole('button', { name: '+1 h', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const g = window.__qa.game();
    return { day: g.day, food: g.shelter.food, people: g.survivors.map(p => ({ food: p.food, stress: p.stress })) };
  })).toEqual({ day: 2, food: 0, people: [{ food: 0, stress: 0 }, { food: 0, stress: 0 }] });
});

test('master can request rest again after a scene change cancels an unstarted rest', async ({ page }) => {
  await page.goto('/?screen=map&scenario=rest');
  expect(await page.evaluate(() => window.__qa.game().playerActions?.operations[0].status)).toBe('forming');
  await page.getByRole('button', { name: 'Nova cena', exact: true }).click();
  expect(await page.evaluate(() => window.__qa.game().playerActions?.operations[0].status)).toBe('cancelled');
  await page.getByRole('button', { name: 'Ficha', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar descanso curto · 1h', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__qa.game().playerActions?.operations
    .filter(op => op.type === 'rest' && op.status === 'forming').map(op => op.scene))).toEqual([2]);
  await expect(page.getByText('Já há um descanso aguardando confirmação destes participantes.', { exact: true })).toHaveCount(0);
});

for (const width of [1440, 1920]) test(`session bar stays compact with a remote shelter at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/?screen=map&scenario=roads');
  await page.evaluate(() => window.__qa.mutate(g => { g.shelter.hex = '1,0'; }));
  await expect(page.getByText(/Abrigo distante:/)).toBeVisible();
  expect((await page.locator('.map-session-bar').boundingBox())!.height).toBeLessThanOrEqual(110);
  expect((await page.locator('.world-map-viewport').boundingBox())!.height).toBeGreaterThan(650);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
