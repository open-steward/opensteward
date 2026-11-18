import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'trackingevents'

export function createTrackingEventsRouter() {
  return async function trackingEventsRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/tracking-events', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTrackingEvents) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listTrackingEvents!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { trackingNumber: string }; Querystring: { carrier?: string } }>(
      '/tracking-events/:trackingNumber',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.getTrackingEvents) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
        // Optional carrier hint, for platforms that can disambiguate a
        // tracking number that collides across carriers (SERA/stamps does).
        const carrier = request.query.carrier?.trim() || undefined
        const data = await cachedGet<{ id?: string }>(request, {
          resourceType: RESOURCE,
          // The hint belongs in the cache key, not just the request: the whole
          // reason it exists is that one tracking number can mean two
          // different shipments on two carriers, so keying on the number alone
          // would serve the first carrier's answer to the second.
          resourceId: carrier
            ? `${request.params.trackingNumber}@${carrier}`
            : request.params.trackingNumber,
          fetch: () =>
            adapter.getTrackingEvents!(credentials, request.params.trackingNumber, carrier),
        })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )
  }
}
