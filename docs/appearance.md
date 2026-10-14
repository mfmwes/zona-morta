# Estilos visuais

O botão **Estilo**, ao lado do controle de modo claro/noturno, permite escolher:

- **Visual atual** (padrão): aparência original da main.
- **Refino fiel**: petróleo profundo e âmbar, Segoe UI/Consolas, contornos discretos e cartões com cantos moderados.
- **Leitura confortável**: papel quente e ameixa (ameixa escuro no modo noturno), Source Sans 3, cantos suaves e entrelinhas mais abertas nos textos de leitura.
- **Dossiê técnico**: azul de arquivo e ciano, IBM Plex Sans/Mono, cantos retos, divisórias e grade discreta no cabeçalho da ficha.

No celular, os controles ficam em **Mais → Ferramentas**. A escolha é aplicada imediatamente e salva neste navegador, separadamente do modo claro/noturno. Não depende da conta ou da campanha e não altera dados do jogo. Se o navegador bloquear o armazenamento, a escolha continua válida na aba aberta.

## Implementação

`lib/appearance.ts` define os estilos aceitos e o script executado antes da primeira pintura, evitando exibir o estilo original antes de restaurar a preferência. O Visual atual remove `data-visual-style` do elemento HTML: as regras dos três estilos opcionais deixam de se aplicar.

`app/appearance.css` é carregado após os estilos existentes. Todas as novas regras ficam sob seletores explícitos dos três estilos opcionais; remover `data-visual-style` restaura a cascata original. As regras compartilhadas do seletor de aparência permanecem as mesmas.

Cada tema define superfícies, texto principal/secundário, ação e seu texto, campos, contornos e uma família independente de cores para cabeçalhos escuros. Isso impede que o texto de um painel escuro herde a cor de uma superfície clara, e vice-versa. Painéis internos, abas ativas, controles da ficha, resumos do inventário, histórico, biblioteca, visão geral, chat e diálogos usam esses pares. Estados selecionados de rolagem também usam pares de cores completos. Fundos e textos dos botões mudam juntos, sem interpolação de cores que produza combinações ilegíveis durante a troca.

Os temas mantêm grids, posições, sete áreas da ficha, ações e imagens do catálogo. Esperança, Medo, dano e avisos continuam com significado próprio; seus textos têm variantes claras/noturnas. Habilidades usadas preservam o estado dessaturado e a possibilidade de expansão. A arte dos objetos e as cores do mapa permanecem nos estilos originais. IBM Plex usa os pesos fornecidos localmente, sem sintetizar pesos mais fortes. O controle original de claro/noturno continua funcionando com um clique.

As fontes WOFF2 de Latin e Latin Extended são servidas por `/fonts/appearance/`, com as licenças SIL OFL na mesma pasta. Não há chamadas ao Google Fonts durante o uso do aplicativo. Fontes de origem: [Source Sans](https://github.com/adobe-fonts/source-sans), [IBM Plex](https://github.com/IBM/plex) e distribuição [Google Fonts](https://github.com/google/fonts).

## Validação

- Testes de restauração, valores inválidos, armazenamento bloqueado e independência entre estilo e claro/noturno em `tests/appearance.test.cjs`.
- `tests/appearance-css.test.cjs` verifica o isolamento de todas as regras opcionais e contraste mínimo de 4,5:1 dos pares de texto das seis paletas; limites dos campos têm pelo menos 3:1 contra a superfície.
- Conferência local dos três estilos em claro e escuro, da navegação nas sete áreas da ficha e dos controles no celular.
- Nenhuma migração de banco ou alteração de regras de campanha.

Backup anterior à implementação: branch `backup/main-antes-temas-2026-10-13`, commit `f6d832d65ddac7ed2d2e8d28fa84a942a888f4c0`.
