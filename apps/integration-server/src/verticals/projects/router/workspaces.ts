import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Workspace } from '../schema/workspace'

const RESOURCE = 'workspaces'

export function createWorkspacesRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/workspaces', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listWorkspaces) {
        return reply
          .status(501)
          .send({ error: 'listWorkspaces not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Workspace>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listWorkspaces!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/workspaces/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getWorkspace) {
        return reply
          .status(501)
          .send({ error: 'getWorkspace not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Workspace>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getWorkspace!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
