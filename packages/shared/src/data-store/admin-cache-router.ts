/**
 * Admin-only cache control. Mounted at root by `server.ts`. Lets an
 * operator drop a connection's cached resources without deleting the
 * connection itself — useful for invalidating after a manual upstream
 * data fix or recovering from cache drift.
 */
import type { FastifyPluginAsync } from 'fastify'
import { adminGuard } from '../control-plane/admin-guard'
import type { CredentialStore } from '../auth/store'
import type { ResourceStore } from './resource-store'

export interface CreateAdminCacheRouterOptions {
  store: CredentialStore
  resourceStore: ResourceStore
}

export function createAdminCacheRouter(opts: CreateAdminCacheRouterOptions): FastifyPluginAsync {
  const { store, resourceStore } = opts
  return async (fastify) => {
    fastify.post<{ Params: { id: string } }>(
      '/admin/connections/:id/cache-clear',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const row = await store.getRow(request.params.id)
        if (!row) {
          return reply
            .status(404)
            .send({ error: { code: 'CONNECTION_NOT_FOUND', message: 'No such connection.' } })
        }
        if (!row.vertical) {
          return reply.status(409).send({
            error: {
              code: 'CONNECTION_VERTICAL_MISSING',
              message: 'Connection has no vertical column.',
            },
          })
        }
        await resourceStore.deleteConnection(row.vertical, row.platform, row.id)
        return reply.send({ ok: true })
      },
    )

    /**
     * Bulk purge, optionally scoped to one vertical.
     *
     * Exists because turning a raw-payload flag off filters reads but leaves
     * the bytes on disk, and "it is no longer returned" is not the same answer
     * as "it is no longer stored" when someone asks about a breach or an
     * erasure request.
     */
    fastify.post<{ Querystring: { vertical?: string } }>(
      '/admin/cache-clear',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const vertical = request.query?.vertical?.trim() || undefined
        const removed = await resourceStore.deleteAll(vertical)
        return reply.send({ data: { removed, vertical: vertical ?? null } })
      },
    )
  }
}
