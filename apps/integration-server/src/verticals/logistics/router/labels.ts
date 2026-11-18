import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'labels'

export function createLabelsRouter() {
  return async function labelsRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/labels', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listLabels) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listLabels!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/labels/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getLabel) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getLabel!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/labels', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createLabel) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createLabel(credentials, parsed.data as Record<string, unknown>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.delete<{ Params: { id: string } }>('/labels/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.voidLabel) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      await adapter.voidLabel(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
