# Zona Morta — Menu Contextual de Inventário v0.4.4

Adiciona ações rápidas pelo clique direito sem remover o fluxo atual do botão **Ações**.

## Onde funciona
- Itens guardados do sobrevivente.
- Itens compartilhados do abrigo/reservas, quando acessíveis.

## Ações rápidas
Dependem do item e do contexto:
- Consumir 1 porção.
- Preparar.
- Verificar/tratar.
- Equipar em arma principal/secundária, proteção, item pessoal ou bolsos compatíveis.
- Transferir para outro sobrevivente ou abrigo.
- Transferir 1 unidade ou tudo quando houver pilha.
- Usar medicamentos/itens utilizáveis.
- Registrar Medicamentos abstratos.
- Guardar suprimentos abstratos nas reservas.
- Deixar 1 unidade ou tudo para trás, sempre com confirmação.

## Importante
O menu contextual e o diálogo antigo usam o mesmo executor em `lib/item-actions.ts`.
Assim, as regras de consumir, transferir, equipar, preparar e descartar não são duplicadas.

O botão **Ações** continua disponível para:
- editar estado;
- corrigir quantidade/carga;
- fluxos avançados;
- celulares e telas touch.

## Aplicar no Codespaces

```bash
unzip -o Zona_Morta_Menu_Contextual_v0_4_4.zip
python3 apply_context_menu.py
npm test
npm run build
```

Se tudo passar:

```bash
rm -rf .context-menu-backup
git add .
git commit -m "feat: menu contextual de inventario"
git push
```

Não exige SQL nem migração no D1.
