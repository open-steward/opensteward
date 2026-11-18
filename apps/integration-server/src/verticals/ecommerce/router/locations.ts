import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'locations'

export function createLocationsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/locations', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listLocations) {
        return reply.status(501).send({ error: 'listLocations not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listLocations!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/locations/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getLocation) {
        return reply.status(501).send({ error: 'getLocation not implemented by this adapter' })
      }
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getLocation!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
