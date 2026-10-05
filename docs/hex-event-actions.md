# Ações dos eventos de hex

Nos detalhes do hex, o mestre pode preparar quatro ações para eventos **Pendentes** ou **Ativos**. Eventos antigos sem estado continuam sendo tratados como ativos.

- **Criar ponto:** revise nome, tipo, sinal, acesso, condição, risco e tabela de busca. O resultado entra nos pontos descobertos do hex, com buscas inicialmente vazias.
- **Criar PNJ:** revise nome, profissão, descrição, estado, infecção, disposição e capacidades. O PNJ fica neste hex, sem entrar automaticamente no abrigo ou acompanhar o grupo.
- **Adicionar ameaça:** escolha uma ficha da biblioteca e a quantidade. Com conflito ativo, as instâncias são adicionadas àquela cena. Sem conflito ativo, a confirmação inicia uma cena com os sobreviventes presentes no hex do evento, usando o gerenciador existente.
- **Criar pista:** escolha outro hex existente como destino e escreva o texto público. A pista é um ponto no hex de origem; o mestre pode usar seu botão de destino para navegar no mapa. Isso não revela, renomeia ou explora o destino.

Escolha a ação que corresponde à ficção do evento. Abrir o formulário ou cancelar não registra nada. **Confirmar** registra apenas a ação revisada: o estado do evento, o relógio, o Barulho, o Medo e os recursos permanecem iguais. Ataques, dano e spotlight seguem os controles de conflito existentes.

## Visibilidade e vínculos

Pontos, PNJs e pistas novos começam ocultos. Cada formulário permite ao mestre escolher explicitamente sua visibilidade. As ameaças entram na projeção pública do conflito com seus nomes; suas fichas, notas e vínculos permanecem reservados.

O destino estruturado da pista é reservado ao mestre, mesmo quando a pista é pública. O texto da pista deve conter apenas a informação que se deseja compartilhar. Setores desconhecidos permanecem desconhecidos.

Cada evento guarda um vínculo por tipo de ação. A ação fica indisponível depois da confirmação, inclusive após salvar, reabrir ou excluir o resultado. O histórico informa registros removidos e conflitos anteriores. Para evitar cadastros repetidos, os formulários também permitem vincular um ponto, pista ou PNJ existente no hex, preservando seus dados e visibilidade. Nomes equivalentes por acentos, caixa ou espaços não podem gerar um segundo cadastro no mesmo hex.

Se o evento for removido, resolvido ou arquivado durante a preparação, a confirmação é recusada. Mudanças no conflito, no cadastro selecionado ou na capacidade de armazenamento também são verificadas novamente ao confirmar.

## Persistência e validação

Os campos opcionais `HexEvent.actionLinks`, `Point.eventOrigin`, `Point.clueTargetHex`, `NPC.eventOrigin` e `ThreatInstance.eventOrigin` reutilizam o estado da campanha. Não é necessária migração de banco. A projeção dos jogadores remove vínculos, origens e destinos reservados; a edição de jogador não aceita alterações nessas estruturas compartilhadas.

`tests/hex-event-actions.test.cjs` cobre compatibilidade, preparação sem mutação, confirmação, repetição, vínculos existentes, mudanças durante a preparação, limites e privacidade. A CI executa a suíte completa, `pnpm lint:hex-events`, build e smoke test do Worker.
