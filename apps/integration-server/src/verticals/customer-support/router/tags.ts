import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Tag } from '../schema/tag'

const RESOURCE = 'tags'

export function createTagsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/tags', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTags) {
        return reply.status(501).send({ error: 'listTags not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Tag>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listTags!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/tags/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTag) {
        return reply.status(501).send({ error: 'getTag not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Tag>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTag!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
