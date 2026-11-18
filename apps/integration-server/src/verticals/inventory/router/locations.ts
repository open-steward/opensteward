import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Location } from '../schema/location'

const RESOURCE = 'locations'

export function createLocationsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/locations', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listLocations) {
        return reply.status(501).send({ error: 'listLocations not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Location>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listLocations!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/locations/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getLocation) {
        return reply.status(501).send({ error: 'getLocation not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Location>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getLocation!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
