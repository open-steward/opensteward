import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Contact } from '../schema/contact'

const RESOURCE = 'contacts'

export function createContactsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/contacts', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listContacts) {
        return reply.status(501).send({ error: 'listContacts not implemented by this adapter' })
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
        return reply.status(501).send({ error: 'getContact not implemented by this adapter' })
      }
      const data = await cachedGet<Contact>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getContact!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/contacts', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createContact) {
        return reply.status(501).send({ error: 'createContact not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.createContact(credentials, parsed.data as Partial<Contact>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateContact) {
        return reply.status(501).send({ error: 'updateContact not implemented by this adapter' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const data = await adapter.updateContact(
        credentials,
        request.params.id,
        parsed.data as Partial<Contact>,
      )
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/contacts/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteContact) {
        return reply.status(501).send({ error: 'deleteContact not implemented by this adapter' })
      }
      await adapter.deleteContact(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
