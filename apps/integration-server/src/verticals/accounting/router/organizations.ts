import type { FastifyPluginAsync } from 'fastify'
import { cachedGet } from '@opensteward/shared'
import { singleResponse } from '../schema/shared'

const RESOURCE = 'organizations'
// Singleton resource — single ORG row per connection. Stable id used for
// cache-key bookkeeping; the platform itself doesn't expose multiple orgs.
const SINGLETON_ID = 'self'

export function createOrganizationsRouter(): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/', async (request, reply) => {
      const { adapter, credentials } = request
      if (!adapter.getOrganization) return reply.status(501).send({ error: 'Not implemented' })
      const item = await cachedGet(request, {
        resourceType: RESOURCE,
        resourceId: SINGLETON_ID,
        fetch: () => adapter.getOrganization!(credentials),
      })
      return singleResponse(item, adapter.platform)
    })
  }
}
