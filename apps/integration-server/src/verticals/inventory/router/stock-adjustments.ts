import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { StockAdjustment } from '../schema/stock-adjustment'

const RESOURCE = 'stock-adjustments'

export function createStockAdjustmentsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/stock-adjustments', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listStockAdjustments) {
        return reply.status(501).send({ error: 'listStockAdjustments not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<StockAdjustment>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listStockAdjustments!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/stock-adjustments/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getStockAdjustment) {
        return reply.status(501).send({ error: 'getStockAdjustment not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<StockAdjustment>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getStockAdjustment!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
