/**
 * Auth for the `/test/v1/{vertical}/*` sandbox.
 *
 * Structurally the third principal type feeding the same vertical plugins, after
 * the tenant key (`auth-middleware.ts`) and the end-user token
 * (`end-user-auth-middleware.ts`) — modelled on the latter, which is the
 * existing precedent for "same plugins, different preHandler".
 *
 * What makes this one different is what it does NOT do. It never calls
 * `CredentialStore.loadById`, never calls `UnifiedAdapterRegistry.get`, and
 * never runs a token refresh. There is no credential to decrypt and no upstream
 * to reach, so a test key cannot touch live data through this path by
 * construction rather than by a check that could be got wrong. The egress
 * guarantee rests on that absence; everything else is defence in depth.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
// From the leaf modules, NOT from `api-key-middleware` / `auth-middleware` /
// `credential-resolver`. Those reach `oidc-verifier` → `safe-fetch` for JWKS;
// `check:sandbox-egress` walks the import graph rather than the call graph,
// so importing them would fail the sandbox's no-egress property. The OIDC
// path here needs no fetch: the only issuer it verifies is the deployment's
// own test issuer, whose key is in memory, and the claims→principal half of
// the verifier lives in `oauth-authority` precisely so it can be shared.
import {
  requireSandboxCredential,
  resolveSandboxCredential,
  type SandboxOauthOptions,
  type SandboxPrincipal,
} from './sandbox-credential'
import type { RateLimitConfigSource } from './api-key-middleware'
import {
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
  type McpEnabledSource,
} from './mcp-guards'
import { assertVerticalScopes } from './vertical-scopes'
import { consume, DEFAULT_API_KEY_RATE_LIMIT } from './rate-limit'
import { isSandboxConnectionId } from '../sandbox/ids'
import { isValidUuid } from '../util/uuid'
import { DEFAULT_TENANT } from './tenant-domains'

/** Resolves an adapter for the caller's tenant. Injected so `shared` need not
 *  know about the integration-server's per-vertical manifests. */
export type SandboxAdapterFactory = (vertical: string, tenantId: string) => unknown

export interface SandboxAuthOptions {
  apiKeys: ApiKeyStore
  vertical: string
  adapterFor: SandboxAdapterFactory
  /**
   * Live read of `features.test_mode_enabled`.
   *
   * Read PER REQUEST, not once at mount. The end-user mount gates at
   * registration time, which is why flipping that flag 404s and needs a
   * restart. The setting for this feature promises a 503 within one settings
   * poll, so honour that.
   */
  testModeEnabled?: () => boolean
  rateLimit?: RateLimitConfigSource
  mcpEnabled?: McpEnabledSource
  /**
   * Accept tokens from the deployment's own test issuer (`/test/oidc`) as
   * well as test keys. Omit and a JWT is refused as OAUTH_DISABLED. `enabled`
   * is the same `auth.dev_oauth_enabled` read `/v1/*` uses, so the two
   * surfaces switch together — an operator turning OIDC off turns it off
   * everywhere, and turning keys off on `/v1/*` still leaves test keys here.
   */
  oauth?: SandboxOauthOptions
}

export function createSandboxAuthMiddleware(opts: SandboxAuthOptions) {
  const { apiKeys, vertical, adapterFor } = opts
  const rateLimitSource = opts.rateLimit ?? DEFAULT_API_KEY_RATE_LIMIT

  return async function sandboxAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (opts.testModeEnabled && !opts.testModeEnabled()) {
      await reply.status(503).send({
        error: {
          code: 'TEST_MODE_DISABLED',
          message:
            'Test mode is disabled on this deployment. An operator set ' +
            'features.test_mode_enabled = false.',
        },
      })
      return
    }

    // Key or test-issuer token — see sandbox-credential.ts. A live key or a
    // real IdP's token is refused there; only test credentials reach here.
    const result: SandboxPrincipal | null | false = await resolveSandboxCredential(
      request,
      reply,
      apiKeys,
      opts.oauth,
    )
    if (result === false) return // 401/403 already sent
    if (!result) {
      await requireSandboxCredential(reply)
      return
    }

    // Host-tenant cross-check, mirroring the live middleware. Easy to omit, and
    // omitting it would let a test key work on another tenant's custom domain.
    const hostTenant = (request as unknown as { hostTenantId?: string }).hostTenantId
    if (hostTenant && hostTenant !== DEFAULT_TENANT && hostTenant !== result.tenantId) {
      await reply.status(403).send({
        error: {
          code: 'TENANT_MISMATCH',
          message: 'This API key is scoped to a different tenant than the domain it was used on.',
        },
      })
      return
    }

    // Scopes before the rate-limit resolver runs, so the resolver can read them
    // — same ordering rationale as the live middlewares.
    const r = request as unknown as Record<string, unknown>
    r['apiKeyScopes'] = result.scopes

    const rateLimit =
      typeof rateLimitSource === 'function' ? rateLimitSource(request) : rateLimitSource
    const rl = await consume(result.apiKeyId, rateLimit)
    if (!rl.ok) {
      const retrySec = Math.ceil(rl.retryAfterMs / 1000)
      reply.header('retry-after', String(retrySec))
      reply.header('x-ratelimit-limit', String(rl.limit))
      reply.header('x-ratelimit-remaining', '0')
      await reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: `Rate limit exceeded — retry in ${retrySec}s.` },
      })
      return
    }
    reply.header('x-ratelimit-limit', String(rl.limit))
    reply.header('x-ratelimit-remaining', String(rl.remaining))

    // The MCP guards apply here exactly as they do live: an agent pointed at
    // the sandbox is still an agent, and the kill switch must still reach it.
    if (await refuseIfMcpClientLacksScope(request, reply, result.scopes)) return
    if (await refuseIfMcpDisabled(reply, result.scopes, opts.mcpEnabled)) return
    if (await refuseIfMcpWrite(request, reply, result.scopes, 'keys')) return

    const query = (request.query as Record<string, string | undefined>) ?? {}
    const connectionId = query['connection_id']
    if (!connectionId) {
      await reply.status(400).send({
        error: {
          code: 'CONNECTION_ID_REQUIRED',
          message: '?connection_id=<uuid> is required. GET /test/v1/connections lists yours.',
        },
      })
      return
    }
    if (!isValidUuid(connectionId)) {
      await reply.status(400).send({
        error: { code: 'CONNECTION_ID_INVALID', message: '?connection_id= must be a UUID.' },
      })
      return
    }
    // A whitelist, not a blacklist: the one id this tenant may use for this
    // vertical is recomputed from the verified key. A live connection UUID
    // cannot match, and neither can another tenant's sandbox id.
    if (!isSandboxConnectionId(connectionId, result.tenantId, vertical)) {
      await reply.status(403).send({
        error: {
          code: 'CONNECTION_FORBIDDEN',
          message: `Connection ${connectionId} is not this tenant's ${vertical} sandbox connection.`,
        },
      })
      return
    }

    if (!(await assertVerticalScopes(request, reply, vertical, '/test/v1'))) return

    r['tenantId'] = result.tenantId
    r['apiKeyId'] = result.apiKeyId
    r['apiKeyMode'] = result.mode
    r['connectionId'] = connectionId
    r['vertical'] = vertical
    // `bind()` in cached-router-helpers forces passthrough and discards context
    // when vertical/platform/connectionId are not all set, so all three matter.
    r['platform'] = 'sandbox'
    r['adapter'] = adapterFor(vertical, result.tenantId)
    // Shaped like a real Credentials so a router destructuring it works, but
    // it authenticates nothing — no upstream call is ever made with it.
    r['credentials'] = { accessToken: 'sandbox', tenantId: result.tenantId }
  }
}
