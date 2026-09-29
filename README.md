# Zona Morta — Provisões Físicas v0.4.3

Este patch substitui o comportamento de “converter o item em contador”.

## O que muda

- Alimentos e bebidas continuam no inventário.
- O total de Comida/Água soma porções soltas + porções consumíveis nos itens físicos.
- Cada item acompanha suas porções restantes.
- Consumir uma porção não apaga o pacote inteiro.
- Pilhas são separadas automaticamente quando uma unidade fica parcialmente consumida.
- Preparar ou verificar não destrói o objeto.
- Itens pendentes de preparo/verificação não entram no total disponível.
- A carga usa as porções realmente restantes.
- Transferência conserva porções restantes, estado, abertura e prazo.
- Alimentos preparados podem ganhar vencimento próprio.
- Ao fechar o dia, o abrigo pode usar itens físicos prontos se as porções soltas não bastarem.
- Mantém os dois bolsos e a regra 3 porções = 0 carga / 4 porções = 1 carga.

## Importante sobre dados já convertidos

Se a versão anterior já apagou um item e transformou tudo em `food`/`water`, a identidade do objeto foi perdida. Essas porções continuam válidas como **porções soltas**, mas não há como o sistema adivinhar automaticamente se eram bolachas, garrafas, frutas etc.

## Aplicar no Codespaces

```bash
unzip -o Zona_Morta_Provisoes_Fisicas_v0_4_3.zip
python3 apply_provision_model.py
npm test
npm run build
```

Se tudo passar:

```bash
rm -rf .provision-model-backup
git add .
git commit -m "feat: preservar itens e rastrear porcoes fisicas"
git push
```

Não exige SQL nem migração no D1.
