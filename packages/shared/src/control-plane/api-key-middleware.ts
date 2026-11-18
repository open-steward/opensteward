/**
 * Tenant-scoped API-key middleware. Reads `Authorization: Bearer <key>`,
 * looks the key up in `ApiKeyStore`, and decorates `request.tenantId` +
 * `request.apiKeyId` for downstream handlers.
 *
 * Used by the developer-facing routes — `/v1/customers/*` and the per-vertical
 * resource routes when no `X-Admin-Secret` is present.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ApiKeyMode, ApiKeyStore } from '../auth/api-keys'
import { hasScope } from '../auth/api-keys'
import { refuseKeyModeMismatch, resolveApiKey } from './api-key-resolver'
import {
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
  type McpEnabledSource,
} from './mcp-guards'

// Defined in leaf modules so the sandbox can import them without the OIDC
// verifier's network reach; re-exported here for convenience.
export { refuseIfMcpClientLacksScope, refuseIfMcpDisabled, refuseIfMcpWrite }
export type { McpEnabledSource }

// Defined in ./api-key-resolver so the sandbox can import them without
// dragging the OIDC verifier's network reach in. Re-exported here for
// callers.
export { refuseKeyModeMismatch, resolveApiKey }
import { consume, DEFAULT_API_KEY_RATE_LIMIT, type RateLimitConfig } from './rate-limit'
import {
  extractBearerToken,
  resolveDeveloperCredential,
  type DeveloperCredentialOptions,
} from './credential-resolver'

// Defined in ./credential-resolver (shared by both credential types);
// re-exported here for callers.
export { extractBearerToken }

/**
 * Static config or a per-request resolver. The resolver form lets the
 * integration-server read live RuntimeSettingsClient values so admin
 * edits to `rate_limit.api_key.per_minute` apply without a restart.
 *
 * The resolver receives the request so it can branch on the key's
 * grant set (e.g. tighter budget for `mcp:read` tokens). The middleware
 * already populates `request.apiKeyScopes` before invoking the
 * resolver, so a typical implementation looks like:
 *
 *   rateLimit: (req) => {
 *     const scopes = (req as any).apiKeyScopes ?? []
 *     const isMcp = scopes.includes('mcp:read')
 *     return {
 *       max: settings.getNumber(isMcp ? 'rate_limit.mcp_tenant.per_minute'
 *                                     : 'rate_limit.api_key.per_minute', 600),
 *       windowMs: settings.getNumber('rate_limit.api_key.window_ms', 60_000),
 *     }
 *   }
 */
export type RateLimitConfigSource = RateLimitConfig | ((request: FastifyRequest) => RateLimitConfig)

export interface ApiKeyMiddlewareOptions extends DeveloperCredentialOptions {
  apiKeys: ApiKeyStore
  /**
   * Which key mode this mount accepts. Defaults to `'live'`, so a route wired
   * with `requireTenantKey` and no explicit mode is live-only — including any
   * route added in future. See `resolveApiKey`.
   */
  mode?: ApiKeyMode
  /** Override the default 600-req/60s per-key bucket. */
  rateLimit?: RateLimitConfigSource
  /**
   * Live read of the `features.mcp_enabled` runtime setting. Omit and MCP
   * access is always allowed — embedders and tests that wire no runtime
   * settings need no MCP gating.
   */
  mcpEnabled?: McpEnabledSource
}

/**
 * Strict variant: rejects unauthenticated requests with 401. Use this on
 * developer-only routes (e.g. `/v1/customers/*`).
 */
export function requireTenantKey(opts: ApiKeyMiddlewareOptions) {
  const expectedMode: ApiKeyMode = opts.mode ?? 'live'
  const rateLimitSource = opts.rateLimit ?? DEFAULT_API_KEY_RATE_LIMIT
  return async function tenantKeyMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Accepts an `osk_` key or an OIDC bearer token, whichever the operator
    // has enabled. Both resolve to the same principal shape, so everything
    // below this line is credential-agnostic.
    const result = await resolveDeveloperCredential(request, reply, opts)
    if (result === false) return // 401/403 already sent
    // The live/test boundary: this resolver owns the lookup, so the mode
    // check must happen here. Without it a sandbox key would be accepted on
    // `/v1/*` — including `/v1/customers*`, `/v1/connections*` and `/v1/events`, which
    // this middleware also guards. An OIDC principal has no mode and is
    // therefore live-only, which is what `undefined` means below.
    if (result && (result.mode ?? 'live') !== expectedMode) {
      await refuseKeyModeMismatch(reply, result.mode ?? 'live', expectedMode)
      return
    }
    if (!result) {
      await reply.status(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authorization: Bearer <api-key> is required.',
        },
      })
      return
    }

    // Populate scopes early so the resolver can branch on them.
    ;(request as unknown as Record<string, unknown>)['apiKeyScopes'] = result.scopes

    const rateLimit =
      typeof rateLimitSource === 'function' ? rateLimitSource(request) : rateLimitSource
    const rl = await consume(result.apiKeyId, rateLimit)
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

    if (await refuseIfMcpClientLacksScope(request, reply, result.scopes)) return
    if (await refuseIfMcpDisabled(reply, result.scopes, opts.mcpEnabled)) return
    if (await refuseIfMcpWrite(request, reply, result.scopes, 'keys')) return

    const r = request as unknown as Record<string, unknown>
    r['tenantId'] = result.tenantId
    r['apiKeyId'] = result.apiKeyId
    r['apiKeyScopes'] = result.scopes
    r['apiKeyMode'] = result.mode ?? 'live'
    r['authMethod'] = result.authMethod
  }
}

/**
 * Returns true if the request's API key carries the required scope. When
 * it does not, sends a 403 and returns false so the caller can `return`
 * immediately. The middleware must have already populated
 * `request.apiKeyScopes`.
 */
export async function assertScope(
  request: FastifyRequest,
  reply: FastifyReply,
  required: string,
): Promise<boolean> {
  const grants = (request as unknown as { apiKeyScopes?: string[] }).apiKeyScopes ?? []
  if (hasScope(grants, required)) return true
  await reply.status(403).send({
    error: {
      code: 'INSUFFICIENT_SCOPE',
      message: `This API key is missing required scope '${required}'.`,
      requiredScope: required,
    },
  })
  return false
}
