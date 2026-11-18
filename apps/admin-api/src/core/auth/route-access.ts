/**
 * Route access metadata: which guard protects which admin-api route.
 *
 * Every guard this service uses (`requireAuth`, `requireRole`,
 * `requirePermission`, `requireAnyPermission`, `serviceGuard`,
 * `jwtOrServiceAuth`, the SCIM bearer check) carries a {@link GuardTag}. The
 * tag is a property on the guard function itself, so it survives however the
 * guard is attached: a route's own `onRequest`/`preHandler` array, or a
 * plugin-level `addHook('preHandler', fastify.authenticate)`.
 *
 * {@link createRouteAccessRecorder} collects, for every registered route, the
 * tags of every guard that will run before its handler. `buildServer` installs
 * it only when asked (`BuildServerOptions.routeAccessRecorder`); the route
 * access gate (`tests/unit/route-access.test.ts`) boots the real server with
 * one and fails when an `/api/*` route has no authentication guard, or when a
 * route on a data-access surface declares no permission.
 */
import type { FastifyInstance, RouteOptions } from 'fastify'
import type { Permission } from '@opensteward/shared'

export type GuardKind =
  /** Admin-user JWT (`requireAuth`, a.k.a. `fastify.authenticate`). */
  | 'jwt'
  /** Minimum base role; 401s when no JWT user was established. */
  | 'role'
  /** One permission, or any of several; verifies the JWT itself. */
  | 'permission'
  /** Sibling-service shared secret (`X-Service-Secret`). */
  | 'service'
  /** Either a JWT or the service secret. */
  | 'jwt-or-service'
  /** SCIM bearer token of an identity provider. */
  | 'scim'
  /**
   * `denyRestrictedScope`: 403 `SCOPE_RESTRICTED` for tenant-restricted
   * callers on a surface that is not tenant-scoped yet. Not an
   * authentication guard — it lets an unauthenticated request through to the
   * route's own `authenticate`.
   */
  | 'scope-deny'

export interface GuardTag {
  kind: GuardKind
  /** `permission` guards: the permission(s) checked. */
  permissions?: readonly Permission[]
  /** `permission` guards: true when holding any one of `permissions` passes. */
  any?: boolean
  /** `role` guards: the minimum base role. */
  role?: string
}

const GUARD_TAG = Symbol.for('opensteward.admin-api.route-guard')

/** Attach `tag` to a guard function and return the same function. */
export function tagGuard<F extends (...args: never[]) => unknown>(fn: F, tag: GuardTag): F {
  Object.defineProperty(fn, GUARD_TAG, { value: Object.freeze({ ...tag }), enumerable: false })
  return fn
}

/** The tag on a guard function, or undefined for an untagged hook. */
export function guardTag(fn: unknown): GuardTag | undefined {
  if (typeof fn !== 'function') return undefined
  return (fn as unknown as Record<symbol, GuardTag | undefined>)[GUARD_TAG]
}

/** Guard kinds that reject a request with no valid credential. */
const AUTHENTICATING_KINDS: ReadonlySet<GuardKind> = new Set([
  'jwt',
  'role',
  'permission',
  'service',
  'jwt-or-service',
  'scim',
])

export interface RouteAccessRecord {
  method: string
  url: string
  /** Tags of every guard that runs before the handler, in no particular order. */
  guards: GuardTag[]
  /** True when some guard rejects an unauthenticated request. */
  authenticated: boolean
  /** Every permission a `permission` guard on this route checks. */
  permissions: Permission[]
  /** `schema.hide` — the route is left out of the OpenAPI document. */
  hidden: boolean
}

/** Request-phase hooks that run before the handler. */
const PRE_HANDLER_HOOKS = ['onRequest', 'preParsing', 'preValidation', 'preHandler'] as const

type HookArrays = Partial<Record<(typeof PRE_HANDLER_HOOKS)[number], unknown[]>>

/**
 * The encapsulated instance's own hook lists (plugin-level `addHook`). Fastify
 * keeps them behind a private symbol and merges them into each route only at
 * `preReady`, so an `onRoute` hook cannot see them in `routeOptions`. They are
 * read after `ready()`, when every `addHook` in the plugin has run.
 */
function instanceHooks(instance: FastifyInstance): HookArrays {
  const sym = Object.getOwnPropertySymbols(instance).find((s) => s.description === 'fastify.hooks')
  if (!sym) {
    throw new Error(
      'route-access: Fastify no longer exposes its hook registry under the ' +
        '"fastify.hooks" symbol — update instanceHooks() in core/auth/route-access.ts',
    )
  }
  return (instance as unknown as Record<symbol, HookArrays>)[sym] ?? {}
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  return v === undefined || v === null ? [] : [v]
}

export interface RouteAccessRecorder {
  /** Register as the root instance's `onRoute` hook before any route plugin. */
  onRoute: (this: FastifyInstance, opts: RouteOptions) => void
  /** Every recorded route with its effective guards. Call after `ready()`. */
  collect: () => RouteAccessRecord[]
}

export function createRouteAccessRecorder(): RouteAccessRecorder {
  const seen: Array<{ instance: FastifyInstance; opts: RouteOptions }> = []
  return {
    onRoute(opts) {
      seen.push({ instance: this, opts })
    },
    collect() {
      const out: RouteAccessRecord[] = []
      for (const { instance, opts } of seen) {
        const scoped = instanceHooks(instance)
        const fns: unknown[] = []
        for (const phase of PRE_HANDLER_HOOKS) {
          fns.push(...asArray(scoped[phase]))
          fns.push(...asArray((opts as unknown as HookArrays)[phase]))
        }
        const guards = fns.map(guardTag).filter((t): t is GuardTag => !!t)
        const permissions = [
          ...new Set(guards.flatMap((g) => (g.kind === 'permission' ? (g.permissions ?? []) : []))),
        ]
        const schema = opts.schema as { hide?: boolean } | undefined
        for (const method of asArray(opts.method) as string[]) {
          out.push({
            method: String(method).toUpperCase(),
            url: opts.url,
            guards,
            authenticated: guards.some((g) => AUTHENTICATING_KINDS.has(g.kind)),
            permissions,
            hidden: schema?.hide === true,
          })
        }
      }
      return out
    },
  }
}
