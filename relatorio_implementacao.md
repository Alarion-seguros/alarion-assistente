# Relatório de Implementação: Tarefa Agendada para Lembretes de Boletos

**Autor:** Manus AI
**Data:** 04 de Abril de 2026

## Resumo Executivo

Este documento detalha a implementação da tarefa agendada (cron job) responsável por verificar diariamente os boletos com vencimento em 7 dias e criar os respetivos lembretes automáticos no sistema da Alarion Seguros. A solução foi desenvolvida utilizando Node.js e a biblioteca `node-cron`, integrando-se com o backend através da procedure tRPC `trpc.lembretes.criarLembretesBoletosVencendo`.

## Arquitetura da Solução

A solução foi estruturada de forma modular no diretório `automacao/lembretes/`, garantindo separação de responsabilidades e facilidade de manutenção.

### Componentes Principais

1. **Agendador Principal (`scheduler.js`)**
   - Utiliza a biblioteca `node-cron` para gerir o ciclo de execução [1].
   - Configurado com a expressão cron `0 8 * * *`, garantindo a execução diária às 08:00 no fuso horário de Brasília (`America/Sao_Paulo`).
   - Mantém um processo de longa duração que dispara o script de execução da tarefa num processo filho, isolando falhas e prevenindo que um erro na tarefa derrube o agendador.

2. **Script de Execução (`criarLembretesBoletosVencendo.js`)**
   - Responsável por realizar a chamada HTTP POST à procedure tRPC [2].
   - Implementa tratamento de erros, timeout configurável e logging detalhado.
   - Suporta retry com backoff linear crescente (configurável via `MAX_RETRIES` e `RETRY_DELAY_MS`).
   - Retorna estatísticas de execução (boletos verificados, lembretes criados e duplicatas ignoradas).

3. **Configuração e Documentação**
   - `cron.config.json`: Mantém a definição declarativa da tarefa.
   - `.env.example`: Modelo de variáveis de ambiente para facilitar a configuração em novos ambientes.
   - `README.md`: Fornece instruções claras sobre como configurar, executar e monitorizar o agendador em diferentes ambientes (PM2, systemd, crontab).

## Requisitos Atendidos

| Requisito | Implementação | Status |
|-----------|---------------|--------|
| Verificação de boletos a vencer em 7 dias | A procedure tRPC encapsula a lógica de negócio para filtrar os boletos não pagos com vencimento exato em 7 dias. | Concluído |
| Criação de lembretes automáticos | A procedure cria um novo lembrete com o título "Boleto [número] vence em 7 dias", incluindo informações do cliente e valor. | Concluído |
| Prevenção de duplicatas | A procedure verifica a existência prévia de um lembrete antes de criar um novo. | Concluído |
| Execução diária às 08:00 | O `scheduler.js` está configurado com a expressão `0 8 * * *` e fuso horário `America/Sao_Paulo`. | Concluído |
| Retorno de estatísticas | O script regista em log as estatísticas devolvidas pela procedure tRPC. | Concluído |
| Retry com backoff em caso de falha | O script realiza até `MAX_RETRIES` tentativas com atraso linear crescente antes de encerrar com erro. | Concluído |
| Logging persistente em ficheiro | Logs gravados diariamente em `logs/lembretes-YYYY-MM-DD.log` e `logs/scheduler-YYYY-MM-DD.log`. | Concluído |
| Modelo de variáveis de ambiente | Ficheiro `.env.example` com todas as variáveis documentadas e valores padrão. | Concluído |

## Fluxo de Execução

```
scheduler.js (processo contínuo)
    │
    ├── [08:00 BRT] Cron "0 8 * * *" dispara
    │
    └── execFile() → criarLembretesBoletosVencendo.js (processo filho)
            │
            ├── comRetry() → chamarTrpc('lembretes.criarLembretesBoletosVencendo')
            │       │
            │       └── HTTP POST → /api/trpc/lembretes.criarLembretesBoletosVencendo
            │               │
            │               └── Backend: busca boletos → verifica duplicatas → cria lembretes
            │                       │
            │                       └── Retorna { totalVerificado, lembreteCriados, jaExistiam }
            │
            └── Regista estatísticas em log → exit(0) ou exit(1)
```

## Considerações Adicionais: Notificações Mensais Recorrentes

De acordo com os requisitos de sistemas de faturação e acompanhamento de pagamentos, foi identificada a necessidade futura de implementar **notificações mensais recorrentes** enviadas ao cliente no dia e mês do vencimento registado do boleto [3].

Recomenda-se que esta funcionalidade seja implementada seguindo a mesma arquitetura modular:
1. Criação de uma nova procedure tRPC (ex.: `trpc.lembretes.criarNotificacoesMensais`).
2. Adição de um novo script de execução no diretório `automacao/lembretes/`.
3. Registo de uma nova expressão cron no `scheduler.js` para disparar a verificação mensal.

## Referências

[1] Repositório npm. "node-cron". Disponível em: https://www.npmjs.com/package/node-cron
[2] Documentação tRPC. "tRPC over HTTP". Disponível em: https://trpc.io/docs/rpc
[3] Base de Conhecimento Manus. "Recurring Monthly Billing Notification Requirement".
