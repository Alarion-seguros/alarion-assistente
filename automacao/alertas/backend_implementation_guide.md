# Guia de Implementação Backend: Notificação de Aniversariantes

Este guia descreve como implementar a função backend e a procedure tRPC `trpc.alertas.notificarAniversariantes` no sistema principal da Alarion Seguros. A automação existente neste módulo depende desta procedure para funcionar corretamente.

## Requisitos de Implementação

A procedure tRPC deve cumprir os seguintes requisitos:

1. **Buscar aniversariantes do dia:** Localizar todos os beneficiários cujo dia e mês de aniversário coincidem com a data atual.
2. **Formatar mensagem:** Compor uma lista formatada com nome completo e idade de cada aniversariante (ex: `• João Silva (25 anos)`).
3. **Enviar notificação ao owner:** Chamar `notifyOwner()` com título e conteúdo formatado.
4. **Retornar resultado:** Devolver um objeto com `sucesso`, `total` de aniversariantes e a `mensagem` enviada.
5. **Caso sem aniversariantes:** Retornar a mensagem `"Nenhum aniversariante hoje"` sem enviar notificação.

## Exemplo de Implementação (TypeScript + Prisma + tRPC)

Abaixo encontra-se um exemplo de como esta lógica pode ser implementada no backend, assumindo a utilização do ORM Prisma e tRPC v10.

```typescript
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../prisma';
import { notifyOwner } from '../notifications';

export const alertasRouter = router({
  /**
   * Procedure: trpc.alertas.notificarAniversariantes
   *
   * 1. Busca beneficiários fazendo aniversário no dia atual
   * 2. Compara dia e mês da data de aniversário com a data atual
   * 3. Formata mensagem com lista de nomes e idades (ex: "• João Silva (25 anos)")
   * 4. Envia notificação ao owner usando notifyOwner() com título e conteúdo formatado
   * 5. Retorna sucesso e quantidade de aniversariantes encontrados
   * 6. Se não houver aniversariantes, retorna mensagem "Nenhum aniversariante hoje"
   */
  notificarAniversariantes: protectedProcedure
    .mutation(async ({ ctx }) => {
      const hoje = new Date();
      const diaHoje = hoje.getDate();
      const mesHoje = hoje.getMonth() + 1; // getMonth() retorna 0-11

      // 1. Buscar todos os beneficiários com aniversário hoje (mesmo dia e mês)
      const beneficiarios = await prisma.beneficiario.findMany({
        where: {
          ativo: true,
        },
        select: {
          id: true,
          nome: true,
          dataNascimento: true,
        },
      });

      // 2. Filtrar por dia e mês de aniversário
      const aniversariantes = beneficiarios.filter((b) => {
        if (!b.dataNascimento) return false;
        const nascimento = new Date(b.dataNascimento);
        return (
          nascimento.getDate() === diaHoje &&
          nascimento.getMonth() + 1 === mesHoje
        );
      });

      // 3. Caso sem aniversariantes
      if (aniversariantes.length === 0) {
        return {
          sucesso: true,
          total: 0,
          mensagem: 'Nenhum aniversariante hoje',
        };
      }

      // 4. Calcular idades e formatar lista
      const anoAtual = hoje.getFullYear();
      const linhas = aniversariantes.map((b) => {
        const anoNascimento = new Date(b.dataNascimento!).getFullYear();
        const idade = anoAtual - anoNascimento;
        return `• ${b.nome} (${idade} anos)`;
      });

      const dataFormatada = hoje.toLocaleDateString('pt-BR');
      const titulo = `🎂 Aniversariantes do dia ${dataFormatada}`;
      const conteudo = linhas.join('\n');

      // 5. Enviar notificação ao owner
      await notifyOwner({
        titulo,
        conteudo,
      });

      return {
        sucesso: true,
        total: aniversariantes.length,
        mensagem: conteudo,
      };
    }),
});
```

## Integração no Router Principal

Registar o `alertasRouter` no router principal da aplicação:

```typescript
// server/routers/_app.ts
import { router } from '../trpc';
import { alertasRouter } from './alertas';
import { lembretesRouter } from './lembretes';

export const appRouter = router({
  alertas: alertasRouter,
  lembretes: lembretesRouter,
  // ... outros routers
});
```

## Função notifyOwner

A função `notifyOwner` deve estar implementada no módulo de notificações do backend. Exemplo de assinatura esperada:

```typescript
// server/notifications.ts
export async function notifyOwner(params: {
  titulo: string;
  conteudo: string;
}): Promise<void> {
  // Implementação: e-mail, push notification, webhook, etc.
}
```

## Referências

[1] Documentação tRPC. "tRPC over HTTP". Disponível em: https://trpc.io/docs/rpc
[2] Documentação Prisma. "Filtering and Sorting". Disponível em: https://www.prisma.io/docs/orm/prisma-client/queries/filtering-and-sorting
