import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'manifests'

export function createManifestsRouter() {
  return async function manifestsRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/manifests', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listManifests) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listManifests!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/manifests/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getManifest) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getManifest!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/manifests', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createManifest) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createManifest(credentials, parsed.data as Record<string, unknown>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })
  }
}
