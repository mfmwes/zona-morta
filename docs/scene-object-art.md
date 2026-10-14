# Artes de objetos da cena

Foram criados quatro atlas com 64 objetos ilustrados usando o recurso integrado **imagegen**, com fundo transparente. Os arquivos finais são `public/scene-art/home-v1.webp`, `work-v1.webp`, `survival-v1.webp` e `street-v1.webp`. Cada imagem possui 1254 × 1254 pixels. A exportação WebP conserva o canal alfa; os PNGs originais foram preservados nos artefatos locais da tarefa.

A biblioteca e as peças posicionadas usam a mesma arte. `lib/scene-object-art.json` associa as variantes existentes a regiões do atlas, sem mudar IDs, tamanho dos objetos, comandos, rotação salva ou dados de campanha. Os veículos são orientados horizontalmente na arte para manter a orientação dos seus retângulos originais. Regiões têm recorte explícito no SVG para que nenhum objeto vizinho apareça. Variantes desconhecidas e as ferramentas Sala/área, Texto, Pista/objetivo e Divisória mantêm a representação nativa. Retratos de personagens e imagens de itens/habilidades continuam usando seus catálogos originais.

As imagens são ilustrações realistas para leitura rápida, com vistas superiores ou elevadas conforme o objeto. Não representam uma planta de engenharia em escala.

## Prompts usados

As três últimas gerações usaram a prancha de casa como referência de estilo. Nenhuma imagem de catálogo existente foi substituída.

### home

```text
Use case: stylized-concept. Production game asset: one seamless-to-slice sprite ATLAS for the Zona Morta modern urban survival virtual tabletop, NOT a UI mockup. Create a square image laid out as an EXACT 4 columns by 4 rows uniform grid of 16 separate object sprites. Every sprite is centered within its own equal square cell with generous transparent padding (at least 12% per side), never overlaps any neighboring cell. No drawn grid, no labels, no text, no logos, no floor, no background. Genuinely transparent alpha. Style: realistic detailed illustrated 3D game props, recognizable physical materials, subtle wear, wood grain, upholstery seams, muted realistic colors, restrained short soft contact shadows, clean silhouettes that remain recognizable at thumbnail size. Consistent camera STRICT 90-degree overhead orthographic plan view, looking straight DOWN, no isometric viewpoint and no horizon. Every object is upright aligned to grid, NOT diagonal. Show each object whole. Do not add surrounding scenery or loose extra props. Aim for 2048 by 2048 pixels.
Exact row-major slots left to right:
ROW 1: (1) simple rectangular worn wooden table; (2) longer rectangular wooden dining table with NO chairs; (3) low rectangular wooden coffee table; (4) single wooden chair with visible seat and backrest at top edge.
ROW 2: (5) worn gray upholstered armchair; (6) worn gray three-seat sofa with clearly visible cushions; (7) compact wooden storage cabinet; (8) wider double-door wooden wardrobe.
ROW 3: (9) wooden bookcase with visible shelf edges; (10) single bed with pale linen, pillow at top and folded blanket; (11) metal bunk bed seen from directly above with the upper mattress and side ladder; (12) small wooden bedside cabinet.
ROW 4: (13) white refrigerator; (14) steel four-burner kitchen stove with clearly visible circular burners; (15) white washing machine; (16) black flat-screen television as a believable overhead game prop, its stand and narrow screen edge visible.
IMPORTANT: exactly 16 objects in exactly the specified 4x4 slots, uniform cell spacing; no perspective room, no collage, no text, no colored square tiles behind objects.
```

### work

```text
Use case: stylized-concept. Generate ONE new production sprite atlas for a modern urban survival virtual tabletop. The provided image is STYLE REFERENCE ONLY for realistic illustrated materials, restrained wear and clean silhouettes. Do NOT copy its objects; create the specified NEW objects below. Exactly 16 independent sprites in a square 4 columns x 4 rows grid, evenly spaced row-major. Each whole object centered in its own cell with ample transparent padding, no objects overlapping neighboring cells. True transparent alpha, no floor or background, no labels or text, no drawn grid or frames. Detailed realistic game prop rendering, wood grain, brushed metal, seams, dirt and light wear; subtle soft shadows, muted natural colors. Consistent overhead orthographic asset camera, objects aligned to grid, emphasize a view from above appropriate for placement on a floor plan. No scenic rooms, no dramatic diagonal perspective. Every thumbnail must remain recognizable when small. Aim 2048x2048.
ROW 1: porcelain bathroom sink and faucet; white ceramic toilet; square shower tray with drain and small shower head; white oval bathtub.
ROW 2: office desk without chair, dark wood with small drawer section; black rolling office chair with seat and armrests; desktop computer workstation with dark monitor and keyboard, no desk; gray steel filing cabinet.
ROW 3: long retail service counter; compact shop checkout counter with cash register; commercial shelving unit with a few orderly plain unbranded packages; white chest freezer with lid.
ROW 4: vending machine with glass product window and plain unlabeled goods; worn mechanic's workbench with only a few integrated tool details; red metal rolling tool cabinet; gray metal locker cabinet.
```

### survival

```text
Use case: stylized-concept. Generate ONE new production sprite atlas for a modern urban survival virtual tabletop. The provided image is STYLE REFERENCE ONLY for realistic illustrated materials, restrained wear and clean silhouettes. Do NOT copy its objects; create the specified NEW objects below. Exactly 16 independent sprites in a square 4 columns x 4 rows grid, evenly spaced row-major. Each whole object centered in its own cell with ample transparent padding, no objects overlapping neighboring cells. True transparent alpha, no floor or background, no labels or text, no drawn grid or frames. Detailed realistic game prop rendering, wood grain, brushed metal, seams, dirt and light wear; subtle soft shadows, muted natural colors. Consistent overhead orthographic asset camera, objects aligned to grid, emphasize a view from above appropriate for placement on a floor plan. No scenic rooms, no dramatic diagonal perspective. Every thumbnail must remain recognizable when small. Aim 2048x2048.
ROW 1: hospital bed with pale mattress and metal rails; slim ambulance stretcher; empty wheelchair; metal surgical operating table.
ROW 2: folding medical privacy screen; IV drip stand with a single clear fluid bag; hard plastic first-aid medical crate with a simple red cross symbol; wooden shipping crate.
ROW 3: improvised wooden plank barricade; small pile of concrete rubble and broken bricks; compact portable gasoline generator with metal frame; rusty steel drum viewed from above.
ROW 4: wooden shipping pallet; one fully clothed prone human figure in muted civilian clothing, non-graphic, no blood, no visible injury; low stack of sandbags; small contained campfire of firewood and ember flames.
```

### street

```text
Use case: stylized-concept. Generate ONE new production sprite atlas for a modern urban survival virtual tabletop. The provided image is STYLE REFERENCE ONLY for realistic illustrated materials, restrained wear and clean silhouettes. Do NOT copy its objects; create the specified NEW objects below. Exactly 16 independent sprites in a square 4 columns x 4 rows grid, evenly spaced row-major. Each whole object centered in its own cell with ample transparent padding, no objects overlapping neighboring cells. True transparent alpha, no floor or background, no labels or text, no drawn grid or frames. Detailed realistic game prop rendering, wood grain, brushed metal, seams, dirt and light wear; subtle soft shadows, muted natural colors. Consistent overhead orthographic asset camera, objects aligned to grid, emphasize a view from above appropriate for placement on a floor plan. No scenic rooms, no dramatic diagonal perspective. Every thumbnail must remain recognizable when small. Aim 2048x2048.
ROW 1: olive canvas camping tent; round blue water storage tank; green wheeled domestic trash bin; dusty gray sedan car viewed directly from above with roof and windshield clearly visible.
ROW 2: pickup truck with open rear bed; delivery van; white ambulance with simple red medical cross, no letters; long city bus.
ROW 3: motorcycle; bicycle; large green street dumpster; orange traffic cone with white reflective band.
ROW 4: striped portable road barrier; modern streetlight fixture and pole; worn rectangular woven rug with simple faded pattern; straight short flight of concrete stairs seen from above.
```
