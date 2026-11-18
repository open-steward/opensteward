import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { BalanceTransaction } from '../schema/balance-transaction'

const RESOURCE = 'balance_transactions'

export function createBalanceTransactionsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/balance_transactions', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listBalanceTransactions) {
        return reply.status(501).send({ error: 'listBalanceTransactions not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<BalanceTransaction>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listBalanceTransactions!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/balance_transactions/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getBalanceTransaction) {
        return reply.status(501).send({ error: 'getBalanceTransaction not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<BalanceTransaction>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getBalanceTransaction!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
