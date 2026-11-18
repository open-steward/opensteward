import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Signer } from '../schema/signer'

const RESOURCE = 'signers'

export function createSignersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>('/signers', async (request, reply) => {
      const { adapter, credentials } = request
      const envelopeId = request.query.envelope_id
      if (!envelopeId) {
        return reply
          .status(400)
          .send({ error: 'envelope_id query parameter is required', code: 'MISSING_PARAM' })
      }
      if (!adapter.listSigners) {
        return reply
          .status(501)
          .send({ error: 'listSigners not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Signer>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listSigners!(credentials, envelopeId, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/signers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getSigner) {
        return reply
          .status(501)
          .send({ error: 'getSigner not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Signer>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getSigner!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
