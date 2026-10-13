# Estilos visuais

O botão **Estilo**, ao lado do controle de modo claro/noturno, permite escolher:

- **Visual atual** (padrão): aparência original da main.
- **Refino fiel**: petróleo e âmbar com contrastes mais equilibrados, mantendo Segoe UI/Consolas.
- **Leitura confortável**: tons suaves e Source Sans 3 no texto.
- **Dossiê técnico**: petróleo azulado, IBM Plex Sans no texto e IBM Plex Mono nos elementos técnicos.

No celular, os controles ficam em **Mais → Ferramentas**. A escolha é aplicada imediatamente e salva neste navegador, separadamente do modo claro/noturno. Não depende da conta ou da campanha e não altera dados do jogo. Se o navegador bloquear o armazenamento, a escolha continua válida na aba aberta.

## Implementação

`lib/appearance.ts` define os estilos aceitos e o script executado antes da primeira pintura, evitando exibir o estilo original antes de restaurar a preferência. O Visual atual remove `data-visual-style` do elemento HTML: as regras dos três estilos opcionais deixam de se aplicar.

`app/appearance.css` é carregado após os estilos existentes. Os estilos opcionais mudam cores e tipografia, preservando os grids, espaçamentos, posições, sete áreas da ficha, ações, imagens do catálogo e cores semânticas de recursos e estados. O controle original de claro/noturno continua funcionando com um clique.

As fontes WOFF2 de Latin e Latin Extended são servidas por `/fonts/appearance/`, com as licenças SIL OFL na mesma pasta. Não há chamadas ao Google Fonts durante o uso do aplicativo. Fontes de origem: [Source Sans](https://github.com/adobe-fonts/source-sans), [IBM Plex](https://github.com/IBM/plex) e distribuição [Google Fonts](https://github.com/google/fonts).

## Validação

- Testes de restauração, valores inválidos, armazenamento bloqueado e independência entre estilo e claro/noturno em `tests/appearance.test.cjs`.
- Conferência local dos três estilos em claro e escuro, da navegação nas sete áreas da ficha e dos controles no celular.
- Nenhuma migração de banco ou alteração de regras de campanha.

Backup anterior à implementação: branch `backup/main-antes-temas-2026-10-13`, commit `f6d832d65ddac7ed2d2e8d28fa84a942a888f4c0`.
