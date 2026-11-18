import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Payout } from '../schema/payout'

const RESOURCE = 'payouts'

export function createPayoutsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/payouts', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPayouts) {
        return reply.status(501).send({ error: 'listPayouts not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Payout>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listPayouts!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/payouts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPayout) {
        return reply.status(501).send({ error: 'getPayout not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Payout>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getPayout!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
