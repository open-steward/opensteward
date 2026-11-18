import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, assertSearchSupported } from '@opensteward/shared'
import { singleResponse } from '../schema/shared'
import { parseListQuery, listPage, collectionIsComplete } from './helpers'

const RESOURCE = 'taxrates'

export function createTaxratesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTaxRates) return reply.status(501).send({ error: 'Not implemented' })
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const items = await cachedList(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listTaxRates!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return listPage(items, params, adapter.platform, request.log)
    })

    fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTaxRate) return reply.status(501).send({ error: 'Not implemented' })
      const item = await cachedGet(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTaxRate!(credentials, request.params.id),
      })
      return singleResponse(item, adapter.platform)
    })
  }
}
