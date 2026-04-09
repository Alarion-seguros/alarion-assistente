# Cancelamento de Automação: Lembretes de Boletos

**Data:** 09 de Abril de 2026
**Status:** Removido conforme solicitação do utilizador

## Descrição
A automação agendada que executava diariamente às 08:00 para verificar boletos com vencimento em 7 dias e criar lembretes via tRPC (`trpc.lembretes.criarLembretesBoletosVencendo`) foi **removida**.

## Ações Realizadas
- Exclusão do diretório `automacao/lembretes/` contendo o agendador (`scheduler.js`) e o script de execução (`criarLembretesBoletosVencendo.js`).
- Remoção do relatório de implementação anterior.
- Limpeza das configurações de cron job declarativas.

---
*Esta funcionalidade pode ser restaurada a partir do histórico do Git se necessário futuramente.*
