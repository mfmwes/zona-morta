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
