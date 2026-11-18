import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { User } from '../schema/user'

const RESOURCE = 'users'

export function createUsersRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get<{ Querystring: Record<string, string> }>('/users', async (request, reply) => {
      const { adapter, credentials } = request
      const workspaceId = request.query.workspace_id
      if (!workspaceId) {
        return reply
          .status(400)
          .send({ error: 'workspace_id query parameter is required', code: 'MISSING_PARAM' })
      }
      if (!adapter.listUsers) {
        return reply.status(501).send({ error: 'listUsers not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<User>(request, {
        resourceType: RESOURCE,
        fetch: () =>
          adapter.listUsers!(credentials, workspaceId, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getUser) {
        return reply.status(501).send({ error: 'getUser not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<User>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getUser!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
