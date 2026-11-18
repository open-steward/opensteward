/**
 * Admin-only cross-vertical sync-jobs index. Mirrors the per-vertical
 * `/v1/{vertical}/sync` shape but lets the admin UI list / trigger /
 * cancel jobs across every vertical without going through a
 * tenant-scoped Bearer key.
 *
 * Routes:
 *   GET  /admin/sync-jobs            — list jobs (filter by vertical, connection_id, status, limit)
 *   GET  /admin/sync-jobs/:id        — single job
 *   POST /admin/sync-jobs            — enqueue a job (body: { vertical, connection_id, callback_url? })
 *   POST /admin/sync-jobs/:id/cancel — mark a pending/running job failed (best-effort; running workers see the status flip on next progress write)
 *
 * Auth: `X-Admin-Secret` (via `adminGuard`).
 */
import type { FastifyPluginAsync } from 'fastify'
import { adminGuard } from '../control-plane/admin-guard'
import type { CredentialStore } from '../auth/store'
import type { SyncStore, SyncListFilter } from './sync-store'
import type { SyncJob } from './sync-schema'
// Last-wins collapse of a repeated query key. Lived here as a private
// three-liner until `webhook-subs-admin-router.ts` needed the same rule to
// close a live 500 on its own deliveries route; a second caller is where it
// moves rather than gets copied.
import { one } from '../util/query-params'

export interface CreateAdminSyncRouterOptions {
  syncStore: SyncStore
  /** Used to look up the connection's vertical/platform/tenant when an
   *  admin enqueues a sync. */
  credentialStore: CredentialStore
}

export function createAdminSyncRouter(opts: CreateAdminSyncRouterOptions): FastifyPluginAsync {
  const { syncStore, credentialStore } = opts

  return async (fastify) => {
    fastify.get<{
      Querystring: {
        vertical?: string | string[]
        connection_id?: string | string[]
        status?: string | string[]
        limit?: string | string[]
        // Additive-optional. Existing callers (admin-api's `/api/sync-jobs`
        // before this task, and anything else holding an X-Admin-Secret) send
        // only the four above and are unaffected: `meta` joins `data` in the
        // response rather than replacing it.
        //
        // Bare names, no `f_`-prefixed wire form — this is an internal
        // X-Admin-Secret surface, not the admin app's own `?f_<key>=` URL
        // convention. Only admin-api's OWN route maps the admin app's `f_<key>`
        // params onto these, the same split `/admin/end-users` and
        // `/admin/webhook-subscriptions/:id/deliveries` already use.
        offset?: string | string[]
        platform?: string | string[]
        tenant_id?: string | string[]
        id?: string | string[]
        connection_id_contains?: string | string[]
        sort?: string | string[]
        dir?: string | string[]
      }
    }>('/admin/sync-jobs', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const q = request.query
      // One filter object for BOTH calls: the page and its total must be
      // computed over the same predicate, or the pagination lies.
      const filter: SyncListFilter = {
        vertical: one(q.vertical),
        platform: one(q.platform),
        connectionId: one(q.connection_id),
        connectionIdContains: one(q.connection_id_contains),
        tenantId: one(q.tenant_id),
        idContains: one(q.id),
        status: one(q.status),
      }
      const limit = one(q.limit)
      const offset = one(q.offset)
      const [jobs, total] = await Promise.all([
        syncStore.list({
          ...filter,
          // The allow-list lives in the store, which owns the `orderBy`.
          // Duplicating it here would give two places for a UI key to mean
          // two different columns.
          sort: one(q.sort),
          dir: one(q.dir) === 'desc' ? 'desc' : 'asc',
          // Default and ceiling unchanged from before this task.
          limit: limit ? Math.min(parseInt(limit, 10), 200) : 50,
          // `parseInt('abc')` is NaN and `NaN || 0` is 0; a negative value
          // cannot move the window anywhere meaningful. The store clamps
          // again with `Number.isInteger` regardless of caller.
          offset: offset ? Math.max(parseInt(offset, 10) || 0, 0) : 0,
        }),
        syncStore.count(filter),
      ])
      return { data: jobs, meta: { total } }
    })

    fastify.get<{ Params: { id: string } }>('/admin/sync-jobs/:id', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const job = await syncStore.get(request.params.id)
      if (!job) {
        return reply
          .status(404)
          .send({ error: { code: 'SYNC_NOT_FOUND', message: `No sync job ${request.params.id}.` } })
      }
      return { data: job }
    })

    fastify.post<{
      Body: { connection_id?: string; callback_url?: string }
    }>('/admin/sync-jobs', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      const body = request.body ?? {}
      const connectionId = body.connection_id
      if (!connectionId) {
        return reply.status(400).send({
          error: { code: 'CONNECTION_ID_REQUIRED', message: 'connection_id is required.' },
        })
      }
      const row = await credentialStore.getRow(connectionId)
      if (!row || !row.vertical) {
        return reply.status(404).send({
          error: {
            code: 'CONNECTION_NOT_FOUND',
            message: 'No such connection (or vertical column is null).',
          },
        })
      }
      const { job, created } = await syncStore.createIfIdle({
        vertical: row.vertical,
        connectionId,
        platform: row.platform,
        tenantId: row.ownerTenantId ?? row.tenantId,
        callbackUrl: body.callback_url ?? null,
        origin: 'manual',
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

    fastify.post<{ Params: { id: string } }>(
      '/admin/sync-jobs/:id/cancel',
      async (request, reply) => {
        if (!adminGuard(request, reply)) return reply
        const job: SyncJob | null = await syncStore.get(request.params.id)
        if (!job) {
          return reply.status(404).send({
            error: { code: 'SYNC_NOT_FOUND', message: `No sync job ${request.params.id}.` },
          })
        }
        if (job.status === 'completed' || job.status === 'failed') {
          return reply.status(409).send({
            error: {
              code: 'SYNC_NOT_CANCELABLE',
              message: `Job is already ${job.status}.`,
            },
          })
        }
        // Mark failed with an explicit reason. That frees the connection's
        // active-job slot at once, so a new sync can be queued for it. It does
        // NOT interrupt a running job: the worker is not told, finishes the
        // run, and then records the run's own outcome over this one. Until it
        // has, that worker will not start the connection's next job (it
        // passes its in-flight connections to `claimNext`).
        await syncStore.markFailed(job.id, 'cancelled by admin', job.progress ?? undefined)
        return { ok: true, data: await syncStore.get(job.id) }
      },
    )
  }
}
