import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.ROAD_PREVIEW_URL || 'http://127.0.0.1:4173' });

test('desktop hex management keeps the original dialog and tabs without narrowing the map', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?screen=map&scenario=roads');
  const map = page.getByRole('img', { name: /^Mapa de exploração com/ });
  await expect(page.locator('.map-workbench')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  expect((await map.boundingBox())!.height).toBeGreaterThan(650);
  const bounds = (await map.boundingBox())!;
  await page.getByRole('button', { name: 'Detalhes do hex selecionado', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Setor do mapa · Hex 0,0' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.map-inspector')).toHaveCount(0);
  await expect(dialog.getByRole('tab', { name: 'Exploração', exact: true })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Gestão do setor', exact: true }).click();
  await expect(dialog.getByText('Conexões e região', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'outputs/map-workspace-master.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect((await map.boundingBox())!.width).toBe(bounds.width);
});

test('player hex dialog keeps revealed locations and hides management and private notes', async ({ page }) => {
  await page.goto('/?screen=map&scenario=roads&role=player');
  await page.getByRole('button', { name: 'Detalhes do hex selecionado', exact: true }).click();
  const inspector = page.getByRole('dialog');
  await expect(inspector).toContainText('Mercado da praça');
  await expect(inspector).not.toContainText('Depósito secreto');
  await expect(inspector).not.toContainText('Nota reservada');
  await expect(page.getByRole('tab', { name: 'Gestão do setor' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expandir mundo', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'outputs/map-workspace-player.png', fullPage: true });
});

test('mobile opens sector details in a dismissible bottom drawer without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=map&scenario=roads');
  await page.getByRole('button', { name: 'Detalhes do hex selecionado', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('complementary', { name: /^Setor do mapa/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'outputs/map-workspace-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Voltar ao mapa', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
