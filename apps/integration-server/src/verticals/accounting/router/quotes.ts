import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, assertSearchSupported } from '@opensteward/shared'
import { singleResponse } from '../schema/shared'
import { parseListQuery, listPage, collectionIsComplete } from './helpers'

const RESOURCE = 'quotes'

/**
 * Read-only. Quotes exist on twenty accounting platforms, but they model
 * acceptance and conversion-to-invoice differently enough that a canonical
 * create would be guesswork — so list and get only, until a second platform
 * is implemented and the write shape can be derived from more than one.
 */
export function createQuotesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listQuotes) return reply.status(501).send({ error: 'Not implemented' })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const items = await cachedList(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listQuotes!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return listPage(items, params, adapter.platform, request.log)
    })

    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getQuote) return reply.status(501).send({ error: 'Not implemented' })
      const item = await cachedGet(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getQuote!(credentials, request.params.id),
      })
      return singleResponse(item, adapter.platform)
    })
  }
}
