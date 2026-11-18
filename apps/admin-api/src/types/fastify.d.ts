import type { TokenUser } from '../core/auth/jwt-auth'
import type { Permission } from '@opensteward/shared'

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply, done: () => void) => void
    /** Async: the role is read from the access resolver, not the JWT claim. */
    operatorOnly: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<unknown>
    adminOnly: (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<unknown>
    /**
     * preHandler factory: 403 `Forbidden — missing permission <p>` unless the
     * caller holds `p` (see `core/auth/access.ts`). Decorated by `server.ts`;
     * route files import `requirePermission` from `access.ts` directly so a
     * bare test harness that decorates only the three role gates still works.
     */
    requirePermission: (
      permission: Permission,
    ) => (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => Promise<unknown>
  }
  interface FastifyRequest {
    jwtUser?: TokenUser
  }
}
