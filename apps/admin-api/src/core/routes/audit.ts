import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  isAuditSortKey,
  type AdminStore,
  type AuditEntry as AuditEntryRow,
  type AuditFilter,
} from '../db/admin-store'
import { AuditDetailUnion, AUDIT_ACTION_VALUES } from '../db/audit-actions'
import { serviceGuard } from '../auth/service-auth'
import { AuditEntry, listEnvelope, errorBody } from './_openapi'
import { RepeatableString, one } from './_query'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'audit'

/**
 * EVERY param is a `RepeatableString`, not only the three this feature added.
 *
 * Fastify's parser hands a repeated key through as an array, and a bare
 * `z.string()` answers 400 for it — so converting only `sort`/`dir`/`vertical`
 * would leave `?action=a&action=b` still 400ing, a less predictable surface
 * than either extreme. Every value is collapsed with `one()` (last wins) in
 * `collapse()` below before it reaches a filter or a clamp: widening the
 * schema WITHOUT collapsing downgrades the 400 into a 500, because
 * `auditWhere` calls `.toLowerCase()` on the vertical needle.
 */
const ListQuery = z.object({
  page: RepeatableString.optional(),
  limit: RepeatableString.optional(),
  action: RepeatableString.optional(),
  user_id: RepeatableString.optional(),
  /** Exact match on the acted-on id — "everything that happened to key X". */
  target_id: RepeatableString.optional(),
  /** Inclusive lower bound — ISO-8601 or epoch-ms string. */
  from: RepeatableString.optional(),
  /** Inclusive upper bound — ISO-8601 or epoch-ms string. */
  to: RepeatableString.optional(),
  // Sorting. Deliberately plain strings, not `z.enum(...)`: an enum would 400
  // on an unrecognised key, but a stale bookmark or a renamed column must fall
  // back to the default order, never break the page. The handler allow-lists
  // through `isAuditSortKey`. Named as separate fields (rather than a dynamic
  // scheme) so they document and validate under OAS 3.1.
  /** UI sort key from the audit sort allow-list. Unknown values are ignored. */
  sort: RepeatableString.optional().meta({
    description:
      'Column to order by: one of `time`, `user`, `action`, `vertical`, `target`. An unrecognised value is ignored and the default order (newest first) is used. `user` orders by the stored `user_id`, not the username resolved for display.',
    example: 'action',
  }),
  /** `asc` or `desc`; anything else reads as `asc`. */
  dir: RepeatableString.optional().meta({
    description:
      'Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending.',
    example: 'desc',
  }),
  /** Substring match, case-insensitive, on the vertical the action touched. */
  vertical: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the vertical the action touched.',
    example: 'accounting',
  }),
})

// Extends `ListQuery`, so it inherits `sort`/`dir` — and deliberately IGNORES
// them: `iterateAudit` keeps its fixed newest-first ordering, which is the
// order an exported log is expected to arrive in and the one every downstream
// script already assumes.
const ExportQuery = ListQuery.extend({
  // Repeatable for the same reason as everything above it: `?format=csv&format=json`
  // must not 400 the download. Collapsed with `one()` in the handler.
  format: z.union([z.enum(['csv', 'json']), z.array(z.enum(['csv', 'json']))]).optional(),
})

/**
 * Every filter param of an audit query, collapsed to one value each.
 *
 * The single place a `RepeatableString` becomes a plain string, shared by the
 * list and export handlers so the two cannot disagree about which value of a
 * repeated key wins.
 */
function collapse(q: z.infer<typeof ExportQuery>): {
  action?: string
  user_id?: string
  target_id?: string
  vertical?: string
  from?: string
  to?: string
} {
  return {
    action: one(q.action),
    user_id: one(q.user_id),
    target_id: one(q.target_id),
    vertical: one(q.vertical),
    from: one(q.from),
    to: one(q.to),
  }
}

/**
 * Reassemble the discriminated-union variant for one audit row.
 *
 * Storage keeps `action` in its own column and the per-action payload in
 * `detail` (JSON-encoded). The OpenAPI shape pulls them back together
 * into a single `{ action, ...payload }` object so the discriminator
 * lives inside the variant where OAS expects it.
 *
 * Rows whose `action` isn't in the typed registry (forward-compat: a
 * future writer's literal that the current build doesn't know about)
 * surface as `null` rather than 500-ing the read.
 */
function rebuildDetail(row: AuditEntryRow): unknown {
  // `audit_log.detail` is TEXT; an empty/null cell means no payload.
  let parsed: Record<string, unknown> = {}
  if (row.detail) {
    try {
      const candidate = JSON.parse(row.detail)
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>
      }
    } catch {
      // Malformed JSON in a historical row — treat as no payload.
      parsed = {}
    }
  }
  const candidate = { action: row.action, ...parsed }
  const result = AuditDetailUnion.safeParse(candidate)
  return result.success ? result.data : null
}

/** Parse a query bound as either epoch-ms or an ISO date; undefined when blank
 *  or unparseable so a bad value never narrows the result set silently. */
function parseBound(v: string | undefined): number | undefined {
  if (!v) return undefined
  if (/^\d+$/.test(v)) return parseInt(v, 10)
  const ms = Date.parse(v)
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * @param resolvedUserId when the caller looked up a username, the id it maps to
 */
function filterFromQuery(
  q: {
    action?: string
    user_id?: string
    target_id?: string
    vertical?: string
    from?: string
    to?: string
  },
  resolvedUserId?: string,
): AuditFilter {
  const filter: AuditFilter = {}
  if (q.action) filter.action = q.action
  if (resolvedUserId ?? q.user_id) filter.userId = resolvedUserId ?? q.user_id!
  if (q.target_id) filter.targetId = q.target_id
  if (q.vertical) filter.vertical = q.vertical
  const from = parseBound(q.from)
  if (from !== undefined) filter.from = from
  const to = parseBound(q.to)
  if (to !== undefined) filter.to = to
  return filter
}

/** RFC-4180 CSV cell: quote when the value holds a comma, quote, or newline. */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const CSV_COLUMNS = [
  'id',
  'createdAt_iso',
  'userId',
  'username',
  'action',
  'vertical',
  'targetId',
  'detail_json',
] as const

export function createAuditRoutes(adminStore: AdminStore) {
  return async function auditRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)
    fastify.addHook('preHandler', fastify.adminOnly)
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)

    fastify.get(
      '/api/audit/actions',
      {
        schema: {
          tags: [TAG],
          summary: 'Every audit action the registry knows',
          description:
            'The typed action vocabulary, for building filter UIs without hand-typing exact ' +
            'dotted action literals. Admin role required.',
          operationId: 'audit.actions',
          response: {
            200: {
              type: 'object',
              properties: { data: { type: 'array', items: { type: 'string' } } },
            },
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async () => ({ data: AUDIT_ACTION_VALUES }),
    )

    fastify.get<{ Querystring: z.infer<typeof ListQuery> }>(
      '/api/audit',
      {
        schema: {
          tags: [TAG],
          summary: 'List audit-log entries, newest first',
          description:
            'List operator audit-log entries (paginated, newest first; `limit` capped at 200). Admin role required. Supports filtering by `action`, `user_id`, `target_id` (exact match on the acted-on id \u2014 \u201ceverything that happened to key X\u201d), `vertical` (case-insensitive substring), and a `from`/`to` date range (ISO-8601 or epoch-ms), plus `sort`/`dir` to order the result. Filters and ordering are applied in SQL before the page slice, so `meta.total` reflects the filtered set and every page reflects the requested order.',
          operationId: 'audit.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(AuditEntry),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        // `page`/`limit` are free-form strings (the Zod `ListQuery` above only
        // requires them to parse as strings, not numbers), so a hand-edited
        // URL reaches here unchecked. `?page=abc` parses to `NaN`, which
        // reaches Kysely's `.offset()` and throws `SqliteError: datatype
        // mismatch` (a 500) — this route is the only paginated admin-api
        // endpoint with neither a lower clamp nor a NaN fallback (contrast
        // `connections.ts`/`sync-jobs.ts`, which both guard with
        // `Math.max(1, … || default)`). `?page=0`/`?page=-3` parse fine but
        // compile to a negative `OFFSET`, which SQLite silently reads as 0 —
        // so page 1 renders while `meta.page` echoes the bogus value back to
        // the caller. `?limit=-1` compiles to `LIMIT -1`, which SQLite reads
        // as UNLIMITED, bypassing the documented 200-row cap outright. A page
        // below 1 or unparseable now falls back to 1, exactly as an omitted
        // `page` already does; a limit that isn't a finite positive number
        // falls back to the documented default of 50, then the 200 ceiling
        // still applies.
        const q = collapse(request.query)
        const rawPage = parseInt(one(request.query.page) ?? '1', 10)
        const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1
        const rawLimit = parseInt(one(request.query.limit) ?? '50', 10)
        const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 50, 200)
        const offset = (page - 1) * limit
        // The table displays usernames, so an operator filters by one. Ids
        // still work; a username is resolved to its id, which is what the
        // stored rows key on.
        const resolvedUserId = q.user_id
          ? ((await adminStore.userIdByUsername(q.user_id)) ?? undefined)
          : undefined
        const filter = filterFromQuery(q, resolvedUserId)
        // Ordering is resolved here and applied in SQL, before the slice: this
        // is the one admin table with true SQL pagination, so sorting the
        // returned page would reorder a fraction of the log while the
        // pagination control claimed to speak for all of it. An unrecognised
        // `sort` is dropped and the default order stands.
        const rawSort = one(request.query.sort)
        const sort = isAuditSortKey(rawSort)
          ? { key: rawSort, dir: one(request.query.dir) === 'desc' ? ('desc' as const) : ('asc' as const) }
          : undefined
        const rows = await adminStore.listAudit(limit, offset, filter, sort)
        const usernames = await adminStore.usernamesByIds(rows.map((r) => r.user_id))
        const total = await adminStore.countAudit(filter)
        // Rebuild the discriminated union for each row at the boundary so
        // the response matches the OpenAPI shape without forcing storage
        // to mirror it.
        const data = rows.map((row) => ({
          id: row.id,
          userId: row.user_id,
          // Falls back to the id for a deleted operator: an audit entry must
          // not lose who acted just because the account is gone.
          username: usernames.get(row.user_id) ?? row.user_id,
          action: row.action,
          vertical: row.vertical,
          targetId: row.target_id,
          detail: rebuildDetail(row),
          createdAt: row.created_at,
        }))
        return { data, meta: { page, limit, total } }
      },
    )

    // Export the (optionally filtered) audit log as CSV or JSON. Streams from
    // a SQLite cursor so a large table doesn't materialise all at once, and
    // records the export itself as an audit entry.
    fastify.get<{ Querystring: z.infer<typeof ExportQuery> }>(
      '/api/audit/export',
      {
        schema: {
          tags: [TAG],
          summary: 'Export audit-log entries as CSV or JSON',
          description:
            'Export the (optionally filtered) audit log as a downloadable `csv` (default) or `json` attachment, supporting the same filters as the list endpoint. Admin role required. Streamed from a SQLite cursor so large logs do not materialise at once, and the export itself is recorded as an `audit.export` audit entry.',
          operationId: 'audit.export',
          querystring: ExportQuery,
          response: { 401: errorBody, 403: errorBody },
        },
      },
      async (request, reply) => {
        const format = one(request.query.format) === 'json' ? 'json' : 'csv'
        const filter = filterFromQuery(collapse(request.query))
        const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

        let count = 0
        let body: string
        const exportRows = await adminStore.iterateAudit(filter)
        const exportNames = await adminStore.usernamesByIds([...exportRows].map((r) => r.user_id))
        if (format === 'json') {
          const out: unknown[] = []
          for (const row of exportRows) {
            count++
            out.push({
              id: row.id,
              userId: row.user_id,
              username: exportNames.get(row.user_id) ?? row.user_id,
              action: row.action,
              vertical: row.vertical,
              targetId: row.target_id,
              detail: rebuildDetail(row),
              createdAt: row.created_at,
            })
          }
          body = JSON.stringify(out, null, 2)
        } else {
          const lines = [CSV_COLUMNS.join(',')]
          for (const row of exportRows) {
            count++
            lines.push(
              [
                csvCell(row.id),
                csvCell(new Date(row.created_at).toISOString()),
                csvCell(row.user_id),
                csvCell(exportNames.get(row.user_id) ?? row.user_id),
                csvCell(row.action),
                csvCell(row.vertical),
                csvCell(row.target_id),
                csvCell(row.detail ?? ''),
              ].join(','),
            )
          }
          body = lines.join('\r\n')
        }

        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'audit.export',
          detail: { format, count },
        })

        const contentType = format === 'json' ? 'application/json' : 'text/csv'
        return reply
          .header('content-type', `${contentType}; charset=utf-8`)
          .header('content-disposition', `attachment; filename="audit-log-${stamp}.${format}"`)
          .send(body)
      },
    )
  }
}


/**
 * Service-to-service audit ingest — how integration-server events reach the
 * operator's audit trail.
 *
 * Connections are created inside integration-server (OAuth callback,
 * credential form) — a different process with no path into this database —
 * so `connection.*` audit events reach the trail through this ingest. It
 * crosses the boundary the way the runtime-settings poll does — the
 * X-Service-Secret guard, which never falls open when unconfigured.
 *
 * Deliberately NOT an open audit-writing oracle: only the connection pair is
 * accepted, and rows land under the `system` user — there is no admin behind
 * an OAuth callback.
 */
const InternalAuditBody = z
  .object({
    action: z.enum(['connection.create', 'connection.delete']),
    targetId: z.string().min(1).max(200),
    vertical: z.string().max(80).nullish(),
    detail: z
      .object({
        platform: z.string().max(120).optional(),
        tenantId: z.string().max(200).nullish(),
      })
      .optional(),
  })
  .strict()

export function createInternalAuditRoutes(adminStore: AdminStore) {
  return async function internalAuditRoutes(fastify: FastifyInstance): Promise<void> {
    // Hidden from the operator OpenAPI spec: this is service-to-service
    // plumbing (X-Service-Secret), not part of the JWT surface the spec
    // documents — same treatment as the logo data routes.
    fastify.post(
      '/api/internal/audit',
      { preHandler: [serviceGuard], schema: { hide: true } },
      async (request, reply) => {
      const parsed = InternalAuditBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      await adminStore.writeAudit({
        userId: 'system',
        action: parsed.data.action,
        vertical: parsed.data.vertical ?? null,
        targetId: parsed.data.targetId,
        detail: parsed.data.detail ?? undefined,
      })
        return reply.status(202).send({ data: { ok: true } })
      },
    )
  }
}
