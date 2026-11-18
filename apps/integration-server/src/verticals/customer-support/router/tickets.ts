import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Ticket } from '../schema/ticket'

const RESOURCE = 'tickets'

export function createTicketsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/tickets', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTickets) {
        return reply.status(501).send({ error: 'listTickets not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Ticket>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listTickets!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/tickets/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTicket) {
        return reply.status(501).send({ error: 'getTicket not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Ticket>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTicket!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
