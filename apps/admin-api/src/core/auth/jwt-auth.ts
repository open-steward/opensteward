import type { FastifyRequest, FastifyReply } from 'fastify'
import { tagGuard } from './route-access'
import { getAccess } from './access'

export type TokenUser = { id: string; username: string; role: 'admin' | 'operator' | 'viewer' }

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: TokenUser
    user: TokenUser
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    jwtUser?: TokenUser
  }
}

const ROLE_LEVELS: Record<string, number> = { viewer: 0, operator: 1, admin: 2 }

export function requireAuth(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  request.jwtVerify()
    .then((user) => {
      request.jwtUser = user as TokenUser
      done()
    })
    .catch(() => {
      void reply.status(401).send({ error: 'Unauthorized — invalid or missing JWT token' })
    })
}
tagGuard(requireAuth, { kind: 'jwt' })

/**
 * Minimum base role. The role comes from the access resolver (the database,
 * cached ~15 s and invalidated on every role write), not from the JWT claim:
 * a claim is fixed at sign-in, so a demoted or deleted admin would otherwise
 * keep admin routes until the token expires. Without a resolver (bare test
 * harnesses) the claim is all there is.
 */
export function requireRole(minRole: 'operator' | 'admin') {
  return tagGuard(
    async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
      const user = request.jwtUser
      if (!user) return reply.status(401).send({ error: 'Unauthorized' })
      const access = await getAccess(request)
      const role = access ? access.baseRole : user.role
      if ((ROLE_LEVELS[role] ?? 0) < (ROLE_LEVELS[minRole] ?? 0)) {
        return reply.status(403).send({ error: 'Forbidden — insufficient role' })
      }
      return undefined
    },
    { kind: 'role', role: minRole },
  )
}
