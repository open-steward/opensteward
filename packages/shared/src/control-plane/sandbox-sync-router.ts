/**
 * Simulated `/sync` for the sandbox, so a developer's first contact with sync
 * semantics, job polling and `callback_url` validation does not have to
 * happen against a live connection, with real upstream calls and the real
 * 10/hour budget.
 *
 * Mounted per vertical under `/test/v1/{vertical}`, mirroring the live
 * router's contract (`sync-router.ts`): same routes, same envelope, same
 * `SyncJob` shape, same 409 on a job already in flight. What differs is what
 * a sandbox can honestly differ on:
 *
 *   - There is no upstream. "Syncing" regenerates a couple of fresh fixture
 *     rows per resource type (via the injected `simulateUpstream`), so a
 *     poll after completion genuinely sees new data.
 *   - The job walks pending → running → completed over ~2s so polling can be
 *     exercised; `?fast=true` completes synchronously for tests and CI.
 *   - `callback_url` is validated and **stored, never dialed.** Actually
 *     POSTing it would need the network, and the sandbox's no-egress
 *     guarantee (`check:sandbox-egress` walks this file's import graph) does
 *     not bend for convenience. Poll `GET /sync/:id` instead.
 *
 * Auth is the meta-router pattern: leaf `resolveApiKey` (test mode only),
 * the live `features.test_mode_enabled` gate, the shared budget — and the
 * connection id must be the caller's own derived sandbox connection.
 *
 * Jobs are ordinary sandbox rows under the reserved `_sync_jobs` resource
 * type: covered by the tenant quota, wiped by `DELETE /test/v1/reset`, and
 * unreachable from the resource routes (no route names that type).
 */
import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import type { SandboxStore } from '../sandbox/sandbox-store'
import { sandboxConnectionId } from '../sandbox/ids'
import type { SyncJob } from '../data-store/sync-schema'
// Leaf modules only — see the note in sandbox-auth-middleware.ts.
import {
  requireSandboxCredential,
  resolveSandboxCredential,
  type SandboxOauthOptions,
} from './sandbox-credential'
import type { RateLimitConfigSource } from './api-key-middleware'
import { consume, DEFAULT_API_KEY_RATE_LIMIT } from './rate-limit'

/** Reserved sandbox resource type holding the job rows. Not routable. */
export const SANDBOX_SYNC_JOBS_TYPE = '_sync_jobs'

export interface SandboxSyncRouterOptions {
  apiKeys: ApiKeyStore
  /** Accept the deployment's test-issuer tokens as well as test keys. */
  oauth?: SandboxOauthOptions
  store: SandboxStore
  vertical: string
  /**
   * "Pull from upstream": seed a few fresh fixture rows for this tenant and
   * vertical, returning records-synced counts per resource type. Injected so
   * this router needs no knowledge of any vertical's specs.
   */
  simulateUpstream: (tenantId: string) => Promise<Record<string, number>>
  testModeEnabled?: () => boolean
  rateLimit?: RateLimitConfigSource
  /** pending→running and running→completed delays. Overridable for tests. */
  stepDelayMs?: number
  /**
   * Runs after the credential check, so 401 comes before 403. integration-server
   * injects its license gate for this vertical as a VALUE (nothing from
   * licensing is imported here, so this subtree stays egress-free), and the
   * simulated sync answers like the live /v1/{vertical}/sync, which the
   * vertical plugin gates.
   */
  licenseGate?: preHandlerAsyncHookHandler
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * Same intent as the live router's `validateCallbackUrl`, minus the DNS
 * resolution — that helper imports `node:net`, which the sandbox egress gate
 * forbids, and there is nothing to resolve for a URL that is never dialed.
 */
function checkCallbackUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return 'callback_url is not a valid URL.'
  }
  if (url.protocol !== 'https:') return 'callback_url must be https.'
  return null
}

export function createSandboxSyncRouter(opts: SandboxSyncRouterOptions): FastifyPluginAsync {
  const { apiKeys, store, vertical, simulateUpstream } = opts
  const rateLimitSource = opts.rateLimit ?? DEFAULT_API_KEY_RATE_LIMIT
  const stepDelayMs = opts.stepDelayMs ?? 800

  return async (fastify) => {
    // Cleared on close so a shutdown mid-simulation doesn't write into a
    // closed handle. An interrupted job simply stays pending/running —
    // best-effort is the honest contract for an in-process simulator.
    const timers = new Set<NodeJS.Timeout>()
    fastify.addHook('onClose', async () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    })

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
    if (opts.licenseGate) fastify.addHook('preHandler', opts.licenseGate)

    const tenantOf = (request: FastifyRequest): string =>
      (request as unknown as { tenantId: string }).tenantId

    const readJob = (tenantId: string, id: string) =>
      store.get<SyncJob>(tenantId, vertical, SANDBOX_SYNC_JOBS_TYPE, id)

    const writeJob = (tenantId: string, job: SyncJob) =>
      store.upsert(tenantId, vertical, SANDBOX_SYNC_JOBS_TYPE, job.id, job)

    async function completeJob(tenantId: string, jobId: string): Promise<void> {
      const job = await readJob(tenantId, jobId)
      if (!job || job.status === 'completed' || job.status === 'failed') return
      try {
        const counts = await simulateUpstream(tenantId)
        const progress: SyncJob['progress'] = {}
        for (const [resourceType, synced] of Object.entries(counts)) {
          progress[resourceType] = { synced, status: 'completed' }
        }
        await writeJob(tenantId, {
          ...job,
          status: 'completed',
          progress,
          completedAt: nowIso(),
          startedAt: job.startedAt ?? nowIso(),
        })
      } catch (err) {
        // A quota-full tenant is the realistic failure here — surfacing it as
        // a failed job teaches exactly what a live failed sync looks like.
        const message = err instanceof Error ? err.message : 'sync simulation failed'
        await writeJob(tenantId, {
          ...job,
          status: 'failed',
          error: message,
          completedAt: nowIso(),
          startedAt: job.startedAt ?? nowIso(),
        })
      }
    }

    function scheduleLifecycle(tenantId: string, jobId: string): void {
      const start = setTimeout(() => {
        timers.delete(start)
        void (async () => {
          const job = await readJob(tenantId, jobId)
          if (!job || job.status !== 'pending') return
          await writeJob(tenantId, { ...job, status: 'running', startedAt: nowIso() })
        })().catch(() => undefined)
      }, stepDelayMs)
      const finish = setTimeout(() => {
        timers.delete(finish)
        void completeJob(tenantId, jobId).catch(() => undefined)
      }, stepDelayMs * 2)
      start.unref?.()
      finish.unref?.()
      timers.add(start)
      timers.add(finish)
    }

    fastify.post<{
      Querystring: { connection_id?: string; fast?: string }
      Body: { callback_url?: unknown } | null
    }>('/sync', async (request, reply) => {
      const tenantId = tenantOf(request)
      const connectionId = request.query.connection_id
      if (!connectionId) {
        return reply.status(400).send({
          error: { code: 'CONNECTION_ID_REQUIRED', message: '?connection_id=<uuid> is required.' },
        })
      }
      const expected = sandboxConnectionId(tenantId, vertical)
      if (connectionId.toLowerCase() !== expected) {
        return reply.status(404).send({
          error: {
            code: 'CONNECTION_NOT_FOUND',
            message:
              'Not a sandbox connection for your tenant and this vertical. ' +
              'GET /test/v1/connections lists yours.',
          },
        })
      }

      const rawCallback = (request.body as { callback_url?: unknown } | null)?.callback_url
      let callbackUrl: string | null = null
      if (rawCallback !== undefined && rawCallback !== null) {
        if (typeof rawCallback !== 'string') {
          return reply.status(400).send({
            error: { code: 'INVALID_CALLBACK_URL', message: 'callback_url must be a string.' },
          })
        }
        const problem = checkCallbackUrl(rawCallback)
        if (problem) {
          return reply
            .status(400)
            .send({ error: { code: 'INVALID_CALLBACK_URL', message: problem } })
        }
        callbackUrl = rawCallback
      }

      const existing = await store.list<SyncJob>(tenantId, vertical, SANDBOX_SYNC_JOBS_TYPE)
      const active = existing.find(
        (row) => row.data.status === 'pending' || row.data.status === 'running',
      )
      if (active) {
        return reply.status(409).send({
          error: {
            code: 'SYNC_IN_PROGRESS',
            message: `Sync ${active.data.id} is already ${active.data.status} for this connection.`,
          },
          data: active.data,
        })
      }

      const job: SyncJob = {
        id: randomUUID(),
        vertical,
        connectionId: expected,
        platform: 'sandbox',
        tenantId,
        status: 'pending',
        progress: null,
        error: null,
        callbackUrl,
        createdAt: nowIso(),
        startedAt: null,
        completedAt: null,
      }
      await writeJob(tenantId, job)

      // `?fast=true` — complete before responding, for tests and CI scripts
      // that don't want to poll a simulator.
      if (request.query.fast === 'true' || request.query.fast === '1') {
        await completeJob(tenantId, job.id)
        const done = await readJob(tenantId, job.id)
        return reply.status(202).send({ data: done ?? job })
      }

      scheduleLifecycle(tenantId, job.id)
      return reply.status(202).send({ data: job })
    })

    fastify.get<{ Querystring: { connection_id?: string; status?: string; limit?: string } }>(
      '/sync',
      async (request, reply) => {
        const tenantId = tenantOf(request)
        if (!request.query.connection_id) {
          return reply.status(400).send({
            error: {
              code: 'CONNECTION_ID_REQUIRED',
              message: '?connection_id=<uuid> is required.',
            },
          })
        }
        const limit = request.query.limit
          ? Math.min(parseInt(request.query.limit, 10) || 25, 100)
          : 25
        const rows = await store.list<SyncJob>(tenantId, vertical, SANDBOX_SYNC_JOBS_TYPE)
        const jobs = rows
          .map((r) => r.data)
          .filter((j) => (request.query.status ? j.status === request.query.status : true))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, limit)
        return { data: jobs }
      },
    )

    fastify.get<{ Params: { id: string } }>('/sync/:id', async (request, reply) => {
      const tenantId = tenantOf(request)
      const job = await readJob(tenantId, request.params.id)
      // Tenant-scoped read: another tenant's job id answers the same 404 the
      // live router gives for a cross-connection lookup.
      if (!job) {
        return reply.status(404).send({
          error: { code: 'SYNC_NOT_FOUND', message: `No sync job ${request.params.id}.` },
        })
      }
      return { data: job }
    })
  }
}
