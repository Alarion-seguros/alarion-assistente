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

> **Nota para servidores em UTC:** o `scheduler.js` utiliza `node-cron` com a opção `timezone: 'America/Sao_Paulo'`, garantindo execução às 08:00 BRT independentemente do relógio do sistema operativo.

## Fluxo de Execução

1. O processo `scheduler.js` (mantido em execução contínua via PM2 ou systemd) aguarda o gatilho do cron `0 8 * * *`.
2. Às 08:00 BRT, o agendador dispara o script `criarLembretesBoletosVencendo.js` como processo filho.
3. O script realiza uma chamada HTTP POST à procedure `trpc.lembretes.criarLembretesBoletosVencendo`.
4. A procedure, no backend, executa as seguintes etapas:
   - Busca todos os boletos não pagos com vencimento exatamente em 7 dias.
   - Para cada boleto encontrado, verifica se já existe um lembrete criado.
   - Se não existir, cria um novo lembrete com o título `"Boleto [número] vence em 7 dias"`, incluindo informações do cliente, valor e data de vencimento.
5. A procedure retorna estatísticas de execução (total verificado, criados, já existentes).
6. O script regista as estatísticas em log e encerra com código `0` (sucesso) ou `1` (falha).

## Variáveis de Ambiente

| Variável              | Obrigatória | Descrição                                                    | Exemplo                               |
|-----------------------|-------------|--------------------------------------------------------------|---------------------------------------|
| `TRPC_BASE_URL`       | Sim         | URL base da API tRPC                                         | `https://app.alarion.com.br/api/trpc` |
| `TRPC_INTERNAL_TOKEN` | Sim         | Token de autenticação para chamadas internas                 | `secret-internal-token-xyz`           |
| `TRPC_TIMEOUT_MS`     | Não         | Tempo limite para resposta da API em ms (padrão: `30000`)    | `15000`                               |

## Instalação e Configuração

### 1. Instalar dependências

```bash
cd automacao/lembretes
npm install
```

### 2. Configurar variáveis de ambiente

Crie um ficheiro `.env` na raiz do projecto ou exporte as variáveis no ambiente do servidor:

```bash
export TRPC_BASE_URL=https://app.alarion.com.br/api/trpc
export TRPC_INTERNAL_TOKEN=<token-interno-secreto>
```

### 3. Iniciar o agendador

#### Opção A — Node.js directo (desenvolvimento)

```bash
node automacao/lembretes/scheduler.js
```

#### Opção B — PM2 (produção recomendada)

```bash
# Instalar PM2 globalmente (se necessário)
npm install -g pm2

# Iniciar o agendador como processo gerido pelo PM2
pm2 start automacao/lembretes/scheduler.js \
  --name "alarion-lembretes-scheduler" \
  --env production

# Guardar a lista de processos para reinício automático após reboot
pm2 save
pm2 startup
```

#### Opção C — systemd (servidores Linux)

Crie o ficheiro `/etc/systemd/system/alarion-lembretes.service`:

```ini
[Unit]
Description=Alarion — Agendador de Lembretes de Boletos
After=network.target

[Service]
Type=simple
User=alarion
WorkingDirectory=/opt/alarion
ExecStart=/usr/bin/node /opt/alarion/automacao/lembretes/scheduler.js
Restart=always
RestartSec=10
Environment=TRPC_BASE_URL=https://app.alarion.com.br/api/trpc
Environment=TRPC_INTERNAL_TOKEN=<token-interno-secreto>

[Install]
WantedBy=multi-user.target
```

Activar e iniciar o serviço:

```bash
systemctl daemon-reload
systemctl enable alarion-lembretes
systemctl start alarion-lembretes
```

#### Opção D — Execução única (crontab do sistema)

Para ambientes sem processo de longa duração, utilize o crontab do SO:

```bash
# Editar o crontab do utilizador do sistema
crontab -e

# Adicionar a seguinte linha (ajustar os caminhos conforme o ambiente):
0 8 * * * TRPC_BASE_URL=https://app.alarion.com.br/api/trpc TRPC_INTERNAL_TOKEN=<token> node /caminho/para/automacao/lembretes/criarLembretesBoletosVencendo.js >> /var/log/alarion/lembretes.log 2>&1
```

> **Nota:** Ao utilizar o crontab do SO, a expressão deve ser `0 11 * * *` se o servidor estiver em UTC (08:00 BRT = 11:00 UTC). Com o `scheduler.js` e `node-cron`, o fuso horário é gerido automaticamente.

## Exemplo de Saída de Log

```
[19/03/2026 08:00:00] [INFO] ============================================================
[19/03/2026 08:00:00] [INFO] Agendador de Lembretes — Alarion Seguros
[19/03/2026 08:00:00] [INFO] ============================================================
[19/03/2026 08:00:00] [INFO] Tarefa registada: criarLembretesBoletosVencendo
[19/03/2026 08:00:00] [INFO] Expressão cron  : 0 8 * * *
[19/03/2026 08:00:00] [INFO] Fuso horário    : America/Sao_Paulo (UTC-3)
[19/03/2026 08:00:00] [INFO] Próxima execução: diariamente às 08:00 (horário de Brasília)
[19/03/2026 08:00:00] [INFO] ============================================================
[19/03/2026 08:00:00] [INFO] Agendador em execução. Aguardando próximo ciclo...
...
[20/03/2026 08:00:00] [INFO] ============================================================
[20/03/2026 08:00:00] [INFO] Agendador: disparando tarefa de lembretes de boletos
[20/03/2026 08:00:00] [INFO] ============================================================
[20/03/2026 08:00:00] [INFO] Iniciando tarefa: Lembretes de Boletos Vencendo em 7 Dias
[20/03/2026 08:00:00] [INFO] Chamando procedure: trpc.lembretes.criarLembretesBoletosVencendo
[20/03/2026 08:00:01] [INFO] ------------------------------------------------------------
[20/03/2026 08:00:01] [INFO] Tarefa concluída com sucesso. Estatísticas:
[20/03/2026 08:00:01] [INFO]   Boletos verificados : 5
[20/03/2026 08:00:01] [INFO]   Lembretes criados   : 3
[20/03/2026 08:00:01] [INFO]   Já existiam         : 2
[20/03/2026 08:00:01] [INFO] ------------------------------------------------------------
[20/03/2026 08:00:01] [INFO] Tarefa encerrada com sucesso.
```

## Tratamento de Erros

Em caso de falha (erro de rede, timeout, erro tRPC), o script:

1. Regista o erro em log com nível `ERRO`.
2. Encerra com código de saída `1`, sinalizando falha ao orquestrador (PM2, systemd, etc.).
3. A tarefa será reexecutada automaticamente no próximo ciclo agendado (08:00 do dia seguinte).

O processo `scheduler.js` permanece em execução mesmo após falhas individuais da tarefa, garantindo que o próximo ciclo seja disparado normalmente.

## Ficheiros

| Ficheiro                              | Descrição                                                      |
|---------------------------------------|----------------------------------------------------------------|
| `scheduler.js`                        | Processo de longa duração com `node-cron` (agendador principal)|
| `criarLembretesBoletosVencendo.js`    | Script da tarefa — chama a procedure tRPC e regista estatísticas|
| `cron.config.json`                    | Configuração declarativa do agendamento (referência)           |
| `package.json`                        | Dependências Node.js do módulo (`node-cron`)                   |
| `README.md`                           | Documentação do módulo                                         |
