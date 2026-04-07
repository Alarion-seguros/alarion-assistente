# Guia de Implementação Backend: Lembretes de Boletos Vencendo

Este guia descreve como implementar a função backend e a procedure tRPC `trpc.lembretes.criarLembretesBoletosVencendo` no sistema principal da Alarion Seguros. A automação existente neste repositório depende desta procedure para funcionar corretamente.

## Requisitos de Implementação

A procedure tRPC deve cumprir os seguintes requisitos:

1. **Buscar boletos a vencer:** Localizar todos os boletos não pagos com vencimento exato em 7 dias a partir da data atual.
2. **Prevenir duplicatas:** Para cada boleto encontrado, verificar se já existe um lembrete correspondente no sistema.
3. **Criar lembretes:** Se não existir, criar um novo lembrete com o título "Boleto [número] vence em 7 dias", incluindo informações do cliente e o valor do boleto.
4. **Retornar estatísticas:** Devolver um objeto com o total de boletos verificados, lembretes criados e duplicatas ignoradas.

## Exemplo de Implementação (TypeScript + Prisma + tRPC)

Abaixo encontra-se um exemplo de como esta lógica pode ser implementada no backend, assumindo a utilização do ORM Prisma e tRPC v10.

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../prisma';

export const lembretesRouter = router({
  /**
   * Procedure: trpc.lembretes.criarLembretesBoletosVencendo
   * 
   * 1. Busca todos os boletos não pagos que vencem exatamente em 7 dias
   * 2. Para cada boleto encontrado, verifica se já existe um lembrete criado
   * 3. Se não existir, cria um novo lembrete com título "Boleto [número] vence em 7 dias"
   * 4. O lembrete inclui informações do cliente, valor e data de vencimento
   * 5. Retorna estatísticas de quantos lembretes foram criados
   */
  criarLembretesBoletosVencendo: protectedProcedure
    .mutation(async ({ ctx }) => {
      // 1. Calcular a data de vencimento alvo (daqui a 7 dias)
      const dataAtual = new Date();
      const dataAlvo = new Date(dataAtual);
      dataAlvo.setDate(dataAtual.getDate() + 7);
      
      // Normalizar para o início e fim do dia alvo para garantir a pesquisa correta
      const inicioDiaAlvo = new Date(dataAlvo.setHours(0, 0, 0, 0));
      const fimDiaAlvo = new Date(dataAlvo.setHours(23, 59, 59, 999));

      // 2. Buscar boletos não pagos que vencem na data alvo
      const boletosAVencer = await prisma.boleto.findMany({
        where: {
          status: 'PENDENTE',
          dataVencimento: {
            gte: inicioDiaAlvo,
            lte: fimDiaAlvo,
          },
        },
        include: {
          cliente: true,
        },
      });

      let criados = 0;
      let jaExistiam = 0;

      // 3. Iterar sobre os boletos encontrados
      for (const boleto of boletosAVencer) {
        // Verificar se já existe um lembrete para este boleto específico
        const lembreteExistente = await prisma.lembrete.findFirst({
          where: {
            boletoId: boleto.id,
            tipo: 'VENCIMENTO_7_DIAS',
          },
        });

        if (lembreteExistente) {
          jaExistiam++;
          continue;
        }

        // 4. Criar o novo lembrete
        await prisma.lembrete.create({
          data: {
            titulo: `Boleto ${boleto.numero} vence em 7 dias`,
            descricao: `O boleto no valor de R$ ${boleto.valor.toFixed(2)} do cliente ${boleto.cliente.nome} vence no dia ${boleto.dataVencimento.toLocaleDateString('pt-BR')}.`,
            clienteId: boleto.clienteId,
            boletoId: boleto.id,
            tipo: 'VENCIMENTO_7_DIAS',
            dataLembrete: dataAtual,
            status: 'PENDENTE',
          },
        });

        criados++;
      }

      // 5. Retornar estatísticas de execução
      return {
        totalVerificado: boletosAVencer.length,
        lembreteCriados: criados,
        jaExistiam: jaExistiam,
      };
    }),
});
```

## Considerações Futuras: Notificações Mensais Recorrentes

Conforme identificado nos requisitos de sistemas de faturação [1], é recomendada a implementação de **notificações mensais recorrentes** no dia e mês do vencimento registado do boleto.

Isto pode ser alcançado criando uma procedure semelhante (`trpc.lembretes.criarNotificacoesMensais`) e adicionando um novo agendamento no `scheduler.js` da automação.

## Referências
[1] Base de Conhecimento Manus. "Recurring Monthly Billing Notification Requirement".
