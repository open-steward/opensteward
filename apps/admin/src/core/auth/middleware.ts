import type { FastifyRequest, FastifyReply } from 'fastify'
import { permissionsForBuiltin, type Permission } from '@opensteward/shared'
import type { AccessScopeRecord } from '../proxy/admin-api-client'

export type SessionUser = {
  id: string
  username: string
  /** Base role, from the session cookie (the JWT claim at sign-in). */
  role: 'admin' | 'operator' | 'viewer'
  token: string
  /**
   * Effective permissions and tenant scope, loaded from admin-api's
   * `GET /api/auth/me` by a server.ts preHandler (cached per token for a few
   * seconds). Never stored in the cookie: they change without a re-login.
   * Absent only before that hook runs.
   */
  permissions?: string[]
  scope?: AccessScopeRecord
  roleName?: string
  /** Profile-picture version for the header avatar, loaded with the
   *  permissions above; null without a picture. */
  avatarVersion?: string | null
}

/**
 * Does the signed-in user hold `permission`? Falls back to the built-in set
 * of the session's role when permissions were never loaded — the same answer
 * admin-api gives a user with no custom role.
 */
export function hasPermission(user: SessionUser | undefined | null, permission: Permission): boolean {
  if (!user) return false
  if (Array.isArray(user.permissions)) return user.permissions.includes(permission)
  return permissionsForBuiltin(user.role).has(permission)
}

declare module 'fastify' {
  interface FastifyRequest {
    sessionUser?: SessionUser
  }
}

const ROLE_LEVELS: Record<string, number> = { viewer: 0, operator: 1, admin: 2 }

export function requireAuth(request: FastifyRequest, reply: FastifyReply, done: () => void): void {
  const user = request.sessionUser
  if (!user) {
    void reply.redirect('/login')
    return
  }
  done()
}

export function requireRole(minRole: 'operator' | 'admin') {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const user = request.sessionUser
    if (!user) {
      void reply.redirect('/login')
      return
    }
    if ((ROLE_LEVELS[user.role] ?? 0) < (ROLE_LEVELS[minRole] ?? 0)) {
      // Rendered, not raw JSON. `reply.send()` here bypasses setErrorHandler
      // and would give a refused user `{"error":"Forbidden — insufficient
      // role"}` as a bare page — no navigation, no explanation, no way back —
      // so render the error view instead.
      void reply.status(403).view('error.ejs', {
        user,
        status: 403,
        message: `This action needs the ${minRole} role. You are signed in as ${user.role}, which can view but not change.`,
        requestId: null,
      })
      return
    }
    done()
  }
}

/**
 * preHandler factory: render the 403 page unless the user holds `permission`.
 * The UI check is a convenience — admin-api enforces the same permission on
 * every call these pages make.
 */
export function requirePermission(permission: Permission) {
  return (request: FastifyRequest, reply: FastifyReply, done: () => void): void => {
    const user = request.sessionUser
    if (!user) {
      void reply.redirect('/login')
      return
    }
    if (!hasPermission(user, permission)) {
      void reply.status(403).view('error.ejs', {
        user,
        status: 403,
        message: `This page needs the ${permission} permission, which your role does not grant.`,
        requestId: null,
      })
      return
    }
    done()
  }
}
