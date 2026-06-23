/**
 * Motor de Conversa — Bot de Qualificação Alarion Seguros
 *
 * Implementa a máquina de estados que conduz a qualificação do lead.
 * É agnóstico ao canal: recebe (telefone, texto) e devolve as mensagens de
 * resposta a enviar. O estado de cada conversa é mantido por número de telefone.
 *
 * O fluxo (perguntas, opções, textos) é lido de `config/fluxo.json`, permitindo
 * edição fácil sem alterar este código.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const { classificar } = require('./classificador');
const { gravarLead }  = require('./excel');
const logger          = require('./logger');

const FLUXO_PATH = path.join(__dirname, '..', 'config', 'fluxo.json');

// ─── Estado em memória das conversas ──────────────────────────────────────────
// Mapa: telefone -> { indiceEtapa, respostas, finalizado }
const sessoes = new Map();

// Tempo (ms) após o qual uma sessão inativa é descartada (reinicia do início).
const SESSAO_TTL_MS = parseInt(process.env.SESSAO_TTL_MS || `${1000 * 60 * 60 * 6}`, 10); // 6h

// ─── Carregamento do fluxo ────────────────────────────────────────────────────

function carregarFluxo() {
  const bruto = fs.readFileSync(FLUXO_PATH, 'utf8');
  return JSON.parse(bruto);
}

// ─── Utilitários de sessão ──────────────────────────────────────────────────

function obterSessao(telefone) {
  const s = sessoes.get(telefone);
  if (s && Date.now() - s.atualizadoEm > SESSAO_TTL_MS) {
    sessoes.delete(telefone);
    return undefined;
  }
  return s;
}

function novaSessao() {
  return { indiceEtapa: 0, respostas: {}, finalizado: false, atualizadoEm: Date.now() };
}

function salvarSessao(telefone, sessao) {
  sessao.atualizadoEm = Date.now();
  sessoes.set(telefone, sessao);
}

// ─── Renderização de mensagens ────────────────────────────────────────────────

/**
 * Monta o texto de uma pergunta, incluindo as opções numeradas quando aplicável.
 * @param {object} etapa
 * @returns {string}
 */
function renderizarPergunta(etapa) {
  let texto = etapa.pergunta;
  if (etapa.tipo === 'opcoes' && Array.isArray(etapa.opcoes)) {
    const linhas = etapa.opcoes.map((op, i) => `${i + 1}. ${op.rotulo}`);
    texto += '\n\n' + linhas.join('\n');
  }
  return texto;
}

function interpolar(texto, dados) {
  return texto.replace(/\{(\w+)\}/g, (_, chave) => (dados[chave] != null ? dados[chave] : ''));
}

// ─── Validação / interpretação de respostas ────────────────────────────────────

/**
 * Interpreta a resposta do utilizador para a etapa atual.
 * @returns {{ok:boolean, valor?:any, erro?:string}}
 */
function interpretarResposta(etapa, textoBruto) {
  const texto = (textoBruto || '').trim();

  if (etapa.tipo === 'opcoes') {
    // Aceita o número da opção...
    const idx = parseInt(texto, 10);
    if (!Number.isNaN(idx) && idx >= 1 && idx <= etapa.opcoes.length) {
      return { ok: true, valor: etapa.opcoes[idx - 1].valor };
    }
    // ...ou o texto do rótulo/valor (case-insensitive).
    const alvo = texto.toLowerCase();
    const match = etapa.opcoes.find(
      (op) => op.valor.toLowerCase() === alvo || op.rotulo.toLowerCase() === alvo
    );
    if (match) return { ok: true, valor: match.valor };
    return { ok: false, erro: 'opcao_invalida' };
  }

  if (etapa.tipo === 'numero') {
    const n = parseInt(texto.replace(/\D/g, ''), 10);
    if (Number.isNaN(n)) return { ok: false, erro: 'opcao_invalida' };
    if (etapa.min != null && n < etapa.min) return { ok: false, erro: 'opcao_invalida' };
    if (etapa.max != null && n > etapa.max) return { ok: false, erro: 'opcao_invalida' };
    return { ok: true, valor: n };
  }

  // tipo === 'texto'
  if (etapa.obrigatorio && texto.length === 0) {
    return { ok: false, erro: 'opcao_invalida' };
  }
  return { ok: true, valor: texto };
}

// ─── Comandos globais ───────────────────────────────────────────────────────

function ehComandoReiniciar(fluxo, texto) {
  const lista = (fluxo.comandos_globais && fluxo.comandos_globais.reiniciar) || [];
  const t = (texto || '').trim().toLowerCase();
  return lista.map((x) => x.toLowerCase()).includes(t);
}

// ─── Processamento principal ───────────────────────────────────────────────────

/**
 * Processa uma mensagem recebida e devolve as respostas a enviar.
 *
 * @param {string} telefone - Identificador único do contacto (número WhatsApp).
 * @param {string} texto - Texto da mensagem recebida.
 * @returns {Promise<{respostas:string[], finalizado:boolean, lead?:object}>}
 */
async function processarMensagem(telefone, texto) {
  const fluxo = carregarFluxo();
  const etapas = fluxo.etapas || [];
  let sessao = obterSessao(telefone);

  // Comando global de reinício.
  if (ehComandoReiniciar(fluxo, texto)) {
    sessao = novaSessao();
    salvarSessao(telefone, sessao);
    const primeira = etapas[0];
    return {
      respostas: [fluxo.mensagens.reinicio, renderizarPergunta(primeira)],
      finalizado: false,
    };
  }

  // Início de uma nova conversa.
  if (!sessao) {
    sessao = novaSessao();
    salvarSessao(telefone, sessao);
    const primeira = etapas[0];
    return {
      respostas: [fluxo.mensagens.saudacao, renderizarPergunta(primeira)],
      finalizado: false,
    };
  }

  // Conversa já finalizada.
  if (sessao.finalizado) {
    return { respostas: [fluxo.mensagens.ja_finalizado], finalizado: true };
  }

  // Processa a etapa atual.
  const etapaAtual = etapas[sessao.indiceEtapa];
  const resultado = interpretarResposta(etapaAtual, texto);

  if (!resultado.ok) {
    const msgErro = fluxo.mensagens[resultado.erro] || fluxo.mensagens.opcao_invalida;
    return {
      respostas: [msgErro, renderizarPergunta(etapaAtual)],
      finalizado: false,
    };
  }

  // Guarda a resposta e avança.
  sessao.respostas[etapaAtual.campo] = resultado.valor;
  sessao.indiceEtapa += 1;
  salvarSessao(telefone, sessao);

  // Ainda há etapas pendentes.
  if (sessao.indiceEtapa < etapas.length) {
    const proxima = etapas[sessao.indiceEtapa];
    return { respostas: [renderizarPergunta(proxima)], finalizado: false };
  }

  // ─── Fim do fluxo: classifica e grava ──────────────────────────────────────
  sessao.finalizado = true;
  salvarSessao(telefone, sessao);

  const score = classificar(sessao.respostas);
  const lead = {
    data_hora         : new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    telefone,
    nome              : sessao.respostas.nome || '',
    tipo_plano        : sessao.respostas.tipo_plano || '',
    possui_plano      : sessao.respostas.possui_plano || '',
    quantidade_pessoas: sessao.respostas.quantidade_pessoas || '',
    bairro            : sessao.respostas.bairro || '',
    pontuacao         : score.pontuacao,
    classificacao     : score.classificacao,
    prioridade        : score.prioridade,
  };

  try {
    await gravarLead(lead);
  } catch (e) {
    logger.erro(`Não foi possível gravar o lead de ${telefone}: ${e.message}`);
  }

  const encerramento = interpolar(fluxo.mensagens.encerramento, { nome: lead.nome });
  logger.info(`Lead finalizado: ${lead.nome} (${telefone}) — ${score.emoji} ${score.classificacao} / ${score.pontuacao} pts.`);

  return { respostas: [encerramento], finalizado: true, lead };
}

module.exports = {
  processarMensagem,
  // Exportados para testes:
  _interno: { carregarFluxo, interpretarResposta, renderizarPergunta, sessoes },
};
