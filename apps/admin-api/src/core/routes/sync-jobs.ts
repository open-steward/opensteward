/**
 * Admin passthrough for `/admin/sync-jobs` on integration-server.
 *
 * Mirrors the pattern of routes/connect-sessions.ts: the admin UI talks
 * JWT to admin-api, admin-api forwards with X-Admin-Secret to
 * integration-server, which owns the sync_jobs table.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { UnifiedClient } from '../proxy/client'
import type { AdminStore } from '../db/admin-store'
import {
  DataStoreMetrics,
  SyncJob,
  SyncJobStatus,
  dataEnvelope,
  dataNullable,
  listEnvelope,
  errorBody,
  VerticalEnum,
} from './_openapi'
import { RepeatableString, one } from './_query'
import { denyRestrictedScope, getAccess, tenantAllowed, type Access } from '../auth/access'

const TAG = 'sync-jobs'

const ListQuery = z.object({
  vertical: VerticalEnum.optional(),
  connection_id: RepeatableString.optional(),
  status: SyncJobStatus.optional(),
  // `limit`/`page` are `RepeatableString` too, not only the params this task
  // added. Adopting it on new params alone left `?page=1&page=2` 400ing while
  // `?sort=a&sort=b` returned 200 — a surface less predictable than either
  // extreme. `vertical`/`status` keep their enums, which is a different and
  // deliberate choice: they are closed sets the admin app's own `<select>`
  // can only ever submit one value from.
  limit: RepeatableString.optional(),
  page: RepeatableString.optional(),
  // Sorting and per-column filters for the /sync-jobs list page. Forwarded to
  // integration-server's `GET /admin/sync-jobs` (and from there into
  // `SyncStore.list`/`count`), which owns the sort allow-list.
  //
  // `RepeatableString`, never a bare `z.string()`: Fastify's parser yields an
  // ARRAY for a repeated key and a bare string schema answers 400 for it, so a
  // stale bookmark or a back/forward resubmission would 400 the whole page.
  // Every one of these passes through `one()` before it is used — a raw array
  // reaching a filter downstream is a 500, which is worse than the 400 it
  // replaced.
  sort: RepeatableString.optional().meta({
    description:
      'Column to order by: one of `vertical`, `platform`, `connection`, `tenant`, `status`, `created`. An unrecognised value is ignored and the default order (newest first) is used.',
    example: 'status',
  }),
  dir: RepeatableString.optional().meta({
    description:
      'Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending.',
    example: 'desc',
  }),
  platform: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the platform slug.',
    example: 'fortnox',
  }),
  tenant_id: RepeatableString.optional().meta({
    description: "Exact match against the connection's owning tenant id.",
    example: 'acme',
  }),
  id: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the sync job id.',
    example: '9f8e7d6c',
  }),
  connection_id_contains: RepeatableString.optional().meta({
    description:
      'Case-insensitive substring match against the connection id. Distinct from `connection_id`, which is an exact match: the admin table filters on a prefix of the id its Connection cell shows.',
    example: '9f8e7d6c',
  }),
})

const IdParam = z.object({ id: z.string() })

const CreateBody = z
  .object({
    connection_id: z
      .string()
      .min(1)
      .meta({ description: 'Connection to sync (prefix `conn_`).', example: 'conn_1042' }),
    callback_url: z
      .string()
      .optional()
      .meta({
        description: 'Optional URL notified when the sync job completes.',
        example: 'https://app.acme.example/sync-callback',
      }),
  })
  .meta({
    id: 'CreateSyncJobBody',
    description: 'Request body to enqueue a data-sync job for a connection.',
  })

/** The fields every sync-job row carries that scope checks read. */
interface ScopedJob {
  tenantId?: string | null
  vertical?: string
  createdAt?: string
}

/** Upstream answers at most this many rows per request (integration-server). */
const UPSTREAM_PAGE_CAP = 200

type ListOpts = Parameters<UnifiedClient['listSyncJobs']>[0] & object

/** Merge order for rows fetched per tenant — mirrors the upstream sort keys
 *  so a restricted caller's page reads in the order it asked for. */
const MERGE_KEYS: Record<string, (j: Record<string, unknown>) => string> = {
  vertical: (j) => String(j['vertical'] ?? ''),
  platform: (j) => String(j['platform'] ?? ''),
  connection: (j) => String(j['connectionId'] ?? ''),
  tenant: (j) => String(j['tenantId'] ?? ''),
  status: (j) => String(j['status'] ?? ''),
  created: (j) => String(j['createdAt'] ?? ''),
}

/**
 * List sync jobs for a tenant-restricted caller.
 *
 * integration-server filters by ONE tenant, so this asks once per granted
 * tenant for the first `offset + limit` rows (capped at the upstream page
 * size), drops rows outside a vertical-limited grant, merges, re-sorts and
 * slices. `total` sums the per-tenant totals: exact for tenant-wide grants,
 * an upper bound when a grant is limited to some verticals. Deep pages of a
 * multi-tenant scope stop at the upstream cap per tenant.
 */
async function listScopedSyncJobs(
  client: UnifiedClient,
  access: Access & { scope: { mode: 'restricted' } },
  opts: ListOpts,
): Promise<{ data: unknown[]; total: number }> {
  const offset = opts.offset ?? 0
  const limit = opts.limit ?? 50
  let tenants = [...access.scope.tenants.keys()]
  if (opts.tenant_id) tenants = tenants.filter((t) => t === opts.tenant_id)
  if (tenants.length === 0) return { data: [], total: 0 }
  if (tenants.length === 1) {
    // One tenant: upstream pages it exactly; only vertical grants need a trim.
    const res = await client.listSyncJobs({ ...opts, tenant_id: tenants[0] })
    const rows = (res.data as ScopedJob[]).filter((j) => tenantAllowed(access, j.tenantId, j.vertical))
    return { data: rows, total: res.total - ((res.data.length - rows.length) || 0) }
  }
  const window = Math.min(offset + limit, UPSTREAM_PAGE_CAP)
  const results = await Promise.all(
    tenants.map((tenant_id) => client.listSyncJobs({ ...opts, tenant_id, offset: 0, limit: window })),
  )
  const rows = results
    .flatMap((r) => r.data as Array<ScopedJob & Record<string, unknown>>)
    .filter((j) => tenantAllowed(access, j.tenantId, j.vertical))
  const key = opts.sort && MERGE_KEYS[opts.sort] ? MERGE_KEYS[opts.sort] : null
  const sign = opts.dir === 'desc' || !key ? -1 : 1
  const get = key ?? MERGE_KEYS['created']!
  rows.sort((a, b) => get(a).localeCompare(get(b)) * sign)
  return {
    data: rows.slice(offset, offset + limit),
    total: results.reduce((n, r) => n + r.total, 0),
  }
}

export function createSyncJobsRoutes(client: UnifiedClient, adminStore: AdminStore) {
  /** Fetch a job and answer null when it is absent OR outside the caller's
   *  scope — the two must read the same, or a 403 confirms the id exists. */
  async function scopedJob(access: Access | null, id: string): Promise<unknown | null> {
    const job = (await client.getSyncJob(id)) as ScopedJob | null
    if (!job) return null
    return tenantAllowed(access, job.tenantId, job.vertical) ? job : null
  }

  return async function syncJobsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get<{
      Querystring: {
        vertical?: string
        connection_id?: string | string[]
        status?: string
        limit?: string | string[]
        page?: string | string[]
        sort?: string | string[]
        dir?: string | string[]
        platform?: string | string[]
        tenant_id?: string | string[]
        id?: string | string[]
        connection_id_contains?: string | string[]
      }
    }>(
      '/api/sync-jobs',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'List sync jobs',
          description:
            'List data-sync jobs, optionally filtered by `vertical`, `connection_id`, `status`, `platform`, `tenant_id`, `id` and `connection_id_contains`, ordered by `sort`/`dir`, and paged with `page`/`limit`. `meta.total` is the number of rows matching the filter across the whole deployment — a real count, so a caller can page through every one of them. A tenant-restricted caller sees only jobs for its granted tenants. Any authenticated operator.',
          operationId: 'sync-jobs.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(SyncJob),
            401: errorBody,
          },
        },
      },
      async (request) => {
        const { vertical, status } = request.query
        const connection_id = one(request.query.connection_id)
        const page = Math.max(1, parseInt(one(request.query.page) ?? '1', 10) || 1)
        const limit = Math.min(
          Math.max(1, parseInt(one(request.query.limit) ?? '50', 10) || 50),
          200,
        )
        // Ask integration-server for exactly the page this request wants,
        // plus its real total, in one round trip. The old shape asked for
        // `Math.min(page * limit + 1, 200)` rows and sliced locally, which
        // hard-capped the table at 200 rows / 4 pages — row 201 was
        // unreachable at any page size — and reported the size of that
        // window as `meta.total`.
        const opts: ListOpts = {
          vertical,
          connection_id,
          status,
          // `one()` is mandatory before any of these leaves the handler: a raw
          // array reaching the store's `.toLowerCase()` is a 500.
          platform: one(request.query.platform)?.trim() || undefined,
          tenant_id: one(request.query.tenant_id)?.trim() || undefined,
          id: one(request.query.id)?.trim() || undefined,
          connection_id_contains: one(request.query.connection_id_contains)?.trim() || undefined,
          sort: one(request.query.sort)?.trim() || undefined,
          dir: one(request.query.dir)?.trim() === 'desc' ? 'desc' : undefined,
          limit,
          offset: (page - 1) * limit,
        }
        const access = await getAccess(request)
        const { data, total } =
          access && access.scope.mode === 'restricted'
            ? await listScopedSyncJobs(client, access as Access & { scope: { mode: 'restricted' } }, opts)
            : await client.listSyncJobs(opts)
        return { data, meta: { page, limit, total } }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/sync-jobs/:id',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Read one sync job',
          description:
            'Read a single sync job by id, including its status and progress. Any authenticated operator. Returns `404` if the job does not exist.',
          operationId: 'sync-jobs.get',
          params: IdParam,
          response: {
            200: dataEnvelope(SyncJob),
            401: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const data = await scopedJob(await getAccess(request), request.params.id)
        if (!data) return reply.status(404).send({ error: 'Sync job not found.' })
        return { data }
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/sync-jobs/:id/cancel',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Cancel a running sync job',
          description:
            'Request cancellation of an in-flight sync job. Operator role or higher. Returns `404` if the job does not exist or is not in a cancelable state. Writes a `sync_job.cancel` audit entry.',
          operationId: 'sync-jobs.cancel',
          params: IdParam,
          response: {
            200: dataEnvelope(SyncJob),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const access = await getAccess(request)
        if (access?.scope.mode === 'restricted' && !(await scopedJob(access, request.params.id))) {
          return reply.status(404).send({ error: 'Sync job not found or not cancelable.' })
        }
        const data = await client.cancelSyncJob(request.params.id)
        if (!data) return reply.status(404).send({ error: 'Sync job not found or not cancelable.' })
        adminStore.writeAudit(request.jwtUser!.id, 'sync_job.cancel', undefined, request.params.id)
        return { data }
      },
    )

    fastify.post<{ Body: { connection_id?: string; callback_url?: string } }>(
      '/api/sync-jobs',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Enqueue a one-off sync job',
          description:
            'Enqueue a one-off data-sync job for a connection, with an optional completion `callback_url`. Operator role or higher. Responds `202 Accepted` with the queued job. Upstream refusals keep their own status: `409` when a sync is already running for the connection, `404` when the connection is unknown or the deployment runs in `passthrough` mode (no sync engine), `502` when integration-server cannot be reached. `400` if `connection_id` is missing. Writes a `sync_job.create` audit entry.',
          operationId: 'sync-jobs.create',
          body: CreateBody,
          response: {
            202: dataEnvelope(SyncJob),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
            500: errorBody,
            502: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body ?? {}
        if (!body.connection_id) {
          return reply.status(400).send({ error: 'connection_id is required.' })
        }
        const access = await getAccess(request)
        if (access?.scope.mode === 'restricted') {
          // integration-server would sync any connection id; check ownership
          // here and answer an out-of-scope id like an unknown one.
          const connection = await client.getConnection(body.connection_id)
          if (!connection || !tenantAllowed(access, connection.tenantId, connection.vertical)) {
            return reply.status(404).send({ error: 'Connection not found.' })
          }
        }
        // Upstream refusals (409 already running, 404 unknown connection or a
        // passthrough deployment with no sync engine) propagate with their own
        // status and message via the shared error handler. Only a genuinely
        // empty success body lands here.
        const data = await client.createSyncJob(body.connection_id, body.callback_url)
        if (!data) {
          return reply
            .status(502)
            .send({ error: 'integration-server accepted the sync but returned no job.' })
        }
        adminStore.writeAudit(request.jwtUser!.id, 'sync_job.create', undefined, body.connection_id)
        return reply.status(202).send({ data })
      },
    )

    fastify.get(
      '/api/data-store/metrics',
      {
        // Deployment-wide counts: not tenant-scoped, so refused to a
        // tenant-restricted caller.
        preHandler: [fastify.authenticate, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Data-store metrics (resource counts, last sync timestamps, etc.)',
          description:
            'Return aggregate data-store metrics (resource counts, last-sync timestamps, and similar) for dashboards. Any authenticated operator; deployment-wide, so a tenant-restricted caller gets `403 SCOPE_RESTRICTED`. Responds with `data: null` when integration-server is unreachable so the UI can show an offline banner rather than erroring.',
          operationId: 'sync-jobs.metrics',
          response: {
            // Returns null when integration-server is unreachable; the
            // admin UI surfaces an offline banner instead of a hard error.
            200: dataNullable(DataStoreMetrics),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async () => {
        const metrics = await client.getDataStoreMetrics()
        return { data: metrics }
      },
    )
  }
}
