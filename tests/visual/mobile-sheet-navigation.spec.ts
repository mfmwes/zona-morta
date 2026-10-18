import { test, expect } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
  test(`sheet More menu stays inside the mobile viewport and opens every section at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/?screen=sheet&role=player');
    await expect(page.locator('.mobile-sheet-navigation')).toBeVisible();
    // The preview uses the desktop shell. Enable the production mobile dialog rules.
    await page.evaluate(() => {
      const marker = document.createElement('div');
      marker.className = 'mobile-campaign';
      marker.hidden = true;
      document.body.appendChild(marker);
    });

    const more = page.locator('.mobile-sheet-navigation > button');
    for (const section of ['Atributos', 'Combate', 'Condições', 'História', 'Inventário', 'Habilidades', 'Resumo']) {
      await more.tap();
      const dialog = page.getByRole('dialog', { name: 'Seções da ficha', exact: true });
      await expect(dialog).toBeVisible();
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
      await dialog.getByRole('button', { name: section, exact: true }).tap();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole('tabpanel', { name: section === 'Resumo' ? 'Resumo da ficha' : section, exact: true })).toBeVisible();
      await expect(more).toBeFocused();
    }
    await more.tap();
    await page.getByRole('dialog', { name: 'Seções da ficha', exact: true }).getByRole('button', { name: 'Fechar', exact: true }).tap();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(more).toBeFocused();
    await page.getByRole('tab', { name: 'Inventário', exact: true }).tap();
    await expect(page.getByRole('tabpanel', { name: 'Inventário', exact: true })).toBeVisible();
  });
}
