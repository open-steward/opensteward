import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Collection } from '../schema/collection'

const RESOURCE = 'collections'

export function createCollectionsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/collections', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listCollections) {
        return reply.status(501).send({ error: 'listCollections not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Collection>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listCollections!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/collections/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getCollection) {
        return reply.status(501).send({ error: 'getCollection not implemented by this adapter' })
      }
      const data = await cachedGet<Collection>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getCollection!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/collections', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createCollection) {
        return reply.status(501).send({ error: 'createCollection not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createCollection(credentials, parsed.data as Partial<Collection>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/collections/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateCollection) {
        return reply.status(501).send({ error: 'updateCollection not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateCollection(
        credentials,
        request.params.id,
        parsed.data as Partial<Collection>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/collections/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteCollection) {
        return reply.status(501).send({ error: 'deleteCollection not implemented by this adapter' })
      }
      await adapter.deleteCollection(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
