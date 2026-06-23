/**
 * Teste de Simulação — Bot de Qualificação Alarion Seguros
 *
 * Simula conversas completas (sem Z-API) para validar o fluxo de perguntas,
 * a classificação do lead e a gravação no ficheiro Excel.
 *
 * Uso: node test/simular.js
 */

'use strict';

const { processarMensagem } = require('../src/conversa');
const { EXCEL_PATH }        = require('../src/excel');

function divisor(t) {
  console.log('\n' + '═'.repeat(64));
  console.log(`  ${t}`);
  console.log('═'.repeat(64));
}

/**
 * Executa uma conversa simulada enviando uma sequência de mensagens do utilizador.
 * @param {string} telefone
 * @param {string[]} mensagensUtilizador
 */
async function simularConversa(telefone, mensagensUtilizador) {
  divisor(`Conversa simulada — ${telefone}`);

  // Mensagem inicial (qualquer texto inicia a conversa).
  let entrada = 'Olá';
  let i = 0;

  while (true) {
    console.log(`\n👤 Utilizador: ${entrada}`);
    const r = await processarMensagem(telefone, entrada);
    r.respostas.forEach((m) => console.log(`🤖 Bot: ${m.replace(/\n/g, '\n        ')}`));

    if (r.finalizado) {
      if (r.lead) {
        console.log('\n📊 LEAD CLASSIFICADO:');
        console.log(JSON.stringify(r.lead, null, 2));
      }
      break;
    }

    if (i >= mensagensUtilizador.length) break;
    entrada = mensagensUtilizador[i];
    i += 1;
  }
}

(async () => {
  // Lead 1: CNPJ, possui plano, 12 pessoas → deve ser QUENTE.
  await simularConversa('5511988887777', [
    'João da Silva',   // nome
    '1',               // tipo de plano: CNPJ
    '1',               // possui plano: Sim
    '12',              // 12 pessoas
    'Pinheiros, São Paulo', // bairro
  ]);

  // Lead 2: Individual, não possui plano, 1 pessoa → deve ser FRIO.
  await simularConversa('5521977776666', [
    'Maria Souza',     // nome
    '2',               // tipo de plano: Individual
    '2',               // possui plano: Não
    '1',               // 1 pessoa
    'Copacabana, Rio de Janeiro',
  ]);

  // Lead 3: Familiar, possui plano, 3 pessoas → deve ser MORNO.
  await simularConversa('5531966665555', [
    'Carlos Pereira',  // nome
    '3',               // tipo de plano: Familiar
    '1',               // possui plano: Sim
    '3',               // 3 pessoas
    'Savassi, Belo Horizonte',
  ]);

  // Teste de resposta inválida + reinício.
  divisor('Teste — resposta inválida e comando "reiniciar"');
  let r;
  r = await processarMensagem('5599911112222', 'oi');
  r.respostas.forEach((m) => console.log(`🤖 Bot: ${m}`));
  r = await processarMensagem('5599911112222', 'Ana Lima'); // nome
  r.respostas.forEach((m) => console.log(`🤖 Bot: ${m}`));
  r = await processarMensagem('5599911112222', 'opção errada'); // inválida no passo de opções
  console.log('👤 Utilizador: opção errada');
  r.respostas.forEach((m) => console.log(`🤖 Bot: ${m}`));
  r = await processarMensagem('5599911112222', 'reiniciar');
  console.log('👤 Utilizador: reiniciar');
  r.respostas.forEach((m) => console.log(`🤖 Bot: ${m}`));

  divisor('Conclusão');
  console.log(`Ficheiro Excel gerado em: ${EXCEL_PATH}`);
})();
