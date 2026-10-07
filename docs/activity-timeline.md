# Atividades e relógio da campanha

Viagens, buscas, descansos e tratamentos de Exposição são agendados no horário atual. Cada atividade registra participantes, origem e horário de conclusão. O relógio não avança ao iniciar a atividade, e não existem ações retroativas.

O mestre usa **Avançar até HH:MM** na faixa de atividades. O próximo horário é o menor prazo entre atividades de campo, turnos do abrigo e o anoitecer quando existem acontecimentos noturnos pendentes. Todas as conclusões nesse horário são processadas juntas. Um teste de acesso pendente mantém sua busca ocupada, mas não impede outras atividades de terminarem no mesmo horário. O relógio não segue para um horário posterior até esse acesso ser resolvido ou a busca ser interrompida.

## Exemplo

Às 09:00, Ana inicia uma viagem de 1h e Bia inicia uma busca de 30 min. Ana permanece na origem e os achados de Bia ainda não estão disponíveis. O mestre avança até 09:30: a busca termina e Bia pode recolher o estoque ou iniciar outra atividade. Ao avançar até 10:00, Ana chega e o destino é explorado.

## Efeitos e disponibilidade

- Uma viagem só muda a posição e revela os arredores na chegada. A duração, incluindo benefícios aplicáveis, é calculada no início.
- Uma busca só sorteia/libera achados, consome sua duração e aplica Barulho na conclusão. Rolagens de acesso podem ser resolvidas antes; seus custos normais de Esperança, Estresse e Medo são aplicados quando a rolagem ocorre.
- Cada participante confirma duas escolhas de descanso na própria ficha. Só os convidados do mesmo hex precisam confirmar. Recuperações, Medo e renovação de habilidades ocorrem na conclusão; quem não descansou conserva seus limites de habilidade.
- Um tratamento reserva e consome o medicamento no início. O teste e a limpeza da Exposição acontecem após 30 min, dentro da janela de tratamento.
- Participantes ocupados não podem iniciar outra viagem, busca, descanso ou turno de obra, nem recolher/transferir itens pelo fluxo autônomo dos jogadores.
- O mestre pode **Interromper** uma atividade. Isso libera os participantes, conserva o tempo já decorrido e não concede chegada, achados ou recuperação. Medicamentos já consumidos não são devolvidos, e a tentativa de tratamento permanece registrada.

## Ajustes e continuidade

O ajuste manual para frente processa as mesmas conclusões em ordem. Acesso pendente ou consequência narrativa pode interromper um salto maior. Correções para trás exigem que as atividades de campo tenham terminado ou sido interrompidas; resultados já aplicados não são desfeitos. A passagem de dia exige concluir ou interromper as atividades pendentes antes do consumo de recursos.

Descanso longo de toda a mesa que atravessa a meia-noite conserva o fluxo de escolhas para **Encerrar dia**. Descanso de subgrupo deve terminar antes da passagem de dia.

Campanhas anteriores conservam os resultados concluídos. Buscas abertas sem agendamento são adotadas a partir do horário atual ao carregar a campanha. Agendamentos são persistidos no JSON da campanha e sincronizados pelo canal de atualizações existente. A projeção dos jogadores contém apenas resumo das atividades, sem escolhas privadas ou achados futuros.

Os comandos de avanço e interrupção são exclusivos do mestre, verificam o relógio atual, usam controle de revisão e recebem identificadores de reenvio. Reenviar o mesmo comando não avança novamente nem duplica efeitos.
