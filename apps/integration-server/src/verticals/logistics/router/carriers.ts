import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'carriers'

export function createCarriersRouter() {
  return async function carriersRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/carriers', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listCarriers) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listCarriers!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/carriers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getCarrier) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getCarrier!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
