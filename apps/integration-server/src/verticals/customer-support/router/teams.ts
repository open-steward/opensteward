import type { FastifyPluginAsync } from 'fastify'
import { cachedList, cachedGet, parseListQuery, listPage, collectionIsComplete, sharedSingleResponse, assertSearchSupported } from '@opensteward/shared'
import type { Team } from '../schema/team'

const RESOURCE = 'teams'

export function createTeamsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/teams', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.listTeams) {
        return reply.status(501).send({ error: 'listTeams not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const params = parseListQuery(request.query, adapter)
      assertSearchSupported(adapter, params)
      const data = await cachedList<Team>(request, {
        resourceType: RESOURCE,
        fetch: () => adapter.listTeams!(credentials, params),
        isComplete: (rows) => collectionIsComplete(params, rows),
      })
      return reply.send(listPage(data, params, adapter.platform, request.log))
    })

    fastify.get<{ Params: { id: string } }>('/teams/:id', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getTeam) {
        return reply.status(501).send({ error: 'getTeam not implemented', code: 'NOT_IMPLEMENTED' })
      }
      const data = await cachedGet<Team>(request, {
        resourceType: RESOURCE,
        resourceId: request.params.id,
        fetch: () => adapter.getTeam!(credentials, request.params.id),
      })
      return reply.send(sharedSingleResponse(data, adapter.platform))
    })
  }
}
