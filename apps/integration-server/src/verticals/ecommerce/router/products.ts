import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Product } from '../schema/product'

const RESOURCE = 'products'

export function createProductsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/products', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listProducts) {
        return reply.status(501).send({ error: 'listProducts not implemented by this adapter' })
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
        return reply.status(501).send({ error: 'getProduct not implemented by this adapter' })
      }
      const data = await cachedGet<Product>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getProduct!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/products', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createProduct) {
        return reply.status(501).send({ error: 'createProduct not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createProduct(credentials, parsed.data as Partial<Product>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateProduct) {
        return reply.status(501).send({ error: 'updateProduct not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateProduct(
        credentials,
        request.params.id,
        parsed.data as Partial<Product>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/products/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteProduct) {
        return reply.status(501).send({ error: 'deleteProduct not implemented by this adapter' })
      }
      await adapter.deleteProduct(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
