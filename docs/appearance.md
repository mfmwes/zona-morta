# Estilos visuais

O botão **Estilo**, ao lado do controle de modo claro/noturno, permite escolher:

- **Refinado** (padrão): superfícies neutras e calmas, petróleo como cor de ação e âmbar como destaque, IBM Plex Sans com algarismos tabulares, três raios e três elevações fixos.
- **Visual clássico**: a aparência original do Zona Morta.

No celular, os controles ficam em **Mais → Ferramentas**. A escolha é aplicada imediatamente e salva neste navegador, separadamente do modo claro/noturno. Não depende da conta ou da campanha e não altera dados do jogo. Se o navegador bloquear o armazenamento, vale o padrão (Refinado) e a troca continua funcionando na aba aberta.

Os estilos opcionais anteriores (Refino fiel, Leitura confortável e Dossiê técnico) foram retirados em novembro de 2026. Uma escolha salva de um deles é tratada como desconhecida e o app abre no Refinado.

## Implementação

`lib/appearance.ts` define os estilos aceitos, o padrão (`defaultVisualStyle`) e o script executado antes da primeira pintura. Sem preferência salva, o documento recebe `data-visual-style="refinado"`; o HTML do servidor já sai com esse atributo, então não há troca visível na carga. O Visual clássico é a ausência do atributo: as regras do Refinado deixam de se aplicar e vale a cascata original.

- `app/appearance.css`: paleta clara e escura do Refinado e o mapeamento dela para os tokens do app (superfícies, texto, ação, campos, contornos e uma família de cores para áreas escuras, como a barra lateral e a planta do abrigo). Também guarda o seletor de aparência, comum aos dois estilos.
- `app/visual-refinado.css`: forma e tipografia do Refinado (escala de texto, raios, elevações, botões, etiquetas, cartões, diálogos, barra lateral com rótulos e ajustes por tela). É carregado por último.

No Refinado, `--font-mono` aponta para a IBM Plex Sans: rótulos e números deixam a monoespaçada, e os algarismos tabulares mantêm o alinhamento. Teclas de atalho (`kbd`) continuam em IBM Plex Mono. Rótulos são escritos em frase no código; o Visual clássico os mostra em maiúsculas por CSS (fim de `app/globals.css`). Etiquetas curtas de status (ACERTO/FALHA, VOCÊ, AO VIVO) ficam em maiúsculas nos dois estilos.

Esperança, Medo, dano e avisos mantêm cores com significado próprio, com variantes clara e noturna. A arte dos objetos e as cores do mapa não mudam com o estilo.

As fontes WOFF2 de Latin e Latin Extended são servidas por `/fonts/appearance/`, com as licenças SIL OFL na mesma pasta. Não há chamadas ao Google Fonts durante o uso do aplicativo. Fonte de origem: [IBM Plex](https://github.com/IBM/plex), distribuição [Google Fonts](https://github.com/google/fonts).

## Validação

- `tests/appearance.test.cjs`: padrão no primeiro acesso, escolha salva do clássico respeitada, estilos retirados e valores inválidos caindo no padrão, armazenamento bloqueado e independência entre estilo e claro/noturno.
- `tests/appearance-css.test.cjs`: todas as regras do Refinado em `appearance.css` exigem o atributo do estilo; contraste mínimo de 4,5:1 dos pares de texto nas paletas clara e escura e de 3:1 nos limites dos campos.
- `tests/visual/contrast.spec.ts`: nenhum texto visível abaixo de 3:1 contra o fundo real, nos dois estilos e nos dois temas.
- Testes visuais de layout, navegação e Visão geral rodam no padrão (Refinado); o clássico tem um teste próprio sem transbordamento.
