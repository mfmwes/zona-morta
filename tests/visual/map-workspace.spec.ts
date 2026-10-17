import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.ROAD_PREVIEW_URL || 'http://127.0.0.1:4173' });

for (const width of [1280, 1440, 1920]) test(`map heading and log share one compact row at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/?screen=map&scenario=roads');
  const heading = page.locator('.map-stage-heading');
  await expect(heading.getByRole('heading', { name: 'Mapa de exploração', exact: true })).toBeVisible();
  await expect(heading).toContainText('39 áreas');
  expect((await heading.boundingBox())!.height).toBeLessThanOrEqual(40);
  const surfaceBefore = (await page.locator('.world-map-viewport').boundingBox())!;
  await heading.locator('.map-log-popover summary').click();
  await expect(page.locator('.map-log-popover details')).toHaveAttribute('open', '');
  await expect(page.locator('.map-log-popover details > div')).toBeVisible();
  expect((await page.locator('.world-map-viewport').boundingBox())!.height).toBe(surfaceBefore.height);
  await heading.locator('.map-log-popover summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('map log fits the mobile viewport without expanding the heading', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?screen=map&scenario=roads');
  const heading = page.locator('.map-stage-heading');
  const before = (await heading.boundingBox())!.height;
  await heading.locator('.map-log-popover summary').click();
  const panel = page.locator('.map-log-popover details > div');
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect((await heading.boundingBox())!.height).toBe(before);
});

for (const width of [1280, 1440, 1920]) {
  test(`map chat opens inside the viewport, stays open across screens and closes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?screen=map&scenario=roads&chat');
    await page.getByRole('button', { name: 'Chat', exact: true }).click();
    const chat = page.getByRole('complementary', { name: 'Chat da mesa', exact: true });
    await expect(chat).toBeVisible();
    await expect.poll(async () => {
      const box = await chat.boundingBox();
      return Boolean(box && box.y >= 0 && box.y + box.height <= 1001 && box.x >= 0 && box.x + box.width <= width + 1);
    }).toBe(true);
    if (width > 1320) {
      const chatBox = (await chat.boundingBox())!;
      const mapBox = (await page.locator('.map-workbench').boundingBox())!;
      expect(mapBox.x + mapBox.width).toBeLessThanOrEqual(chatBox.x + 1);
    }
    await page.getByRole('textbox', { name: 'Mensagem para a mesa' }).fill('Chat funcionando no mapa');
    await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click();
    await expect(chat).toContainText('Chat funcionando no mapa');
    await page.getByRole('combobox', { name: 'Tela', exact: true }).selectOption('scene');
    await expect(chat).toBeVisible();
    await page.getByRole('combobox', { name: 'Tela', exact: true }).selectOption('map');
    await expect(chat).toBeVisible();
    const box = (await chat.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(1001);
    if (width === 1440) await page.screenshot({ path: 'outputs/map-chat-fixed.png', fullPage: true });
    await chat.getByRole('button', { name: 'Fechar chat', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute('aria-expanded', 'false');
    if (width > 1320) await expect(chat).toBeHidden();
    else await expect.poll(async () => (await chat.boundingBox())?.x).toBeGreaterThanOrEqual(width);
  });
}

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
