import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { PurchaseOrder } from '../schema/purchase-order'

const RESOURCE = 'purchase-orders'

export function createPurchaseOrdersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/purchase-orders', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPurchaseOrders) {
        return reply.status(501).send({ error: 'listPurchaseOrders not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<PurchaseOrder>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listPurchaseOrders!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/purchase-orders/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPurchaseOrder) {
        return reply.status(501).send({ error: 'getPurchaseOrder not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<PurchaseOrder>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getPurchaseOrder!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
