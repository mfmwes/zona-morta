# Preparação e buscas nos hexes

## Uso durante a sessão

No mapa, **Preparar hex** conserva os locais existentes, prepara suas áreas e acrescenta um evento se o hex ainda não tem eventos. Locais e eventos novos começam reservados. A preferência **Preparar conteúdo reservado ao entrar em novos hexes** faz isso durante a entrada; selecionar um hex não prepara, revela nem cobra tempo.

**Buscas e achados** abre o local com suas áreas preparadas. A localização aparece como setor do mapa → local → área interna. Os modelos sugerem espaços separados conforme a tabela do local. O mestre confirma seus sinais e ajusta acesso, extensão, posse e fatos estabelecidos antes da primeira tentativa. Outra área exige nome e sinal próprio; uma tentativa existente conserva sua identidade.

- **À vista:** registrar um item conhecido estabelece estoque sem teste, d12 ou tempo de busca. Recolhê-lo reduz esse estoque.
- **Busca específica:** atalhos sugerem água, comida, medicamentos, peças ou combustível quando a tabela os comporta. Objetivo, finalidade, item e quantidade são combinados antes de resolver. Não há d12 adicional.
- **Busca aberta:** uma finalidade geral e um d12 para o grupo, na tabela preparada. Sem risco relevante, **Resolver busca** reúne sorteio, estoque, histórico e relógio em uma confirmação.
- **Acesso sob risco:** a central de rolagens usa ator, atributo, equipamentos, Experiências e dados de dualidade. A tentativa salva o resultado e os recursos. **Concluir busca e sortear achado** reúne o achado e o relógio; acesso malsucedido conclui sem d12. Fechar e reabrir retoma a mesma tentativa.

Um sucesso com Medo mantém a quantidade prometida. Complicação, dano, chegada de ameaça, início de conflito e revelação ficam com o mestre. Barulho é o custo anunciado da ação, aplicado uma vez; a busca não inicia outra cena nem limpa o Barulho.

## Achados, transporte e retorno

As 168 entradas dos 14 d12 têm vínculos explícitos com o catálogo. Quantidade, alternativas condicionais e baterias estão em `lib/loot-definitions.json`; nenhum texto livre é convertido em inventário por interpretação durante o jogo. Armas sem munição permanecem sem munição.

Nas condições de preparação, resultados incompatíveis com fatos conhecidos podem ser excluídos com uma justificativa. O sorteio conserva o dado original e usa o próximo resultado plausível da mesma tabela, sem rerrolar. Condições de guarda armada ou dono compatível usam as alternativas previstas pela tabela.

Achados permanecem no local até **Confirmar coleta**. O plano sugere os participantes escolhidos, usa as funções de carga existentes e permite ajustar quantidade, destinatário e carrinho já aberto. A preferência de transporte da campanha escolhe inventários ou carrinhos primeiro. Falta de carga deixa o excesso no local; acesso ou posse pendente bloqueia a coleta até o mestre liberar na ficção. Combustível de tanque exige galão vazio para transporte pessoal.

O estoque guarda quantidade original, saldo, condição e origem. Retirada parcial e confirmações repetidas não duplicam inventário. Porções, preparação, verificação, baterias, dia do achado e conservação acompanham os objetos existentes. Alimentos deixados nos locais estragam pelo prazo normal ao amanhecer.

No abrigo efetivo, o depósito mostra os inventários envolvidos, descarrega carrinhos e transfere objetos fisicamente para o estoque. Equipamentos vestidos e munição comprometida permanecem nas fichas. Conversões para reservas continuam pelas ações válidas do inventário: não há conversão automática de remédio avulso, alimento cru ou item não verificado.

## Habilidades e eventos

**Busca por setor**, do Trabalhador de depósito, reduz uma busca ampla de 60 para 30 minutos e registra o uso pela mesma chave da ficha. Em uma área ampla que já dura 30 minutos, apresenta os sinais conhecidos para o mestre indicar os melhores indícios, sem achado adicional. A seleção é opcional; uso já consumido em outra tela impede a confirmação sem cobrança parcial.

**Explicação clara**, de Docente, aparece na central quando há um aliado participante elegível. A seleção declara que está Perto e sabe explicar a ação, oferece +1 e marca 1 Estresse, uma vez por cena. Experiências mantêm seus custos usuais. Outros efeitos que dependem da ficção continuam sob decisão do mestre na ficha.

Eventos novos após busca usam uma referência à sequência de ocorrências do hex. Histórico anterior não os torna prontos, nem a exclusão de um local apaga essa referência. Eventos antigos conservam o comportamento compatível. Consequências sugeridas abrem os formulários atuais de local, PNJ, ameaça ou pista com rascunhos estáveis; criar e revelar continuam ações explícitas.

## Persistência e compatibilidade

Os metadados opcionais de `Point`, `HexState` e `HexEvent` preservam campanhas antigas. Buscas históricas bloqueiam suas áreas sem conceder objetos retroativos. A projeção do jogador remove preparação, áreas, estoque, tentativas, preferências, sequência e referências privadas de eventos. Os limites do estado e o controle de revisão da API continuam protegendo o salvamento entre várias janelas.

Relógio, habilidade, estoque e histórico são confirmados juntos em uma cópia validada da campanha. A coleta valida o lote inteiro, incluindo quantidade agregada e carga, antes de transferir. Identidades de operação impedem a reaplicação de resultados. Não há reversão automática de fatos depois de outras ações dependerem deles.

## Verificação

Testes de domínio cobrem as tabelas, histórico antigo, preparação repetida, retomada, acesso malsucedido, sucesso com Medo, crítico, Experiências, habilidades, passagem de dia, retirada parcial, capacidade, carrinhos, recipientes, conservação, depósito, eventos, estado inválido e sigilo. O CI executa esses testes, a verificação de qualidade da exploração, o build e o smoke test do Worker.

O projeto possui erros de tipos anteriores fora desta implementação. A comparação com `origin/main` verifica se esta alteração introduz novos diagnósticos, sem apresentar a checagem global como limpa.
