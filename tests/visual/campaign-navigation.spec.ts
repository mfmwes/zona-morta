import { test, expect } from '@playwright/test';

test.use({ baseURL: process.env.ROAD_PREVIEW_URL || 'http://127.0.0.1:4173' });

for (const width of [960, 1440]) {
  for (const role of ['master', 'player']) {
    test(`compact navigation is consistent across sections for ${role} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?screen=map&scenario=roads&role=${role}&chat`);
      const rail = page.locator('.rail');
      const workspace = page.locator('.workspace');
      for (const screen of ['map', 'sheet', 'shelter', 'scene', 'conflict', 'npcs', 'reading']) {
        await page.getByRole('combobox', { name: 'Tela', exact: true }).selectOption(screen);
        expect((await rail.boundingBox())!.width).toBe(72);
        expect((await workspace.boundingBox())!.x).toBe(72);
        expect(await workspace.evaluate(el => el.clientWidth)).toBe(width - 72);
        await expect(rail.getByRole('button', { name: 'Ficha', exact: true })).toHaveAttribute('title', 'Ficha');
        await expect(rail.getByRole('button', { name: 'Escolher estilo visual', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
      await page.getByRole('button', { name: 'Chat', exact: true }).click();
      const chat = page.getByRole('complementary', { name: 'Chat da mesa', exact: true });
      await expect(chat).toBeVisible();
      await expect.poll(async () => {
        const box = (await chat.boundingBox())!;
        return box.x + box.width;
      }).toBeLessThanOrEqual(width + 1);
      if (width > 1320) expect((await workspace.boundingBox())!.width).toBe(width - 72 - 360);
      await chat.getByRole('button', { name: 'Fechar chat', exact: true }).click();
      if (width > 1320) await expect(chat).toBeHidden();
      await rail.getByRole('button', { name: 'Abrigo', exact: true }).click();
      await expect(rail.getByRole('button', { name: 'Abrigo', exact: true })).toHaveAttribute('aria-current', 'page');
      if (role === 'master' && width === 1440) await page.screenshot({ path: 'outputs/shared-navigation-shelter.png', fullPage: true });
    });
  }
}
