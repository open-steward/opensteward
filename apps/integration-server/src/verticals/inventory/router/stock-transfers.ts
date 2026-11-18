import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { StockTransfer } from '../schema/stock-transfer'

const RESOURCE = 'stock-transfers'

export function createStockTransfersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/stock-transfers', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listStockTransfers) {
        return reply.status(501).send({ error: 'listStockTransfers not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<StockTransfer>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listStockTransfers!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/stock-transfers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getStockTransfer) {
        return reply.status(501).send({ error: 'getStockTransfer not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<StockTransfer>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getStockTransfer!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
