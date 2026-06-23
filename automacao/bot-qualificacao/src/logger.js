/**
 * Módulo de Logging — Bot de Qualificação Alarion Seguros
 *
 * Emite logs com timestamp (horário de Brasília) simultaneamente em stdout
 * e num ficheiro diário (bot-YYYY-MM-DD.log) no diretório de logs.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '..', 'logs');

function garantirDiretorioLog() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function caminhoLog() {
  const hoje = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `bot-${hoje}.log`);
}

function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Emite uma linha de log.
 * @param {'INFO'|'AVISO'|'ERRO'} nivel
 * @param {string} mensagem
 */
function log(nivel, mensagem) {
  const linha = `[${agora()}] [${nivel}] ${mensagem}`;
  if (nivel === 'ERRO')      console.error(linha);
  else                       console.log(linha);
  try {
    garantirDiretorioLog();
    fs.appendFileSync(caminhoLog(), linha + '\n', 'utf8');
  } catch (e) {
    console.error(`[AVISO] Não foi possível gravar log em ficheiro: ${e.message}`);
  }
}

module.exports = {
  info : (m) => log('INFO', m),
  aviso: (m) => log('AVISO', m),
  erro : (m) => log('ERRO', m),
};
