# Zona Morta — Menus Contextuais v3 + v4

Este patch continua o menu contextual já aplicado no inventário.

## v3 — Hexes

Clique direito em um hex no mapa:

- Abrir detalhes.
- Avistar setor, quando for um hex vizinho desconhecido.
- Entrar no hex, quando a viagem for possível.
- Estabelecer abrigo no hex atual.
- Abrir o diálogo completo de mudança de abrigo quando já existir outra base.
- Gerar B1 Local.
- Gerar B2 Comércio.
- Gerar B3 Evento.
- Criar ponto manualmente.
- Ajustar Infestação de 0 a 5 ou voltar para “em aberto”.
- Abrir as Ferramentas do Mestre.

As ações de avistar e viajar foram centralizadas em `lib/hex-actions.ts`, então botão normal e clique direito usam a mesma regra.

## v4 — Sobreviventes

Clique direito em um sobrevivente na barra de equipe:

- Abrir ficha.
- Ir diretamente para Atributos, Combate, Inventário, Habilidades, Condições ou História.
- Rolar teste.
- Rolar ataque com arma primária ou secundária.
- Mestre: transferir um item guardado diretamente para outro sobrevivente/abrigo.
- Mestre: abrir rapidamente Condições, Combate e Inventário.

O jogador continua vendo apenas a própria ficha projetada pelo servidor, então as ações de personagem não liberam controle sobre fichas de outros jogadores.

## Segurança de fluxo

- Nenhuma migração D1.
- O clique normal continua funcionando.
- Celular/touch mantém o fluxo existente.
- Mudança de abrigo continua usando o diálogo completo para escolher o que será transportado.
- Transferências reutilizam `lib/item-actions.ts`.

## Aplicar

```bash
unzip -o Zona_Morta_Contextual_Hexes_Sobreviventes_v0_4_5.zip
python3 apply_context_v3_v4.py
npm test
npm run build
```

Se tudo passar:

```bash
rm -rf .context-v3-v4-backup
git add .
git commit -m "feat: menus contextuais de hexes e sobreviventes"
git push
```
