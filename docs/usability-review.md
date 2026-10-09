# Revisão de usabilidade — outubro de 2026

Análise dos componentes e fluxos existentes: navegação por perfil, visão geral do mestre, mapa e eventos, fichas, PNJs, inventários, abrigo, conflito, chat, sessões, restauração e referência. As imagens de referência mostram a concentração de controles nos formulários de eventos; esses formulários já receberam a revisão anterior. Esta etapa concentra os ajustes nos problemas de navegação e organização que permaneciam entre as telas.

| Prioridade | Problema observado | Melhoria implementada |
| --- | --- | --- |
| P1 | Localizar uma pessoa, evento, ponto do mapa ou obra exigia percorrer várias abas e listas. | Busca por nome, localização e tipo com acesso ao registro exato; Ctrl/⌘ K, navegação por teclado e estados sem resultados. Índice privado exclusivo do mestre, ausente na prévia e nos perfis de jogador/convidado. |
| P1 | Pendências cresciam numa lista única, dificultando encontrar o que dizia respeito ao grupo em um hex. | Filtros combinados de texto, tipo e localização; contagem, limpeza e mensagem sem correspondências. A ordenação por gravidade e prazo é preservada. |
| P1 | Formulário de sessão aparecia mesmo fora da tarefa; uma falha dependia de mensagem temporária. | Resumo compacto com formulário sob demanda; confirmação explícita, erro junto ao formulário, manutenção do rascunho, sucesso anunciado e bloqueio durante salvamento. |
| P1 | A confirmação de restauração ficava distante do ponto selecionado; recuperação automática se misturava com pontos manuais. | Confirmação dentro do registro, busca por nome/dia, contador de pontos manuais, seção própria para cópia automática, carregamento, erro, atualização e ausência de dados. |
| P1 | A referência dizia que uma munição reserva ocupava um espaço inteiro e que o consumo só ocorria no fechamento do dia. | Textos alinhados com o inventário físico: até quatro munições do mesmo tipo por espaço, consumo diário registrado antes do fechamento quando usado. Referência de busca passa a distinguir áreas e disponibilidade de busca profunda. Nenhuma regra mecânica mudou. |
| P2 | Itens compartilhados precisavam ser procurados numa lista sem filtro. | Busca por nome/categoria/estado, filtro de categoria, contagem, limpeza e ausência de resultados. Transferência e acesso ao depósito conservam suas restrições. |
| P2 | Ajustes administrativos do abrigo competiam com a gestão rotineira dos estoques. | Modificadores manuais agrupados numa seção recolhida; valores e operações permanecem iguais. |
| P2 | Ajuda exigia trocar de tela em tarefas como preparar provisões, descansar e tratar Exposição. | Regras curtas, recolhidas, junto dessas ações e dos inventários. |
| P2 | Formulários e diálogos precisavam de padrões mais consistentes para mensagens, foco e telas pequenas. | Campos com ajuda/erro associados, estados anunciados, foco de retorno da sessão, salto ao conteúdo, alvo maior para fechar diálogos e filtros empilhados em telas estreitas. As cores e superfícies existentes são preservadas nos dois temas. |

## O que foi preservado

Organização atual das fichas e PNJs, filtros do conflito, abas do abrigo, referências pesquisáveis e ações rápidas já existentes. Não houve mudança no modelo de dados, permissões de API, calendário, custos de ações, limites de restauração ou rolagens. A regra de privação permanece +1 Estresse sem Comida e +1 sem Água, acumulando até 6 no encerramento do dia.

## Validação e limites

Testes de componentes exercitam busca, atalhos, teclado dos resultados, filtros, início/encerramento de sessão, falha e preservação do rascunho, confirmação do ponto correto, cópia automática, limite de dez pontos, atualização após erro e restrições da prévia. Os dados usados são apenas fixtures locais de testes. A suíte existente verifica as mecânicas preservadas; a regressão do Worker usa banco isolado para HTTP e WebSocket autenticados.

O navegador remoto recusou a conexão com o ambiente local (ERR_CONNECTION_REFUSED); portanto não foi concluída a inspeção visual das telas renderizadas nem a validação por dispositivo/leitor de tela. As mudanças responsivas usam as quebras existentes e precisam dessa revisão visual complementar. Não se considera uma auditoria completa de acessibilidade.

## Próximos passos

1. Validar as telas em desktop e celular, temas claro/escuro e zoom de 200%, observando rolagem, sobreposição e acesso aos botões de confirmação.
2. Testar uma sessão real com mestre e jogadores para medir quantas etapas são necessárias para localizar um evento, coletar um achado, preparar comida, descansar e retomar a sessão.
3. Com evidência desses testes, ajustar os formulários extensos de mapa/cena; preservar as ferramentas atuais até identificar etapas ou controles que realmente atrapalhem.


## Revisão da interface de conflito

A captura mostrou cartões de ameaças esticados, grandes espaços vazios ao abrir habilidades, nomes cortados na rolagem interna e indicadores com rótulos ocultos em cartões estreitos.

| Prioridade | Problema | Ajuste |
| --- | --- | --- |
| P1 | Abrir uma habilidade aumentava a altura dos cartões vizinhos e distribuía espaço entre os blocos. | Grade alinhada ao topo, cartões com altura natural e conteúdo alinhado ao início. |
| P1 | Rolagem dentro da lista escondia o cabeçalho do grupo. | Lista acompanha a rolagem da página, sem altura máxima ou rolagem própria. |
| P1 | Dificuldade e limiares ficavam sem rótulos; PV podiam ser confundidos com pontos restantes. | Quatro indicadores em uma linha com rótulos visíveis; recursos marcados identificados na descrição acessível e na ajuda do rótulo. Cartões muito estreitos usam duas colunas. Limiares completos no nome acessível. |
| P1 | Consultar habilidades afastava os botões de ação. | Atacar, Spotlight, derrotar/reativar e remover permanecem visíveis numa linha de ações. Habilidades abrem num painel lateral, preservando a altura dos cartões. Condições atuais ficam visíveis mesmo com o editor recolhido. |
| P1 | Pedido de Spotlight só aparecia na trilha e na lista acima da equipe. | Cartão do sobrevivente mostra “Pediu Spotlight” e a ação “Dar Spotlight”; concessão utiliza a mesma regra existente e remove o pedido. |
| P2 | Botões pequenos e nomes truncados dificultavam a operação. | Ações com altura mínima de 44px; resumos compactos de 36px, ampliados para 44px em dispositivos de toque. Nomes com quebra de linha, foco visível e identificação acessível ao remover condições. |

Não muda regras de ataque, dano, condições, derrota, Spotlight, projeção privada ou isolamento da prévia. Os testes de componentes exercitam concessão do pedido, derrota por PV, filtros, reativação, presença das ações, consulta lateral e descrições dos indicadores. A correção de layout ainda precisa de validação visual no navegador: o ambiente local não é acessível pelo navegador remoto.

Validação desta etapa: 493 testes passaram; verificação de tipos, compilação e regressão HTTP/D1/WebSocket passaram. O lint terminou sem erros, mantendo os 41 avisos existentes.

Ajuste após a referência visual do usuário: cabeçalho com estado ao lado do nome, indicadores em uma linha, editor de condições recolhido, consulta de ataque/habilidades em painel lateral e ações compactas abaixo. O painel usa o Sheet existente, com foco contido, Escape, fechamento pelo fundo e retorno ao botão de consulta; o mestre pode consultar ameaças derrotadas.


## Navegação e controles em dispositivos móveis

A captura do usuário mostra a barra inferior cortando os rótulos e o texto do controle de tema aparecendo por baixo do botão de imagem. A barra herdava a altura fixa do TabsList genérico, menor que os botões da navegação. A regra que mostrava o rótulo no tema escuro tinha precedência sobre a regra mobile que deveria escondê-lo; os dois controles flutuavam com posições independentes.

Correção P1: navegação com altura natural, botões com altura própria e rótulos que podem quebrar linha; espaçamento inferior considera a área segura do dispositivo. Tema e apresentação passam a compartilhar o mesmo fluxo acima da navegação, com alvos de 44px e rótulos acessíveis. Apenas um controle de tema aparece na campanha mobile; o controle global continua disponível no acesso e fora da campanha. Entre 621 e 1000px os controles também compartilham uma faixa, preservando a navegação superior. Em desktop, a apresentação permanece na barra lateral e o tema no canto inferior.

A página reserva espaço para a faixa completa; o viewport passa a declarar viewport-fit=cover sem bloquear zoom. Não muda as seções disponíveis, alternância de abas, preferência de tema, permissões da apresentação ou API de imagens.

Validação: 493 testes passaram, verificação de tipos sem erros e lint com os 41 avisos existentes. A análise de layout foi feita sobre a captura e as regras/componentes reais. Não foi possível abrir a prévia local no navegador remoto; a validação visual no aparelho continua pendente, incluindo rótulos, rotação, zoom, área de gestos e abertura de Mais/Exibir imagem.
