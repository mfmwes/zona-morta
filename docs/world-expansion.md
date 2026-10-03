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

Todos os hexes novos começam **desconhecidos**. Acrescentar áreas não avança o
relógio, revela setores nem muda a cena ou a expedição. Avistar e viajar usam as
mesmas regras de adjacência, tempo, subgrupos, PNJs acompanhantes e abrigo. O
terreno e a via de um hex desconhecido não são enviados ao jogador.

A escala continua em aproximadamente 2 km por hex. Novas áreas começam com
travessia de 1 hora; o mestre pode ajustar para 2 horas nas ferramentas do hex.
Uma via é uma descrição do lugar nesta versão e não concede bônus automático
nem estabelece conexões entre bordas. As tabelas B1/B2/B3 continuam disponíveis
para adaptação e registro manual; os nomes e sinais de setores novos já
respeitam o terreno escolhido. Depois do catálogo urbano inicial, paisagens
podem reaparecer com identidades e registros independentes.

O mapa permite arrastar com mouse ou toque, ampliar/reduzir, ver tudo,
centralizar o grupo ativo ou o hex selecionado e buscar nomes ou coordenadas.
Sobre o mapa, a roda do mouse amplia ou reduz mantendo o ponto sob o cursor
na mesma posição da tela. Fora do mapa, a roda continua rolando a página.
Com o mapa em foco, as setas também movem a visão.

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
