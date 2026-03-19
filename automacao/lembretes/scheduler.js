/**
 * Agendador: Lembretes de Boletos Vencendo em 7 Dias
 *
 * Processo de longa duração que utiliza `node-cron` para disparar
 * diariamente às 08:00 (horário de Brasília / America/Sao_Paulo) a
 * procedure tRPC `trpc.lembretes.criarLembretesBoletosVencendo`.
 *
 * Uso:
 *   node scheduler.js
 *
 * Variáveis de ambiente:
 *   TRPC_BASE_URL        — URL base da API tRPC (obrigatória em produção)
 *   TRPC_INTERNAL_TOKEN  — Token de autenticação interno (obrigatório em produção)
 *   TRPC_TIMEOUT_MS      — Timeout em ms para chamadas à API (padrão: 30000)
 */

'use strict';

const cron = require('node-cron');
const { execFile } = require('child_process');
const path = require('path');

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Formata a data e hora atual no padrão brasileiro para uso nos logs.
 * @returns {string} Data e hora formatadas, ex.: "19/03/2026 08:00:00"
 */
function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Emite uma linha de log com timestamp, nível e mensagem.
 * @param {'INFO'|'AVISO'|'ERRO'} nivel - Nível de severidade do log.
 * @param {string} mensagem - Texto da mensagem.
 */
function log(nivel, mensagem) {
  console.log(`[${agora()}] [${nivel}] ${mensagem}`);
}

// ─── Caminho do script de tarefa ──────────────────────────────────────────────

const SCRIPT_TAREFA = path.join(__dirname, 'criarLembretesBoletosVencendo.js');

// ─── Execução da Tarefa ───────────────────────────────────────────────────────

/**
 * Invoca o script `criarLembretesBoletosVencendo.js` como processo filho,
 * herdando as variáveis de ambiente do processo pai (TRPC_BASE_URL,
 * TRPC_INTERNAL_TOKEN, TRPC_TIMEOUT_MS).
 */
function dispararTarefa() {
  log('INFO', '='.repeat(60));
  log('INFO', 'Agendador: disparando tarefa de lembretes de boletos');
  log('INFO', `Script: ${SCRIPT_TAREFA}`);
  log('INFO', '='.repeat(60));

  execFile(
    process.execPath, // caminho do binário node em uso
    [SCRIPT_TAREFA],
    {
      env: process.env,
      timeout: parseInt(process.env.TRPC_TIMEOUT_MS || '30000', 10) + 5000,
    },
    (erro, stdout, stderr) => {
      if (stdout) {
        stdout.split('\n').filter(Boolean).forEach((linha) => {
          process.stdout.write(linha + '\n');
        });
      }
      if (stderr) {
        stderr.split('\n').filter(Boolean).forEach((linha) => {
          log('AVISO', `[stderr] ${linha}`);
        });
      }
      if (erro) {
        log('ERRO', `Tarefa encerrada com falha (código ${erro.code ?? 'N/A'}): ${erro.message}`);
      } else {
        log('INFO', 'Tarefa encerrada com sucesso.');
      }
    }
  );
}

// ─── Agendamento ──────────────────────────────────────────────────────────────

/**
 * Expressão cron: "0 8 * * *"
 *   - Minuto  : 0
 *   - Hora    : 8
 *   - Dia     : qualquer
 *   - Mês     : qualquer
 *   - Semana  : qualquer
 *
 * Fuso horário: America/Sao_Paulo (UTC-3 / horário de Brasília).
 * Em servidores configurados em UTC, o node-cron com timezone garante
 * que a execução ocorra às 08:00 BRT independentemente do relógio do SO.
 */
const tarefa = cron.schedule(
  '0 8 * * *',
  dispararTarefa,
  {
    timezone: 'America/Sao_Paulo',
    scheduled: true,
  }
);

// ─── Inicialização ────────────────────────────────────────────────────────────

log('INFO', '='.repeat(60));
log('INFO', 'Agendador de Lembretes — Alarion Seguros');
log('INFO', '='.repeat(60));
log('INFO', 'Tarefa registada: criarLembretesBoletosVencendo');
log('INFO', 'Expressão cron  : 0 8 * * *');
log('INFO', 'Fuso horário    : America/Sao_Paulo (UTC-3)');
log('INFO', 'Próxima execução: diariamente às 08:00 (horário de Brasília)');
log('INFO', `TRPC_BASE_URL   : ${process.env.TRPC_BASE_URL || '(não definida — usando padrão)'}`);
log('INFO', `TRPC_INTERNAL_TOKEN: ${process.env.TRPC_INTERNAL_TOKEN ? '***configurado***' : '(não definida)'}`);
log('INFO', '='.repeat(60));
log('INFO', 'Agendador em execução. Aguardando próximo ciclo...');

// ─── Tratamento de sinais do SO ───────────────────────────────────────────────

/**
 * Ao receber SIGTERM ou SIGINT (ex.: PM2 graceful stop, Ctrl+C),
 * para o agendador de forma limpa antes de encerrar o processo.
 */
function encerrar(sinal) {
  log('INFO', `Sinal recebido: ${sinal}. Encerrando agendador...`);
  tarefa.stop();
  log('INFO', 'Agendador encerrado com sucesso.');
  process.exit(0);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT',  () => encerrar('SIGINT'));
