/**
 * createSyncRouter — mounts `/sync` routes inside any vertical plugin.
 *
 * Routes (mounted under whatever prefix the host plugin uses, e.g.
 * `/v1/accounting`):
 *   POST   /sync?connection_id=…  body: { callback_url? } → 202 SyncJob
 *   GET    /sync?connection_id=…&status=…&limit=…       → SyncJob[]
 *   GET    /sync/:id                                     → SyncJob
 *
 * Auth: relies on the host plugin's `authMiddleware` preHandler — every
 * call must carry `?connection_id=` so the middleware can verify the
 * caller's tenant owns the connection.
 *
 * Mode: only mount this router when `dataStore.mode !== 'passthrough'`.
 * In passthrough mode, attempting any sync route returns 503
 * `DATA_STORE_DISABLED` via the host plugin (route is simply not present).
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { hasScope } from '../auth/api-keys'
import { validateCallbackUrl } from './callback-url'
import { CreateSyncJobBodySchema } from './sync-schema'
import type { SyncStore } from './sync-store'
import { consume, type RateLimitConfig } from '../control-plane/rate-limit'

export interface CreateSyncRouterOptions {
  vertical: string
  syncStore: SyncStore
  /**
   * Rate-limit cap on POST `/sync` per API key. Defaults to 10/hour
   * which is plenty for periodic warm-ups and prevents a malicious key
   * from enqueueing thousands of jobs on the existing 600/60s read
   * bucket. Pass an explicit value to override.
   */
  syncRateLimit?: RateLimitConfig
}

const DEFAULT_SYNC_RATE_LIMIT: RateLimitConfig = {
  max: 10,
  windowMs: 60 * 60_000, // 1 hour
}

interface SyncRequest extends FastifyRequest {
  connectionId?: string
  platform?: string
  tenantId?: string
  apiKeyId?: string
}

export function createSyncRouter(opts: CreateSyncRouterOptions): FastifyPluginAsync {
  const { vertical, syncStore } = opts
  const syncRateLimit = opts.syncRateLimit ?? DEFAULT_SYNC_RATE_LIMIT

  return async (fastify) => {
    // `readSafe`: a sync is a POST because it enqueues a job, not because it
    // changes anything on the platform — the worker only lists upstream
    // resources, and upserts them locally and removes cached rows the
    // platform no longer returns. Without this it would demand
    // `vertical:write`, which the recommended API-key preset omits by design,
    // so a read-only key could read a vertical's data but never refresh it.
    // (So a read-only key can make a sync remove cached rows other consumers
    // were reading — never anything upstream. See docs/dev-api.md §7.)
    fastify.post('/sync', { config: { readSafe: true } }, async (request, reply) => {
      const r = request as SyncRequest
      if (!r.connectionId || !r.platform) {
        return reply.status(400).send({
          error: { code: 'CONNECTION_ID_REQUIRED', message: '?connection_id=<uuid> is required.' },
        })
      }

      // Tighter rate-limit cap on /sync than the general 600/60s read
      // bucket — defends against accidental + malicious enqueue floods.
      // Keyed by `${vertical}:sync:${apiKeyId}` so the cap is per-key
      // per-vertical (sync to crm doesn't burn the accounting budget).
      if (r.apiKeyId) {
        const rl = await consume(`${vertical}:sync:${r.apiKeyId}`, syncRateLimit)
        if (!rl.ok) {
          const retrySec = Math.ceil(rl.retryAfterMs / 1000)
          reply.header('retry-after', String(retrySec))
          reply.header('x-ratelimit-limit', String(rl.limit))
          reply.header('x-ratelimit-remaining', '0')
          return reply.status(429).send({
            error: {
              code: 'SYNC_RATE_LIMITED',
              message: `Sync rate limit (${syncRateLimit.max}/${syncRateLimit.windowMs}ms) exceeded — retry in ${retrySec}s.`,
            },
          })
        }
      }

      const parsed = CreateSyncJobBodySchema.safeParse({
        connection_id: r.connectionId,
        ...(typeof request.body === 'object' && request.body !== null ? request.body : {}),
      })
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'INVALID_BODY', message: parsed.error.message } })
      }

      // `callback_url` makes the deployment issue an outbound POST of its own,
      // which is a different authority from "refresh my cache": the request
      // leaves from inside the network. Two gates on it, and neither is
      // weakened by sync being read-safe.
      //
      //   1. It stays behind `vertical:write`. A read-only key can sync; it
      //      cannot make us call an address of its choosing.
      //   2. The URL is validated here, so a bad one is a clear 400 rather than
      //      a silent failure in a background job. `callback.ts` re-validates
      //      and re-resolves immediately before the request, because a name can
      //      resolve somewhere else by the time the job runs.
      if (parsed.data.callback_url) {
        const grants = (request as unknown as { apiKeyScopes?: string[] }).apiKeyScopes
        // `grants` is undefined for admin-secret traffic, which bypasses scopes.
        if (grants && !hasScope(grants, 'vertical:write')) {
          return reply.status(403).send({
            error: {
              code: 'INSUFFICIENT_SCOPE',
              message:
                "'vertical:write' scope required to supply a callback_url; a sync without one needs only read access.",
              requiredScope: 'vertical:write',
            },
          })
        }
        // https only. `validateCallbackUrl` can permit plaintext, but nothing
        // in this deployment sets that — an option no caller passes is the
        // shape of knob `check:secret-passthrough` exists to catch, so it is
        // not exposed here until an operator actually needs it.
        const checked = validateCallbackUrl(parsed.data.callback_url)
        if (!checked.ok) {
          return reply.status(400).send({
            error: { code: 'INVALID_CALLBACK_URL', message: checked.reason },
          })
        }
      }

      const { job, created } = await syncStore.createIfIdle({
        vertical,
        connectionId: r.connectionId,
        platform: r.platform,
        tenantId: r.tenantId ?? null,
        callbackUrl: parsed.data.callback_url ?? null,
        origin: 'api',
      })
      if (!created) {
        return reply.status(409).send({
          error: {
            code: 'SYNC_IN_PROGRESS',
            message: `Sync ${job.id} is already ${job.status} for this connection.`,
          },
          data: job,
        })
      }
      return reply.status(202).send({ data: job })
    })

    fastify.get<{ Querystring: { status?: string; limit?: string } }>(
      '/sync',
      async (request, reply) => {
        const r = request as SyncRequest
        if (!r.connectionId) {
          return reply.status(400).send({
            error: {
              code: 'CONNECTION_ID_REQUIRED',
              message: '?connection_id=<uuid> is required.',
            },
          })
        }
        // A bad value collapses to the SAME default an omitted parameter
        // gets — Part A's own stated rule. Without the `|| 25`,
        // `parseInt('abc')` is `NaN`, `Math.min(NaN, 100)` is `NaN`, and the
        // store's `Number.isInteger` clamp then substituted ITS default of
        // 50: `?limit=abc` returned 50 rows where an omitted `limit` returns
        // 25. Both are under this route's 100 cap so nothing was unsafe, but
        // the two defaults must not disagree.
        const rawLimit = parseInt(request.query.limit ?? '', 10)
        const limit = Math.min(Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : 25, 100)
        const jobs = await syncStore.list({
          vertical,
          connectionId: r.connectionId,
          status: request.query.status,
          limit,
        })
        return { data: jobs }
      },
    )

    fastify.get<{ Params: { id: string } }>('/sync/:id', async (request, reply) => {
      const r = request as SyncRequest
      const job = await syncStore.get(request.params.id)
      if (!job || job.vertical !== vertical) {
        return reply.status(404).send({
          error: { code: 'SYNC_NOT_FOUND', message: `No sync job ${request.params.id}.` },
        })
      }
      // Cross-connection lookup leaks job ids — return 404 for jobs not owned by this caller.
      if (r.connectionId && job.connectionId !== r.connectionId) {
        return reply.status(404).send({
          error: { code: 'SYNC_NOT_FOUND', message: `No sync job ${request.params.id}.` },
        })
      }
      return { data: job }
    })
  }
}
