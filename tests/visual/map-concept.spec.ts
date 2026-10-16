import { test, expect } from '@playwright/test';
test('hex artwork preserves original map controls and master sector dialog',async({page})=>{
  await page.setViewportSize({width:1600,height:1100}); await page.goto('/?screen=map');
  await expect(page.locator('.map-hex-art').first()).toBeVisible();
  await expect(page.getByRole('button',{name:'Expandir mapa',exact:true})).toHaveCount(0);
  await expect(page.getByRole('group',{name:'Filtrar setores'})).toHaveCount(0);
  await expect(page.getByRole('searchbox',{name:'Buscar hex por nome ou coordenadas'})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Ampliar mapa',exact:true}).click();
  await page.screenshot({path:'outputs/map-visual-only-desktop.png',fullPage:true});
  await page.locator('.map-cell').filter({has:page.locator('.map-group-marker-main')}).press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('tab',{name:'Gestão do setor',exact:true})).toBeVisible();
  await page.screenshot({path:'outputs/map-visual-only-dialog.png',animations:'disabled'});
});
test('mobile keeps original sheet and unknown hexes have no art',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?screen=map&role=player');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator('.map-cell').filter({hasText:'Fora do horizonte'}).locator('.map-hex-art')).toHaveCount(0);
  await page.locator('.mobile-sector-selection').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByText('Depósito secreto',{exact:true})).toHaveCount(0);
  await page.screenshot({path:'outputs/map-visual-only-mobile.png',animations:'disabled'});
});
