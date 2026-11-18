import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Envelope } from '../schema/envelope'

const RESOURCE = 'envelopes'

export function createEnvelopesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/envelopes', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listEnvelopes) {
        return reply
          .status(501)
          .send({ error: 'listEnvelopes not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Envelope>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listEnvelopes!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/envelopes/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getEnvelope) {
        return reply
          .status(501)
          .send({ error: 'getEnvelope not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Envelope>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getEnvelope!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post<{ Params: { id: string }; Body: { reason?: string } }>(
      '/envelopes/:id/void',
      async (request, reply) => {
        const { adapter, credentials } = request
        if (!adapter.voidEnvelope) {
          return reply.status(501).send({
            error: 'voidEnvelope not implemented by this adapter',
            code: 'NOT_IMPLEMENTED',
          })
        }
        const parsed = z.object({ reason: z.string().optional() }).safeParse(request.body ?? {})
        if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
        const data = await adapter.voidEnvelope(credentials, request.params.id, parsed.data)
        writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
        return reply.send(sharedSingleResponse(data, adapter.platform))
      },
    )
  }
}
