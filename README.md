# Zona Morta — Feedback de Ações v0.4

Adiciona feedback visual imediato para ações importantes usando o sistema de notificações que já existe no projeto.

## O que entra
- Rolagens: sucesso, falha, crítico, total e mudanças de Hope/Fear/Stress.
- Dano rolado: valor, arma e crítico.
- Nova cena e nova expedição.
- Avanço de tempo.
- Reiniciar cidade.
- Estabelecer e renomear abrigo.
- Salvar notas do abrigo.
- Descanso curto e longo.
- Virada de dia.

Os feedbacks já existentes de inventário, habilidades e provisões são preservados.

## Como aplicar no Codespaces

Extraia o ZIP na raiz do projeto e rode:

```bash
python3 apply_feedback.py
npm test
npm run build
git status
```

Se estiver tudo certo:

```bash
rm -rf .feedback-backup
git add .
git commit -m "feat: feedback de ações"
git push
```

Não exige SQL nem alteração no D1.

Compatível para aplicar depois da Central de Rolagens v0.3.
