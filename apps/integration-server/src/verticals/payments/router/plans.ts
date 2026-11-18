import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Plan, Price, Product } from '../schema/plan'

export function createPlansRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/plans', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPlans) {
        return reply.status(501).send({ error: 'listPlans not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Plan>(request, {
        resourceType: 'plans',
        fetch: () => adapter.listPlans!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/plans/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPlan) {
        return reply.status(501).send({ error: 'getPlan not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Plan>(request, {
        resourceType: 'plans',
        resourceId: request.params.id,
        fetch: () => adapter.getPlan!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.get('/prices', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPrices) {
        return reply.status(501).send({ error: 'listPrices not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Price>(request, {
        resourceType: 'prices',
        fetch: () => adapter.listPrices!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/prices/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPrice) {
        return reply.status(501).send({ error: 'getPrice not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Price>(request, {
        resourceType: 'prices',
        resourceId: request.params.id,
        fetch: () => adapter.getPrice!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.get('/products', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listProducts) {
        return reply.status(501).send({ error: 'listProducts not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Product>(request, {
        resourceType: 'products',
        fetch: () => adapter.listProducts!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getProduct) {
        return reply.status(501).send({ error: 'getProduct not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Product>(request, {
        resourceType: 'products',
        resourceId: request.params.id,
        fetch: () => adapter.getProduct!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
