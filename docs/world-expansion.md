# Expansão progressiva do mundo

Na aba **Mapa e hexes**, o mestre seleciona um hex e usa **Expandir mundo**.
A mesma ação aparece nas ferramentas do hex. A prévia mostra os hexes novos em
dourado e informa a quantidade antes de salvar.

- **Adicionar vizinho:** acrescenta uma área na direção escolhida.
- **Estender direção:** percorre de 1 a 12 hexes a partir da origem, acrescentando
  somente as coordenadas que ainda não existem. Pode ser repetido a partir da
  nova borda para construir estradas longas ou novas explorações.
- **Adicionar anel:** acrescenta uma camada em toda a borda atual, inclusive em
  mapas irregulares. Um mapa regular cresce de 19 para 37, depois 61 áreas.

Terreno (urbano, rural, floresta, montanha, pântano) e via (estrada, trilha,
ferrovia ou sem via definida) são escolhas independentes. Essas escolhas valem
apenas para os hexes novos. Os anteriores preservam seus setores, pontos,
eventos, buscas e anotações. As ferramentas do mestre permitem ajustar terreno
e via de cada hex posteriormente, sem substituir o setor já revelado.

Ao adicionar vizinhos ou estender uma direção com uma via, **Conectar a via
desde o hex de origem** cria ligações recíprocas entre os hexes percorridos.
A opção começa desligada: conexões são um recurso opcional para ligar pontos
específicos, e hexes comuns continuam com a exploração normal.
Conexões existentes, inclusive bloqueios, são preservadas. O campo opcional
**Cidade ou região** identifica o núcleo ao qual pertencem os novos hexes.
Em **Gestão do setor → Conexões e região**, o mestre pode criar, remover ou
bloquear cada ligação nas seis direções. Um bloqueio impede a travessia entre
os dois hexes, inclusive nos fluxos de movimento direto e das equipes.

Todos os hexes novos começam **desconhecidos**. Acrescentar áreas não avança o
relógio, revela setores nem muda a cena ou a expedição. Avistar e viajar usam as
mesmas regras de adjacência, tempo, subgrupos, PNJs acompanhantes e abrigo. O
terreno e a via de um hex desconhecido não são enviados ao jogador.

A escala continua em aproximadamente 2 km por hex. Novas áreas começam com
travessia de 1 hora; o mestre pode ajustar para 2 horas nas ferramentas do hex.
O campo Via descreve o lugar; as conexões estabelecem o traçado entre bordas.
Não há bônus automático de velocidade. Vias aparecem quando os dois extremos
são avistados ou explorados; conexões e regiões desconhecidas não são enviadas
ao jogador. As tabelas B1/B2/B3 continuam disponíveis
para adaptação e registro manual; os nomes e sinais de setores novos já
respeitam o terreno escolhido. Depois do catálogo urbano inicial, paisagens
podem reaparecer com identidades e registros independentes.

O mapa permite arrastar com mouse ou toque, ampliar/reduzir, ver tudo,
centralizar o grupo ativo ou o hex selecionado e buscar nomes ou coordenadas.
Sobre o mapa, a roda do mouse amplia ou reduz mantendo o ponto sob o cursor
na mesma posição da tela. Fora do mapa, a roda continua rolando a página.
Com o mapa em foco, as setas também movem a visão.

## Planejamento de viagens

A tela de exploração usa uma mesa com o mapa como área principal. A barra à
esquerda reúne setor, vias, viagem e expansão. No desktop, clicar em um hex abre
a janela original do setor, com as abas Exploração e Gestão do setor. No celular, os
detalhes abrem em uma gaveta inferior. Jogadores consultam apenas o conteúdo
revelado e não recebem as ferramentas de gestão. Sessão, reservas e relógio
ficam disponíveis em controles expansíveis para o mestre.

O mestre escolhe o grupo ativo e **Planejar viagem**, seleciona um destino
conhecido no mapa ou na lista, e usa **Ver trajeto** para enquadrar o percurso.
Por padrão, **Exploração normal entre hexes** encontra o caminho de menor tempo
entre áreas conhecidas adjacentes, com ou sem vias. Escolha **Somente vias
conectadas** quando quiser usar exclusivamente as ligações criadas pelo mestre.
Um bloqueio sempre exclui aquela ligação. A legenda só exibe vias e bloqueios
quando existem conexões visíveis; o trajeto aparece durante o planejamento.
**Ocultar vias / Mostrar vias** alterna as linhas de conexão e os símbolos de
bloqueio apenas na sua visualização atual. As conexões, bloqueios e regras de
travessia permanecem ativos; o trajeto planejado continua visível.

A previsão usa a travessia de cada destino, o Quadro de rotas e condições de
deslocamento dos sobreviventes. Divide a marcha em dias, sugere paradas e
respeita a marcha já registrada hoje e o tempo antes da meia-noite. Horas de
marcha por dia e dias extras de mantimentos são escolhas do planejamento.
As paradas são sugestões; sua segurança precisa ser avaliada na mesa.

Mantimentos seguem a regra de **1 comida e 1 água por pessoa/dia**, incluindo
PNJs acompanhantes e água extra de condições atuais. A previsão cobre dias de
viagem e de reserva; compara a necessidade com porções pessoais e itens prontos
para consumo. Estoques do abrigo, comida ainda sem preparo e itens já vencidos
não são contados como levados. Confira prazos futuros, carga e distribuição.
O planejamento não realiza consumo; o fechamento do dia continua responsável.

**Viajar próximo hex** usa o fluxo real de viagem: move o grupo após a chegada
ou agenda a atividade quando há equipes separadas. O restante é recalculado.
O fechamento do dia e o descanso continuam explícitos. Esta versão planeja
viagens a pé; veículo e combustível não são estimados por este planejador.

Prévia local isolada: `npm run preview:qa -- --port 4189`, em
`http://127.0.0.1:4189/?screen=map&scenario=roads`. O exemplo contém duas cidades,
uma ponte bloqueada e um desvio; Reiniciar exemplo descarta suas alterações.

Campanhas existentes e snapshots mantêm o formato anterior: os campos novos
são opcionais. Não há migração de banco. Esta versão aceita até 2.000 hexes e
registros de campanha com até 1.800.000 bytes, deixando margem abaixo do
[limite de 2 MB por linha do D1](https://developers.cloudflare.com/d1/platform/limits/).
Mundos com muito conteúdo por setor podem alcançar o limite de armazenamento
antes da quantidade máxima de hexes.

Validação: testes de preservação, anéis, direções, capacidade, descoberta,
movimentação além do mapa original, subgrupos, abrigo, PNJs, geração e projeção
do jogador em `tests/world.test.cjs`, além de teste local da interface em
computador e celular usando uma campanha fictícia.
