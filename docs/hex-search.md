# Setores, locais e áreas internas

O **setor do mapa** é a região representada pelo hex (por exemplo, Bairro residencial). Ele contém **locais**, como Mercado da praça. Cada local pode ter **áreas internas** para vasculhar, como depósito dos fundos ou cozinha.

Nos detalhes do setor, use **Gerar local**, **Gerar comércio**, **Gerar evento** ou **Adicionar local**. Os mesmos comandos continuam disponíveis no menu do mapa. Gerar um local não renomeia o setor.

No cartão do local, **Buscar neste local** abre um formulário com três etapas:

1. Escolher a área principal ou nomear outra área interna. As áreas já vasculhadas aparecem no histórico e não podem ser repetidas naquele local.
2. Definir um objetivo específico para o mestre resolver, ou vasculhar por achados com a tabela d12 sugerida para o local.
3. Revisar o resultado e o tempo. Somente **Registrar busca** marca a área e avança o relógio. Cancelar não altera a campanha.

O formulário identifica o setor e o local no topo. Ações de eventos ficam agrupadas em **Criar a partir deste evento**. Em telas menores, o formulário abre sobre o mapa e retorna aos detalhes do setor ao fechar.

Buscas exigem um sobrevivente presente e um hex explorado. A confirmação verifica novamente a presença, o local, a duplicação e o relógio. Locais diferentes podem ter áreas com o mesmo nome. Buscas e seus resultados continuam reservados ao mestre.

O campo salvo `Point.searches[].sector` continua sendo usado para a área interna, preservando campanhas antigas. Quando esse campo contém o nome do próprio local, a interface o apresenta como **Área principal**, sem modificar o registro.

Verificação: `tests/hex-search.test.cjs`, suíte completa, lint das interfaces, build e smoke test do Worker na CI. A prévia visual usa apenas dados fictícios.
