import type { FastifyPluginAsync } from 'fastify'
import { adminGuard } from '@opensteward/shared'
import { toLicenseStatusDTO, type LicenseStatus } from '@opensteward/shared/licensing'

/**
 * GET /admin/license: the evaluated license, for admin-api's /api/license (D-A).
 * Operator only (X-Admin-Secret). Never gated by the license itself, and never
 * the token: LicenseStatus carries none, and toLicenseStatusDTO copies only the
 * schema's keys. Not in the public spec, like the other /admin operator
 * internals. A failed connection count reports `usage.connections: null`
 * rather than failing the whole read.
 */
export function createAdminLicenseRouter(opts: {
  license: { current(): LicenseStatus }
  countConnections: () => Promise<number>
}): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/admin/license', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      let connections: number | null = null
      try {
        connections = await opts.countConnections()
      } catch (err) {
        request.log.warn({ err }, 'license: connection count unavailable')
      }
      return { data: toLicenseStatusDTO(opts.license.current(), { connections }) }
    })
  }
}
