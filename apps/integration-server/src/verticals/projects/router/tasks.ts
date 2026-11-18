import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Task } from '../schema/task'

const RESOURCE = 'tasks'

export function createTasksRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>('/tasks', async (request, reply) => {
      const { adapter, credentials } = request
      const projectId = request.query.project_id
      if (!projectId) {
        return reply
          .status(400)
          .send({ error: 'project_id query parameter is required', code: 'MISSING_PARAM' })
      }
      if (!adapter.listTasks) {
        return reply.status(501).send({ error: 'listTasks not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Task>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listTasks!(credentials, projectId, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/tasks/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTask) {
        return reply.status(501).send({ error: 'getTask not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Task>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTask!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
