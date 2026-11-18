import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Invoice, InvoiceLineItem } from '../schema/invoice'

const RESOURCE = 'invoices'
const LINE_ITEM_RESOURCE = 'invoice_line_items'

export function createInvoicesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/invoices', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listInvoices) {
        return reply.status(501).send({ error: 'listInvoices not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Invoice>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listInvoices!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/invoices/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getInvoice) {
        return reply.status(501).send({ error: 'getInvoice not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Invoice>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getInvoice!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post('/invoices', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createInvoice) {
        return reply.status(501).send({ error: 'createInvoice not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.createInvoice(credentials, parsed.data as Partial<Invoice>)
      if (data?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(data.id), data })
      return reply.status(201).send({ data })
    })

    fastify.patch<{ Params: { id: string } }>('/invoices/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateInvoice) {
        return reply.status(501).send({ error: 'updateInvoice not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request body' })
      const data = await adapter.updateInvoice(credentials, request.params.id, parsed.data as Partial<Invoice>)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post<{ Params: { id: string } }>('/invoices/:id/void', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.voidInvoice) {
        return reply.status(501).send({ error: 'voidInvoice not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await adapter.voidInvoice(credentials, request.params.id)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.post<{ Params: { id: string } }>('/invoices/:id/pay', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.payInvoice) {
        return reply.status(501).send({ error: 'payInvoice not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await adapter.payInvoice(credentials, request.params.id)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })

    fastify.get<{ Params: { id: string } }>('/invoices/:id/line_items', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listInvoiceLineItems) {
        return reply.status(501).send({ error: 'listInvoiceLineItems not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<InvoiceLineItem>(request, {
        resourceType: LINE_ITEM_RESOURCE,
        fetch: () =>
          adapter.listInvoiceLineItems!(
            credentials,
            request.params.id,
            params,
          ),
        // Never one cached collection. The parent invoice is in the PATH, so
        // the query is empty and the cache would take these rows as every
        // 'invoice_line_items' row of the connection: the store keys rows by
        // resource type, not by invoice, and the next invoice's unfiltered
        // read was answered with the first invoice's line items. The other
        // parent-scoped lists carry their parent in the query, which already
        // keeps them out of the cache.
        isComplete: () => false,
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })
  }
}
