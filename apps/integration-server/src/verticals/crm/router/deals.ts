import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Deal } from '../schema/deal'

const RESOURCE = 'deals'

export function createDealsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/deals', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listDeals) {
        return reply.status(501).send({ error: 'listDeals not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Deal>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listDeals!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/deals/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getDeal) {
        return reply.status(501).send({ error: 'getDeal not implemented by this adapter' })
      }
      const data = await cachedGet<Deal>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getDeal!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/deals', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createDeal) {
        return reply.status(501).send({ error: 'createDeal not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createDeal(credentials, parsed.data as Partial<Deal>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/deals/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateDeal) {
        return reply.status(501).send({ error: 'updateDeal not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateDeal(
        credentials,
        request.params.id,
        parsed.data as Partial<Deal>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/deals/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteDeal) {
        return reply.status(501).send({ error: 'deleteDeal not implemented by this adapter' })
      }
      await adapter.deleteDeal(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
