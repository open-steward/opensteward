import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'orders'

export function createOrdersRouter() {
  return async function ordersRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/orders', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listOrders) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listOrders!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getOrder) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getOrder!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/orders', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createOrder) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createOrder(credentials, parsed.data as Record<string, unknown>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateOrder) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateOrder(credentials, request.params.id, parsed.data as Record<string, unknown>)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.cancelOrder) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      await adapter.cancelOrder(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
