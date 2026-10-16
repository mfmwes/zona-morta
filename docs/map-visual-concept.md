# Imagens e marcadores dos hexes

Escopo revisado: apenas imagens e organização dos ícones. Painéis, gestão, busca, controles e cores de fundo restaurados da main 16bc8e1.

PNJs acima à esquerda; abrigo acima à direita; grupo abaixo à esquerda; locais abaixo à direita. Nomes com contorno para leitura sobre as imagens.

## Imagens

Arquivo: `public/map/sector-atlas.png`, aproximadamente 3 MB, compartilhado e armazenável em cache pelos hexes. Gerado com a ferramenta integrada ImageGen, usando o conceito visual aprovado como referência. Os recortes são feitos pelo SVG em tempo de execução.

Especificação da geração: atlas quadrado 4 × 4 de cenários isométricos pós-apocalípticos detalhados, sem texto ou interface, perspectiva e iluminação consistentes; fundo azul-marinho, arquitetura em cinza, vegetação verde-oliva, preservando o estilo do conceito aprovado. Ordem das células: bairro residencial, reservatório, praça com monumento, estação ferroviária, oficinas industriais, mercado, canal com ponte, hospital, escola/universidade, parque, viaduto, construção, área rural, floresta, montanha e pântano.

As imagens representam categorias visuais, não plantas exatas dos locais. Setores personalizados usam a categoria reconhecida pelo nome ou a imagem residencial padrão. Setores desconhecidos usam apenas silhuetas neutras. A escolha da imagem não consulta pistas nem eventos secretos.

## Validação

594 testes, typecheck e testes visuais de desktop/móvel e abertura do diálogo original. Prévia na porta 4187; aplicação completa na porta 4188. Sem merge ou push.
