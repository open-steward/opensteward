import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Comment } from '../schema/comment'

const RESOURCE = 'comments'

export function createCommentsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>('/comments', async (request, reply) => {
      const { adapter, credentials } = request
      const taskId = request.query.task_id
      if (!taskId) {
        return reply
          .status(400)
          .send({ error: 'task_id query parameter is required', code: 'MISSING_PARAM' })
      }
      if (!adapter.listComments) {
        return reply.status(501).send({ error: 'listComments not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Comment>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listComments!(credentials, taskId, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/comments/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getComment) {
        return reply.status(501).send({ error: 'getComment not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Comment>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getComment!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
