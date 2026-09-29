# Zona Morta — Carga, Bolsos e Porções Automáticas v0.4.2 (revisado)

Este ZIP **substitui o patch v0.4.2 anterior**. Use apenas este.

## 1. Carga de porções
- 1–3 porções: 0 espaços.
- 4–7 porções: 1 espaço.
- 8–11 porções: 2 espaços.
- e assim por diante.

## 2. Dois bolsos no Kit Ativo
- `Bolso 1` e `Bolso 2`.
- 0 carga enquanto o objeto estiver ativo no bolso.
- Aceitam itens compactos marcados como `Carga 0` ou `Guarda 0`.
- Alimentos e bebidas não usam esses slots.

## 3. Porções automáticas
Ao usar **Registrar achado**:
- alimento pronto entra automaticamente no contador de Comida;
- bebida/água pronta entra automaticamente no contador de Água;
- a quantidade de porções vem do próprio catálogo;
- o item é convertido para porções, evitando duplicação entre objeto e contador;
- prazo/perecibilidade é mantido no lote de provisões.

Exemplos:
- 1 Barra de cereal → +1 Comida;
- 2 Pacotes de bolachas → +4 Comida;
- 3 Garrafas de água lacrada → +3 Água.

### Exceção importante
Itens que exigem preparo, tratamento ou verificação **não entram automaticamente** no contador. Eles continuam como objetos físicos até a ação ser resolvida. Isso evita contar como água potável algo ainda não verificado ou como comida pronta algo que ainda precisa ser preparado.

Não exige migração no D1.

## Codespaces

Extraia o ZIP na raiz e rode:

```bash
python3 apply_inventory_fixes.py
npm test
npm run build
```

Se tudo passar:

```bash
rm -rf .inventory-fix-backup
git add .
git commit -m "fix: carga, bolsos e porções automáticas"
git push
```
