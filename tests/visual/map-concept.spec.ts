import { test, expect } from '@playwright/test';

test('illustrated map keeps details beside the map, filters, search and camera when opening a location', async ({page}) => {
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1600,height:1100});
  await page.goto('/?screen=map');
  await expect(page.getByRole('complementary',{name:'Detalhes do setor'})).toBeVisible();
  await expect(page.locator('.map-hex-art').first()).toBeVisible();
  await expect(page.getByRole('heading',{name:'Bairro residencial',exact:true})).toBeVisible();
  const panel=await page.locator('.hex-detail-desktop').boundingBox(),map=await page.locator('.map-main-panel').boundingBox();
  expect(panel!.x).toBeGreaterThanOrEqual(map!.x+map!.width);
  await page.getByRole('button',{name:'Eventos pendentes',exact:true}).click();
  await expect(page.locator('.map-cell.is-filtered').first()).toBeVisible();
  await page.getByRole('button',{name:'Todos',exact:true}).click();
  await page.getByRole('searchbox',{name:'Buscar setor, local ou pista'}).fill('Mercado da praca');
  await page.locator('.world-map-results button').click();
  await page.getByRole('button',{name:'Ampliar mapa',exact:true}).click();
  const camera=await page.locator('.world-map-viewport > svg').getAttribute('viewBox');
  await page.locator('.hex-point-card').filter({hasText:'Mercado da praça'}).getByRole('button',{name:'Explorar local',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.locator('.world-map-viewport > svg').getAttribute('viewBox')).toBe(camera);
  await page.getByRole('button',{name:'Expandir mapa',exact:true}).click();
  await expect(page.locator('.hex-detail-desktop')).toBeHidden();
  await page.getByRole('button',{name:'Restaurar painel',exact:true}).click();
  await expect(page.locator('.hex-detail-desktop')).toBeVisible();
  await page.screenshot({path:'outputs/map-concept-desktop.png',fullPage:true});
  expect(errors).toEqual([]);
});

test('player search and filters do not disclose reserved locations or unknown terrain',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});await page.goto('/?screen=map&role=player');
  await expect(page.getByText('Depósito secreto',{exact:true})).toHaveCount(0);
  await page.getByRole('searchbox').fill('Depósito secreto');
  await expect(page.locator('.world-map-results button')).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await expect(page.locator('.map-cell').filter({hasText:'Fora do horizonte'}).locator('.map-hex-art')).toHaveCount(0);
  await page.screenshot({path:'outputs/map-concept-player.png',fullPage:true});
});

test('map and sector sheet fit mobile and light theme',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?screen=map');
  await expect(page.locator('.world-map-viewport')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.locator('.mobile-sector-selection').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Bairro residencial',exact:true})).toBeVisible();
  await page.screenshot({path:'outputs/map-concept-mobile.png',animations:'disabled'});
  await page.getByRole('button',{name:'Voltar ao mapa',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Tema',{exact:true}).selectOption('light');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'outputs/map-concept-light.png',fullPage:true});
});
