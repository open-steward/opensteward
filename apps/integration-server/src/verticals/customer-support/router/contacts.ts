import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Contact } from '../schema/contact'

const RESOURCE = 'contacts'

export function createContactsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/contacts', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listContacts) {
        return reply.status(501).send({ error: 'listContacts not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Contact>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listContacts!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getContact) {
        return reply.status(501).send({ error: 'getContact not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Contact>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getContact!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
