import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { ProductVariant } from '../schema/product'

const RESOURCE = 'variants'

export function createVariantsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/variants', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listVariants) {
        return reply.status(501).send({ error: 'listVariants not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<ProductVariant>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listVariants!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/variants/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getVariant) {
        return reply.status(501).send({ error: 'getVariant not implemented by this adapter' })
      }
      const data = await cachedGet<ProductVariant>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getVariant!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/variants', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createVariant) {
        return reply.status(501).send({ error: 'createVariant not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createVariant(credentials, parsed.data as Partial<ProductVariant>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/variants/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateVariant) {
        return reply.status(501).send({ error: 'updateVariant not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateVariant(
        credentials,
        request.params.id,
        parsed.data as Partial<ProductVariant>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/variants/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteVariant) {
        return reply.status(501).send({ error: 'deleteVariant not implemented by this adapter' })
      }
      await adapter.deleteVariant(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
