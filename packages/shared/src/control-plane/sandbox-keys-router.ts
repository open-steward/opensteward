/**
 * Self-serve sandbox keys: `POST /test/v1/keys`, no authentication.
 *
 * Lets a developer evaluate the API without an operator: absent self-serve,
 * even a zero-risk test key requires admin rights to mint. Gated behind an
 * operator opt-in (`auth.sandbox_self_serve_enabled`, default OFF, read per
 * request).
 *
 * Abuse budget, in order of what actually bounds it:
 *   - every key is minted into a fresh throwaway tenant (`sandbox-<hex>`),
 *     so no self-served key ever shares data with a real tenant;
 *   - the key is `mode: 'test'` — `/v1/*` refuses it outright, and the
 *     sandbox it can reach has no egress and a per-tenant row quota;
 *   - it expires after `keyTtlMs` (default 7 days) via the store's own
 *     expiry enforcement — junk keys clean themselves up;
 *   - minting is IP-rate-limited (default 3/hour) so the endpoint cannot be
 *     used to fill the keys table.
 *
 * Leaf imports only — this router sits in the sandbox's import graph and
 * `check:sandbox-egress` proves it network-free.
 */
import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import { consume, type RateLimitConfig } from './rate-limit'

export interface SandboxKeysRouterOptions {
  apiKeys: ApiKeyStore
  /** Live read of `auth.sandbox_self_serve_enabled`. Absent = disabled. */
  selfServeEnabled?: () => boolean
  /** Live read of `features.test_mode_enabled`. Absent = enabled. */
  testModeEnabled?: () => boolean
  /** Per-IP mint budget. Default 3/hour. */
  rateLimit?: RateLimitConfig
  /** Lifetime of a self-served key. Default 7 days. */
  keyTtlMs?: number
}

const DEFAULT_MINT_RATE_LIMIT: RateLimitConfig = { max: 3, windowMs: 3_600_000 }
const DEFAULT_KEY_TTL_MS = 7 * 24 * 3_600_000

export function createSandboxKeysRouter(opts: SandboxKeysRouterOptions): FastifyPluginAsync {
  const { apiKeys } = opts
  const rateLimit = opts.rateLimit ?? DEFAULT_MINT_RATE_LIMIT
  const keyTtlMs = opts.keyTtlMs ?? DEFAULT_KEY_TTL_MS

  return async (fastify) => {
    fastify.post<{ Body: { label?: unknown } | null }>('/keys', async (request, reply) => {
      if (opts.testModeEnabled && !opts.testModeEnabled()) {
        return reply.status(503).send({
          error: {
            code: 'TEST_MODE_DISABLED',
            message:
              'Test mode is disabled on this deployment. An operator set ' +
              'features.test_mode_enabled = false.',
          },
        })
      }
      if (!opts.selfServeEnabled || !opts.selfServeEnabled()) {
        return reply.status(403).send({
          error: {
            code: 'SANDBOX_SELF_SERVE_DISABLED',
            message:
              'Self-serve sandbox keys are disabled on this deployment. Ask the ' +
              'operator for a test key, or to enable auth.sandbox_self_serve_enabled.',
          },
        })
      }

      const rl = await consume(`sandbox-keys:${request.ip}`, rateLimit)
      if (!rl.ok) {
        const retrySec = Math.ceil(rl.retryAfterMs / 1000)
        reply.header('retry-after', String(retrySec))
        return reply.status(429).send({
          error: {
            code: 'RATE_LIMITED',
            message: `Sandbox key minting is rate-limited — retry in ${retrySec}s.`,
          },
        })
      }

      const rawLabel = (request.body as { label?: unknown } | null)?.label
      const label =
        typeof rawLabel === 'string' && rawLabel.trim().length > 0
          ? rawLabel.trim().slice(0, 200)
          : 'self-serve sandbox'

      // A fresh tenant per key: nothing to guess, nothing shared, and the
      // deterministic sandbox connection ids derive per tenant so two
      // evaluators never see each other's writes.
      const tenantId = `sandbox-${randomUUID().slice(0, 8)}`
      const minted = await apiKeys.mint({
        tenantId,
        label,
        scopes: ['*'],
        mode: 'test',
        expiresAt: Date.now() + keyTtlMs,
      })

      return reply.status(201).send({
        data: {
          ...minted,
          next: 'GET /test/v1/connections with this key lists your sandbox connection ids.',
        },
      })
    })
  }
}
