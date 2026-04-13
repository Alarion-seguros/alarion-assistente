/**
 * Agendador: Notificação de Aniversariantes do Dia
 *
 * Processo de longa duração que utiliza node-cron para disparar diariamente
 * às 08:00 (horário de Brasília) a tarefa de notificação de aniversariantes.
 *
 * Variáveis de ambiente:
 *   TRPC_BASE_URL        — URL base da API tRPC
 *   TRPC_INTERNAL_TOKEN  — Token de autenticação interno
 *   TRPC_TIMEOUT_MS      — Timeout em ms para chamadas à API
 *   MAX_RETRIES          — Número máximo de tentativas em caso de falha
 *   RETRY_DELAY_MS       — Atraso base entre tentativas em ms
 *   LOG_DIR              — Diretório para ficheiros de log
 */

'use strict';

const cron   = require('node-cron');
const { execFile } = require('child_process');
const path   = require('path');
const fs     = require('fs');

// ─── Configuração ────────────────────────────────────────────────────────────

const CRON_EXPRESSION = '0 8 * * *';
const TIMEZONE        = 'America/Sao_Paulo';
const SCRIPT_PATH     = path.join(__dirname, 'notificarAniversariantes.js');
const LOG_DIR         = process.env.LOG_DIR || path.join(__dirname, 'logs');

const MAX_RETRIES    = parseInt(process.env.MAX_RETRIES    || '3',     10);
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '5000',  10);
const TIMEOUT_MS     = parseInt(process.env.TRPC_TIMEOUT_MS || '30000', 10);

// Timeout total estimado para o processo filho (inclui retries)
const CHILD_TIMEOUT_MS = TIMEOUT_MS * MAX_RETRIES + RETRY_DELAY_MS * MAX_RETRIES + 10000;

// ─── Logging ──────────────────────────────────────────────────────────────────

function garantirDiretorioLog() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function log(nivel, mensagem) {
  const linha = `[${agora()}] [${nivel}] ${mensagem}`;
  console.log(linha);
  try {
    garantirDiretorioLog();
    const hoje = new Date().toISOString().slice(0, 10);
    fs.appendFileSync(
      path.join(LOG_DIR, `aniversariantes-${hoje}.log`),
      linha + '\n',
      'utf8'
    );
  } catch (e) {
    console.error(`[AVISO] Não foi possível gravar log em ficheiro: ${e.message}`);
  }
}

// ─── Execução da Tarefa ───────────────────────────────────────────────────────

function dispararTarefa() {
  log('INFO', '='.repeat(60));
  log('INFO', 'Agendador: disparando tarefa de notificação de aniversariantes');
  log('INFO', '='.repeat(60));

  const env = { ...process.env };

  execFile(
    process.execPath,
    [SCRIPT_PATH],
    { env, timeout: CHILD_TIMEOUT_MS },
    (erro, stdout, stderr) => {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);

      if (erro) {
        log('ERRO', `Processo filho encerrou com erro: ${erro.message}`);
      } else {
        log('INFO', 'Processo filho encerrou com sucesso.');
      }
    }
  );
}

// ─── Inicialização ────────────────────────────────────────────────────────────

log('INFO', '='.repeat(60));
log('INFO', 'Agendador de Aniversariantes — Alarion Seguros');
log('INFO', '='.repeat(60));
log('INFO', 'Tarefa registada: notificarAniversariantes');
log('INFO', `Expressão cron  : ${CRON_EXPRESSION}`);
log('INFO', `Fuso horário    : ${TIMEZONE} (UTC-3)`);
log('INFO', 'Próxima execução: diariamente às 08:00 (horário de Brasília)');
log('INFO', '='.repeat(60));

cron.schedule(CRON_EXPRESSION, dispararTarefa, { timezone: TIMEZONE });

log('INFO', 'Agendador em execução. Aguardando próximo ciclo...');

// ─── Encerramento Gracioso ────────────────────────────────────────────────────

process.on('SIGTERM', () => {
  log('INFO', 'Sinal SIGTERM recebido. Encerrando agendador...');
  process.exit(0);
});

process.on('SIGINT', () => {
  log('INFO', 'Sinal SIGINT recebido. Encerrando agendador...');
  process.exit(0);
});
