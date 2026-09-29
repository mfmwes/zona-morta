# Zona Morta — versão independente

Aplicativo de campanha e ficha para Daggerheart: Zona Morta. Esta cópia não usa hospedagem, login nem banco de dados do ChatGPT. Ela foi preparada para **Cloudflare Workers + D1**; o endereço inicial será um subdomínio `workers.dev`, sem necessidade de comprar domínio.

Cada pessoa cria uma conta própria com e-mail, senha e código de recuperação. A tela **Seus dossiês** guarda todas as campanhas vinculadas à conta: mesas que a pessoa conduz como mestre e mesas em que participa como jogador. O convite é necessário apenas no primeiro ingresso; depois a campanha permanece salva na conta. O servidor separa campanhas e retira anotações reservadas da visão dos jogadores.

## Requisitos

- Uma conta Cloudflare controlada por quem vai hospedar o aplicativo.
- Node.js 22.13 ou superior e pnpm 11.
- Esta pasta completa, inclusive `public/`, `content/`, `db/` e `drizzle/`.

## Publicar pela primeira vez

Na pasta do projeto:

```sh
pnpm install --frozen-lockfile
pnpm exec wrangler login
pnpm exec wrangler d1 create zona-morta
```

O último comando informa o `database_id` do novo banco. Substitua o valor `00000000-0000-4000-8000-000000000000` em `wrangler.jsonc` pelo identificador recebido. Não altere o nome da ligação `DB`.

Em uma instalação nova, crie as tabelas no banco remoto **uma vez, nesta ordem**:

```sh
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0000_early_zzzax.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0001_remarkable_harrier.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0002_lethal_doctor_octopus.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0003_past_toad.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0004_sad_darkstar.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0005_campaign_library.sql
```

Em uma atualização de uma instalação v0.1 já em produção, a v0.2 também consegue criar e registrar a tabela `campaigns` automaticamente no primeiro acesso autenticado; o arquivo `0005_campaign_library_cloudflare.sql` continua disponível para aplicação manual.

Depois publique:

```sh
pnpm deploy
```

O Wrangler informará o endereço público em `workers.dev`. Abra esse endereço, crie sua conta e **guarde o código de recuperação** exibido uma única vez. A aba **Jogadores** gera o convite da campanha aberta. Gerar outro convite impede novos ingressos pelo endereço anterior; jogadores que já entraram continuam vinculados e encontram a mesa em **Seus dossiês**.

Para atualizações futuras, publique de novo com `pnpm deploy`. Não reaplique as migrações antigas. Se o esquema mudar, aplique somente os arquivos novos que ainda não foram usados nesse banco.

## Trazer a campanha atual

1. No site atual, entre como mestre e use **Baixar cópia** para salvar o JSON da campanha.
2. No novo endereço, crie sua conta, abra ou crie uma campanha em **Seus dossiês** e use **Importar cópia**. Isso substitui apenas os dados da campanha aberta.
3. Gere um novo convite. Cada jogador cria sua conta e entra pelo endereço completo. Para aproveitar fichas importadas, vincule a ficha à pessoa na aba **Jogadores** antes que ela crie outra.

O banco do site antigo não é compartilhado com o novo. Deixe o endereço antigo ativo até conferir fichas, mapa, reservas e acesso dos jogadores no novo aplicativo.

## Acesso e limites desta versão

- O e-mail identifica a conta, mas ainda não recebe confirmação ou recuperação automática. A recuperação depende do código salvo ao criar a conta ou redefinir a senha.
- Uma conta pode manter várias campanhas como mestre e participar de várias campanhas como jogador. Cada campanha possui mapa, jogadores, convite e estado próprios.
- **Reiniciar cidade** substitui apenas o estado da campanha aberta. Para começar outra mesa sem perder a atual, volte a **Seus dossiês** e crie outra campanha.
- O convite é uma credencial de entrada: compartilhe-o somente com a sua mesa. O aplicativo limita a campanha a 12 jogadores ativos.
- O mestre pode remover uma pessoa na aba **Jogadores**. O servidor impede que ela leia ou salve a campanha depois da remoção.
- Sessões expiram após 30 dias. Senhas não são gravadas em texto simples. O código de recuperação é armazenado como hash.

Para desenvolvimento local: `pnpm dev`. Crie o banco local com os mesmos arquivos SQL, trocando `--remote` por `--local`; ele é separado do banco publicado. A verificação de tipos é `pnpm exec tsc --noEmit` e os testes existentes são `pnpm test`.
