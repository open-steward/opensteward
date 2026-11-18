/**
 * The two sandbox routes that are not a vertical resource:
 * `GET /test/v1/connections` and `DELETE /test/v1/reset`.
 *
 * Connections are derived rather than stored, so listing them is a computation,
 * not a query — which is exactly why a fresh test key can call the API with no
 * seeding step. This route exists so a developer can discover the ids without
 * having to know the derivation.
 */
import type { FastifyPluginAsync } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import type { SandboxStore } from '../sandbox/sandbox-store'
import { sandboxConnectionIds } from '../sandbox/ids'
// Leaf modules — see the note in sandbox-auth-middleware.ts.
import {
  requireSandboxCredential,
  resolveSandboxCredential,
  type SandboxOauthOptions,
} from './sandbox-credential'
import type { RateLimitConfigSource } from './api-key-middleware'
import { consume, DEFAULT_API_KEY_RATE_LIMIT } from './rate-limit'

export interface SandboxMetaRouterOptions {
  apiKeys: ApiKeyStore
  /** Accept the deployment's test-issuer tokens as well as test keys. */
  oauth?: SandboxOauthOptions
  store: SandboxStore
  /** Verticals with a sandbox mount, in the order they should be listed. */
  verticals: readonly string[]
  testModeEnabled?: () => boolean
  rateLimit?: RateLimitConfigSource
}

export function createSandboxMetaRouter(opts: SandboxMetaRouterOptions): FastifyPluginAsync {
  const { apiKeys, store, verticals } = opts
  const rateLimitSource = opts.rateLimit ?? DEFAULT_API_KEY_RATE_LIMIT

  return async (fastify) => {
    // A trimmed sibling of the vertical sandbox middleware: same mode gate,
    // same key check, same budget — but no `connection_id`, because these two
    // routes are what you call to find out what it should be.
    fastify.addHook('preHandler', async (request, reply) => {
      if (opts.testModeEnabled && !opts.testModeEnabled()) {
        await reply.status(503).send({
          error: {
            code: 'TEST_MODE_DISABLED',
            message:
              'Test mode is disabled on this deployment. An operator set ' +
              'features.test_mode_enabled = false.',
          },
        })
        return reply
      }
      // Test key or test-issuer token — see sandbox-credential.ts.
      const result = await resolveSandboxCredential(request, reply, apiKeys, opts.oauth)
      if (result === false) return reply
      if (!result) {
        await requireSandboxCredential(reply)
        return reply
      }
      const rateLimit =
        typeof rateLimitSource === 'function' ? rateLimitSource(request) : rateLimitSource
      const rl = await consume(result.apiKeyId, rateLimit)
      if (!rl.ok) {
        const retrySec = Math.ceil(rl.retryAfterMs / 1000)
        reply.header('retry-after', String(retrySec))
        await reply.status(429).send({
          error: { code: 'RATE_LIMITED', message: `Rate limit exceeded — retry in ${retrySec}s.` },
        })
        return reply
      }
      ;(request as unknown as Record<string, unknown>)['tenantId'] = result.tenantId
      return
    })

    fastify.get('/connections', async (request) => {
      const tenantId = (request as unknown as { tenantId: string }).tenantId
      // Shaped like `/v1/connections` so the same client code reads both.
      const data = sandboxConnectionIds(tenantId, verticals).map((row) => ({
        id: row.connectionId,
        vertical: row.vertical,
        platform: 'sandbox',
        label: `${row.vertical} sandbox`,
        tenantId,
      }))
      return { data, meta: { total: data.length } }
    })

    fastify.delete('/reset', async (request) => {
      const tenantId = (request as unknown as { tenantId: string }).tenantId
      // Only this tenant's own sandbox rows are reachable — the tenant comes
      // from the verified key, never from the request.
      const deleted = await store.resetTenant(tenantId)
      return { data: { deleted } }
    })
  }
}
