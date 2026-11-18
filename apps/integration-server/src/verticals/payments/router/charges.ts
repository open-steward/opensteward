import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Charge } from '../schema/charge'

const RESOURCE = 'charges'

export function createChargesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/charges', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listCharges) {
        return reply.status(501).send({ error: 'listCharges not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Charge>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listCharges!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/charges/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getCharge) {
        return reply.status(501).send({ error: 'getCharge not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Charge>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getCharge!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/charges', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createCharge) {
        return reply.status(501).send({ error: 'createCharge not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.createCharge(credentials, parsed.data as Partial<Charge>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.post<{ Params: { id: string }; Body: { amount?: number } }>(
      '/charges/:id/capture',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.captureCharge) {
          return reply.status(501).send({ error: 'captureCharge not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
        }
        const parsed = z.record(z.string(), z.unknown()).safeParse(request.body ?? {})
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
        const data = await adapter.captureCharge(credentials, request.params.id, parsed.data as { amount?: number })
        writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )

    fastify.post<{ Params: { id: string } }>('/charges/:id/cancel', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.cancelCharge) {
        return reply.status(501).send({ error: 'cancelCharge not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await adapter.cancelCharge(credentials, request.params.id)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
