# Mapa ilustrado e exploração

Implementação do conceito aprovado, em `codex/map-visual-concept`, a partir de `16bc8e1`. A integração na main depende da avaliação da prévia.

## Interface

- Hexes com ilustrações isométricas, nomes legíveis e marcadores de grupo, achados e acontecimentos.
- Painel lateral persistente no desktop; detalhes em painel inferior no celular e em telas estreitas.
- Busca por coordenadas, setor e nome de local/pista, incluindo palavras sem acentos.
- Filtros Todos, Com achados e Eventos pendentes. Os setores sem correspondência ficam atenuados, preservando a orientação espacial.
- Expandir mapa recolhe o painel; selecionar um setor volta a mostrá-lo. Zoom e posição são mantidos ao abrir e fechar os diálogos de exploração.
- Locais apresentados em cartões com ações; acontecimentos recolhíveis e gestão em aba separada.
- As regras, permissões e dados salvos da campanha permanecem compatíveis. Nenhuma migração é necessária.

## Imagens

Arquivo: `public/map/sector-atlas.png`, aproximadamente 3 MB, compartilhado e armazenável em cache pelos hexes. Gerado com a ferramenta integrada ImageGen, usando o conceito visual aprovado como referência. Os recortes são feitos pelo SVG em tempo de execução.

Especificação da geração: atlas quadrado 4 × 4 de cenários isométricos pós-apocalípticos detalhados, sem texto ou interface, perspectiva e iluminação consistentes; fundo azul-marinho, arquitetura em cinza, vegetação verde-oliva, preservando o estilo do conceito aprovado. Ordem das células: bairro residencial, reservatório, praça com monumento, estação ferroviária, oficinas industriais, mercado, canal com ponte, hospital, escola/universidade, parque, viaduto, construção, área rural, floresta, montanha e pântano.

As imagens representam categorias visuais, não plantas exatas dos locais. Setores personalizados usam a categoria reconhecida pelo nome ou a imagem residencial padrão. Setores desconhecidos usam apenas silhuetas neutras. A escolha da imagem não consulta pistas nem eventos secretos.

## Validação e prévia

`npm run typecheck`, `npm test`, `npm run lint`, `npm run build` e testes Playwright em `tests/visual/map-concept.spec.ts`. Os testes verificam busca, privacidade, filtros, câmera, painel lateral e layout móvel. A prévia `/?screen=map` usa uma campanha de exemplo, sem enviar dados à campanha real.

Backup anterior: `outputs/backups/zona-morta-before-map-concept.bundle`, validado com `git bundle verify`. SHA-256: `2F33C58CFAA121CDB9A446EFC767209912F42D690CA7094E80862483BC4D943D`. Contém o histórico Git até a versão anterior; não contém o banco de campanhas nem credenciais.
