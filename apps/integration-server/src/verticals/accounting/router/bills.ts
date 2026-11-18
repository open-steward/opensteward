import { z } from 'zod'
import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, cachedDelete, assertSearchSupported } from '@opensteward/shared'
import { singleResponse } from '../schema/shared'
import { parseListQuery, listPage, collectionIsComplete } from './helpers'

const RESOURCE = 'bills'

export function createBillsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listBills) return reply.status(501).send({ error: 'Not implemented' })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const items = await cachedList(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listBills!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return listPage(items, params, adapter.platform, request.log)
    })

    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getBill) return reply.status(501).send({ error: 'Not implemented' })
      const item = await cachedGet(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getBill!(credentials, request.params.id),
      })
      return singleResponse(item, adapter.platform)
    })

    fastify.post('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createBill) return reply.status(501).send({ error: 'Not implemented' })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const item = await adapter.createBill(credentials, parsed.data as never)
      if (item?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(item.id), data: item })
      return reply.status(201).send(singleResponse(item, adapter.platform))
    })

    fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.updateBill) return reply.status(501).send({ error: 'Not implemented' })
      const parsed = z.record(z.string(), z.unknown()).safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid request body' })
      }
      const item = await adapter.updateBill(credentials, request.params.id, parsed.data as never)
      writeThrough(request, { resourceType: RESOURCE, resourceId: request.params.id, data: item })
      return singleResponse(item, adapter.platform)
    })

    fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.deleteBill) return reply.status(501).send({ error: 'Not implemented' })
      await adapter.deleteBill(credentials, request.params.id)
      cachedDelete(request, { resourceType: RESOURCE, resourceId: request.params.id })
      return reply.status(204).send()
    })
  }
}
