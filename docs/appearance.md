# Aparência

O app tem um único estilo visual, o **Refinado**: superfícies neutras e calmas, petróleo como cor de ação e âmbar como destaque, IBM Plex Sans com algarismos tabulares, três raios e três elevações fixos. O único ajuste do usuário é o **modo claro/noturno**, salvo neste navegador e independente da conta ou da campanha. No celular, o controle fica em **Mais → Ferramentas**.

Histórico: em novembro de 2026 o Refinado passou a ser o padrão e os estilos opcionais (Refino fiel, Leitura confortável, Dossiê técnico e, por último, o Visual clássico) foram retirados, junto com o seletor **Estilo**. Uma escolha antiga que tenha ficado salva no navegador é apagada na inicialização e não tem efeito.

## Implementação

`lib/appearance.ts` define o estilo (`visualStyle`) e o script executado antes da primeira pintura, que restaura o modo claro/noturno e garante `data-visual-style="refinado"` no `<html>`. O HTML do servidor já sai com esse atributo. As regras do estilo dependem dele: muitas ainda sobrepõem a camada original de CSS, escrita para o visual anterior, que vai sendo limpa em entregas pequenas.

- `app/appearance.css`: paleta clara e escura e o mapeamento dela para os tokens do app (superfícies, texto, ação, campos, contornos e uma família de cores para áreas escuras, como a barra lateral e a planta do abrigo). Também guarda o posicionamento do controle de claro/noturno.
- `app/visual-refinado.css`: forma e tipografia (escala de texto, raios, elevações, botões, etiquetas, cartões, diálogos, barra lateral com rótulos e ajustes por tela). É carregado por último.

`--font-mono` aponta para a IBM Plex Sans: rótulos e números deixam a monoespaçada, e os algarismos tabulares mantêm o alinhamento. Teclas de atalho (`kbd`) usam IBM Plex Mono. Rótulos são escritos em frase no código; etiquetas curtas de status (ACERTO/FALHA, VOCÊ, AO VIVO) ficam em maiúsculas.

Esperança, Medo, dano e avisos mantêm cores com significado próprio, com variantes clara e noturna. A arte dos objetos e as cores do mapa não dependem do estilo.

As fontes WOFF2 de Latin e Latin Extended são servidas por `/fonts/appearance/`, com as licenças SIL OFL na mesma pasta. Não há chamadas ao Google Fonts durante o uso do aplicativo. Fonte de origem: [IBM Plex](https://github.com/IBM/plex), distribuição [Google Fonts](https://github.com/google/fonts).

## Validação

- `tests/appearance.test.cjs`: atributo do estilo sempre presente (inclusive com escolhas antigas salvas, que são apagadas), modo claro/noturno restaurado, valores inválidos e armazenamento bloqueado.
- `tests/appearance-css.test.cjs`: todas as regras do estilo em `appearance.css` exigem o atributo; contraste mínimo de 4,5:1 dos pares de texto nas paletas clara e escura e de 3:1 nos limites dos campos.
- `tests/visual/contrast.spec.ts`: nenhum texto visível abaixo de 3:1 contra o fundo real, nos dois temas.
