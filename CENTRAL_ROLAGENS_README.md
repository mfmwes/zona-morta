# Zona Morta — Central de Rolagens v0.3

Este patch adiciona uma Central de Rolagens à campanha sem exigir migração do D1.

## O que muda

- Nova seção **Rolagens** na navegação da campanha.
- Histórico de testes e dano já registrados no `game.log`.
- Resumo de rolagens, Hope, Fear e críticos.
- Filtros por testes e dano.
- Botão para rolar diretamente da central.
- Jogador fica travado no próprio sobrevivente ao abrir a rolagem pela central.
- Jogadores passam a enxergar rolagens públicas de outros sobreviventes.
- Rolagens livres do mestre, sem `actorId`, continuam privadas.
- A central atualiza junto com a sincronização existente da campanha (polling atual de ~8 segundos).

## Aplicar no Codespaces

Coloque `zona-morta-central-rolagens-v0.3.patch` na raiz do repositório e rode:

```bash
git apply --check zona-morta-central-rolagens-v0.3.patch
git apply zona-morta-central-rolagens-v0.3.patch
npm test
npm run build
git status
```

Se os testes/build passarem:

```bash
git add .
git commit -m "feat: central de rolagens"
git push
```

Não há SQL para executar nesta etapa.
