import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Template } from '../schema/template'

const RESOURCE = 'templates'

export function createTemplatesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/templates', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTemplates) {
        return reply
          .status(501)
          .send({ error: 'listTemplates not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Template>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listTemplates!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/templates/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTemplate) {
        return reply
          .status(501)
          .send({ error: 'getTemplate not implemented by this adapter', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Template>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTemplate!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
