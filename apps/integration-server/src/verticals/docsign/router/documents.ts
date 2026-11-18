import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Document } from '../schema/document'

const RESOURCE = 'documents'

export function createDocumentsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>('/documents', async (request, reply) => {
      const { adapter, credentials } = request
      const envelopeId = request.query.envelope_id
      if (!envelopeId) {
        return reply
          .status(400)
          .send({ error: 'envelope_id query parameter is required', code: 'MISSING_PARAM' })
      }
      if (!adapter.listDocuments) {
        return reply.status(501).send({
          error: 'listDocuments not implemented by this adapter',
          code: 'NOT_IMPLEMENTED',
        })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Document>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listDocuments!(
            credentials,
            envelopeId,
            params,
          ),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/documents/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getDocument) {
        return reply
          .status(501)
          .send({ error: 'getDocument not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Document>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getDocument!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
