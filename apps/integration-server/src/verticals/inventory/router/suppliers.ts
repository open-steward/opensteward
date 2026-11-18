import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Supplier } from '../schema/supplier'

const RESOURCE = 'suppliers'

export function createSuppliersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/suppliers', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listSuppliers) {
        return reply.status(501).send({ error: 'listSuppliers not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Supplier>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listSuppliers!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/suppliers/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getSupplier) {
        return reply.status(501).send({ error: 'getSupplier not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Supplier>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getSupplier!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
