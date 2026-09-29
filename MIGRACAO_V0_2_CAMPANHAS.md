# Zona Morta v0.2 — Biblioteca de Campanhas

Esta versão adiciona **Seus dossiês**, uma tela inicial que guarda as campanhas da conta como mestre e como jogador.

## Banco D1

A v0.2 é compatível com o banco já publicado. O backend cria a tabela `campaigns` automaticamente no primeiro acesso autenticado e registra a campanha antiga como **Campanha principal**, sem apagar ou mover os dados existentes.

O arquivo `drizzle/0005_campaign_library_cloudflare.sql` fica disponível como migração explícita para manutenção ou conferência. Aplicá-lo manualmente é opcional nesta versão.

## Depois do deploy

1. Acesse a raiz do site e faça login.
2. A tela **Seus dossiês** deve aparecer.
3. A campanha existente deve aparecer em **Como mestre** ou **Como jogador**.
4. Um mestre pode criar várias campanhas.
5. O link de convite é necessário só para o primeiro ingresso. Depois a campanha aparece automaticamente em **Como jogador**.
6. Dentro de qualquer campanha há o botão **Meus dossiês** para voltar à biblioteca.

## Verificação rápida do D1

```sql
SELECT id, owner_id, name, created_at, updated_at, archived_at
FROM campaigns
ORDER BY updated_at DESC;
```
