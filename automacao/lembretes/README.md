# Automação: Lembretes de Boletos Vencendo em 7 Dias

## Visão Geral

Este módulo implementa a tarefa agendada responsável por verificar diariamente os boletos não pagos com vencimento em 7 dias e criar lembretes automáticos para cada um deles, utilizando a procedure tRPC `trpc.lembretes.criarLembretesBoletosVencendo`.

## Agendamento

| Parâmetro        | Valor                        |
|------------------|------------------------------|
| Expressão Cron   | `0 8 * * *`                  |
| Horário          | 08:00 (horário de Brasília)  |
| Fuso Horário     | `America/Sao_Paulo` (UTC-3)  |
| Frequência       | Diária                       |

> **Nota para servidores em UTC:** ajustar a expressão cron para `0 11 * * *` (08:00 BRT equivale a 11:00 UTC).

## Fluxo de Execução

1. O cron job dispara o script `criarLembretesBoletosVencendo.js` às 08:00.
2. O script realiza uma chamada HTTP POST à procedure `trpc.lembretes.criarLembretesBoletosVencendo`.
3. A procedure, no backend, executa as seguintes etapas:
   - Busca todos os boletos não pagos com vencimento exatamente em 7 dias.
   - Para cada boleto encontrado, verifica se já existe um lembrete criado.
   - Se não existir, cria um novo lembrete com o título `"Boleto [número] vence em 7 dias"`, incluindo informações do cliente, valor e data de vencimento.
4. A procedure retorna estatísticas de execução (total verificado, criados, já existentes).
5. O script registra as estatísticas em log e encerra com código `0` (sucesso) ou `1` (falha).

## Variáveis de Ambiente

| Variável              | Obrigatória | Descrição                                                    | Exemplo                          |
|-----------------------|-------------|--------------------------------------------------------------|----------------------------------|
| `TRPC_BASE_URL`       | Sim         | URL base da API tRPC                                         | `https://app.alarion.com.br/api/trpc` |
| `TRPC_INTERNAL_TOKEN` | Sim         | Token de autenticação para chamadas internas                 | `secret-internal-token-xyz`      |
| `TRPC_TIMEOUT_MS`     | Não         | Tempo limite para resposta da API em milissegundos (padrão: `30000`) | `15000`                |

## Configuração do Cron Job

### Linux/macOS (crontab)

```bash
# Editar o crontab do utilizador do sistema
crontab -e

# Adicionar a seguinte linha (ajustar os caminhos conforme o ambiente):
0 8 * * * TRPC_BASE_URL=https://app.alarion.com.br/api/trpc TRPC_INTERNAL_TOKEN=<token> node /caminho/para/automacao/lembretes/criarLembretesBoletosVencendo.js >> /var/log/alarion/lembretes.log 2>&1
```

### Node.js com `node-cron`

```javascript
const cron = require('node-cron');

// Executa diariamente às 08:00 no horário de Brasília
cron.schedule('0 8 * * *', () => {
  require('./automacao/lembretes/criarLembretesBoletosVencendo');
}, {
  timezone: 'America/Sao_Paulo'
});
```

### PM2 com Cron

```bash
# Iniciar com PM2 usando expressão cron
pm2 start automacao/lembretes/criarLembretesBoletosVencendo.js \
  --name "lembretes-boletos" \
  --cron "0 8 * * *" \
  --no-autorestart
```

## Exemplo de Saída de Log

```
[16/03/2026 08:00:00] [INFO] ============================================================
[16/03/2026 08:00:00] [INFO] Iniciando tarefa: Lembretes de Boletos Vencendo em 7 Dias
[16/03/2026 08:00:00] [INFO] ============================================================
[16/03/2026 08:00:00] [INFO] Chamando procedure: trpc.lembretes.criarLembretesBoletosVencendo
[16/03/2026 08:00:01] [INFO] ------------------------------------------------------------
[16/03/2026 08:00:01] [INFO] Tarefa concluída com sucesso. Estatísticas:
[16/03/2026 08:00:01] [INFO]   Boletos verificados : 5
[16/03/2026 08:00:01] [INFO]   Lembretes criados   : 3
[16/03/2026 08:00:01] [INFO]   Já existiam         : 2
[16/03/2026 08:00:01] [INFO] ------------------------------------------------------------
```

## Tratamento de Erros

Em caso de falha (erro de rede, timeout, erro tRPC), o script:

1. Registra o erro em log com nível `ERRO`.
2. Encerra com código de saída `1`, sinalizando falha ao orquestrador (PM2, systemd, etc.).
3. A tarefa será reexecutada automaticamente no próximo ciclo agendado (08:00 do dia seguinte).

## Ficheiros

| Ficheiro                              | Descrição                                              |
|---------------------------------------|--------------------------------------------------------|
| `criarLembretesBoletosVencendo.js`    | Script principal da tarefa agendada                    |
| `cron.config.json`                    | Configuração declarativa do agendamento                |
| `README.md`                           | Documentação do módulo                                 |
