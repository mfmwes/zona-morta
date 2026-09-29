# Zona Morta — versão independente

Aplicativo de campanha e ficha para Daggerheart: Zona Morta. Esta cópia não usa hospedagem, login nem banco de dados do ChatGPT. Ela foi preparada para **Cloudflare Workers + D1**; o endereço inicial será um subdomínio `workers.dev`, sem necessidade de comprar domínio.

Cada pessoa cria uma conta própria com e-mail, senha e código de recuperação. Cada conta pode manter uma campanha como mestre e participar de campanhas de outras pessoas. O mestre cria um convite, os jogadores entram e criam suas fichas. O servidor separa campanhas e retira anotações reservadas da visão dos jogadores.

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

Crie as tabelas no banco remoto **uma vez, nesta ordem**:

```sh
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0000_early_zzzax.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0001_remarkable_harrier.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0002_lethal_doctor_octopus.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0003_past_toad.sql
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --file drizzle/0004_sad_darkstar.sql
```

Depois publique:

```sh
pnpm deploy
```

O Wrangler informará o endereço público em `workers.dev`. Abra esse endereço, crie sua conta e **guarde o código de recuperação** exibido uma única vez. A aba **Jogadores** gera o convite da sua campanha. Gerar outro convite impede novos ingressos pelo endereço anterior; jogadores que já entraram continuam vinculados.

Para atualizações futuras, publique de novo com `pnpm deploy`. Não reaplique as migrações antigas. Se o esquema mudar, aplique somente os arquivos novos que ainda não foram usados nesse banco.

## Trazer a campanha atual

1. No site atual, entre como mestre e use **Baixar cópia** para salvar o JSON da campanha.
2. No novo endereço, crie sua conta e use **Importar cópia**. Isso substitui os dados da campanha dessa conta; baixe uma cópia dela antes, se já tiver jogado ali.
3. Gere um novo convite. Cada jogador cria sua conta e entra pelo endereço completo. Para aproveitar fichas importadas, vincule a ficha à pessoa na aba **Jogadores** antes que ela crie outra.

O banco do site antigo não é compartilhado com o novo. Deixe o endereço antigo ativo até conferir fichas, mapa, reservas e acesso dos jogadores no novo aplicativo.

## Acesso e limites desta versão

- O e-mail identifica a conta, mas ainda não recebe confirmação ou recuperação automática. A recuperação depende do código salvo ao criar a conta ou redefinir a senha.
- Uma conta mantém uma campanha própria por vez. **Nova campanha** substitui a campanha dessa conta; baixe uma cópia antes.
- O convite é uma credencial de entrada: compartilhe-o somente com a sua mesa. O aplicativo limita a campanha a 12 jogadores ativos.
- O mestre pode remover uma pessoa na aba **Jogadores**. O servidor impede que ela leia ou salve a campanha depois da remoção.
- Sessões expiram após 30 dias. Senhas não são gravadas em texto simples. O código de recuperação é armazenado como hash.

Para desenvolvimento local: `pnpm dev`. Crie o banco local com os mesmos arquivos SQL, trocando `--remote` por `--local`; ele é separado do banco publicado. A verificação de tipos é `pnpm exec tsc --noEmit` e os testes existentes são `pnpm test`.
