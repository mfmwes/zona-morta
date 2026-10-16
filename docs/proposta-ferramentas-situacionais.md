# Proposta: ferramentas de acesso e reparo

Status: rascunho histórico, substituído por [Curadoria de regras dos itens](curadoria-regras-itens.md). A ideia de novos fluxos de interface abaixo foi descartada pelo usuário. A versão consolidada altera somente os textos das regras do catálogo.

## Princípios

- A ferramenta permite uma ação compatível ou evita um risco específico. Possuí-la não concede bônus permanente.
- Sem incerteza ou risco relevante, resolve-se a tarefa pagando o tempo indicado; não há teste obrigatório.
- Com risco, o mestre define o teste e a dificuldade. A ferramenta exigida para tentar não concede também Vantagem automaticamente.
- Vantagem só se aplica quando a ferramenta oferece uma vantagem adicional concreta, confirmada pelo mestre; não acumula por quantidade de ferramentas.
- Tempos abaixo são referências propostas para tarefas pequenas, não tempos de busca de locais ou turnos de construção.
- Falhas não destroem nem consomem ferramentas automaticamente. Consequências são informadas e resolvidas pelo mestre.
- Materiais e Peças continuam necessários quando o reparo exigir; ferramentas não criam recursos.

## Primeiro conjunto

| Item | Ação e efeito proposto | Custo e limite |
|---|---|---|
| Kit de ferramentas de trabalho | Permite um reparo simples que exija ferramentas comuns: reapertar, alinhar ou remontar uma peça acessível. | Referência de 30 min; reutilizável. Não substitui especialista, Peças ou turno de obra. |
| Alicate | Corta arame fino ou solta uma fixação acessível; elimina esse obstáculo específico. | 10 min; reutilizável. Não corta corrente, cadeado ou cabo energizado com segurança. |
| Jogo de chaves | Abre uma fechadura previamente identificada como compatível, sem teste de arrombamento. | Ação imediata; sem Barulho adicional. Não identifica chaves nem abre outros bloqueios da área. |
| Gazua improvisada | Permite tentar abrir uma fechadura mecânica simples sem forçá-la. | 10 min por tentativa; reutilizável. Acuidade quando houver risco. Sem repetir indefinidamente a mesma tentativa sem mudança de abordagem. |
| Chaves de boca | Soltam uma conexão aparafusada acessível para abrir acesso ou desmontar um componente. | 10 min; reutilizáveis. Não geram Peças automaticamente. |
| Fita isolante | Isola um condutor exposto de circuito desligado, removendo o risco de contato naquele ponto após avaliação do mestre. | 10 min; consome 1 unidade. Não torna seguro trabalhar energizado nem restaura instalação danificada. |
| Fita resistente | Mantém provisoriamente uma fixação ou barreira leve no lugar durante a cena atual. | 10 min; consome 1 unidade. Sem restaurar integridade estrutural ou impedir passagem à força. |
| Corda curta | Estabelece uma linha ancorada para uma descida curta ou para baixar um objeto. | 10 min de preparo; fica comprometida no local até recolhida. Evita depender de uma escalada sem apoio; outros riscos ainda podem exigir teste. |
| Corrente com cadeado | Tranca uma passagem com pontos adequados de fixação. | 10 min; fica comprometida no local. Não cria uma porta, não fixa resistência universal e pode ser contornada ou rompida. |
| Serra manual | Abre uma passagem pequena cortando material compatível e acessível. | 30 min e +1 Barulho ao executar; reutilizável. Não corta qualquer metal, parede ou estrutura. |

Fita isolante e Fita resistente passariam a ter consumo explícito, hoje ausente. Nesta proposta uma unidade representa material para uma aplicação; a descrição e o inventário precisam explicar isso antes de implementar. Objetos comprometidos, como cordas e correntes, precisam manter referência ao local para impedir reutilização simultânea e permitir recuperação sem duplicação.

## Como usar na interface existente

Em Ações do item, acrescentar “Usar ferramenta”. Escolher alvo e tarefa; mostrar efeito, tempo, consumo e Barulho antes de confirmar. A ficha, a mochila e os painéis do mapa mantêm seu layout.

O mestre confirma a compatibilidade e a consequência. Um jogador envia a solicitação; não altera acesso, tempo ou recursos da campanha sem o fluxo de autorização. Apenas situações públicas aparecem para jogadores.

Quando houver rolagem, o resultado passa pelo fluxo existente e a consequência só é aplicada uma vez. Abrir uma fechadura remove apenas esse obstáculo. Uma área com entulho, guarda ou outro impedimento não se torna automaticamente livre ou vasculhada.

## Integração e validação

Atualmente SearchArea.access distingue open/risk/blocked, sem tipo de obstáculo. Antes de automatizar abertura, acrescentar obstáculos opcionais identificados pelo mestre. Áreas antigas bloqueadas não serão reinterpretadas automaticamente como fechaduras.

Reutilizar relógio dos participantes para ações temporizadas e o fluxo de rolagem existente. Não reduzir duração de busca, gerar saque ou somar progresso de abrigo como efeito implícito.

Verificar disponibilidade, quantidade, estado do item, posição do ator e do alvo; não duplicar custos ao reenviar uma solicitação. Testar cancelamento antes do início, resolução repetida, transferência durante solicitação pendente, autorização de jogador e preservação de campanhas antigas.

## Decisões a avaliar

Os tempos de 10/30 minutos, o consumo por aplicação das fitas e o +1 Barulho da serra são propostas de balanceamento, ainda não regras aprovadas. Começar com Jogo de chaves, Gazua improvisada, Alicate e Serra manual permite validar o fluxo de acesso antes de implementar objetos comprometidos e reparos.
