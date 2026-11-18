import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'

const RESOURCE = 'pipelines'

export function createPipelinesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/pipelines', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listPipelines) {
        return reply.status(501).send({ error: 'listPipelines not implemented by this adapter' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<{ id: string }>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listPipelines!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/pipelines/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getPipeline) {
        return reply.status(501).send({ error: 'getPipeline not implemented by this adapter' })
      }
      const data = await cachedGet<{ id?: string }>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getPipeline!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
