import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, writeThrough, assertSearchSupported } from '@opensteward/shared'
import { singleResponse } from '../schema/shared'
import { parseListQuery, listPage, collectionIsComplete } from './helpers'
import { CreditMemoSchema } from '../schema/creditmemo'

const RESOURCE = 'creditmemos'

export function createCreditmemosRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listCreditMemos) return reply.status(501).send({ error: 'Not implemented' })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const items = await cachedList(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listCreditMemos!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return listPage(items, params, adapter.platform, request.log)
    })

    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getCreditMemo) return reply.status(501).send({ error: 'Not implemented' })
      const item = await cachedGet(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getCreditMemo!(credentials, request.params.id),
      })
      return singleResponse(item, adapter.platform)
    })

    fastify.post('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.createCreditMemo) return reply.status(501).send({ error: 'Not implemented' })
      const parsed = CreditMemoSchema.partial().safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({ error: 'validation_error', issues: parsed.error.issues })
      }
      const item = await adapter.createCreditMemo(credentials, parsed.data)
      if (item?.id) writeThrough(request, { resourceType: RESOURCE, resourceId: String(item.id), data: item })
      return reply.status(201).send(singleResponse(item, adapter.platform))
    })
  }
}
