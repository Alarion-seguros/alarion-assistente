/**
 * Servidor de Webhook — Bot de Qualificação Alarion Seguros
 *
 * Expõe um endpoint HTTP que recebe as mensagens recebidas (on-message-received)
 * enviadas pela Z-API, processa-as no motor de conversa e responde ao contacto
 * via Z-API.
 *
 * Rotas:
 *   GET  /            — Health check.
 *   GET  /health      — Health check detalhado.
 *   POST /webhook     — Recebe os eventos de mensagem da Z-API.
 *
 * Variáveis de ambiente:
 *   PORT              — Porta do servidor HTTP (padrão: 3100)
 *   WEBHOOK_PATH      — Caminho do webhook (padrão: /webhook)
 *   WEBHOOK_TOKEN     — (Opcional) token exigido na query (?token=) para segurança
 *   + variáveis da Z-API (ver zapiClient.js)
 */

'use strict';

const express = require('express');

const { processarMensagem } = require('./conversa');
const zapi                  = require('./zapiClient');
const logger                = require('./logger');

const PORT         = parseInt(process.env.PORT || '3100', 10);
const WEBHOOK_PATH = process.env.WEBHOOK_PATH || '/webhook';
const WEBHOOK_TOKEN = process.env.WEBHOOK_TOKEN || '';

const app = express();
app.use(express.json({ limit: '1mb' }));

// ─── Health checks ────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.status(200).json({ status: 'ok', servico: 'bot-qualificacao-alarion' });
});

app.get('/health', (_req, res) => {
  res.status(200).json({
    status      : 'ok',
    servico     : 'bot-qualificacao-alarion',
    zapi        : zapi.configurado() ? 'configurada' : 'modo-simulacao',
    webhookPath : WEBHOOK_PATH,
    hora        : new Date().toISOString(),
  });
});

// ─── Extração robusta do payload Z-API ─────────────────────────────────────────

/**
 * Extrai (telefone, texto) de um payload da Z-API.
 * O webhook "on-message-received" da Z-API entrega o telefone em `phone` e o
 * texto em `text.message`. Esta função tolera variações de formato.
 *
 * @param {object} body
 * @returns {{telefone:string|null, texto:string|null, deMim:boolean}}
 */
function extrairMensagem(body) {
  if (!body || typeof body !== 'object') return { telefone: null, texto: null, deMim: false };

  // Ignora mensagens enviadas pela própria instância (eco).
  const deMim = Boolean(body.fromMe);

  const telefone = body.phone || body.from || (body.sender && body.sender.id) || null;

  let texto = null;
  if (body.text && typeof body.text === 'object' && body.text.message != null) {
    texto = body.text.message;
  } else if (typeof body.text === 'string') {
    texto = body.text;
  } else if (body.message && typeof body.message === 'string') {
    texto = body.message;
  } else if (body.body && typeof body.body === 'string') {
    texto = body.body;
  } else if (body.buttonsResponseMessage && body.buttonsResponseMessage.message) {
    texto = body.buttonsResponseMessage.message;
  } else if (body.listResponseMessage && body.listResponseMessage.message) {
    texto = body.listResponseMessage.message;
  }

  return { telefone, texto, deMim };
}

// ─── Webhook principal ──────────────────────────────────────────────────────────

app.post(WEBHOOK_PATH, async (req, res) => {
  // Validação opcional por token na query string.
  if (WEBHOOK_TOKEN && req.query.token !== WEBHOOK_TOKEN) {
    logger.aviso('Webhook recebido com token inválido. Pedido rejeitado.');
    return res.status(401).json({ erro: 'token inválido' });
  }

  // Responde imediatamente para a Z-API não reenviar (idempotência/ack rápido).
  res.status(200).json({ recebido: true });

  try {
    const { telefone, texto, deMim } = extrairMensagem(req.body);

    if (deMim) return;                       // ignora eco da própria instância
    if (!telefone || texto == null) {
      logger.aviso(`Payload sem telefone/texto reconhecível: ${JSON.stringify(req.body).slice(0, 400)}`);
      return;
    }

    logger.info(`Mensagem recebida de ${telefone}: "${String(texto).slice(0, 200)}"`);

    const resultado = await processarMensagem(telefone, String(texto));
    if (resultado.respostas && resultado.respostas.length) {
      await zapi.enviarSequencia(telefone, resultado.respostas);
    }
  } catch (e) {
    logger.erro(`Erro ao processar webhook: ${e.stack || e.message}`);
  }
});

// ─── Inicialização ──────────────────────────────────────────────────────────────

function iniciar() {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info('='.repeat(60));
    logger.info('Bot de Qualificação — Alarion Seguros (WhatsApp / Z-API)');
    logger.info('='.repeat(60));
    logger.info(`Servidor a escutar na porta : ${PORT}`);
    logger.info(`Endpoint do webhook         : POST ${WEBHOOK_PATH}`);
    logger.info(`Integração Z-API            : ${zapi.configurado() ? 'configurada' : 'MODO SIMULAÇÃO (sem credenciais)'}`);
    logger.info(`Proteção por token          : ${WEBHOOK_TOKEN ? 'ativa' : 'desativada'}`);
    logger.info('='.repeat(60));
    logger.info('Aguardando mensagens recebidas...');
  });
}

if (require.main === module) {
  iniciar();
}

module.exports = { app, iniciar, extrairMensagem };
