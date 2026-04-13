# Automação: Notificação de Aniversariantes do Dia

## Visão Geral

Este módulo implementa a tarefa agendada responsável por verificar diariamente os beneficiários que fazem aniversário no dia atual e enviar uma notificação automática ao owner, utilizando a procedure tRPC `trpc.alertas.notificarAniversariantes`.

## Agendamento

| Parâmetro        | Valor                        |
|------------------|------------------------------|
| Expressão Cron   | `0 8 * * *`                  |
| Horário          | 08:00 (horário de Brasília)  |
| Fuso Horário     | `America/Sao_Paulo` (UTC-3)  |
| Frequência       | Diária                       |

> **Nota para servidores em UTC:** o `scheduler.js` utiliza `node-cron` com a opção `timezone: 'America/Sao_Paulo'`, garantindo execução às 08:00 BRT independentemente do relógio do sistema operativo.

## Fluxo de Execução

1. O processo `scheduler.js` (mantido em execução contínua via PM2 ou systemd) aguarda o gatilho do cron `0 8 * * *`.
2. Às 08:00 BRT, o agendador dispara o script `notificarAniversariantes.js` como processo filho.
3. O script realiza uma chamada HTTP POST à procedure `trpc.alertas.notificarAniversariantes`.
4. A procedure, no backend, executa as seguintes etapas:
   - Busca todos os beneficiários ativos com aniversário no dia atual (compara dia e mês).
   - Formata uma mensagem com a lista de nomes e idades (ex: `• João Silva (25 anos)`).
   - Envia notificação ao owner via `notifyOwner()` com título e conteúdo formatado.
5. A procedure retorna `{ sucesso, total, mensagem }`.
   - Se não houver aniversariantes, retorna `mensagem: "Nenhum aniversariante hoje"`.
6. O script regista o resultado em log e encerra com código `0` (sucesso) ou `1` (falha).

## Variáveis de Ambiente

| Variável              | Obrigatória | Descrição                                                    | Exemplo                               |
|-----------------------|-------------|--------------------------------------------------------------|---------------------------------------|
| `TRPC_BASE_URL`       | Sim         | URL base da API tRPC                                         | `https://app.alarion.com.br/api/trpc` |
| `TRPC_INTERNAL_TOKEN` | Sim         | Token de autenticação para chamadas internas                 | `secret-internal-token-xyz`           |
| `TRPC_TIMEOUT_MS`     | Não         | Tempo limite para resposta da API em ms (padrão: `30000`)    | `15000`                               |
| `MAX_RETRIES`         | Não         | Número máximo de tentativas em caso de falha (padrão: `3`)   | `3`                                   |
| `RETRY_DELAY_MS`      | Não         | Atraso base entre tentativas em ms (padrão: `5000`)          | `5000`                                |
| `LOG_DIR`             | Não         | Diretório para ficheiros de log (padrão: `./logs`)           | `./logs`                              |

## Instalação e Configuração

### 1. Instalar dependências

```bash
cd automacao/alertas
npm install
```

### 2. Configurar variáveis de ambiente

Crie um ficheiro `.env` na raiz do módulo ou exporte as variáveis no ambiente do servidor:

```bash
export TRPC_BASE_URL=https://app.alarion.com.br/api/trpc
export TRPC_INTERNAL_TOKEN=<token-interno-secreto>
```

### 3. Iniciar o agendador

#### Opção A — Node.js directo (desenvolvimento)

```bash
node automacao/alertas/scheduler.js
```

#### Opção B — Execução única imediata

```bash
node automacao/alertas/notificarAniversariantes.js
```

#### Opção C — PM2 (produção recomendada)

```bash
pm2 start automacao/alertas/scheduler.js \
  --name "alarion-alertas-aniversariantes" \
  --env production

pm2 save
pm2 startup
```

## Exemplo de Saída de Log

```
[13/04/2026 08:00:00] [INFO] ============================================================
[13/04/2026 08:00:00] [INFO] Iniciando tarefa: Notificação de Aniversariantes do Dia
[13/04/2026 08:00:00] [INFO] Data atual: 13/04/2026
[13/04/2026 08:00:00] [INFO] Chamando procedure: trpc.alertas.notificarAniversariantes
[13/04/2026 08:00:01] [INFO] ------------------------------------------------------------
[13/04/2026 08:00:01] [INFO] Tarefa concluída com sucesso. Resultado:
[13/04/2026 08:00:01] [INFO]   Total de aniversariantes : 2
[13/04/2026 08:00:01] [INFO]   Notificação enviada      : Sim
[13/04/2026 08:00:01] [INFO]   Mensagem enviada         :
[13/04/2026 08:00:01] [INFO] • Maria Oliveira (32 anos)
[13/04/2026 08:00:01] [INFO] • Carlos Souza (45 anos)
[13/04/2026 08:00:01] [INFO] ------------------------------------------------------------
[13/04/2026 08:00:01] [INFO] Resposta completa: {"sucesso":true,"total":2,"mensagem":"• Maria Oliveira (32 anos)\n• Carlos Souza (45 anos)"}
```

## Ficheiros

| Ficheiro                          | Descrição                                                       |
|-----------------------------------|-----------------------------------------------------------------|
| `scheduler.js`                    | Processo de longa duração com `node-cron` (agendador principal) |
| `notificarAniversariantes.js`     | Script da tarefa — chama a procedure tRPC e regista resultado   |
| `cron.config.json`                | Configuração declarativa do agendamento (referência)            |
| `package.json`                    | Dependências Node.js do módulo (`node-cron`)                    |
| `.env.example`                    | Modelo de variáveis de ambiente                                 |
| `README.md`                       | Documentação do módulo                                          |
| `backend_implementation_guide.md` | Guia de implementação backend (TypeScript + Prisma + tRPC)      |
