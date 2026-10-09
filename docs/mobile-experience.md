# Experiência própria de celular

A campanha tem duas apresentações. Até 767 px, `MobileCampaignShell` organiza navegação, cabeçalho, chat e ferramentas para uso por toque. A partir de 768 px, permanece a apresentação de computador/tablet. A escolha acompanha alterações da largura e usa um snapshot de servidor estável para a hidratação.

O `CampaignApp` continua responsável pela campanha, projeção de jogador, fila de alterações, sincronização, revisão e simulação local. Conteúdo, handlers e chat são compartilhados entre as apresentações; nenhuma campanha, regra ou API foi duplicada.

## Problemas e prioridades atendidas

| Prioridade | Problema observado | Implementação |
| --- | --- | --- |
| Alta | Barra inferior sobreposta ao conteúdo e ao espaço reservado pelo dispositivo | Cabeçalho, área rolável e navegação participam do mesmo layout flex; áreas seguras entram no espaçamento. |
| Alta | Chat e ferramentas flutuantes disputam espaço | Chat tem uma tela própria. Tema e apresentação da imagem aparecem em Mais → Ferramentas, com rótulos. |
| Alta | A ficha exige percorrer informações secundárias para agir | Resumo mobile próprio com recursos, ataque, teste, alimentação e acesso ao inventário. Equipe, descanso e demais seções abrem sob demanda. |
| Alta | Conflito reúne duas listas extensas | Mestre alterna entre Ameaças e Equipe. Pedidos de Spotlight, trilha e impactos pendentes ficam fora da alternância. Um aviso abre o conflito de outras telas. |
| Alta | Opções de gestão precedem a exploração | Mapa mantém seleção e navegação acessíveis; gestão, relógio e eventos recentes são recolhíveis. Setores abrem no painel inferior com retorno explícito ao mapa. |
| Média | Formulários e botões pequenos | Formulários abrem em tela inteira; ações principais têm área de toque de pelo menos 44 px. Campos usam 16 px para leitura. |
| Média | Teclado reduz o espaço do chat | Altura acompanha `visualViewport`, com fallback para `dvh`; compositor tem rolagem própria e o chat conserva o rascunho ao trocar de tela. Zoom continua disponível. |
| Média | Cabeçalhos e instruções repetidos ocupam espaço | Cabeçalho mobile concentra título, dia, horário e estado de gravação. Ajuda do mapa e ferramentas secundárias ficam sob demanda. |

## Fluxos

- Mestre: Agora, Mapa, Equipe, Chat e Mais. Conflito ativo, pedidos e danos têm atalho de prioridade. Busca permanece no cabeçalho. Sessão e recapitulação ficam recolhíveis na visão geral.
- Jogador: Ficha, Mapa, Abrigo ou Conflito, Chat e Mais. Danos pendentes alteram o rótulo do destino público de conflito. Abrigo continua acessível em Mais durante o conflito.
- Ficha: Agora, Inventário e Habilidades são destinos frequentes. Mais abre Atributos, Combate, Condições e História. Retrato continua editável em História. Ajuste de recurso retorna o foco ao botão que abriu o formulário.
- Mapa: tocar num hex ou abrir Detalhes mostra o setor selecionado. Locais, eventos, movimento e preparação usam os componentes e regras existentes. Ajuda explica seleção de grupo e navegação.
- Chat: mensagens, testes, reações, ataques, dados livres e comandos `/r` usam os mesmos handlers. Abrir/fechar a tela não envia o rascunho. Rolagens e mensagens mantêm o autor correto.
- Mais: todas as seções permitidas ao perfil, apresentação, tema, encerramento de dia, prévia, cópias, restauração e conta. Recursos de mestre permanecem sujeitos ao perfil e à ausência de prévia.
- Abrigo, PNJs, referências, cena visual e acessos usam as ferramentas existentes dentro da estrutura mobile. Seus formulários recebem o tratamento de tela inteira.

## Regras e integridade

PV e Armadura continuam exibindo espaços **marcados**. Alimentação usa `consumeDailyProvision`, inclusive proteção contra consumo repetido no mesmo dia. Itens embalados continuam sendo consumidos no inventário. As privações existentes continuam acumulando +1 Estresse por falta de comida e +1 por falta de água ao encerrar o dia.

Prévia usa `PlayerSimulationContext` e a sessão local existente. Jogadores recebem a mesma projeção pública; ferramentas privadas e acessos não são renderizados na prévia. Filtros, alternância de listas e escolha de tela não modificam o estado do jogo.

## Validação

501 testes passaram: 493 existentes e 8 testes novos de interação mobile. Os novos testes cobrem navegação por perfil, prioridade do conflito, altura com teclado/zoom/limpeza, consumo diário e edição de recursos, ataque, foco de formulário, alternância de listas, painel do mapa e rascunho/envio/rolagem do chat. São testes dos componentes e handlers; não substituem inspeção de layout em navegador.

Typecheck e build passaram. Lint sem erros, com 41 avisos já existentes. A checagem HTTP/D1/WebSocket passou, incluindo sincronização, isolamento, privacidade, prévia/projeção, alimentação, conflitos, rolagens livres e restauração.

A inspeção visual em navegador/dispositivo está pendente: o navegador disponível não acessa o servidor local deste ambiente. Nenhum resultado de captura ou de teste de aparelho é presumido.

Antes do merge, validar a branch da PR no ambiente de desenvolvimento ou de homologação:

1. 320, 390, 620 e 767 px: rolar todas as telas, chegar ao último item e usar os cinco destinos sem cortes. Conferir áreas seguras e barras do navegador.
2. 768 px e computador: conferir navegação original, painel de chat, ferramentas e troca de orientação.
3. Mestre/jogador/prévia: abrir Mais e verificar disponibilidade das ferramentas. Solicitar Spotlight com jogador real e atender no mestre; prévia continua local.
4. Ficha: editar recursos, rolar ataque/teste, consumir porção e item embalado, abrir descanso, trocar seções e atualizar retrato.
5. Conflito: alternar equipe/ameaças, atender pedidos, escolher alvo, resolver dano, consultar habilidades e encerrar.
6. Mapa: arrastar, ampliar, selecionar grupo/hex, abrir/fechar detalhes e executar ações permitidas.
7. Chat: mensagem, `/r`, dados livres, rascunho entre telas e teclado aberto. Conferir compositor, foco e retorno à campanha.
8. Teclado/leitor de tela: navegar, abrir/fechar formulários, verificar rótulos e retorno de foco. Conferir temas claro/escuro e zoom.
