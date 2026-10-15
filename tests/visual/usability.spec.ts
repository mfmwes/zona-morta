import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.page')).toBeVisible();
  await expect(page.locator('.runtime-error-panel')).toHaveCount(0);
  if(path.includes('screen=scene')) await expect(page.locator('.scene-viewport')).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}))).toEqual(expect.objectContaining({width:expect.any(Number)}));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
async function objectCount(page: Page) { return page.evaluate(()=>window.__qa.game().sceneBoard!.scenes[0].objects.length); }

test('scene undo, redo, keyboard guards and conflict protection',async({page})=>{
  await ready(page,'/?screen=scene');await page.getByRole('button',{name:'Montar cena',exact:true}).click();
  const count=await objectCount(page);
  await page.getByTitle('Adicionar Mesa',{exact:true}).click();expect(await objectCount(page)).toBe(count+1);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();expect(await objectCount(page)).toBe(count);
  await page.getByRole('button',{name:'Refazer',exact:true}).click();expect(await objectCount(page)).toBe(count+1);
  await page.locator('.scene-board-root').focus();await page.keyboard.press('Control+z');expect(await objectCount(page)).toBe(count);
  await page.keyboard.press('Control+Shift+z');expect(await objectCount(page)).toBe(count+1);
  await page.getByRole('searchbox',{name:'Buscar na biblioteca visual'}).fill('Cama');await page.keyboard.press('Control+z');expect(await objectCount(page)).toBe(count+1);
  await page.evaluate(()=>window.__qa.mutate(d=>{d.sceneBoard!.scenes[0].objects.at(-1)!.label='Alterado por outro participante';}));
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();expect(await objectCount(page)).toBe(count+1);
  await expect(page.getByText(/Os elementos desta ação mudaram/)).toBeVisible();
});

test('favorite objects and templates persist and insert as one undoable action',async({page})=>{
  await ready(page,'/?screen=scene');await page.getByRole('button',{name:'Montar cena',exact:true}).click();
  await page.getByRole('button',{name:'Favoritar Mesa',exact:true}).click();
  await page.getByRole('button',{name:'Favoritos',exact:true}).click();
  await expect(page.getByTitle('Adicionar Mesa',{exact:true})).toBeVisible();
  await expect(page.getByTitle('Adicionar Cama',{exact:true})).toHaveCount(0);
  await page.getByTitle('Adicionar Mesa',{exact:true}).click();
  await page.getByRole('button',{name:'Guardar seleção',exact:true}).click();
  await page.getByLabel('Nome do modelo').fill('Posto de trabalho');
  await page.getByRole('button',{name:'Guardar modelo',exact:true}).click();
  const count=await objectCount(page);await page.getByRole('button',{name:'Inserir modelo',exact:true}).click();expect(await objectCount(page)).toBe(count+1);
  await page.getByRole('button',{name:'Desfazer',exact:true}).click();expect(await objectCount(page)).toBe(count);
  await page.reload();await page.getByRole('button',{name:'Montar cena',exact:true}).click();
  await page.getByRole('button',{name:'Modelos',exact:true}).click();await expect(page.getByText('Posto de trabalho',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Objetos',exact:true}).click();await expect(page.getByRole('button',{name:'Favoritar Mesa',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('scene preparation layout remains readable on desktop and mobile',async({page},testInfo)=>{
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    await ready(page,'/?screen=scene');
    await page.getByRole('button',{name:'Montar cena',exact:true}).click();
    await noOverflow(page);
    await expect(page.getByRole('button',{name:'Guardar seleção',exact:true})).toBeVisible();
    await page.screenshot({path:`outputs/preview-scene-${width}.png`,fullPage:true});
    await testInfo.attach(`preparation-${width}`,{body:await page.screenshot(),contentType:'image/png'});
  }
});

test('player attention navigates to rest choices and clears after confirmation',async({page})=>{
  await ready(page,'/?screen=shelter&role=player&scenario=rest');
  await page.getByRole('button',{name:/Escolha seu descanso curto/}).click();
  await page.getByRole('button',{name:'Escolher minhas duas ações',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar minhas ações',exact:true}).click();
  await expect(page.getByRole('button',{name:/Escolha seu descanso curto/})).toHaveCount(0);
});

test('choice cards support keyboard and explicit rule labels remain readable',async({page},testInfo)=>{
  await ready(page,'/?screen=reading');const checkbox=page.getByRole('checkbox',{name:'Nina',exact:true});
  await checkbox.focus();await page.keyboard.press('Space');await expect(checkbox).toBeChecked();
  await expect(page.locator('.rule-prose strong')).toHaveText(['Gatilho:','Efeito:','Custo:','Duração:','Como remover:']);
  for(const theme of ['light','dark'])for(const style of ['fiel','leitura','tecnico']){
    await page.getByLabel('Tema',{exact:true}).selectOption(theme);await page.getByLabel('Estilo',{exact:true}).selectOption(style);
    await noOverflow(page);await testInfo.attach(`reading-${theme}-${style}`,{body:await page.locator('.qa-reading').screenshot(),contentType:'image/png'});
  }
});

for(const role of ['master','player'])for(const screen of ['sheet','shelter','conflict','scene']) {
  test(`layout ${role} / ${screen}`,async({page},testInfo)=>{
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    for(const width of [390,768,1280,1920]){
      await page.setViewportSize({width,height:1000});await ready(page,`/?screen=${screen}&role=${role}`);
      await noOverflow(page);
      if(screen==='shelter'&&width>=1280){
        const boxes=await page.locator('.shelter-routine-grid > *').evaluateAll(els=>els.map(el=>{const b=el.getBoundingClientRect();return {y:b.y,bottom:b.bottom,width:b.width};}));
        if(role==='player'){expect(boxes[1].y).toBeGreaterThanOrEqual(boxes[0].bottom);expect(boxes[1].width).toBeGreaterThan(300);}
      }
      if(width===390||width===1920)await testInfo.attach(`${role}-${screen}-${width}`,{body:await page.screenshot(),contentType:'image/png'});
    }
    expect(errors).toEqual([]);
  });
}

test('large scene renders and records insertion/undo timings',async({page},testInfo)=>{
  const start=Date.now();await ready(page,'/?screen=scene&objects=200');
  const loaded=Date.now()-start;await page.getByRole('button',{name:'Montar cena',exact:true}).click();const count=await objectCount(page);
  const insert=Date.now();await page.getByTitle('Adicionar Mesa',{exact:true}).click();await expect.poll(()=>objectCount(page)).toBe(count+1);
  const inserted=Date.now()-insert;await page.getByRole('button',{name:'Desfazer',exact:true}).click();expect(await objectCount(page)).toBe(count);
  await testInfo.attach('timings.json',{body:JSON.stringify({initialObjects:count,loadMs:loaded,insertMs:inserted,environment:'local Vite preview; not a production latency benchmark'}),contentType:'application/json'});
});
