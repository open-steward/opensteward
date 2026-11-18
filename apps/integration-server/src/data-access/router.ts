/**
 * Internal data-access surface — `/admin/data/*`.
 *
 * What the admin data viewer reads the stored copy through. The caller is
 * admin-api, authenticated by the deployment admin secret (`adminGuard`); the
 * signed-in operator's permissions arrive as a SCOPE it computed:
 *
 *   {
 *     tenants: '*' | string[]                        — owner tenants visible
 *     tenantVerticals?: Record<tenant, '*' | string[]> — verticals granted
 *                                                      within each tenant
 *     verticals?: Record<vertical, '*' | string[]>   — verticals (and their
 *                                                      resource types) visible;
 *                                                      omitted = all
 *     revealPii?: boolean                            — holds data:read_pii
 *     maskFinancial?: boolean                        — data_access.mask_financial
 *   }
 *
 * passed as the `X-OpenSteward-Data-Scope` header (JSON) or a `scope` query
 * parameter (parsed in `./scope.ts`). The metric catalog the dashboards chart
 * (`./metrics/`) is served from the same plugin, under the same guard. The scope is re-checked here against `credentials.owner_tenant_id`
 * — defence in depth, since on SQLite `resources.db` is a file only this
 * service can read. A connection with no owner tenant is visible only to a
 * `'*'` scope. Anything out of scope answers 404, never 403, so a scope cannot
 * probe for connection ids it may not see.
 *
 * Every record passes through `stripRawPayload` (in the store) and then
 * `applyMasking` with the vertical's classification. PII is revealed only when
 * the scope allows it AND the request asks (`?reveal=pii`). Filters and search
 * are limited to fields `isSearchable` for this scope — a filter on a masked
 * field would answer the question the mask refuses.
 */
import { Readable } from 'node:stream'
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  adminGuard,
  applyMasking,
  classifiedPaths,
  deriveMaskKey,
  isSearchable,
  isValidDataPath,
  resolveFieldRule,
  ResourcePageError,
  DEFAULT_RULE_KEY,
  PAGE_MAX_LIMIT,
  type ConnectionRow,
  type CredentialStore,
  type PageFilter,
  type ResourceClassification,
  type ResourceStore,
  type StoredResource,
  type SyncStore,
} from '@opensteward/shared'
import {
  UNCLASSIFIED,
  getClassification,
  getResourceSchema,
  VERTICAL_CLASSIFICATIONS,
} from './classification-registry'
import {
  HttpError,
  connectionInScope,
  connectionsInScope,
  fail,
  parseScope,
  typeInScope,
  type DataScope,
} from './scope'
import { createMetricsEngine } from './metrics/engine'
import { registerMetricsRoutes } from './metrics/routes'

export { DATA_SCOPE_HEADER, type DataScope } from './scope'
export const EXPORT_MAX_ROWS = 100_000

const FilterSchema = z.object({
  path: z.string(),
  op: z.enum(['eq', 'contains', 'gt', 'lt', 'is_null']),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
})

export interface CreateDataAccessRouterOptions {
  credentialStore: CredentialStore
  /** Undefined in passthrough mode — every route then answers 409. */
  resourceStore?: ResourceStore
  /** Sync job history, for the built-in "sync outcomes" metric. */
  syncStore?: SyncStore
  /** STORE_SECRET; the `hmac` mask key is derived from it. */
  storeSecret: string
}

function classificationFor(vertical: string, resourceType: string): ResourceClassification {
  return getClassification(vertical, resourceType) ?? UNCLASSIFIED
}

/**
 * Plain dotted paths a free-text search may read: the schema's top-level
 * fields and every classified path without array or wildcard segments, minus
 * whatever this scope may not search.
 */
function searchPathsFor(
  vertical: string,
  resourceType: string,
  cls: ResourceClassification,
  scope: DataScope,
): string[] {
  const schema = getResourceSchema(vertical, resourceType)
  const candidates = new Set<string>(schema ? Object.keys(schema.shape) : [])
  for (const p of classifiedPaths(cls)) candidates.add(p)
  return [...candidates].filter(
    (p) =>
      isValidDataPath(p) &&
      isSearchable(p, cls, scope.revealPii === true, scope.maskFinancial === true),
  )
}

interface ListQuery {
  cursor?: string
  limit?: string
  sort?: string
  dir?: string
  q?: string
  filters?: string
  reveal?: string
  format?: string
}

function parseFilters(
  raw: string | undefined,
  cls: ResourceClassification,
  scope: DataScope,
): PageFilter[] {
  if (raw === undefined || raw === '') return []
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new HttpError(400, 'INVALID_QUERY', '`filters` must be a JSON array.')
  }
  const parsed = z.array(FilterSchema).max(20).safeParse(json)
  if (!parsed.success) throw new HttpError(400, 'INVALID_QUERY', '`filters` is malformed.')
  for (const f of parsed.data) {
    if (!isValidDataPath(f.path)) {
      throw new HttpError(400, 'INVALID_PATH', `Invalid field path '${f.path}'.`)
    }
    if (!isSearchable(f.path, cls, scope.revealPii === true, scope.maskFinancial === true)) {
      throw new HttpError(
        400,
        'FIELD_NOT_SEARCHABLE',
        `Field '${f.path}' cannot be filtered with this access level.`,
      )
    }
  }
  return parsed.data
}

function parseSort(q: ListQuery): { sort: 'updated_at' | 'resource_id'; dir: 'asc' | 'desc' } {
  const sort = q.sort ?? 'updated_at'
  const dir = q.dir ?? 'desc'
  if (sort !== 'updated_at' && sort !== 'resource_id') {
    throw new HttpError(400, 'INVALID_QUERY', '`sort` must be updated_at or resource_id.')
  }
  if (dir !== 'asc' && dir !== 'desc') {
    throw new HttpError(400, 'INVALID_QUERY', '`dir` must be asc or desc.')
  }
  return { sort, dir }
}

function parseLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1 || n > PAGE_MAX_LIMIT) {
    throw new HttpError(400, 'INVALID_QUERY', `\`limit\` must be an integer 1..${PAGE_MAX_LIMIT}.`)
  }
  return n
}

// ── CSV ──────────────────────────────────────────────────────────────────

/** RFC 4180 quoting, plus a leading `'` on values a spreadsheet would execute. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function createDataAccessRouter(opts: CreateDataAccessRouterOptions): FastifyPluginAsync {
  const { credentialStore, resourceStore } = opts
  const hmacKey = deriveMaskKey(opts.storeSecret)
  const metrics = createMetricsEngine({
    credentialStore,
    resourceStore,
    syncStore: opts.syncStore,
  })

  function present(
    item: StoredResource,
    cls: ResourceClassification,
    scope: DataScope,
    reveal: boolean,
  ) {
    return {
      id: item.resourceId,
      resourceType: item.resourceType,
      vertical: item.vertical,
      platform: item.platform,
      connectionId: item.connectionId,
      fetchedAt: item.fetchedAt,
      updatedAt: item.updatedAt,
      changedAt: item.changedAt,
      normVersion: item.normVersion,
      data: applyMasking(item.data, cls, {
        revealPii: reveal,
        maskFinancial: scope.maskFinancial === true,
        hmacKey,
      }),
    }
  }

  /** The connection, or an HttpError(404) when unknown or out of scope. */
  async function scopedConnection(scope: DataScope, id: string): Promise<ConnectionRow> {
    const row = await credentialStore.getRow(id)
    if (!row || !connectionInScope(scope, row)) {
      throw new HttpError(404, 'CONNECTION_NOT_FOUND', 'No such connection.')
    }
    return row
  }

  function requireStore(): ResourceStore {
    if (!resourceStore) {
      throw new HttpError(
        409,
        'DATA_STORE_DISABLED',
        'The data store is off (DATA_STORE_MODE=passthrough); nothing is stored to browse.',
      )
    }
    return resourceStore
  }

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
    })

    fastify.setErrorHandler((err, _request, reply) => {
      if (err instanceof HttpError) return fail(reply, err.status, err.code, err.message)
      if (err instanceof ResourcePageError) return fail(reply, 400, err.code, err.message)
      throw err
    })

    fastify.get('/admin/data/summary', async (request, reply) => {
      const scope = parseScope(request)
      const store = requireStore()
      const rows = await connectionsInScope(credentialStore, scope)
      const counts = await store.countsByConnection()
      const byConnection = new Map<string, typeof counts>()
      for (const c of counts) {
        if (c.connectionId === null) continue
        const list = byConnection.get(c.connectionId) ?? []
        list.push(c)
        byConnection.set(c.connectionId, list)
      }
      const data = []
      for (const row of rows) {
        const vertical = row.vertical!
        const resources = []
        for (const c of byConnection.get(row.id) ?? []) {
          if (c.vertical !== vertical || c.platform !== row.platform) continue
          if (!typeInScope(scope, vertical, c.resourceType)) continue
          resources.push({
            resourceType: c.resourceType,
            count: c.count,
            latestChangedAt: c.maxChangedAt,
            collectionCompletedAt: await store.collectionCompletedAt(
              vertical,
              row.platform,
              row.id,
              c.resourceType,
            ),
            classified: getClassification(vertical, c.resourceType) !== null,
          })
        }
        resources.sort((a, b) => a.resourceType.localeCompare(b.resourceType))
        data.push({
          connectionId: row.id,
          vertical,
          platform: row.platform,
          label: row.label,
          ownerTenantId: row.ownerTenantId,
          resources,
        })
      }
      return reply.send({ data })
    })

    fastify.get<{ Params: { vertical: string; type: string } }>(
      '/admin/data/schema/:vertical/:type',
      async (request, reply) => {
        const scope = parseScope(request)
        const { vertical, type } = request.params
        if (
          !Object.hasOwn(VERTICAL_CLASSIFICATIONS, vertical) ||
          !typeInScope(scope, vertical, type)
        ) {
          throw new HttpError(404, 'RESOURCE_TYPE_NOT_FOUND', 'No such resource type.')
        }
        const explicit = getClassification(vertical, type)
        const schema = getResourceSchema(vertical, type)
        if (!explicit && !schema) {
          throw new HttpError(404, 'RESOURCE_TYPE_NOT_FOUND', 'No such resource type.')
        }
        const cls = explicit ?? UNCLASSIFIED
        const paths = new Set<string>(schema ? Object.keys(schema.shape) : [])
        for (const p of classifiedPaths(cls)) paths.add(p)
        const revealPii = scope.revealPii === true
        const maskFinancial = scope.maskFinancial === true
        const fields = [...paths].map((path) => {
          const rule = resolveFieldRule(path, cls)
          return {
            path,
            class: rule.class,
            mask: rule.mask ?? null,
            classified: Object.hasOwn(cls, path),
            inSchema: schema ? Object.hasOwn(schema.shape, path) : false,
            searchable: isValidDataPath(path) && isSearchable(path, cls, revealPii, maskFinancial),
          }
        })
        return reply.send({
          data: {
            vertical,
            resourceType: type,
            classified: explicit !== null,
            defaultClass: (cls[DEFAULT_RULE_KEY] ?? { class: 'internal' }).class,
            fields,
          },
        })
      },
    )

    async function prepareList(
      request: FastifyRequest<{ Params: { id: string; type: string }; Querystring: ListQuery }>,
    ) {
      const scope = parseScope(request)
      const store = requireStore()
      const row = await scopedConnection(scope, request.params.id)
      const vertical = row.vertical!
      const type = request.params.type
      if (!typeInScope(scope, vertical, type)) {
        throw new HttpError(404, 'RESOURCE_TYPE_NOT_FOUND', 'No such resource type.')
      }
      const cls = classificationFor(vertical, type)
      const q = request.query ?? {}
      const filters = parseFilters(q.filters, cls, scope)
      const { sort, dir } = parseSort(q)
      const search = q.q?.trim() || undefined
      return {
        scope,
        store,
        row,
        vertical,
        type,
        cls,
        filters,
        sort,
        dir,
        search,
        searchPaths: search ? searchPathsFor(vertical, type, cls, scope) : [],
        reveal: scope.revealPii === true && q.reveal === 'pii',
      }
    }

    fastify.get<{ Params: { id: string; type: string }; Querystring: ListQuery }>(
      '/admin/data/connections/:id/resources/:type',
      async (request, reply) => {
        const ctx = await prepareList(request)
        const page = await ctx.store.page({
          vertical: ctx.vertical,
          connectionIds: [ctx.row.id],
          resourceType: ctx.type,
          cursor: request.query?.cursor,
          limit: parseLimit(request.query?.limit, 50),
          sort: ctx.sort,
          dir: ctx.dir,
          filters: ctx.filters,
          q: ctx.search,
          searchPaths: ctx.searchPaths,
        })
        return reply.send({
          data: page.items.map((i) => present(i, ctx.cls, ctx.scope, ctx.reveal)),
          meta: {
            nextCursor: page.nextCursor,
            total: page.total,
            totalCapped: page.totalCapped,
            piiRevealed: ctx.reveal,
            financialMasked: ctx.scope.maskFinancial === true,
            classified: getClassification(ctx.vertical, ctx.type) !== null,
          },
        })
      },
    )

    // Registered before `/:rid` for readability; find-my-way prefers the
    // static segment either way, so a record whose id is literally "export"
    // is reachable only through the list.
    fastify.get<{ Params: { id: string; type: string }; Querystring: ListQuery }>(
      '/admin/data/connections/:id/resources/:type/export',
      async (request, reply) => {
        const ctx = await prepareList(request)
        const format = request.query?.format ?? 'ndjson'
        if (format !== 'csv' && format !== 'ndjson') {
          throw new HttpError(400, 'INVALID_QUERY', '`format` must be csv or ndjson.')
        }
        // Validate the first page BEFORE headers go out, so a bad cursor or
        // filter is a 400, not a truncated 200.
        const pageArgs = {
          vertical: ctx.vertical,
          connectionIds: [ctx.row.id],
          resourceType: ctx.type,
          limit: PAGE_MAX_LIMIT,
          sort: ctx.sort,
          dir: ctx.dir,
          filters: ctx.filters,
          q: ctx.search,
          searchPaths: ctx.searchPaths,
        }
        const first = await ctx.store.page(pageArgs)
        const schema = getResourceSchema(ctx.vertical, ctx.type)
        const store = ctx.store
        async function* rows(): AsyncGenerator<ReturnType<typeof present>> {
          let page = first
          let emitted = 0
          for (;;) {
            for (const item of page.items) {
              if (emitted >= EXPORT_MAX_ROWS) return
              emitted++
              yield present(item, ctx.cls, ctx.scope, ctx.reveal)
            }
            if (!page.nextCursor) return
            page = await store.page({ ...pageArgs, cursor: page.nextCursor })
          }
        }
        async function* body(): AsyncGenerator<string> {
          if (format === 'ndjson') {
            for await (const r of rows()) yield `${JSON.stringify(r)}\n`
            return
          }
          const columns = schema
            ? Object.keys(schema.shape)
            : [...new Set(first.items.flatMap((i) => Object.keys(i.data as object)))]
          const meta = ['id', 'connectionId', 'updatedAt', 'changedAt']
          yield `${[...meta.map((c) => `_${c}`), ...columns].map(csvCell).join(',')}\r\n`
          for await (const r of rows()) {
            const data = (r.data ?? {}) as Record<string, unknown>
            yield `${[
              r.id,
              r.connectionId,
              r.updatedAt,
              r.changedAt,
              ...columns.map((c) => data[c]),
            ]
              .map(csvCell)
              .join(',')}\r\n`
          }
        }
        const filename = `${ctx.vertical}-${ctx.type}-${ctx.row.id}.${format}`
        return reply
          .header(
            'content-type',
            format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson',
          )
          .header(
            'content-disposition',
            `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
          )
          .header('cache-control', 'no-store')
          .header('x-opensteward-export-max-rows', String(EXPORT_MAX_ROWS))
          .send(Readable.from(body()))
      },
    )

    fastify.get<{
      Params: { id: string; type: string; rid: string }
      Querystring: { reveal?: string }
    }>('/admin/data/connections/:id/resources/:type/:rid', async (request, reply) => {
      const scope = parseScope(request)
      const store = requireStore()
      const row = await scopedConnection(scope, request.params.id)
      const vertical = row.vertical!
      const { type, rid } = request.params
      if (!typeInScope(scope, vertical, type)) {
        throw new HttpError(404, 'RESOURCE_TYPE_NOT_FOUND', 'No such resource type.')
      }
      const item = await store.getRecord(vertical, row.platform, row.id, type, rid)
      if (!item) throw new HttpError(404, 'RESOURCE_NOT_FOUND', 'No such record in the store.')
      const reveal = scope.revealPii === true && request.query?.reveal === 'pii'
      const cls = classificationFor(vertical, type)
      reply.header('cache-control', 'no-store')
      return reply.send({
        data: present(item, cls, scope, reveal),
        meta: {
          piiRevealed: reveal,
          financialMasked: scope.maskFinancial === true,
          classified: getClassification(vertical, type) !== null,
        },
      })
    })

    registerMetricsRoutes(fastify, metrics)
  }
}
