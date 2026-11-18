/**
 * Effective access for a console user: what they may DO (permissions) and
 * WHICH tenants they may see (scope).
 *
 * Two independent axes on top of the coarse base role:
 *
 *   - Permissions come from the user's custom role when `users.role_id` names
 *     one, otherwise from the built-in set for `users.role`
 *     (`BUILTIN_ROLE_PERMISSIONS` in @opensteward/shared).
 *   - Scope is `all` (every tenant — the default, and the only behaviour
 *     before admin_store v3) or `restricted` to the `user_scopes` grants. Admins are always unrestricted.
 *
 * Resolved from the database, never from the JWT: a token is minted once and
 * lives for hours, and a role or scope change must bite on the next request,
 * not the next sign-in. The resolution is cached per user for a few seconds
 * and every write path (`AdminStore.setUserRole`/`assignUserRole`/
 * `setUserScope`/`updateRole`/`deleteRole`/`deleteUser`) calls
 * `invalidateAccess`, so on a single replica a change is immediate and across
 * replicas it is bounded by the TTL.
 *
 * Route files never reach for the store themselves: `getAccess(request)`
 * uses the resolver `server.ts` decorates onto the instance. A harness that
 * decorates none (the route unit tests that build a bare Fastify) resolves to
 * `null`, which every helper here reads as "unrestricted, built-in
 * permissions of the JWT role" — the pre-permission behaviour those tests
 * were written against.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  isBuiltinRole,
  permissionsForBuiltin,
  type BuiltinRole,
  type Permission,
} from '@opensteward/shared'
import type { AdminStore, ScopeGrant } from '../db/admin-store'
import type { TokenUser } from './jwt-auth'
import { tagGuard } from './route-access'

/** Tenant → `'*'` (every vertical) or the verticals granted in it. */
export type TenantGrants = Map<string, '*' | Set<string>>

export type AccessScope = { mode: 'all' } | { mode: 'restricted'; tenants: TenantGrants }

export interface Access {
  userId: string
  /** Built-in level used by role gates; mirrors `users.role`. */
  baseRole: BuiltinRole
  /** Effective role: a custom role id, or the built-in id (`admin`, …). */
  roleId: string
  roleName: string
  permissions: Set<Permission>
  scope: AccessScope
}

/** JSON-safe scope for proxying to another service (integration-server). */
export type ProxyScope =
  { tenants: '*' } | { tenants: string[]; verticals: Record<string, '*' | string[]> }

/** The API view of a scope — what `GET /api/auth/me` returns. */
export type ScopeView = { mode: 'all' } | { mode: 'restricted'; grants: ScopeGrant[] }

export type AccessResolver = (userId: string) => Promise<Access>

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `getAccess` / `requirePermission` once resolved for this request. */
    access?: Access
  }
  interface FastifyInstance {
    /** Decorated by `server.ts`. Absent in bare test harnesses. */
    accessResolver?: AccessResolver
  }
}

const TTL_MS = 15_000
const MAX_ENTRIES = 1_000

interface CacheEntry {
  store: AdminStore
  expiresAt: number
  access: Access
}

const cache = new Map<string, CacheEntry>()

/** Drop one user's cached access, or everyone's when called with no id. */
export function invalidateAccess(userId?: string): void {
  if (userId === undefined) cache.clear()
  else cache.delete(userId)
}

/** A user row that no longer exists holds nothing: no permissions, no tenants. */
function noAccess(userId: string): Access {
  return {
    userId,
    baseRole: 'viewer',
    roleId: 'viewer',
    roleName: 'viewer',
    permissions: new Set(),
    scope: { mode: 'restricted', tenants: new Map() },
  }
}

export function grantsToTenantMap(grants: readonly ScopeGrant[]): TenantGrants {
  const map: TenantGrants = new Map()
  for (const g of grants) {
    const current = map.get(g.tenantId)
    if (g.verticals === '*' || current === '*') {
      map.set(g.tenantId, '*')
      continue
    }
    const set = current ?? new Set<string>()
    for (const v of g.verticals) set.add(v)
    map.set(g.tenantId, set)
  }
  return map
}

async function loadAccess(store: AdminStore, userId: string): Promise<Access> {
  const user = await store.getUserById(userId)
  if (!user) return noAccess(userId)
  let baseRole: BuiltinRole = isBuiltinRole(user.role) ? user.role : 'viewer'

  let roleId: string = baseRole
  let roleName: string = baseRole
  let permissions = permissionsForBuiltin(baseRole)
  if (user.role_id) {
    const role = await store.getRole(user.role_id)
    if (role && !role.isBuiltin) {
      roleId = role.id
      roleName = role.name
      permissions = new Set(role.permissions)
    } else if (!role) {
      // A role id that points nowhere cannot be read as "the base role": the
      // base role may grant more than the deleted custom role did. Deleting a
      // role in use is refused, so this is a hand-edited database — hold
      // nothing until an admin reassigns the user.
      roleId = user.role_id
      roleName = user.role_id
      permissions = new Set()
      baseRole = 'viewer'
    }
  }

  // An admin always sees every tenant. Stored scope rows are never read for
  // one: promotion clears them, but a row written before that rule (or by
  // hand) must not narrow an admin either.
  const scopeRow = baseRole === 'admin' ? null : await store.getUserScope(userId)
  const scope: AccessScope =
    scopeRow && scopeRow.mode === 'restricted'
      ? { mode: 'restricted', tenants: grantsToTenantMap(scopeRow.grants) }
      : { mode: 'all' }

  return { userId, baseRole, roleId, roleName, permissions, scope }
}

/** Resolve a user's effective access, served from a short per-user cache. */
export async function resolveAccess(store: AdminStore, userId: string): Promise<Access> {
  const hit = cache.get(userId)
  const now = Date.now()
  if (hit && hit.store === store && hit.expiresAt > now) return hit.access
  const access = await loadAccess(store, userId)
  if (cache.size >= MAX_ENTRIES) {
    // Map iteration is insertion order: evict the oldest entry.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.delete(userId)
  cache.set(userId, { store, expiresAt: now + TTL_MS, access })
  return access
}

/** The resolver `server.ts` decorates onto the Fastify instance. */
export function createAccessResolver(store: AdminStore): AccessResolver {
  return (userId) => resolveAccess(store, userId)
}

// ── Pure helpers ──────────────────────────────────────────────────────────

export function can(access: Access | null | undefined, permission: Permission): boolean {
  return !!access && access.permissions.has(permission)
}

export function isRestricted(access: Access | null | undefined): boolean {
  return !!access && access.scope.mode === 'restricted'
}

/**
 * May this caller see an object owned by `tenantId`?
 *
 * Unrestricted callers see everything, including objects with no tenant.
 * A restricted caller sees only tenants it was granted — never an untenanted
 * object, which by definition belongs to no grant. Without `vertical`, any
 * grant in the tenant is enough (the tenant itself is visible); with one, the
 * grant must cover that vertical.
 */
export function tenantAllowed(
  access: Access | null | undefined,
  tenantId: string | null | undefined,
  vertical?: string | null,
): boolean {
  return scopeAllows(access?.scope, tenantId, vertical)
}

/**
 * {@link tenantAllowed} for a bare scope — e.g. one narrowed to a dashboard's
 * pinned tenants (`narrowAccessScope`). No scope means unrestricted.
 */
export function scopeAllows(
  scope: AccessScope | null | undefined,
  tenantId: string | null | undefined,
  vertical?: string | null,
): boolean {
  if (!scope || scope.mode === 'all') return true
  if (!tenantId) return false
  const grant = scope.tenants.get(tenantId)
  if (grant === undefined) return false
  if (grant === '*' || !vertical) return true
  return grant.has(vertical)
}

/** Tenants a restricted caller may see, or null when unrestricted. */
export function allowedTenantIds(access: Access | null | undefined): string[] | null {
  if (!access || access.scope.mode === 'all') return null
  return [...access.scope.tenants.keys()].sort()
}

export function toScopeView(access: Access): ScopeView {
  if (access.scope.mode === 'all') return { mode: 'all' }
  return {
    mode: 'restricted',
    grants: [...access.scope.tenants.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tenantId, v]) => ({ tenantId, verticals: v === '*' ? '*' : [...v].sort() })),
  }
}

/** JSON-serialisable scope for a downstream service to re-check against. */
export function toProxyScope(access: Access): ProxyScope {
  if (access.scope.mode === 'all') return { tenants: '*' }
  const verticals: Record<string, '*' | string[]> = {}
  for (const [tenantId, v] of access.scope.tenants)
    verticals[tenantId] = v === '*' ? '*' : [...v].sort()
  return { tenants: Object.keys(verticals).sort(), verticals }
}

/**
 * Is `requested` (a scope a caller wants to grant) inside `holder`'s own?
 * An unrestricted holder may grant anything; a restricted one only tenants —
 * and verticals within them — it holds itself, and never `all`.
 */
export function scopeWithin(
  holder: Access,
  requested: { mode: 'all' | 'restricted'; grants: readonly ScopeGrant[] },
): boolean {
  if (holder.scope.mode === 'all') return true
  if (requested.mode === 'all') return false
  for (const g of requested.grants) {
    const held = holder.scope.tenants.get(g.tenantId)
    if (held === undefined) return false
    if (held === '*') continue
    if (g.verticals === '*' || g.verticals.length === 0) return false
    for (const v of g.verticals) if (!held.has(v)) return false
  }
  return true
}

// ── Request helpers ───────────────────────────────────────────────────────

/**
 * Resolve (once per request) the caller's access. Verifies the JWT itself
 * when no earlier hook has, so a plugin-level hook that runs before a
 * route-level `authenticate` still sees the caller. Null when there is no
 * valid token or no resolver is wired (bare test harnesses).
 */
export async function getAccess(request: FastifyRequest): Promise<Access | null> {
  if (request.access) return request.access
  const resolver = request.server.accessResolver
  if (!resolver) return null
  let user = request.jwtUser
  if (!user) {
    try {
      user = (await request.jwtVerify()) as TokenUser
      request.jwtUser = user
    } catch {
      return null
    }
  }
  request.access = await resolver(user.id)
  return request.access
}

/** Permissions the caller holds — the built-in set of the JWT role when no
 *  resolver is wired. */
export async function callerPermissions(request: FastifyRequest): Promise<Set<Permission>> {
  const access = await getAccess(request)
  if (access) return access.permissions
  return permissionsForBuiltin(request.jwtUser?.role ?? '')
}

/**
 * preHandler factory: 403 unless the caller holds `permission`. Runs after
 * `authenticate`; a request with no JWT user is a 401.
 */
export function requirePermission(permission: Permission) {
  async function permissionGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.jwtUser) {
      try {
        request.jwtUser = (await request.jwtVerify()) as TokenUser
      } catch {
        return reply.status(401).send({ error: 'Unauthorized — invalid or missing JWT token' })
      }
    }
    const held = await callerPermissions(request)
    if (!held.has(permission)) {
      return reply.status(403).send({ error: `Forbidden — missing permission ${permission}` })
    }
  }
  return tagGuard(permissionGuard, { kind: 'permission', permissions: [permission] })
}

export const SCOPE_RESTRICTED_ERROR = {
  code: 'SCOPE_RESTRICTED',
  message:
    'Forbidden — your access is restricted to specific tenants, and this surface is not yet tenant-scoped.',
} as const

/**
 * preHandler: fail closed for tenant-restricted callers on surfaces that do
 * not filter by tenant yet. Unrestricted callers (the default) pass through
 * untouched. An unauthenticated request passes too, so the route's own
 * `authenticate` answers it with the usual 401.
 */
export async function denyRestrictedScope(request: FastifyRequest, reply: FastifyReply) {
  const access = await getAccess(request)
  if (isRestricted(access)) {
    return reply.status(403).send({ error: SCOPE_RESTRICTED_ERROR })
  }
}
tagGuard(denyRestrictedScope, { kind: 'scope-deny' })

/** preHandler factory: 403 unless the caller holds at least one of `permissions`. */
export function requireAnyPermission(permissions: readonly Permission[]) {
  async function anyPermissionGuard(request: FastifyRequest, reply: FastifyReply) {
    if (!request.jwtUser) {
      try {
        request.jwtUser = (await request.jwtVerify()) as TokenUser
      } catch {
        return reply.status(401).send({ error: 'Unauthorized — invalid or missing JWT token' })
      }
    }
    const held = await callerPermissions(request)
    if (!permissions.some((p) => held.has(p))) {
      return reply
        .status(403)
        .send({ error: `Forbidden — missing permission ${permissions.join(' or ')}` })
    }
  }
  return tagGuard(anyPermissionGuard, {
    kind: 'permission',
    permissions: [...permissions],
    any: true,
  })
}

// ── Escalation guards ─────────────────────────────────────────────────────

export const BASE_ROLE_LEVEL: Readonly<Record<BuiltinRole, number>> = {
  viewer: 0,
  operator: 1,
  admin: 2,
}

/** What the caller holds, for escalation checks. `access` is null only in a
 *  harness with no resolver, where the caller is unrestricted and holds the
 *  built-in set of its JWT role. */
export interface CallerContext {
  access: Access | null
  permissions: Set<Permission>
  baseRole: BuiltinRole
}

export async function callerContext(request: FastifyRequest): Promise<CallerContext> {
  const access = await getAccess(request)
  const jwtRole = request.jwtUser?.role
  return {
    access,
    permissions: access ? access.permissions : permissionsForBuiltin(jwtRole ?? ''),
    baseRole: access ? access.baseRole : isBuiltinRole(jwtRole) ? jwtRole : 'viewer',
  }
}

/**
 * Can the caller grant (create, edit into, or assign) a role with these
 * permissions and base role? Nobody may hand out a permission they do not
 * hold themselves, nor a base role above their own — the base role is what
 * `operatorOnly`/`adminOnly` read, so it is a privilege in its own right.
 * Returns the refusal message, or null when allowed.
 */
export function roleGrantRefusal(
  caller: CallerContext,
  role: { permissions: readonly Permission[]; baseRole: BuiltinRole },
): string | null {
  const missing = role.permissions.filter((p) => !caller.permissions.has(p))
  if (missing.length > 0) {
    return `You cannot grant permissions you do not hold: ${missing.join(', ')}`
  }
  if (BASE_ROLE_LEVEL[role.baseRole] > BASE_ROLE_LEVEL[caller.baseRole]) {
    return `You cannot grant the ${role.baseRole} base role; yours is ${caller.baseRole}`
  }
  return null
}

/** {@link scopeWithin} for a caller that may have no resolved access. */
export function callerMayGrantScope(
  caller: CallerContext,
  requested: { mode: 'all' | 'restricted'; grants: readonly ScopeGrant[] },
): boolean {
  return !caller.access || scopeWithin(caller.access, requested)
}
