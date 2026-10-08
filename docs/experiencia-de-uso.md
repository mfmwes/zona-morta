# Consulta e retomada da campanha

A Visão geral do mestre reúne eventos prontos e ativos, prazos em andamento ou vencidos, Exposição, condições dos sobreviventes e cuidados pendentes de PNJs ativos. Eventos arquivados e PNJs mortos, desaparecidos ou inativos não geram esses avisos. Prazos vencidos deixam de aparecer ao concluir a ocorrência; condições precisam ser encerradas na ficha quando sua causa cessar.

**Abrir registro** direciona ao evento no hex correspondente, à aba Condições da pessoa ou à ficha do PNJ. Buscas abrem o local e a área indicados, conservando a tentativa existente. Obras abrem a estrutura na aba Construção do abrigo. Abrir um atalho não revela conteúdo, não prepara achados, não cobra tempo e não altera recursos. O destino é conferido contra o estado atual antes de navegar.

A lista inicial limita a quantidade de cartões; **Ver todas** expande pendências ou atividades sem ocultar o total. Construção, reparos e turnos operacionais em andamento aparecem na consulta de trabalhos.

**Retomar campanha**, na Visão geral, mostra posições e pendências atuais. O mestre pode escolher um dia para consultar até vinte registros recentes do diário, em ordem cronológica. A consulta depende dos registros que continuam guardados; não reconstrói dias apagados nem inventa um resumo narrativo. As posições e pendências não são uma reprodução histórica do dia escolhido.

# Regras na ação

**Consultar regra** é uma referência recolhida dentro da condução de eventos, buscas, rolagens, viagens, encerramento do dia, condições e obras. As orientações resumem regras existentes e não acrescentam efeitos automáticos. Abrir a consulta conserva o rascunho e permanece na mesma ação.

# Pontos de restauração

O mestre encontra **Opções → Pontos de restauração**. É possível guardar até dez pontos nomeados por campanha, além de uma cópia automática reservada. Os pontos ficam no servidor e podem ser consultados em outro dispositivo. Guardar ou excluir um ponto não muda o relógio, os recursos ou o estado do jogo.

Restaurar exige confirmação e substitui o estado principal da campanha, incluindo mapa, fichas, reservas, conflitos, cenas visuais, atividades e diário. Contas, convites e apresentação de imagem, persistidos separadamente, permanecem atuais. A campanha mantém sua identidade e recebe uma revisão maior; a restauração é comunicada às telas conectadas.

A cópia **Antes da última restauração** guarda o estado imediatamente anterior e permite recuperá-lo. Copiar o estado anterior e substituir a campanha pertencem à mesma transação. Uma alteração concorrente impede ambos, sem sobrescrever a campanha ou sua cópia de recuperação. Mesmo com os dez pontos manuais preenchidos, a cópia automática continua disponível. Restaurar a própria cópia automática captura seu conteúdo antes de substituí-la pelo estado anterior da campanha.

Recibos de pedidos recentes do mesmo dia são conservados para impedir reaplicação de solicitações antigas após restaurar. O estado escolhido precisa passar pela mesma validação dos salvamentos normais. As listagens apresentam apenas metadados e são restritas ao mestre da campanha. Prévia e jogadores não acessam este gerenciamento.

Exportação e importação de arquivos continuam disponíveis nas opções da campanha.

# Sessões da mesa

Na Visão geral, **Sessões da mesa** permite iniciar uma sessão nomeada e encerrá-la com um resumo de decisões e próximos passos. Os marcadores usam o dia e horário do jogo e também guardam a data real. Não avançam tempo nem encerram um dia ou conflito. Só uma sessão fica aberta por vez, com limite de 100 sessões.

A consulta separa sessões dos dias da campanha. Ao encerrar, preserva até 50 registros ainda disponíveis no diário, em ordem cronológica, e até 30 pendências daquele momento. O resumo e esse recorte sobrevivem à limpeza do diário. Registros que já saíram do limite de 200 do diário não são reconstruídos. Pendências históricas não são tarefas novas; os atalhos atuais continuam em Retomar campanha.

A opção **Guardar ponto de restauração** vem marcada e guarda o estado imediatamente antes de iniciar ou encerrar. Esses pontos usam o limite existente de dez pontos nomeados. Se a cópia falhar ou o limite for atingido, a sessão não é alterada; o mestre pode liberar um ponto ou desmarcar a opção. Restaurações também restauram os registros de sessões. Os resumos e pendências de sessões são privados do mestre.

# Privação diária

No encerramento do dia, cada sobrevivente sem alimentação marca **+1 Estresse**; sem hidratação marca **+1 Estresse**. Ambas as faltas somam **+2**. Novos dias sem consumir geram novas marcações, até o limite atual de seis espaços; não há conversão em dano. A prévia mostra a penalidade por pessoa e o total resultante, e o diário registra cada falta e a alteração efetiva.

Consumir durante o dia ou no encerramento evita a respectiva penalidade. Uma fonte alternativa ou dispensa declarada pelo mestre também atende essa necessidade. Alimentar-se depois não remove Estresse anterior; as formas habituais de recuperação continuam disponíveis, incluindo descanso quando escolhido. O consumo já registrado não é descontado de novo. Um pedido repetido de encerramento para um dia anterior é rejeitado.

PNJs e moradores não possuem trilha de Estresse no modelo atual; suas faltas continuam registradas sem inventar PV ou Estresse para eles. A penalidade não é aplicada retroativamente a dias antigos.

# Dados livres no chat

O chat oferece d4, d6, d8, d10, d12, d20 e d100. Clicar adiciona um dado à fórmula; cliques repetidos aumentam a quantidade. A fórmula pode ser editada para combinar tamanhos e somar ou subtrair um modificador, por exemplo **2d6 + 1d8 + 3**. **Rolar** publica o resultado e conserva a fórmula para repetir; **Limpar** limpa apenas a seleção. Também é possível enviar **/r 2d6 + 3** ou **/roll d20** no campo de mensagem.

O registro mostra autor, fórmula, valores individuais e total para todos os jogadores e mestre, em tempo real. Não altera Esperança, Medo, Estresse, PV, munição ou relógio e não pressupõe sucesso ou dano. A seleção do mestre acompanha “Falando como”; jogadores usam o próprio personagem. Prévia e convidados não rolam. Rolagens livres têm o mesmo histórico, exclusão pelo mestre e proteção contra repetição de salvamento do chat existente.

São permitidos até vinte dados por rolagem e um modificador total entre −999 e +999. Fórmulas são analisadas sem executar código; multiplicação, divisão, dados negativos e tipos fora da lista são recusados. A API confere tipos, valores e total antes de guardar o registro do jogador.

# Revisar efeitos de eventos

Os painéis **Efeitos nos sobreviventes** e **Relação com um PNJ** mostram se estão ativos e abrem a edição ao marcar sua aplicação. Desativar preserva o rascunho, mas não envia esses efeitos. Sugestões pessoais ficam visíveis em um resumo enquanto o painel está desativado.

A seleção dos sobreviventes usa cartões com nome, retrato e indicação de seleção, além de selecionar todos e limpar. PV, Estresse e Esperança ficam no grupo “Por pessoa selecionada”; Comida e Água ficam em “Provisões do grupo”, com o total dividido pelos alvos. A prévia mostra valores antes e depois por pessoa, incluindo quem recebe zero porções na divisão. Condições continuam exigindo efeito e forma de remoção. Usar Armadura só aparece com dano; zerar os PV a marcar remove essa escolha.

PNJs presentes aparecem em cartões. **Manter vínculo**, **Melhorar vínculo** e **Definir vínculo** conservam as regras existentes; a prévia mostra a disposição resultante, inclusive quando um vínculo mais forte é preservado. Sem cadastro, o atalho abre a criação ou vinculação do PNJ do evento. O acordo permanece reservado ao mestre. Os avisos indicam seleção ou descrição que falta antes de confirmar; a aplicação continua dependendo da confirmação ou conclusão da etapa agendada.
