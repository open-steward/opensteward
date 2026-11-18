import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Fulfillment } from '../schema/fulfillment'

const RESOURCE = 'fulfillments'

export function createFulfillmentsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/fulfillments', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listFulfillments) {
        return reply.status(501).send({ error: 'listFulfillments not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Fulfillment>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listFulfillments!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/fulfillments/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getFulfillment) {
        return reply.status(501).send({ error: 'getFulfillment not implemented by this adapter' })
      }
      const data = await cachedGet<Fulfillment>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getFulfillment!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/fulfillments', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createFulfillment) {
        return reply
          .status(501)
          .send({ error: 'createFulfillment not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createFulfillment(
        credentials,
        parsed.data as Partial<Fulfillment>,
      )
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>(
      '/fulfillments/:id',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.updateFulfillment) {
          return reply
            .status(501)
            .send({ error: 'updateFulfillment not implemented by this adapter' })
        }
        const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
        if (!parsed.success) {
          return reply.status(400).send({ error: 'Invalid request body' })
        }
        const data = await adapter.updateFulfillment(
          credentials,
          request.params.id,
          parsed.data as Partial<Fulfillment>,
        )
        writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/fulfillments/:id/cancel',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.cancelFulfillment) {
          return reply
            .status(501)
            .send({ error: 'cancelFulfillment not implemented by this adapter' })
        }
        const data = await adapter.cancelFulfillment(credentials, request.params.id)
        writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )
  }
}
