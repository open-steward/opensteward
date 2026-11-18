import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Customer } from '../schema/customer'

const RESOURCE = 'customers'

export function createCustomersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/customers', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listCustomers) {
        return reply.status(501).send({ error: 'listCustomers not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Customer>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listCustomers!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getCustomer) {
        return reply.status(501).send({ error: 'getCustomer not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Customer>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getCustomer!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/customers', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createCustomer) {
        return reply.status(501).send({ error: 'createCustomer not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.createCustomer(credentials, parsed.data as Partial<Customer>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateCustomer) {
        return reply.status(501).send({ error: 'updateCustomer not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.updateCustomer(credentials, request.params.id, parsed.data as Partial<Customer>)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.delete<{ Params: { id: string } }>('/customers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteCustomer) {
        return reply.status(501).send({ error: 'deleteCustomer not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      await adapter.deleteCustomer(credentials, request.params.id)
      return reply.status(204).send()
    })
  }
}
