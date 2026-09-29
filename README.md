# Zona Morta — Feedback de Ações: Redesign visual v0.4.1

Redesign visual das notificações do sistema, mantendo o comportamento já implementado.

## Visual
- estilo de terminal/dossiê de campo coerente com Zona Morta;
- fundo verde-petróleo escuro;
- faixa lateral semântica;
- sucesso em verde claro;
- erro em ferrugem/vermelho;
- alerta em âmbar;
- informação em ciano;
- ícones em cápsulas próprias;
- tipografia de registro técnico;
- detalhe `ZM // REGISTRO`;
- acabamento com grade/scanline discreta e círculos de radar;
- botão de fechar redesenhado;
- versão responsiva para celular.

## Não altera
- banco D1;
- regras;
- rolagens;
- Hope/Fear;
- inventário;
- dados das campanhas.

## Aplicação no Codespaces

Aplique primeiro o Feedback de Ações v0.4. Depois extraia este ZIP na raiz e rode:

```bash
python3 apply_feedback_style.py
npm test
npm run build
```

Se tudo passar:

```bash
rm -rf .feedback-style-backup
git add .
git commit -m "style: redesenhar feedback de ações"
git push
```
