import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Discount } from '../schema/discount'

const RESOURCE = 'discounts'

export function createDiscountsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/discounts', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listDiscounts) {
        return reply.status(501).send({ error: 'listDiscounts not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Discount>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listDiscounts!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/discounts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getDiscount) {
        return reply.status(501).send({ error: 'getDiscount not implemented by this adapter' })
      }
      const data = await cachedGet<Discount>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getDiscount!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/discounts', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createDiscount) {
        return reply.status(501).send({ error: 'createDiscount not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createDiscount(credentials, parsed.data as Partial<Discount>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/discounts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateDiscount) {
        return reply.status(501).send({ error: 'updateDiscount not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateDiscount(
        credentials,
        request.params.id,
        parsed.data as Partial<Discount>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/discounts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteDiscount) {
        return reply.status(501).send({ error: 'deleteDiscount not implemented by this adapter' })
      }
      await adapter.deleteDiscount(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
