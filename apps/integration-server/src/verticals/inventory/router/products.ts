import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Product } from '../schema/product'

const RESOURCE = 'products'

export function createProductsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/products', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listProducts) {
        return reply.status(501).send({ error: 'listProducts not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Product>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listProducts!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getProduct) {
        return reply.status(501).send({ error: 'getProduct not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Product>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getProduct!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
