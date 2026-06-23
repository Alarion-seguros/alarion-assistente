/**
 * Cliente Z-API — Bot de Qualificação Alarion Seguros
 *
 * Encapsula o envio de mensagens de texto via Z-API (https://www.z-api.io/).
 *
 * Endpoint utilizado:
 *   POST https://api.z-api.io/instances/{INSTANCE_ID}/token/{INSTANCE_TOKEN}/send-text
 *   Header: Client-Token: {CLIENT_TOKEN}   (Account Security Token, quando ativo)
 *   Body  : { "phone": "5511999999999", "message": "..." }
 *
 * Variáveis de ambiente:
 *   ZAPI_INSTANCE_ID     — ID da instância Z-API (obrigatória)
 *   ZAPI_INSTANCE_TOKEN  — Token da instância Z-API (obrigatória)
 *   ZAPI_CLIENT_TOKEN    — Account Security Token (Client-Token), se ativado no painel
 *   ZAPI_BASE_URL        — Base da API (padrão: https://api.z-api.io)
 *   SEND_DELAY_MS        — Atraso entre mensagens consecutivas (padrão: 1200ms)
 */

'use strict';

const logger = require('./logger');

const BASE_URL       = process.env.ZAPI_BASE_URL || 'https://api.z-api.io';
const INSTANCE_ID    = process.env.ZAPI_INSTANCE_ID || '';
const INSTANCE_TOKEN = process.env.ZAPI_INSTANCE_TOKEN || '';
const CLIENT_TOKEN   = process.env.ZAPI_CLIENT_TOKEN || '';
const SEND_DELAY_MS  = parseInt(process.env.SEND_DELAY_MS || '1200', 10);

function urlSendText() {
  return `${BASE_URL}/instances/${INSTANCE_ID}/token/${INSTANCE_TOKEN}/send-text`;
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Indica se as credenciais mínimas da Z-API estão configuradas.
 * Em ambiente de teste (sem credenciais), o cliente entra em modo "simulação".
 * @returns {boolean}
 */
function configurado() {
  return Boolean(INSTANCE_ID && INSTANCE_TOKEN);
}

/**
 * Envia uma mensagem de texto para um número via Z-API.
 *
 * @param {string} phone - Número no formato internacional sem '+', ex.: 5511999999999.
 * @param {string} message - Texto da mensagem.
 * @returns {Promise<object>} Resposta da Z-API (ou objeto simulado).
 */
async function enviarTexto(phone, message) {
  if (!configurado()) {
    // Modo simulação — útil para desenvolvimento/testes sem credenciais reais.
    logger.aviso(`[SIMULAÇÃO] Z-API não configurada. Mensagem que seria enviada para ${phone}: "${message.replace(/\n/g, ' / ')}"`);
    return { simulado: true, phone, message };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (CLIENT_TOKEN) headers['Client-Token'] = CLIENT_TOKEN;

  try {
    const resp = await fetch(urlSendText(), {
      method : 'POST',
      headers,
      body   : JSON.stringify({ phone, message }),
    });

    const corpo = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      logger.erro(`Z-API respondeu ${resp.status} ao enviar para ${phone}: ${JSON.stringify(corpo)}`);
      throw new Error(`Z-API HTTP ${resp.status}`);
    }

    logger.info(`Mensagem enviada para ${phone} via Z-API (messageId: ${corpo.messageId || corpo.id || 'N/A'}).`);
    return corpo;
  } catch (e) {
    logger.erro(`Falha ao enviar mensagem via Z-API para ${phone}: ${e.message}`);
    throw e;
  }
}

/**
 * Envia uma sequência de mensagens com um pequeno atraso entre elas,
 * simulando um ritmo de conversa natural.
 *
 * @param {string} phone
 * @param {string[]} mensagens
 */
async function enviarSequencia(phone, mensagens) {
  for (let i = 0; i < mensagens.length; i += 1) {
    await enviarTexto(phone, mensagens[i]);
    if (i < mensagens.length - 1) await dormir(SEND_DELAY_MS);
  }
}

module.exports = { enviarTexto, enviarSequencia, configurado };
