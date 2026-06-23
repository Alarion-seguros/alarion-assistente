/**
 * Módulo de Classificação (Lead Scoring) — Bot de Qualificação Alarion Seguros
 *
 * Calcula a pontuação de um lead com base nas respostas recolhidas e nas regras
 * definidas em `config/classificacao.json`, classificando-o em Quente, Morno ou Frio.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'classificacao.json');

/**
 * Carrega as regras de classificação do ficheiro JSON.
 * É lido a cada chamada para refletir edições sem reiniciar o serviço.
 * @returns {object}
 */
function carregarRegras() {
  const bruto = fs.readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(bruto);
}

/**
 * Procura os pontos de uma quantidade numérica dentro de uma lista de faixas.
 * @param {Array<{min:number,max:number,pontos:number}>} faixas
 * @param {number} valor
 * @returns {number}
 */
function pontosPorFaixa(faixas, valor) {
  if (!Array.isArray(faixas)) return 0;
  const faixa = faixas.find((f) => valor >= f.min && valor <= f.max);
  return faixa ? faixa.pontos : 0;
}

/**
 * Calcula a pontuação total e a classificação de um lead.
 *
 * @param {object} respostas - Objeto com os campos recolhidos
 *   (tipo_plano, possui_plano, quantidade_pessoas, bairro, ...).
 * @returns {{pontuacao:number, classificacao:string, prioridade:string, emoji:string, detalhe:object}}
 */
function classificar(respostas) {
  const regras = carregarRegras();
  const p = regras.pontuacao || {};
  const detalhe = {};
  let total = 0;

  // tipo_plano
  if (p.tipo_plano && respostas.tipo_plano != null) {
    const pts = p.tipo_plano[respostas.tipo_plano] || 0;
    detalhe.tipo_plano = pts;
    total += pts;
  }

  // possui_plano
  if (p.possui_plano && respostas.possui_plano != null) {
    const pts = p.possui_plano[respostas.possui_plano] || 0;
    detalhe.possui_plano = pts;
    total += pts;
  }

  // quantidade_pessoas (faixas)
  if (p.quantidade_pessoas && respostas.quantidade_pessoas != null) {
    const qtd = parseInt(respostas.quantidade_pessoas, 10) || 0;
    const pts = pontosPorFaixa(p.quantidade_pessoas, qtd);
    detalhe.quantidade_pessoas = pts;
    total += pts;
  }

  // Determina a faixa de classificação
  const faixas = regras.faixas || [];
  const faixa = faixas.find((f) => total >= f.min && total <= f.max) || {
    classificacao: 'Frio',
    prioridade: 'Baixa',
    emoji: '❄️',
  };

  return {
    pontuacao    : total,
    classificacao: faixa.classificacao,
    prioridade   : faixa.prioridade,
    emoji        : faixa.emoji || '',
    detalhe,
  };
}

module.exports = { classificar, carregarRegras };
