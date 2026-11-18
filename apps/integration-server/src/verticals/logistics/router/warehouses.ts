import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'warehouses'

export function createWarehousesRouter() {
  return async function warehousesRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/warehouses', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listWarehouses) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listWarehouses!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/warehouses/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getWarehouse) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getWarehouse!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
