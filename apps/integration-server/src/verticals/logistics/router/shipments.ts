import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'shipments'

export function createShipmentsRouter() {
  return async function shipmentsRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/shipments', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listShipments) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listShipments!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/shipments/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getShipment) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getShipment!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/shipments', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createShipment) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createShipment(credentials, parsed.data as Record<string, unknown>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.delete<{ Params: { id: string } }>('/shipments/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.cancelShipment) return reply.status(501).send({ error: { code: 'NOT_IMPLEMENTED' } })
      await adapter.cancelShipment(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
