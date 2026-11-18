import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { parseSyncMode, type SyncSchedule } from '@opensteward/shared'
import type { Aggregator, TaggedConnection } from '../proxy/aggregator'
import type { AdminStore } from '../db/admin-store'
import {
  Connection,
  ConnectionSyncSchedule,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
  PlatformSlugSchema,
  VerticalEnum,
  VerticalPathSchema,
} from './_openapi'
import { RepeatableString, one } from './_query'
import { getAccess, tenantAllowed } from '../auth/access'

const TAG = 'connections'

/**
 * Sortable columns, as an allow-list.
 *
 * A caller-supplied key never becomes a property lookup on ITS OWN VALUE —
 * the handler below checks membership with `CONNECTION_SORT_KEYS.has(...)`, never
 * a bare `key in CONNECTION_SORT_ACCESSORS`, because `CONNECTION_SORT_ACCESSORS` is a plain object
 * literal and
 * `in` also matches `Object.prototype` keys (`constructor`, `__proto__`,
 * `valueOf`, `hasOwnProperty`, …), each of which resolves to something other
 * than one of the getters below and throws when called as one. An
 * unrecognised key — prototype-inherited or not — is ignored and the default
 * order stands. There is no precedent for an allow-list like this elsewhere
 * in the repo — every one of the ~50 Kysely `orderBy` calls names a literal
 * column — so this is the pattern to copy from.
 *
 * The Platform cell renders a logo beside the slug and the Connection id
 * cell carries a Copy button, but both are still sortable on the plain field
 * underneath (`platform`, `id`) — what is NOT ordered on is the rendered
 * decoration itself, which has no defined order of its own.
 */
export const CONNECTION_SORT_ACCESSORS = {
  label: (c: TaggedConnection) => c.label ?? '',
  id: (c: TaggedConnection) => c.id,
  vertical: (c: TaggedConnection) => c.vertical,
  platform: (c: TaggedConnection) => c.platform,
  status: (c: TaggedConnection) => c.status,
  tenant: (c: TaggedConnection) => c.tenantId ?? '',
  created: (c: TaggedConnection) => c.createdAt ?? '',
} as const

/** Own-keys-only membership test for `CONNECTION_SORT_ACCESSORS` — see the docblock above for
 *  why `in` is unsafe here. Mirrors `sortable.has(requested)` in the admin
 *  app's `table-controls.ts`, which uses a `Set` for the same reason. */
const CONNECTION_SORT_KEYS = new Set(Object.keys(CONNECTION_SORT_ACCESSORS))

const ListQuery = z.object({
  vertical: VerticalEnum.optional(),
  status: z.string().optional(),
  platform: PlatformSlugSchema.optional(),
  search: z.string().optional().meta({
    description:
      'Case-insensitive substring match against the connection id and label. An id prefix is enough, which is what an operator pastes from a support ticket or a `?connection_id=` call.',
    example: '9f8e7d6c',
  }),
  page: z.string().optional(),
  limit: z.string().optional(),
  // Sorting. Deliberately a plain string, not `z.enum(Object.keys(CONNECTION_SORT_ACCESSORS))`:
  // an enum would 400 on an unrecognised key, but a stale bookmark or a
  // renamed column must fall back to the default order, never break the
  // page. The handler allow-lists against CONNECTION_SORT_ACCESSORS itself.
  sort: RepeatableString.optional().meta({
    description:
      'Column to order by: one of `label`, `id`, `vertical`, `platform`, `status`, `tenant`, `created`. An unrecognised value is ignored and the default order (most recently updated first) is used.',
    example: 'label',
  }),
  dir: RepeatableString.optional().meta({
    description:
      'Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending.',
    example: 'desc',
  }),
  // Per-column filters. Named explicitly: an undeclared key is stripped by the
  // validator before the handler runs, which looks like a broken table with no
  // error anywhere.
  f_label: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the label.',
    example: 'acme',
  }),
  f_id: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the connection id.',
    example: '9f8e7d6c',
  }),
  f_vertical: RepeatableString.optional().meta({
    description: 'Exact match against the vertical.',
    example: 'accounting',
  }),
  f_status: RepeatableString.optional().meta({
    description: 'Exact match against the connection status.',
    example: 'valid',
  }),
  f_platform: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the platform slug.',
    example: 'fortnox',
  }),
  f_tenant: RepeatableString.optional().meta({
    description: 'Exact match against the tenant id.',
    example: 'acme',
  }),
})

const VerticalIdParams = z.object({
  vertical: VerticalPathSchema,
  id: z.string(),
})

const PatchBody = z.object({
  label: z.string().nullable().meta({
    description:
      'New human-friendly name for the connection. `null` clears it. Labels are unique per tenant and platform, so reusing one answers `409`.',
    example: 'Acme production books',
  }),
})

export function createConnectionsRoutes(aggregator: Aggregator, adminStore: AdminStore) {
  return async function connectionsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get<{
      Querystring: {
        vertical?: string
        status?: string
        platform?: string
        search?: string
        page?: string
        limit?: string
        sort?: string | string[]
        dir?: string | string[]
        f_label?: string | string[]
        f_id?: string | string[]
        f_vertical?: string | string[]
        f_status?: string | string[]
        f_platform?: string | string[]
        f_tenant?: string | string[]
      }
    }>(
      '/api/connections',
      {
        schema: {
          tags: [TAG],
          summary: 'List connections across every configured vertical',
          description:
            'List all active integration connections aggregated across every configured vertical, with optional filters for `vertical`, `status`, `platform`, per-column filters (`f_label`, `f_id`, `f_vertical`, `f_status`, `f_platform`, `f_tenant`), a `search` over connection id and label, and `sort`/`dir` to order the result. Filters apply before pagination, so `meta.total` reflects the filtered set, and sorting is applied before the slice, so every page reflects the requested order. A tenant-restricted caller sees only connections owned by its granted tenants (and verticals); connections with no tenant are hidden from it. Any authenticated operator.',
          operationId: 'connections.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(Connection),
            401: errorBody,
          },
        },
      },
      async (request) => {
        let connections = await aggregator.allConnections()
        // Tenant scope first, before any filter or count: a restricted caller's
        // `meta.total` must never reveal how many rows it cannot see.
        const access = await getAccess(request)
        if (access && access.scope.mode === 'restricted') {
          connections = connections.filter((c) => tenantAllowed(access, c.tenantId, c.vertical))
        }
        const { vertical, status, platform } = request.query
        if (vertical) connections = connections.filter((c) => c.vertical === vertical)
        if (status) connections = connections.filter((c) => c.status === status)
        if (platform) connections = connections.filter((c) => c.platform.includes(platform))

        // Search runs here, before the slice below, so a match two pages deep is
        // still found — filtering in the browser would only ever search the page
        // in view. Id and label are what an operator arrives knowing: the id is
        // what every /v1 call needs as ?connection_id=, the label is what they
        // named it.
        const search = request.query.search?.trim().toLowerCase()
        if (search) {
          connections = connections.filter(
            (c) =>
              c.id.toLowerCase().includes(search) || (c.label ?? '').toLowerCase().includes(search),
          )
        }

        // Per-column filters. Text columns are case-insensitive substring, enum
        // columns exact — the same semantics table-controls applies in the
        // admin app, so the same box behaves the same way on every page.
        // `one()` collapses a repeated key to its last value rather than 400ing.
        const q = request.query
        const sub = (v: string | undefined) => v?.trim().toLowerCase() || undefined
        const fLabel = sub(one(q.f_label))
        const fId = sub(one(q.f_id))
        const fPlatform = sub(one(q.f_platform))
        if (fLabel)
          connections = connections.filter((c) => (c.label ?? '').toLowerCase().includes(fLabel))
        if (fId) connections = connections.filter((c) => c.id.toLowerCase().includes(fId))
        if (fPlatform)
          connections = connections.filter((c) => c.platform.toLowerCase().includes(fPlatform))
        // `.trim()` here too: table-controls.ts trims every value it parses
        // out of the URL, so a `%20`-padded exact filter must not silently
        // fail to match anything while the admin UI still renders it as an
        // applied chip.
        const fVertical = one(q.f_vertical)?.trim() || undefined
        const fStatus = one(q.f_status)?.trim() || undefined
        const fTenant = one(q.f_tenant)?.trim() || undefined
        // Exact — these are enum selects in the UI, and a substring match would
        // silently widen the result when one value is a prefix of another.
        if (fVertical) connections = connections.filter((c) => c.vertical === fVertical)
        if (fStatus) connections = connections.filter((c) => c.status === fStatus)
        if (fTenant) connections = connections.filter((c) => (c.tenantId ?? '') === fTenant)

        // Sorted before the slice, or page 2 would be a slice of the wrong set.
        // Absent values sort last in BOTH directions — an unlabelled connection
        // is unknown, not "earliest" — so the direction sign never applies to
        // those branches. V8's sort is stable, so ties keep the upstream
        // `updated_at DESC` order the operator saw before sorting.
        const sortParam = one(q.sort)?.trim()
        const sortKey =
          sortParam && CONNECTION_SORT_KEYS.has(sortParam)
            ? (sortParam as keyof typeof CONNECTION_SORT_ACCESSORS)
            : null
        if (sortKey) {
          const get = CONNECTION_SORT_ACCESSORS[sortKey]
          const sign = one(q.dir)?.trim() === 'desc' ? -1 : 1
          connections = [...connections].sort((a, b) => {
            const av = get(a)
            const bv = get(b)
            if (!av && !bv) return 0
            if (!av) return 1
            if (!bv) return -1
            return av.localeCompare(bv, undefined, { sensitivity: 'base' }) * sign
          })
        }

        const total = connections.length
        const page = Math.max(1, parseInt(request.query.page ?? '1', 10) || 1)
        const limit = Math.min(Math.max(1, parseInt(request.query.limit ?? '50', 10) || 50), 200)
        const start = (page - 1) * limit
        return {
          data: connections.slice(start, start + limit),
          meta: { page, limit, total },
        }
      },
    )

    fastify.get<{ Params: { vertical: string; id: string } }>(
      '/api/connections/:vertical/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Fetch a single connection',
          description:
            'Fetch one connection by its vertical and id. Any authenticated operator. Returns `404` if the vertical is unknown, no connection with that id exists in it, or the connection belongs to a tenant outside the caller\'s scope.',
          operationId: 'connections.get',
          params: VerticalIdParams,
          response: {
            200: dataEnvelope(Connection),
            401: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        const connection = await aggregator.getClient().getConnection(request.params.id)
        // Out of scope reads exactly like absent: a 403 would confirm the id exists.
        if (
          !connection ||
          connection.vertical !== request.params.vertical ||
          !tenantAllowed(await getAccess(request), connection.tenantId, connection.vertical)
        ) {
          return reply.status(404).send({ error: 'Connection not found' })
        }
        return { data: connection }
      },
    )

    fastify.patch<{ Params: { vertical: string; id: string }; Body: { label: string | null } }>(
      '/api/connections/:vertical/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Rename a connection',
          description:
            'Rename a connection by vertical and id. The label is the only mutable field — it is what the admin UI and `GET /api/connections?search=` match on, so it is how an operator tells two connections to the same platform apart. Send `null` to clear it. Operator role or higher. Returns `404` if the vertical is unknown or the connection is not found, and `409` if another connection for the same tenant and platform already carries that label. Writes a `connection.update` audit entry.',
          operationId: 'connections.update',
          params: VerticalIdParams,
          body: PatchBody,
          response: {
            200: dataEnvelope(Connection),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        // Read first, exactly as the delete below does: the upstream PATCH is
        // keyed on the id alone, so without this a connection in another
        // vertical would be renamed through this vertical's path.
        const existing = await aggregator.getClient().getConnection(request.params.id)
        if (
          !existing ||
          existing.vertical !== request.params.vertical ||
          !tenantAllowed(await getAccess(request), existing.tenantId, existing.vertical)
        ) {
          return reply.status(404).send({ error: 'Connection not found' })
        }
        // A box submitted with whitespace in it is a cleared label, not a
        // connection named ' '.
        const label = request.body.label === null ? null : request.body.label.trim() || null
        const updated = await aggregator.getClient().updateConnectionLabel(request.params.id, label)
        if (!updated) return reply.status(404).send({ error: 'Connection not found' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'connection.update',
          request.params.vertical,
          request.params.id,
        )
        return { data: updated }
      },
    )

    fastify.put<{ Params: { vertical: string; id: string }; Body: SyncSchedule }>(
      '/api/connections/:vertical/:id/sync-schedule',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: "Set a connection's sync schedule",
          description:
            "Choose how often a connection's data is re-synced: `default` (the deployment interval), `custom` (every `intervalMinutes`, 15–43200), `trigger_only` (only when a sync is requested — never automatically) or `once` (one sync when connected). Takes effect on the scheduler's next tick. Operator role or higher. Returns `404` if the vertical is unknown, the connection is not found, or it belongs to a tenant outside the caller's scope; `400` for an invalid schedule. Writes a `connection.sync_schedule` audit entry with the previous and new schedule.",
          operationId: 'connections.setSyncSchedule',
          params: VerticalIdParams,
          body: ConnectionSyncSchedule,
          response: {
            200: dataEnvelope(Connection),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        // Read first, as the rename does: upstream keys on the id alone, so
        // this is what makes the vertical in the path — and the caller's
        // tenant scope — mean something.
        const existing = await aggregator.getClient().getConnection(request.params.id)
        if (
          !existing ||
          existing.vertical !== request.params.vertical ||
          !tenantAllowed(await getAccess(request), existing.tenantId, existing.vertical)
        ) {
          return reply.status(404).send({ error: 'Connection not found' })
        }
        const updated = await aggregator
          .getClient()
          .setConnectionSyncSchedule(request.params.id, request.body)
        if (!updated) return reply.status(404).send({ error: 'Connection not found' })
        adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'connection.sync_schedule',
          vertical: request.params.vertical,
          targetId: request.params.id,
          detail: {
            // Upstream's value is untyped JSON: anything outside the enum
            // (or absent, on an older integration-server) is audited as
            // `default`, never written into the typed audit row as-is.
            from: {
              mode: parseSyncMode(existing.syncMode),
              intervalMinutes: existing.syncIntervalMinutes ?? null,
            },
            to: { mode: request.body.mode, intervalMinutes: request.body.intervalMinutes ?? null },
          },
        })
        return { data: updated }
      },
    )

    fastify.delete<{ Params: { vertical: string; id: string } }>(
      '/api/connections/:vertical/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Revoke a connection',
          description:
            'Revoke a connection by vertical and id, deleting its stored credentials. Operator role or higher. Returns `404` if the vertical is unknown or the connection is not found. Writes a `connection.delete` audit entry.',
          operationId: 'connections.delete',
          params: VerticalIdParams,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (!aggregator.knownVertical(request.params.vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        const connection = await aggregator.getClient().getConnection(request.params.id)
        if (
          !connection ||
          connection.vertical !== request.params.vertical ||
          !tenantAllowed(await getAccess(request), connection.tenantId, connection.vertical)
        ) {
          return reply.status(404).send({ error: 'Connection not found' })
        }
        const ok = await aggregator.getClient().deleteConnection(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'Connection not found' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'connection.delete',
          request.params.vertical,
          request.params.id,
        )
        return reply.status(204).send()
      },
    )
  }
}
