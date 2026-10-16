# Revisão integral do catálogo

Data: 16/10/2026. Escopo: as 179 entradas de `lib/content.json`, incluindo os oito lembretes de consulta. Foram alterados 74 textos nesta revisão. As demais entradas foram lidas e mantidas. Não houve alteração de interfaces ou rotinas de jogo.

## Cobertura

| Categoria | Entradas revisadas |
|---|---:|
| Armas primárias | 24 |
| Armas secundárias | 9 |
| Proteções | 9 |
| Trajes e acessórios | 18 |
| Ferramentas, acesso e reparo | 13 |
| Luz, comunicação e informação | 12 |
| Abrigo, transporte e mochilas | 16 |
| Bebidas | 16 |
| Alimentos | 22 |
| Medicamentos e cuidado | 20 |
| Suprimentos abstratos | 5 |
| Munição | 7 |
| Consulta antes de sair e ao retornar | 8 |
| **Total** | **179** |

## Correções de coerência

- **Munição:** o lembrete antigo dizia que munição pronta ocupava zero e cada reserva ocupava um espaço. Foi alinhado à regra existente: até quatro unidades por tipo ocupam um espaço, e a unidade comprometida permanece na carga até o encerramento da cena. As observações das armas passaram a usar os nomes dos tipos de Munição, evitando confundir unidade de munição com carga de inventário.
- **Saque:** o lembrete passou a referir-se à área de um local, em vez de um d12 por setor. Também distingue áreas narrativas, coleta e busca profunda.
- **Armas secundárias:** os bônus da Faca pequena, Tampa resistente e Escudo improvisado dependem de empunhadura compatível. Os números e o requisito de integridade do escudo foram preservados.
- **Pá dobrável:** a referência ao perfil de Pá curta agora explicita a exigência de duas mãos; isso já era determinado pelo perfil existente.
- **Materiais médicos:** tratamento direto e conversão em Medicamentos são alternativas. O mesmo conteúdo não pode ser contado duas vezes. A Caixa clínica completa deixa o kit reutilizável em ambas as alternativas, conforme a implementação existente.
- **Tala:** imobilização não significa remover Fratura nem recuperar PV.
- **Bolsas:** bônus de capacidade distinguido da carga guardada; não acumula com outra bolsa ativa.
- **Provisões:** o lembrete considera porções físicas e soltas sem duplicação e registra a exceção do Galão vazio preenchido. O fechamento do dia desconta o consumo pessoal já registrado.
- **Água:** filtro, pastilhas e panela exigem tratamento compatível com a situação; não prometem tornar qualquer líquido seguro. A verificação permanece necessária.
- **Apito:** o aumento de Barulho é certo; a reação de aliados ou de um Cego depende da cena.
- **Redação:** corrigidas negações ambíguas, como “não aumenta Armadura, reduz dano...”, além de concordância e pontuação das descrições.

## Valores preservados e notação

Nomes e categorias foram preservados, assim como todos os campos de Atributo, Alcance, Dano, Mãos, Barulho, carga, porções, preparo e prazo. Não foram alteradas outras seções do arquivo de conteúdo.

Os códigos de prazo permanecem D/F/R/C porque são usados pelo sistema. O lembrete de alimentos explica cada código. “Carga 0/1” em provisões é uma notação resumida: a carga pessoal depende do agrupamento das porções; não significa que qualquer quantidade permaneça sem carga. “Carga 1/4” de munição também é agrupada por tipo, com arredondamento por grupo de até quatro unidades.

## Limites da revisão

Não houve rebalanceamento de números nem criação de regras novas além da curadoria já discutida. Os efeitos situacionais definidos naquela curadoria continuam resolvidos pela mesa. O consumo das fitas e o comprometimento de cordas/correntes ainda dependem de registro manual pelos controles existentes; o texto não implica automação nova.

Os valores narrativos de veículos (carro 3, moto 1, van 6) foram preservados, sem criação de ficha ou controle automático. Alterá-los seria uma decisão de balanceamento, não uma correção editorial.

A conferência estrutural verificou que somente os 74 campos descritivos mudaram, mantendo as 179 entradas e os demais dados do catálogo. Não foram executados testes de jogo nesta revisão textual.
