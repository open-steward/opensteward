import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Message } from '../schema/message'

const RESOURCE = 'messages'

export function createMessagesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>('/messages', async (request, reply) => {
      const { adapter, credentials } = request
      const ticketId = request.query.ticket_id
      if (!ticketId) {
        return reply
          .status(400)
          .send({ error: 'ticket_id query parameter is required', code: 'MISSING_PARAM' })
      }
      if (!adapter.listMessages) {
        return reply.status(501).send({ error: 'listMessages not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Message>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listMessages!(credentials, ticketId, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/messages/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getMessage) {
        return reply.status(501).send({ error: 'getMessage not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Message>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getMessage!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
