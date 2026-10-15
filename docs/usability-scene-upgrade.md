# Avaliação das melhorias — 15/10/2026

Branch: `codex/usability-scene-upgrade`. Base preservada: `2837481938a00451ebdfab201a82fb28892a081b`. Integração e publicação dependem da validação do usuário.

## Implementação

- Cena: desfazer/refazer por botões e Ctrl/Cmd+Z, Shift+Z ou Y; até 50 ações por cena enquanto o editor estiver montado. Edições em objetos, paredes e anexos, grade e névoa entram no histórico. Criação/exclusão de cenas e apresentação à mesa não entram. Campos de texto e diálogos preservam seus atalhos. Uma alteração concorrente nos elementos afetados bloqueia a reversão; mudanças em outros objetos são preservadas.
- Biblioteca: favoritos, filtro de favoritos e modelos de seleção. Modelos incluem as paredes necessárias às portas/janelas, excluem personagens e ganham novos identificadores ao inserir. A inserção respeita capacidade e dimensões e constitui uma ação para desfazer. Limites: 24 modelos, 100 peças por modelo. Armazenamento local por campanha e navegador, sem sincronização entre dispositivos; limpar os dados do navegador remove essa biblioteca.
- Seleção: cartões com ícone, descrição, estado marcado e foco de teclado para participantes de descanso, participantes dos eventos e capacidades dos PNJs.
- Leitura: parágrafos e títulos explícitos nos efeitos de habilidades e resultados dos eventos, preservando as palavras e regras.
- Jogador: resumo de impactos pendentes, escolhas de descanso, entregas e testes de acesso da busca. Os avisos usam somente a projeção pública do próprio jogador e encaminham para a seção correspondente.
- Responsividade: ações de cena e descanso com quebra de linha; controles de toque e foco visível; regressão de ficha, abrigo, conflito e cena em 390, 768, 1280 e 1920px para mestre/jogador.
- Desempenho: ilustrações da cena memoizadas para evitar reconstruir SVGs quando sua variante não mudou. Medidor do pacote inicial e cenário de 203 objetos incluídos. A redução do JavaScript inicial permanece pendente: a divisão experimental da cena aumentou o total comprimido e foi retirada. Não há promessa de melhoria de tempo de rede baseada nesse experimento.
- Qualidade: suíte Playwright com relatório e capturas na CI; README atualizado com execução e validação.

## Como avaliar

1. Execute `pnpm preview:qa` e abra http://127.0.0.1:4173. Use **Montar cena**: adicione, mova e gire peças; desfaça e refaça por botões e teclado. Digite na busca e confira que Ctrl+Z não altera objetos.
2. Favorite uma peça e filtre **Favoritos**. Adicione uma peça, use **Guardar seleção**, nomeie o modelo e insira-o em **Modelos**. Desfaça a inserção; recarregue para conferir a persistência da biblioteca.
3. Troque para **Leitura e seleção**; alterne claro/escuro e os três estilos. Use Tab e Espaço nos cartões. Na ficha, consulte efeitos de habilidades e a seleção do descanso.
4. Abra http://127.0.0.1:4173/?screen=shelter&role=player&scenario=rest. Clique no aviso de descanso, escolha as ações e confirme; o aviso deve desaparecer.
5. Abra http://127.0.0.1:4173/?screen=conflict&role=player para conferir o aviso de impacto e o conflito. Alterne para mestre para consultar os controles.
6. Reduza a janela e confira ficha, abrigo, conflito e cena. Para a cena maior use `/?screen=scene&objects=200`.

A prévia usa os componentes e regras locais, mas não reproduz login, persistência remota ou uma sessão entre vários navegadores. Algumas ações administrativas ficam indisponíveis nela. O teste do Worker cobre separadamente HTTP/D1/WebSocket. Uma sessão real com os participantes e a aprovação visual continuam sendo etapas de aceite.

## Backup

Em `outputs/backups/` estão o ZIP do código e o bundle Git anteriores às alterações, com instruções e SHA-256 no arquivo `BACKUP.md`. Esses arquivos são locais e ignorados pelo Git. O backup não contém o banco da campanha, uploads externos, segredos ou dependências instaladas. Nenhuma alteração foi feita nos dados de produção.

## Validação

Resultados locais e capturas ficam em `outputs/upgrade-*.log`, `outputs/preview-scene-*.png` e `outputs/visual-report/`. As verificações de layout não substituem uma auditoria completa de acessibilidade ou medição de latência em produção.

Resultado desta revisão: 593 testes automatizados e 14 testes de navegador passaram; tipos e build passaram. O teste HTTP/D1/WebSocket local passou. Lint: zero erros, 42 avisos. A CI remota ainda não foi executada para esta branch.

O pacote inicial final medido contém 3.710.540 bytes de JavaScript (683.044 bytes em gzip). A comparação local anterior à tentativa de divisão, já com parte das melhorias, era 3.707.615 bytes (682.007 em gzip); não é uma comparação exata com o commit de backup. A alteração final é aproximadamente +0,15% em gzip. O custo do pacote inicial continua registrado como melhoria pendente.
