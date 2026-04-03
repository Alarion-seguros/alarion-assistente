/**
 * Tarefa Agendada: Criação de Lembretes para Boletos Vencendo em 7 Dias
 *
 * Execução: Diariamente às 08:00 (horário de Brasília)
 * Procedure tRPC: trpc.lembretes.criarLembretesBoletosVencendo
 *
 * Descrição:
 *   Este módulo executa a verificação de boletos não pagos que vencem
 *   exatamente em 7 dias e cria lembretes automáticos para cada um deles,
 *   evitando duplicatas. Retorna estatísticas de execução ao final.
 *
 * Variáveis de ambiente:
 *   TRPC_BASE_URL        — URL base da API tRPC (padrão: http://localhost:3000/api/trpc)
 *   TRPC_INTERNAL_TOKEN  — Token de autenticação interno (obrigatório em produção)
 *   TRPC_TIMEOUT_MS      — Timeout em ms para chamadas à API (padrão: 30000)
 *   LOG_DIR              — Diretório para ficheiros de log (padrão: ./logs)
 *   MAX_RETRIES          — Número máximo de tentativas em caso de falha (padrão: 3)
 *   RETRY_DELAY_MS       — Atraso base entre tentativas em ms (padrão: 5000)
 */

'use strict';

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

// ─── Configuração ────────────────────────────────────────────────────────────

const CONFIG = {
  /**
   * URL base da API tRPC.
   * Ajuste conforme o ambiente (desenvolvimento, homologação ou produção).
   * Pode ser sobrescrita pela variável de ambiente TRPC_BASE_URL.
   */
  trpcBaseUrl: process.env.TRPC_BASE_URL || 'http://localhost:3000/api/trpc',

  /**
   * Token de autenticação para chamadas internas ao servidor tRPC.
   * Deve ser configurado via variável de ambiente TRPC_INTERNAL_TOKEN.
   */
  internalToken: process.env.TRPC_INTERNAL_TOKEN || '',

  /**
   * Tempo máximo de espera por resposta da API (em milissegundos).
   */
  timeoutMs: parseInt(process.env.TRPC_TIMEOUT_MS || '30000', 10),

  /**
   * Diretório onde os ficheiros de log serão gravados.
   */
  logDir: process.env.LOG_DIR || path.join(__dirname, 'logs'),

  /**
   * Número máximo de tentativas em caso de falha transitória.
   */
  maxRetries: parseInt(process.env.MAX_RETRIES || '3', 10),

  /**
   * Atraso base entre tentativas (em ms). Cada tentativa multiplica este
   * valor pelo número da tentativa (backoff linear crescente).
   */
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '5000', 10),
};

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * Garante que o diretório de logs existe, criando-o se necessário.
 */
function garantirDiretorioLog() {
  if (!fs.existsSync(CONFIG.logDir)) {
    fs.mkdirSync(CONFIG.logDir, { recursive: true });
  }
}

/**
 * Retorna o caminho do ficheiro de log do dia atual.
 * Formato: logs/lembretes-YYYY-MM-DD.log
 * @returns {string}
 */
function caminhoLogDiario() {
  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(CONFIG.logDir, `lembretes-${hoje}.log`);
}

/**
 * Formata a data e hora atual no padrão brasileiro para uso nos logs.
 * @returns {string} Data e hora formatadas, ex.: "16/03/2026 08:00:00"
 */
function agora() {
  return new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Emite uma linha de log com timestamp, nível e mensagem.
 * Escreve simultaneamente em stdout e no ficheiro de log diário.
 *
 * @param {'INFO'|'AVISO'|'ERRO'} nivel - Nível de severidade do log.
 * @param {string} mensagem - Texto da mensagem.
 */
function log(nivel, mensagem) {
  const linha = `[${agora()}] [${nivel}] ${mensagem}`;
  console.log(linha);
  try {
    garantirDiretorioLog();
    fs.appendFileSync(caminhoLogDiario(), linha + '\n', 'utf8');
  } catch (e) {
    // Falha ao gravar log em ficheiro não deve interromper a execução
    console.error(`[AVISO] Não foi possível gravar log em ficheiro: ${e.message}`);
  }
}

// ─── Utilitários de Retry ─────────────────────────────────────────────────────

/**
 * Aguarda um determinado número de milissegundos.
 * @param {number} ms - Tempo de espera em milissegundos.
 * @returns {Promise<void>}
 */
function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa uma função assíncrona com retry e backoff linear crescente.
 *
 * @param {Function} fn - Função assíncrona a executar.
 * @param {number} maxTentativas - Número máximo de tentativas.
 * @param {number} atrasoBaseMs - Atraso base entre tentativas (em ms).
 * @returns {Promise<any>} Resultado da função em caso de sucesso.
 * @throws {Error} Lança o último erro após esgotar todas as tentativas.
 */
async function comRetry(fn, maxTentativas, atrasoBaseMs) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await fn();
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < maxTentativas) {
        const atraso = atrasoBaseMs * tentativa; // backoff linear crescente
        log('AVISO', `Tentativa ${tentativa}/${maxTentativas} falhou: ${erro.message}`);
        log('AVISO', `Aguardando ${atraso}ms antes da próxima tentativa...`);
        await aguardar(atraso);
      }
    }
  }
  throw ultimoErro;
}

// ─── Chamada tRPC ─────────────────────────────────────────────────────────────

/**
 * Executa uma chamada HTTP POST à procedure tRPC informada.
 *
 * O protocolo tRPC (v10+) para mutations via HTTP utiliza POST com o corpo
 * no formato JSON `{ "0": { "json": <input> } }` e retorna a resposta no
 * formato `[{ "result": { "data": { "json": <output> } } }]`.
 *
 * @param {string} procedure - Nome completo da procedure (ex.: "lembretes.criarLembretesBoletosVencendo").
 * @param {object} [input={}] - Dados de entrada para a procedure.
 * @returns {Promise<object>} Dados retornados pela procedure.
 */
function chamarTrpc(procedure, input = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${CONFIG.trpcBaseUrl}/${procedure}`);
    const corpo = JSON.stringify({ '0': { json: input } });

    const opcoes = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(corpo),
        ...(CONFIG.internalToken
          ? { Authorization: `Bearer ${CONFIG.internalToken}` }
          : {}),
      },
    };

    const driver = url.protocol === 'https:' ? https : http;
    const req = driver.request(opcoes, (res) => {
      let dados = '';
      res.on('data', (chunk) => { dados += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(dados);

          // Verifica se a resposta contém erro tRPC
          if (json[0]?.error) {
            const err = json[0].error;
            return reject(
              new Error(
                `Erro tRPC [${err.data?.code || 'DESCONHECIDO'}]: ${err.message}`
              )
            );
          }

          // Extrai o resultado no formato padrão tRPC v10
          const resultado = json[0]?.result?.data?.json ?? json[0]?.result?.data;
          if (resultado === undefined) {
            return reject(new Error('Resposta tRPC em formato inesperado.'));
          }

          resolve(resultado);
        } catch (e) {
          reject(new Error(`Falha ao interpretar resposta JSON: ${e.message}`));
        }
      });
    });

    req.setTimeout(CONFIG.timeoutMs, () => {
      req.destroy();
      reject(new Error(`Tempo limite de ${CONFIG.timeoutMs}ms excedido.`));
    });

    req.on('error', (e) => reject(new Error(`Erro de rede: ${e.message}`)));
    req.write(corpo);
    req.end();
  });
}

// ─── Tarefa Principal ─────────────────────────────────────────────────────────

/**
 * Executa a tarefa agendada de criação de lembretes para boletos vencendo
 * em 7 dias, invocando a procedure tRPC correspondente.
 *
 * Fluxo:
 *  1. Chama `trpc.lembretes.criarLembretesBoletosVencendo`.
 *  2. A procedure busca todos os boletos não pagos com vencimento em 7 dias.
 *  3. Para cada boleto, verifica se já existe lembrete; se não, cria um novo
 *     com título "Boleto [número] vence em 7 dias" e dados do cliente.
 *  4. Retorna estatísticas: total verificado, criados e já existentes.
 *
 * @returns {Promise<void>}
 */
async function executarTarefa() {
  log('INFO', '='.repeat(60));
  log('INFO', 'Iniciando tarefa: Lembretes de Boletos Vencendo em 7 Dias');
  log('INFO', `Configuração: maxRetries=${CONFIG.maxRetries}, retryDelayMs=${CONFIG.retryDelayMs}ms`);
  log('INFO', '='.repeat(60));

  try {
    log('INFO', 'Chamando procedure: trpc.lembretes.criarLembretesBoletosVencendo');

    const estatisticas = await comRetry(
      () => chamarTrpc('lembretes.criarLembretesBoletosVencendo'),
      CONFIG.maxRetries,
      CONFIG.retryDelayMs
    );

    log('INFO', '-'.repeat(60));
    log('INFO', 'Tarefa concluída com sucesso. Estatísticas:');
    log('INFO', `  Boletos verificados : ${estatisticas.totalVerificado ?? 'N/A'}`);
    log('INFO', `  Lembretes criados   : ${estatisticas.lembreteCriados ?? estatisticas.criados ?? 'N/A'}`);
    log('INFO', `  Já existiam         : ${estatisticas.jaExistiam ?? estatisticas.duplicatas ?? 'N/A'}`);
    log('INFO', '-'.repeat(60));

    // Exibe o objeto completo para auditoria
    log('INFO', `Resposta completa: ${JSON.stringify(estatisticas)}`);

    process.exit(0);
  } catch (erro) {
    log('ERRO', `Falha na execução da tarefa após ${CONFIG.maxRetries} tentativas: ${erro.message}`);
    log('ERRO', 'A tarefa será reexecutada no próximo ciclo agendado (08:00).');
    process.exit(1);
  }
}

// ─── Ponto de Entrada ─────────────────────────────────────────────────────────

executarTarefa();
