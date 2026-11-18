/**
 * Unified auth middleware. Reads `?connection_id=`, looks up the row in the
 * shared CredentialStore (across every vertical), and decorates the request
 * with `adapter`, `credentials`, `connectionId`, `vertical`, and `platform`.
 *
 * One middleware serves every vertical.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'
import type { ApiKeyMode, ApiKeyStore } from '../auth/api-keys'
import type { ConnectSessionStore } from '../auth/connect-sessions'
import type { CredentialStore } from '../auth/store'
import {
  assertVerticalScopes,
  requiresWriteScope,
  type ConnectionWriteGuard,
} from './vertical-scopes'

// Defined in ./vertical-scopes so the sandbox can import it without the
// OIDC verifier's network reach; re-exported here for callers.
export { assertVerticalScopes, requiresWriteScope }
import {
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
  refuseKeyModeMismatch,
} from './api-key-middleware'
import type { McpEnabledSource } from './api-key-middleware'
import { isTokenExpired } from '../auth/oauth'
import { withRefreshLock } from '../auth/refresh-lock'
import { refreshWithRotationGuard } from '../auth/refresh-runner'
import { safeStrEqual } from '../util/safe-equal'
import { isValidUuid } from '../util/uuid'
import { resolveDeveloperCredential } from './credential-resolver'
import type { DeveloperCredentialOptions } from './credential-resolver'
import { consume, DEFAULT_API_KEY_RATE_LIMIT } from './rate-limit'
import { DEFAULT_TENANT } from './tenant-domains'

// NOTE: no `declare module 'fastify'` here. Per-vertical apps already augment
// FastifyRequest with their own narrowly-typed adapter; merging a second
// open-ended `adapter?: BaseAdapter` would widen the union and break those
// apps. The unified service in `apps/integration-server/` declares its own
// augmentation matching the unified-registry types it actually uses.

export interface UnifiedAuthOptions {
  store: CredentialStore
  registry: UnifiedAdapterRegistry
  /**
   * Optional. When supplied, requests carrying `Authorization: Bearer <key>`
   * are accepted and the resolved tenant must own the requested
   * `connection_id` (linkage via connect_sessions). When the key store is
   * omitted, only `X-Admin-Secret`-scoped traffic reaches the middleware.
   */
  apiKeys?: ApiKeyStore
  /**
   * Accept OIDC bearer tokens as well as `osk_` keys, when the operator has
   * configured an issuer. Both resolve to the same principal, so the tenant
   * linkage, host cross-check and scope rules below are identical either way.
   */
  oauth?: DeveloperCredentialOptions['oauth']
  /** Live read of `auth.dev_api_keys_enabled`. Omit and keys stay enabled. */
  apiKeysEnabled?: DeveloperCredentialOptions['apiKeysEnabled']
  /** Live read of `auth.dev_oauth_enabled`. Omit and OAuth stays disabled. */
  oauthEnabled?: DeveloperCredentialOptions['oauthEnabled']
  /** Required when `apiKeys` is set; used to resolve connection ↔ tenant linkage. */
  sessions?: ConnectSessionStore
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
  /**
   * Key mode this mount accepts. Defaults to `'live'`; the `/test/v1/*`
   * sandbox mount passes `'test'`. See `resolveApiKey`.
   */
  mode?: ApiKeyMode
  /**
   * License (integration-server): refuses writes on connections beyond the
   * limit. Runs for every caller, `X-Admin-Secret` included, before the adapter
   * lookup. Reads and read-safe routes are never asked.
   */
  connectionWriteGuard?: ConnectionWriteGuard
}

export function createUnifiedAuthMiddleware(opts: UnifiedAuthOptions) {
  const { store, registry, apiKeys, sessions } = opts
  const keyMode: ApiKeyMode = opts.mode ?? 'live'
  const adminSecret = process.env['ADMIN_SECRET']

  return async function unifiedAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = (request.query as Record<string, string | undefined>) ?? {}
    const connectionId = query['connection_id']
    if (!connectionId) {
      await reply.status(400).send({
        error: { code: 'CONNECTION_ID_REQUIRED', message: '?connection_id=<uuid> is required.' },
      })
      return
    }
    if (!isValidUuid(connectionId)) {
      await reply.status(400).send({
        error: {
          code: 'CONNECTION_ID_INVALID',
          message: '?connection_id= must be a UUID.',
        },
      })
      return
    }

    // Tenant resolved from the request's Host header (custom-domain map). When
    // the host maps to a real (non-default) tenant, the request is "host
    // scoped": its connection — and any API key — must belong to that tenant.
    // Unknown/unconfigured hosts resolve to DEFAULT_TENANT and impose no host
    // constraint, so single-tenant deployments are unaffected.
    const hostTenant = (request as unknown as { hostTenantId?: string }).hostTenantId
    const hostScoped = !!hostTenant && hostTenant !== DEFAULT_TENANT

    // Auth: when an `apiKeys` store is provided, accept either a matching
    // `X-Admin-Secret` (operator bypass) or a tenant-scoped Bearer key whose
    // tenant owns the requested connection. When `apiKeys` is omitted, or
    // `ADMIN_SECRET` is unset in non-production, fall through
    // unauthenticated (dev convenience).
    const adminHeader = request.headers['x-admin-secret']
    const isAdmin =
      typeof adminHeader === 'string' && !!adminSecret && safeStrEqual(adminHeader, adminSecret)
    if (!isAdmin && apiKeys && sessions) {
      const result = await resolveDeveloperCredential(request, reply, {
        apiKeys,
        oauth: opts.oauth,
        apiKeysEnabled: opts.apiKeysEnabled,
        oauthEnabled: opts.oauthEnabled,
      })
      if (result === false) return
      // The live/test boundary. `resolveDeveloperCredential` has no mode
      // concept of its own, so the mode check is enforced here — otherwise
      // the sandbox mount would accept a live key and `/v1/*` a sandbox one.
      // An OIDC principal carries no mode and is live-only.
      if (result && (result.mode ?? 'live') !== keyMode) {
        await refuseKeyModeMismatch(reply, result.mode ?? 'live', keyMode)
        return
      }
      if (!result) {
        const devOpen = !adminSecret && process.env['NODE_ENV'] !== 'production'
        if (!devOpen) {
          await reply.status(401).send({
            error: {
              code: 'UNAUTHENTICATED',
              message:
                'Authorization: Bearer <api-key or OIDC token> or X-Admin-Secret header is required.',
            },
          })
          return
        }
      } else {
        // Cross-check: a tenant-scoped key used on another tenant's custom
        // domain is rejected. (host=default imposes nothing → defers to the key.)
        if (hostScoped && hostTenant !== result.tenantId) {
          await reply.status(403).send({
            error: {
              code: 'TENANT_MISMATCH',
              message: `This API key is scoped to a different tenant than the domain it was used on.`,
            },
          })
          return
        }
        // Two ways a tenant comes to own a connection: a customer finished a
        // Connect Link (a consumed session links the two), or an operator /
        // API caller created it headlessly with `POST /auth/:v/:p/connect`,
        // which records the tenant as the row's owner and writes no session.
        // Checking only the first refused every headless connection to the
        // very tenant it was minted for — only the admin secret could use it.
        const owned =
          (await sessions.connectionBelongsToTenant(connectionId, result.tenantId)) ||
          (await store.getRow(connectionId))?.ownerTenantId === result.tenantId
        if (!owned) {
          await reply.status(403).send({
            error: {
              code: 'CONNECTION_FORBIDDEN',
              message: `Connection ${connectionId} is not owned by your tenant.`,
            },
          })
          return
        }

        const rl = await consume(result.apiKeyId, DEFAULT_API_KEY_RATE_LIMIT)
        if (!rl.ok) {
          const retrySec = Math.ceil(rl.retryAfterMs / 1000)
          reply.header('retry-after', String(retrySec))
          reply.header('x-ratelimit-limit', String(rl.limit))
          reply.header('x-ratelimit-remaining', '0')
          await reply.status(429).send({
            error: {
              code: 'RATE_LIMITED',
              message: `Rate limit exceeded — retry in ${retrySec}s.`,
            },
          })
          return
        }
        reply.header('x-ratelimit-limit', String(rl.limit))
        reply.header('x-ratelimit-remaining', String(rl.remaining))

        // MCP guards run here, before the vertical is known: neither depends
        // on it, and both should refuse as early as the other middlewares do.
        // The read-only check enforces the documented contract for
        // `/v1/{vertical}/*`; the two-axis scope check and the mint guard
        // alone would not stop every write on this path.
        if (await refuseIfMcpClientLacksScope(request, reply, result.scopes)) return
        if (await refuseIfMcpDisabled(reply, result.scopes, opts.mcpEnabled)) return
        if (await refuseIfMcpWrite(request, reply, result.scopes, 'keys')) return

        // Defer the scope check until after the connection row resolves so
        // we can check `vertical:<vertical>` against the actual vertical.
        const r0 = request as unknown as Record<string, unknown>
        r0['tenantId'] = result.tenantId
        r0['apiKeyId'] = result.apiKeyId
        r0['apiKeyScopes'] = result.scopes
        r0['authMethod'] = result.authMethod
      }
    }

    const row = await store.getRow(connectionId)
    if (!row) {
      await reply.status(404).send({
        error: { code: 'CONNECTION_NOT_FOUND', message: `No connection with id ${connectionId}.` },
      })
      return
    }

    // Host-scoped isolation (defence in depth, and the only tenant check on the
    // admin-secret path): on a tenant's custom domain, the connection must be
    // owned by that tenant. Only enforced when the row actually carries an
    // owner — unowned rows (owner_tenant_id NULL) are covered by the API-key
    // linkage check above.
    if (hostScoped && row.ownerTenantId && row.ownerTenantId !== hostTenant) {
      await reply.status(403).send({
        error: {
          code: 'TENANT_MISMATCH',
          message: `Connection ${connectionId} is not owned by the tenant for this domain.`,
        },
      })
      return
    }

    const vertical = row.vertical
    if (!vertical) {
      await reply.status(500).send({
        error: {
          code: 'CONNECTION_VERTICAL_MISSING',
          message:
            'Connection row is missing a `vertical` value; the row cannot be routed to an adapter.',
        },
      })
      return
    }

    // Now that we know the vertical, enforce two-axis scope on dev-key
    // traffic. Admin-secret traffic (`isAdmin`) bypassed scope checks above.
    //
    //   Touch axis (must satisfy for any request):
    //     `*` OR `vertical:<v>` OR `vertical:read` OR `vertical:write`
    //   Verb axis (must additionally satisfy for non-GET):
    //     `*` OR `vertical:write`
    //
    // The verb axis exists so a key minted with `vertical:read` (or with
    // per-vertical scopes only) can read upstream data without being able
    // to push writes back — important for self-hosted deployments where
    // accounting / CRM mutations carry regulatory weight.
    if (!isAdmin && apiKeys && sessions) {
      if (!(await assertVerticalScopes(request, reply, vertical))) return
    }

    // License write gate (P6). Deliberately outside `!isAdmin`: the admin
    // secret does not lift a read-only connection back over the limit.
    if (
      opts.connectionWriteGuard &&
      requiresWriteScope(
        request.method,
        request.routeOptions?.config as { readSafe?: unknown } | undefined,
      )
    ) {
      const refusal = await opts.connectionWriteGuard(connectionId)
      if (refusal) {
        await reply.status(403).send({ error: refusal })
        return
      }
    }

    const adapter = registry.get(vertical, row.platform)
    if (!adapter) {
      // 404, matching every other ADAPTER_UNAVAILABLE emission (connect-router,
      // auth-router, end-user-auth-middleware). This one returned 400, so the
      // same code meant "you sent something wrong" here and "this does not
      // exist" everywhere else — a client branching on the status got opposite
      // answers for the identical condition. The adapter not being enabled is
      // a property of the deployment, never of the caller's request.
      await reply.status(404).send({
        error: {
          code: 'ADAPTER_UNAVAILABLE',
          message: `Adapter '${vertical}:${row.platform}' is not enabled.`,
        },
      })
      return
    }

    let credentials = await store.loadById(connectionId)
    if (!credentials) {
      await reply.status(401).send({
        error: { code: 'NOT_CONNECTED', message: `Credentials missing for ${connectionId}.` },
      })
      return
    }

    if (isTokenExpired(credentials.expiresAt) && adapter.refreshCredentials) {
      try {
        await withRefreshLock(connectionId, async () => {
          const { outcome, credentials: fresh } = await refreshWithRotationGuard(
            store,
            connectionId,
            credentials!,
            (creds) => adapter.refreshCredentials!(creds),
          )
          // Throw on hard/transient failure so the outer catch returns 401 —
          // and so concurrent in-process waiters on this lock reject too.
          if (outcome !== 'ok') throw new Error(`token refresh ${outcome}`)
          credentials = fresh
        })
        // Re-load after refresh in case the lock-holder did the work.
        credentials = (await store.loadById(connectionId)) ?? credentials
      } catch {
        await reply.status(401).send({
          error: {
            code: 'TOKEN_REFRESH_FAILED',
            message: `Token refresh failed. Re-authenticate at /auth/${vertical}/${row.platform}/connect.`,
          },
        })
        return
      }
    }

    // Use index assignment so this file doesn't depend on a particular
    // augmentation of FastifyRequest. Apps that mount this middleware
    // declare their own typed accessors.
    const r = request as unknown as Record<string, unknown>
    r['adapter'] = adapter
    r['credentials'] = credentials
    r['connectionId'] = connectionId
    r['vertical'] = vertical
    r['platform'] = row.platform
  }
}
