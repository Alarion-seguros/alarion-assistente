/**
 * Módulo de Persistência em Excel — Bot de Qualificação Alarion Seguros
 *
 * Grava cada lead qualificado como uma nova linha num ficheiro .xlsx.
 * Cria o ficheiro e o cabeçalho automaticamente na primeira gravação.
 * As escritas são serializadas (fila) para evitar corrupção quando vários
 * leads finalizam em simultâneo.
 */

'use strict';

const ExcelJS = require('exceljs');
const path    = require('path');
const fs      = require('fs');
const logger  = require('./logger');

const DATA_DIR    = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const EXCEL_PATH  = process.env.EXCEL_PATH || path.join(DATA_DIR, 'leads_qualificados.xlsx');
const SHEET_NAME  = 'Leads';

// Definição das colunas — a ordem aqui define a ordem no Excel.
const COLUNAS = [
  { header: 'Data/Hora',            key: 'data_hora',          width: 20 },
  { header: 'Telefone',             key: 'telefone',           width: 18 },
  { header: 'Nome',                 key: 'nome',               width: 28 },
  { header: 'Tipo de Plano',        key: 'tipo_plano',         width: 22 },
  { header: 'Possui Plano Atual',   key: 'possui_plano',       width: 18 },
  { header: 'Qtd. Pessoas',         key: 'quantidade_pessoas', width: 14 },
  { header: 'Bairro',               key: 'bairro',             width: 28 },
  { header: 'Pontuação',            key: 'pontuacao',          width: 12 },
  { header: 'Classificação',        key: 'classificacao',      width: 16 },
  { header: 'Prioridade',           key: 'prioridade',         width: 12 },
];

// Fila de escrita para serializar acessos concorrentes ao ficheiro.
let filaEscrita = Promise.resolve();

function garantirDiretorio() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Aplica estilo de cor de fundo à célula de classificação.
 * @param {ExcelJS.Cell} celula
 * @param {string} classificacao
 */
function estilizarClassificacao(celula, classificacao) {
  const cores = {
    Quente: 'FFFFCDD2', // vermelho claro
    Morno : 'FFFFF9C4', // amarelo claro
    Frio  : 'FFBBDEFB', // azul claro
  };
  const cor = cores[classificacao];
  if (cor) {
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } };
  }
}

/**
 * Grava um lead no ficheiro Excel (operação serializada).
 *
 * @param {object} lead - Objeto com os campos a gravar. Deve conter pelo menos
 *   telefone, nome, tipo_plano, possui_plano, quantidade_pessoas, bairro,
 *   pontuacao, classificacao, prioridade.
 * @returns {Promise<string>} Caminho do ficheiro Excel atualizado.
 */
function gravarLead(lead) {
  filaEscrita = filaEscrita.then(() => _gravarLeadInterno(lead)).catch((e) => {
    logger.erro(`Falha ao gravar lead em Excel: ${e.message}`);
    throw e;
  });
  return filaEscrita;
}

async function _gravarLeadInterno(lead) {
  garantirDiretorio();

  const workbook = new ExcelJS.Workbook();
  let sheet;

  if (fs.existsSync(EXCEL_PATH)) {
    await workbook.xlsx.readFile(EXCEL_PATH);
    sheet = workbook.getWorksheet(SHEET_NAME) || workbook.addWorksheet(SHEET_NAME);
  } else {
    sheet = workbook.addWorksheet(SHEET_NAME);
  }

  // Garante cabeçalho/colunas.
  if (sheet.rowCount === 0 || !sheet.columns || !sheet.columns.length || !sheet.getRow(1).getCell(1).value) {
    sheet.columns = COLUNAS;
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
    header.alignment = { vertical: 'middle', horizontal: 'center' };
    header.height = 22;
  } else {
    // Reassegura mapeamento de chaves caso o ficheiro tenha sido aberto sem definição de colunas.
    sheet.columns = COLUNAS;
  }

  const novaLinha = sheet.addRow({
    data_hora         : lead.data_hora,
    telefone          : lead.telefone,
    nome              : lead.nome,
    tipo_plano        : lead.tipo_plano,
    possui_plano      : lead.possui_plano,
    quantidade_pessoas: lead.quantidade_pessoas,
    bairro            : lead.bairro,
    pontuacao         : lead.pontuacao,
    classificacao     : lead.classificacao,
    prioridade        : lead.prioridade,
  });

  estilizarClassificacao(novaLinha.getCell('classificacao'), lead.classificacao);
  novaLinha.commit && novaLinha.commit();

  await workbook.xlsx.writeFile(EXCEL_PATH);
  logger.info(`Lead gravado em Excel (${path.basename(EXCEL_PATH)}): ${lead.nome} — ${lead.classificacao} (${lead.pontuacao} pts).`);
  return EXCEL_PATH;
}

module.exports = { gravarLead, EXCEL_PATH };
