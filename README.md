# Zona Morta

Aplicativo de campanha com visões de mestre e jogador, mapa, sobreviventes, abrigo, conflito e cena visual. Usa React, TypeScript, Vite/Vinext e Cloudflare Workers, D1 e Durable Objects.

## Desenvolvimento

Requisitos: Node.js >=22.13 e pnpm 11.25.0 (versão fixada em package.json).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

A configuração do Worker está em `wrangler.jsonc`. O ambiente local usa os bindings DB e CAMPAIGN_LIVE; credenciais e dados de produção não fazem parte do repositório. Não execute deploy para testar alterações de interface.

## Prévia de avaliação

```sh
pnpm preview:qa
```

Abra http://127.0.0.1:4173. A prévia usa componentes reais e uma campanha fictícia em memória, sem autenticação ou chamadas à campanha real. A barra superior alterna perfil, tela, tema e estilo. Recarregar reinicia a campanha de exemplo; favoritos e modelos da biblioteca persistem no navegador.

Roteiro e limites: [melhorias de usabilidade e cena](docs/usability-scene-upgrade.md).

## Validação

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm exec playwright install chromium
pnpm test:visual
node scripts/check-campaign-live.mjs
```

A suíte visual inicia sua própria prévia, verifica interações e layouts e gera `outputs/visual-report/index.html`. O teste do Worker exige build e usa banco isolado. A CI executa essas verificações e publica o relatório visual por sete dias. As capturas auxiliam a revisão; não são comparação automática de pixels com imagens aprovadas.

Para medir o JavaScript inicial após um build:

```sh
node scripts/report-client-bundle.mjs outputs/client-bundle.json
```

## Documentação

- [Atalhos da cena](docs/scene-shortcuts.md)
- [Biblioteca visual](docs/scene-object-art.md)
- [Revisão de usabilidade](docs/usability-review.md)
- [Experiência móvel](docs/mobile-experience.md)
- [Ações da equipe](docs/acoes-da-equipe.md)
- [Aparência](docs/appearance.md)

Deploy é uma etapa separada: `pnpm deploy` valida o ambiente, compila e publica no Cloudflare. A branch de avaliação deve ser aprovada antes da integração à main.
