import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Refund } from '../schema/refund'

const RESOURCE = 'refunds'

export function createRefundsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/refunds', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listRefunds) {
        return reply.status(501).send({ error: 'listRefunds not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Refund>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listRefunds!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/refunds/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getRefund) {
        return reply.status(501).send({ error: 'getRefund not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Refund>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getRefund!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/refunds', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createRefund) {
        return reply.status(501).send({ error: 'createRefund not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.createRefund(credentials, parsed.data as Partial<Refund>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })
  }
}
