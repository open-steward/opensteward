import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Dispute } from '../schema/dispute'

const RESOURCE = 'disputes'

export function createDisputesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/disputes', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listDisputes) {
        return reply.status(501).send({ error: 'listDisputes not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Dispute>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listDisputes!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/disputes/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getDispute) {
        return reply.status(501).send({ error: 'getDispute not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Dispute>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getDispute!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post<{ Params: { id: string } }>('/disputes/:id/evidence', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.submitDisputeEvidence) {
        return reply.status(501).send({ error: 'submitDisputeEvidence not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.submitDisputeEvidence(credentials, request.params.id, parsed.data)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
