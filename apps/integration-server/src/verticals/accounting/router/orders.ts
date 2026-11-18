import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, assertSearchSupported } from '@opensteward/shared'
import { singleResponse } from '../schema/shared'
import { parseListQuery, listPage, collectionIsComplete } from './helpers'
import { OrderSchema } from '../schema/order'

const RESOURCE = 'orders'

export function createOrdersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listOrders) return reply.status(501).send({ error: 'Not implemented' })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const items = await cachedList(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listOrders!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return listPage(items, params, adapter.platform, request.log)
    })

    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getOrder) return reply.status(501).send({ error: 'Not implemented' })
      const item = await cachedGet(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getOrder!(credentials, request.params.id),
      })
      return singleResponse(item, adapter.platform)
    })

    fastify.post('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createOrder) return reply.status(501).send({ error: 'Not implemented' })
      const parsed = OrderSchema.partial().safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_error', issues: parsed.error.issues })
      }
      const item = await adapter.createOrder(credentials, parsed.data)
      if (item?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(item.id), data: item })
      return reply.status(201).send(singleResponse(item, adapter.platform))
    })
  }
}
