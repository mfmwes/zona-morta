# UX Etapa 7 — auditoria de consistência, temas e fluxos

## Correções

- Tema claro/noturno governado por `data-theme` também nas variantes Tailwind, nos controles nativos, no abrigo e nos cartões da comunidade. Avisos do Sonner acompanham a mesma preferência; o botão informa a próxima opção e expõe seu estado à acessibilidade.
- Contraste noturno dos rótulos de provisões da ficha, indicadores da visão geral, aviso de situação regular e erros da lista de campanhas. Seletores e código de recuperação usam o fundo do tema.
- Opções de participante, ameaça e alvo do conflito calculadas a partir das opções disponíveis; rascunhos de notas vinculados à cena e ao texto de origem.
- Editor de apresentação inicializado ao abrir, evitando sobrescrever a edição durante atualizações da campanha. Expansão da imagem vinculada ao identificador da apresentação. Seletor de imagem sincronizado com mudanças de origem sem um efeito adicional.
- Tipagem dos retornos das ações síncronas, munição, reparos, consumo de água e horários; resultado exibido de rolagem corretamente protegido contra ausência; composição de texto respeitada no atalho Enter.
- CI verifica tipos, lint completo, testes, build e smoke test do Worker.

## Escopo do TypeScript

Seis arquivos históricos na raiz foram excluídos da compilação: `hex-actions.ts`, `hex-context-menu.tsx`, `item-actions.ts`, `item-context-menu.tsx`, `provision-items.ts` e `survivor-context-menu.tsx`. São cópias antigas sem importação pelo aplicativo; as implementações usadas em `lib/` e `components/` continuam incluídas. `strict` permanece ativo. Os arquivos históricos foram preservados.

## Validação

- 260 testes existentes aprovados, incluindo permissões de jogadores, exploração, inventário, conflito, abrigo, PNJs e cenas visuais.
- `pnpm typecheck`, `pnpm lint` e `pnpm build` aprovados. Lint com 39 avisos existentes, principalmente imagens e variáveis não usadas; sem erros.
- Navegação na campanha em produção: visão geral, ficha, abrigo sem base estabelecida, conflito inativo, cena visual vazia, criação/cancelamento do diálogo de cena e comunidade vazia.
- Prévia dos jogadores: controles de geração/registro de PNJs e seções reservadas do mestre ocultos. A validação automatizada cobre também filtragem de dados e permissões de edição.
- Temas claro e noturno observados no navegador; contraste dos rótulos conferido pelo estilo calculado e pela inspeção visual.

A inspeção manual usa os estados disponíveis na campanha; fluxos que modificam recursos, criam conflitos ou publicam cenas são cobertos pelos testes automatizados, sem alterar dados de jogo durante a auditoria. Não houve inspeção manual em dispositivo móvel.
