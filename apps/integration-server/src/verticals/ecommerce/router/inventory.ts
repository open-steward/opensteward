import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'inventory_levels'

interface AdjustBody {
  variantId: string
  locationId: string
  delta: number
}

interface SetBody {
  variantId: string
  locationId: string
  available: number
}

export function createInventoryRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/inventory_levels', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listInventoryLevels) {
        return reply
          .status(501)
          .send({ error: 'listInventoryLevels not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listInventoryLevels!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>(
      '/inventory_levels/:id',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.getInventoryLevel) {
          return reply
            .status(501)
            .send({ error: 'getInventoryLevel not implemented by this adapter' })
        }
        const data = await cachedGet<{ id?: string }>(request, {
          resourceType: RESOURCE,
          resourceId: request.params.id,
          fetch: () => adapter.getInventoryLevel!(credentials, request.params.id),
        })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )

    fastify.post<{ Body: AdjustBody }>(
      '/inventory_levels/adjust',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.adjustInventoryLevel) {
          return reply
            .status(501)
            .send({ error: 'adjustInventoryLevel not implemented by this adapter' })
        }
        const data = await adapter.adjustInventoryLevel(credentials, request.body)
        if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )

    fastify.post<{ Body: SetBody }>('/inventory_levels/set', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.setInventoryLevel) {
        return reply
          .status(501)
          .send({ error: 'setInventoryLevel not implemented by this adapter' })
      }
      const data = await adapter.setInventoryLevel(credentials, request.body)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
