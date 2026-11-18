import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Order } from '../schema/order'

const RESOURCE = 'orders'

export function createOrdersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/orders', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listOrders) {
        return reply.status(501).send({ error: 'listOrders not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Order>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listOrders!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getOrder) {
        return reply.status(501).send({ error: 'getOrder not implemented by this adapter' })
      }
      const data = await cachedGet<Order>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getOrder!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/orders', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createOrder) {
        return reply.status(501).send({ error: 'createOrder not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createOrder(credentials, parsed.data as Partial<Order>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/orders/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateOrder) {
        return reply.status(501).send({ error: 'updateOrder not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateOrder(
        credentials,
        request.params.id,
        parsed.data as Partial<Order>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
      '/orders/:id/cancel',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.cancelOrder) {
          return reply.status(501).send({ error: 'cancelOrder not implemented by this adapter' })
        }
        const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body' })
        }
        const data = await adapter.cancelOrder(credentials, request.params.id, parsed.data as { reason?: string })
        writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )
  }
}
