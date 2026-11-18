import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { StockLevel } from '../schema/stock-level'

const RESOURCE = 'stock-levels'

export function createStockLevelsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/stock-levels', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listStockLevels) {
        return reply.status(501).send({ error: 'listStockLevels not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<StockLevel>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listStockLevels!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/stock-levels/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getStockLevel) {
        return reply.status(501).send({ error: 'getStockLevel not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<StockLevel>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getStockLevel!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
