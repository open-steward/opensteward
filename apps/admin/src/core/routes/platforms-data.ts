import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../auth/middleware'
import type { AdminApiClient } from '../proxy/admin-api-client'
import { loadCatalog, type Catalog } from './platform-catalog'

export function createPlatformsDataRoutes(apiClient: AdminApiClient) {
  return async function platformsDataRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireAuth)

    fastify.get('/data/platforms/platforms.json', async (request, reply) => {
      const token = request.sessionUser!.token

      let connectionCounts = new Map<string, number>()
      try {
        const connections = await apiClient.listConnections(token).catch(() => [])
        connectionCounts = connections.reduce((acc, c) => {
          acc.set(c.platform, (acc.get(c.platform) ?? 0) + 1)
          return acc
        }, new Map<string, number>())
      } catch {
        // If admin-api is unreachable, fall back to catalog without overlay.
      }

      let catalog: Catalog
      try {
        catalog = loadCatalog()
      } catch (err) {
        request.log.error({ err }, 'failed to load platforms.json')
        return reply.code(500).send({ error: 'catalog unavailable' })
      }

      const merged = {
        ...catalog,
        platforms: catalog.platforms.map((p) => {
          const count = connectionCounts.get(p.slug) ?? 0
          return { ...p, configured: count > 0, connection_count: count }
        }),
      }

      return reply.header('cache-control', 'no-store').type('application/json').send(merged)
    })
  }
}
