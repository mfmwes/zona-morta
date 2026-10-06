# Ações da equipe

As ações dos jogadores ficam nas ferramentas já usadas durante a sessão: busca e coleta no local do hex, viagens no destino do mapa, entregas no inventário, depósitos e retiradas no Abrigo, descanso na ficha e na rotina do Abrigo, e tokens e marcações na própria cena visual. O mestre administra as liberações no mesmo contexto: áreas e objetivos em cada local do hex, rotas no hex de partida, entregas no Inventário, depósitos e cotas nos recursos do Abrigo, descanso na ficha ou rotina do Abrigo, e tokens na Cena visual. Não existe seção adicional no menu. A Visão geral reúne pedidos, consequências e o controle de pausa. Campanhas existentes começam com as liberações desativadas; o mestre escolhe o que liberar e salva a configuração.

| Fluxo | Liberação do mestre | Ação do jogador | Limite |
| --- | --- | --- | --- |
| Busca e coleta | Preparar e revelar o local; liberar áreas e objetivos | Propor, confirmar participação, iniciar, rolar acesso e recolher | Uma busca por área; estoque real; tempo, carga e acesso validados |
| Entrega | Habilitar entregas | Oferecer item próprio; destinatário confirma | Mesmo hex; item e quantidade precisam continuar disponíveis |
| Depósito | Habilitar depósitos | Guardar itens próprios | Presença no local das reservas |
| Retirada | Definir cotas de comida, água ou itens | Retirar para a própria mochila | Cota por sobrevivente por dia; devolver não renova a cota |
| Descanso | Habilitar conclusão pela equipe | Preparar duas escolhas na ficha; confirmar; proponente conclui | Todos os sobreviventes confirmam; escolhas não podem mudar depois; descanso que atravessa o dia usa Encerrar dia |
| Trabalho | Manter obras disponíveis no Abrigo | Oferecer-se, programar ou cancelar seu turno | Ferramentas existentes; busca em andamento impede programar atividade simultânea |
| Viagem | Liberar cada sentido de uma rota conhecida | Propor, confirmar participação e partir | Apenas participantes confirmados; tempo e compromissos conferidos |
| Cena visual | Habilitar tokens e marcações | Mover token próprio; marcar uma posição | Cena ativa, objeto desbloqueado, posição revelada; uma marcação por jogador |

O mestre continua resolvendo objetivos excepcionais, acessos bloqueados, vantagens narrativas, conflitos, acontecimentos e complicações. Jogadores podem enviar pedidos no contexto da atividade. Falhas de acesso, rolagens com Medo, barulho elevado e novos acontecimentos pausam as ações e aparecem em **Pedidos e consequências**, na Visão geral. Resolver o aviso não remove a pausa: o mestre desmarca a pausa e salva quando a cena estiver pronta.

A dificuldade, as tabelas, a preparação completa e os achados ainda não sorteados não entram no resumo de ações do jogador. A identidade do sobrevivente vem da associação autenticada à campanha. Solicitações usam identificadores para reenvio seguro, e a atualização verifica a revisão da campanha para preservar ações paralelas.

As cotas são preservadas ao editar liberações. Dados do dia anterior são descartados dos recibos e das cotas quando uma nova ação é registrada; o histórico da campanha conserva os acontecimentos. As propostas expiram com a mudança de dia ou de cena. Nenhuma migração de banco é necessária.

As buscas exibem apenas os cômodos, achados e propostas do local aberto; não é necessário escolher novamente o local ou sair do mapa. Confirmações e rolagens aparecem junto da proposta correspondente. Uma solicitação sem confirmação da rede pode ser reenviada com o mesmo identificador mesmo após trocar de seção.

As interações na ficha do jogador são salvas em sequência, cada uma com seu próprio identificador. Cliques e rolagens feitos enquanto uma solicitação é enviada permanecem na fila; um reenvio após perda de resposta não repete custos nem registros. Ações contextuais aguardam a conclusão dessa fila antes de executar. O salvamento valida apenas os campos alterados: dados legados inalterados não bloqueiam PV, Estresse ou Esperança. Edições simultâneas em campos diferentes são preservadas; alterações concorrentes no mesmo campo continuam exigindo revisão.

### Prévia e conflito público

A trilha aparece para qualquer jogador enquanto houver conflito ativo, inclusive para quem está acompanhando sem participar. Apenas participantes podem pedir Spotlight. Na prévia, a ficha usa a mesma projeção pública de conflito entregue pela API ao jogador; pedidos de Spotlight e resolução de dano apenas demonstram os controles, sem alterar a campanha. Proficiência, reservas compartilhadas e ferramentas de inventário respeitam as mesmas restrições de exibição na prévia e no acesso real.
