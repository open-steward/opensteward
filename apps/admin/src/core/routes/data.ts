/**
 * Data viewer — browse what the data store holds for each connection.
 *
 *   GET  /data                                           connections in scope, per-type counts
 *   GET  /data/connections/:id                           one connection: a tab per resource
 *                                                        type, cursor-paginated table,
 *                                                        filters, search, export
 *   GET  /data/connections/:id/export                    CSV / NDJSON download (streamed)
 *   GET  /data/connections/:id/records/:type/:rid        one record, masked
 *   POST /data/connections/:id/records/:type/:rid/reveal the record unmasked (audited)
 *
 * Every page needs `data:read`; export needs `data:export`; reveal and a PII
 * export need `data:read_pii`. These checks decide what the UI offers —
 * admin-api enforces the same permissions, the tenant scope and the masking
 * on every call (and integration-server re-checks the scope again), so a
 * connection outside the operator's scope answers 404 here exactly as an
 * unknown one does.
 *
 * All of these pages are served with a strict Content-Security-Policy (see
 * `../csp.ts`); nothing here may rely on an inline script or handler.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasPermission, requirePermission } from '../auth/middleware'
import { useStrictCsp } from '../csp'
import type {
  AdminApiClient,
  DataConnectionSummary,
  DataFieldRecord,
  DataRecordPage,
  DataRecordRow,
  DataSchemaRecord,
  TenantRecord,
} from '../proxy/admin-api-client'
import { KNOWN_VERTICALS, VERTICAL_LABELS } from '../verticals'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'

/** Columns shown by default, in this order, when the schema has them. */
const PREFERRED_COLUMNS = [
  'name',
  'title',
  'invoiceNumber',
  'orderNumber',
  'number',
  'subject',
  'status',
  'financialStatus',
  'stage',
  'email',
  'type',
  'currency',
  'totalAmount',
  'totalPrice',
  'createdAt',
  'created_at',
  'postedAt',
]
const DEFAULT_COLUMN_COUNT = 6
const MAX_COLUMNS = 12
/** Filter inputs offered, at most. */
const MAX_FILTERS = 8
const MAX_TRAIL = 50
const PAGE_LIMIT = 50
const HIDDEN_COLUMNS = new Set(['id', 'metadata', 'raw'])

type Query = Record<string, string | string[] | undefined>

function str(q: Query, key: string): string {
  const v = q[key]
  const last = Array.isArray(v) ? v[v.length - 1] : v
  return typeof last === 'string' ? last.trim() : ''
}

function status(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

function upstreamMessage(err: unknown): { code: string | null; message: string } {
  const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (typeof raw === 'string') return { code: null, message: raw }
  if (raw && typeof raw === 'object') {
    const e = raw as { code?: unknown; message?: unknown }
    return {
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message : 'The request was refused.',
    }
  }
  return { code: null, message: err instanceof Error ? err.message : 'The request failed.' }
}

function notFound(request: FastifyRequest, reply: FastifyReply, message: string) {
  return reply.status(404).view('error.ejs', {
    user: request.sessionUser,
    status: 404,
    message,
    requestId: null,
  })
}

/** Top-level schema fields a table column can show. */
function columnCandidates(schema: DataSchemaRecord | null): DataFieldRecord[] {
  if (!schema) return []
  return schema.fields.filter(
    (f) =>
      f.inSchema && !f.path.includes('.') && !HIDDEN_COLUMNS.has(f.path) && f.class !== 'secret',
  )
}

export function chooseColumns(schema: DataSchemaRecord | null, requested: string): string[] {
  const candidates = columnCandidates(schema).map((f) => f.path)
  const allowed = new Set(candidates)
  if (requested) {
    const picked = [...new Set(requested.split(','))].filter((c) => allowed.has(c))
    if (picked.length > 0) return picked.slice(0, MAX_COLUMNS)
  }
  const preferred = PREFERRED_COLUMNS.filter((c) => allowed.has(c))
  const rest = candidates.filter((c) => !preferred.includes(c))
  return [...preferred, ...rest].slice(0, DEFAULT_COLUMN_COUNT)
}

/** Fields this caller may filter on, as simple top-level text boxes. */
export function filterableFields(schema: DataSchemaRecord | null): DataFieldRecord[] {
  if (!schema) return []
  return schema.fields
    .filter(
      (f) => f.searchable && f.inSchema && !f.path.includes('.') && !HIDDEN_COLUMNS.has(f.path),
    )
    .slice(0, MAX_FILTERS)
}

/** `f_<path>` query values → the filter list admin-api takes. */
export function filtersFromQuery(q: Query, fields: DataFieldRecord[]) {
  const out: Array<{ path: string; op: 'contains'; value: string }> = []
  for (const f of fields) {
    const v = str(q, `f_${f.path}`)
    if (v) out.push({ path: f.path, op: 'contains', value: v })
  }
  return out
}

/** A short, single-line rendering of a record value for a table cell. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return s.length > 80 ? `${s.slice(0, 79)}…` : s
}

/** Path → class, for badges on the record view. */
function classMap(schema: DataSchemaRecord | null): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of schema?.fields ?? []) out[f.path] = f.class
  return out
}

function freshness(ms: number | null): string {
  if (!ms) return 'never'
  const mins = Math.floor((Date.now() - ms) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return `${Math.floor(hours / 24)} days ago`
}

/** One /data row: the summary plus the figures its cells show. */
interface DataOverviewRow extends DataConnectionSummary {
  total: number
  /** The newest `latestChangedAt` across its resource types, or null. */
  latestMs: number | null
  freshness: string
  /** What the Tenant cell renders (`_tenant.ejs`): the name when known, then the id. */
  tenantLabel: string
}

/**
 * The /data table: every column sorts, and every column an operator would
 * search by filters, on the shared `?sort=&dir=&f_<key>=` contract.
 *
 * In memory, like /webhooks: `listDataConnections` returns the caller's whole
 * scope in one response, so sorting here orders every row rather than a page.
 * Each `get` returns what its cell shows (table-controls.ts, cell parity) —
 * Label falls back to the platform exactly as the cell does, and Resource
 * types reads the type names in the order the badges render them, so typing
 * `invoices` finds every connection holding invoices. Last change is the one
 * exception: the cell reads "17 h ago", the column sorts on the timestamp
 * behind it, and it carries no filter box.
 *
 * Tenant is a text box over `tenantLabel`, as on /connect-links, not a
 * dropdown over ids as on /webhooks. The cell is `_tenant.ejs` — name, then
 * id — and one accessor answers both the sort and the filter: a dropdown has
 * to match the id exactly, which would sort the column by id while it reads
 * by name. Typing either half of what is on screen finds the row.
 */
export const DATA_TABLE: TableSpec = {
  id: 'data-filters',
  baseUrl: '/data',
  columns: [
    {
      key: 'label',
      header: 'Label',
      sortable: true,
      filter: 'text',
      get: (c: DataOverviewRow) => c.label || c.platform,
    },
    {
      key: 'id',
      header: 'Connection id',
      sortable: true,
      filter: 'text',
      get: (c: DataOverviewRow) => c.connectionId,
    },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      filter: {
        type: 'enum',
        options: KNOWN_VERTICALS.map((name) => ({ value: name, label: VERTICAL_LABELS[name] })),
      },
      get: (c: DataOverviewRow) => c.vertical,
    },
    {
      key: 'tenant',
      header: 'Tenant',
      sortable: true,
      filter: 'text',
      get: (c: DataOverviewRow) => c.tenantLabel,
    },
    {
      key: 'platform',
      header: 'Platform',
      sortable: true,
      filter: 'text',
      get: (c: DataOverviewRow) => c.platform,
    },
    {
      key: 'resources',
      header: 'Resource types',
      sortable: true,
      filter: 'text',
      get: (c: DataOverviewRow) => c.resources.map((r) => r.resourceType).join(', '),
    },
    { key: 'records', header: 'Records', sortable: true, get: (c: DataOverviewRow) => c.total },
    {
      key: 'lastChange',
      header: 'Last change',
      sortable: true,
      get: (c: DataOverviewRow) => c.latestMs,
    },
  ],
}

async function findConnection(
  apiClient: AdminApiClient,
  token: string,
  id: string,
): Promise<DataConnectionSummary | null> {
  const all = await apiClient.listDataConnections(token)
  return all.find((c) => c.connectionId === id) ?? null
}

export function createDataRoutes(apiClient: AdminApiClient) {
  return async function dataRoutes(fastify: FastifyInstance): Promise<void> {
    useStrictCsp(fastify)
    fastify.addHook('preHandler', requirePermission('data:read'))

    fastify.get('/data', async (request, reply) => {
      const token = request.sessionUser!.token
      let connections: DataConnectionSummary[] = []
      let disabled = false
      // Non-fatal, like every activity page's tenant fetch: an unreachable
      // tenant list costs the Tenant column its names, not the page.
      const [listed, tenants] = await Promise.all([
        apiClient.listDataConnections(token).catch((err: unknown) => err),
        apiClient.listTenants(token).catch(() => [] as TenantRecord[]),
      ])
      if (Array.isArray(listed)) {
        connections = listed
      } else {
        if (status(listed) !== 409) throw listed
        disabled = true
      }
      const rows: DataOverviewRow[] = connections.map((c) => {
        const latest = c.resources.reduce<number | null>(
          (m, r) =>
            r.latestChangedAt !== null && (m === null || r.latestChangedAt > m)
              ? r.latestChangedAt
              : m,
          null,
        )
        return {
          ...c,
          total: c.resources.reduce((n, r) => n + r.count, 0),
          latestMs: latest,
          freshness: freshness(latest),
          tenantLabel: [tenants.find((t) => t.id === c.ownerTenantId)?.name, c.ownerTenantId]
            .filter(Boolean)
            .join(' '),
        }
      })
      const tableState = parseTableQuery(request.query, DATA_TABLE)
      return reply.view('data/index.ejs', {
        user: request.sessionUser,
        connections: applyTableQuery(rows, tableState, DATA_TABLE),
        totalConnections: rows.length,
        tenants,
        tableSpec: DATA_TABLE,
        tableState,
        disabled,
      })
    })

    fastify.get<{ Params: { id: string }; Querystring: Query }>(
      '/data/connections/:id',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const q = request.query ?? {}
        let conn: DataConnectionSummary | null
        try {
          conn = await findConnection(apiClient, token, request.params.id)
        } catch (err) {
          if (status(err) === 409) return reply.redirect('/data')
          throw err
        }
        if (!conn)
          return notFound(request, reply, 'No such connection, or it is outside your scope.')

        const types = conn.resources.map((r) => r.resourceType)
        const requestedType = str(q, 'type')
        const type = types.includes(requestedType) ? requestedType : (types[0] ?? null)
        const user = request.sessionUser!
        const base = {
          user,
          connection: conn,
          types: conn.resources,
          type,
          canExport: hasPermission(user, 'data:export'),
          canReadPii: hasPermission(user, 'data:read_pii'),
        }
        if (!type) {
          return reply.view('data/connection.ejs', {
            ...base,
            schema: null,
            columns: [],
            candidates: [],
            filterFields: [],
            filterValues: {},
            page: null,
            error: null,
            state: { q: '', sort: 'updated_at', dir: 'desc', cols: '' },
            nav: null,
          })
        }

        const schema = await apiClient.getDataSchema(token, conn.vertical, type)
        const filterFields = filterableFields(schema)
        const filters = filtersFromQuery(q, filterFields)
        const search = str(q, 'q')
        const sort = str(q, 'sort') === 'resource_id' ? 'resource_id' : 'updated_at'
        const dir = str(q, 'dir') === 'asc' ? 'asc' : 'desc'
        const cursor = str(q, 'cursor')
        const trail = str(q, 'trail')
          .split(',')
          .filter((t) => t !== '')
          .slice(-MAX_TRAIL)
        // The column picker posts one `colpick` per checked box; a link
        // carries the choice forward as `cols=a,b,c`.
        const picked = q['colpick']
        const cols = picked ? (Array.isArray(picked) ? picked : [picked]).join(',') : str(q, 'cols')
        const columns = chooseColumns(schema, cols)

        let page: DataRecordPage | null = null
        let error: { code: string | null; message: string } | null = null
        try {
          page = await apiClient.getDataRecordPage(token, conn.connectionId, type, {
            cursor: cursor || undefined,
            limit: String(PAGE_LIMIT),
            sort,
            dir,
            filters: filters.length > 0 ? JSON.stringify(filters) : undefined,
            q: search || undefined,
          })
        } catch (err) {
          const s = status(err)
          if (s === 404) {
            return notFound(request, reply, 'No such connection, or it is outside your scope.')
          }
          if (s !== 400 && s !== 409) throw err
          error = upstreamMessage(err)
        }

        // The query string every link on the page carries forward (minus the
        // cursor and trail, which each link sets for itself).
        const keep = new URLSearchParams()
        keep.set('type', type)
        if (search) keep.set('q', search)
        if (sort !== 'updated_at') keep.set('sort', sort)
        if (dir !== 'desc') keep.set('dir', dir)
        if (cols) keep.set('cols', columns.join(','))
        for (const f of filters) keep.set(`f_${f.path}`, f.value)
        const baseQs = keep.toString()
        const href = (extra: Record<string, string>) => {
          const p = new URLSearchParams(baseQs)
          for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
          return `/data/connections/${encodeURIComponent(conn.connectionId)}?${p.toString()}`
        }
        // Cursor trail: each Next pushes the current cursor ('-' for the first
        // page), each Previous pops one — so Previous needs no server state.
        const nav = {
          first: cursor ? href({}) : null,
          prev:
            trail.length > 0
              ? href({
                  cursor: trail[trail.length - 1] === '-' ? '' : trail[trail.length - 1]!,
                  trail: trail.slice(0, -1).join(','),
                })
              : null,
          next: page?.meta.nextCursor
            ? href({
                cursor: page.meta.nextCursor,
                trail: [...trail, cursor || '-'].slice(-MAX_TRAIL).join(','),
              })
            : null,
          pageNumber: trail.length + 1,
        }
        const exportQs = new URLSearchParams(baseQs)
        exportQs.delete('cols')

        return reply.view('data/connection.ejs', {
          ...base,
          schema,
          columns,
          candidates: columnCandidates(schema),
          filterFields,
          filterValues: Object.fromEntries(filters.map((f) => [f.path, f.value])),
          page,
          error,
          state: { q: search, sort, dir, cols: columns.join(',') },
          nav,
          exportQs: exportQs.toString(),
          classOf: classMap(schema),
          cellText,
        })
      },
    )

    fastify.get<{ Params: { id: string }; Querystring: Query }>(
      '/data/connections/:id/export',
      { preHandler: requirePermission('data:export') },
      async (request, reply) => {
        const user = request.sessionUser!
        const q = request.query ?? {}
        const includePii = str(q, 'include_pii') === '1' || str(q, 'include_pii') === 'true'
        if (includePii && !hasPermission(user, 'data:read_pii')) {
          return reply.status(403).view('error.ejs', {
            user,
            status: 403,
            message: 'Exporting personal data needs the data:read_pii permission.',
            requestId: null,
          })
        }
        const type = str(q, 'type')
        const conn = await findConnection(apiClient, user.token, request.params.id)
        if (!conn || !conn.resources.some((r) => r.resourceType === type)) {
          return notFound(request, reply, 'No such connection or resource type in your scope.')
        }
        const schema = await apiClient.getDataSchema(user.token, conn.vertical, type)
        const filters = filtersFromQuery(q, filterableFields(schema))
        const search = str(q, 'q')
        const opened = await apiClient.openDataExport(user.token, conn.connectionId, type, {
          format: str(q, 'format') === 'ndjson' ? 'ndjson' : 'csv',
          ...(includePii ? { include_pii: 'true' as const } : {}),
          sort: str(q, 'sort') === 'resource_id' ? 'resource_id' : undefined,
          dir: str(q, 'dir') === 'asc' ? 'asc' : undefined,
          filters: filters.length > 0 ? JSON.stringify(filters) : undefined,
          q: search || undefined,
        })
        for (const [k, v] of Object.entries(opened.headers)) reply.header(k, v)
        reply.header('Cache-Control', 'no-store')
        return reply.send(opened.stream)
      },
    )

    async function renderRecord(
      request: FastifyRequest<{ Params: { id: string; type: string; rid: string } }>,
      reply: FastifyReply,
      record: DataRecordRow,
      revealed: boolean,
    ) {
      const user = request.sessionUser!
      const schema = await apiClient.getDataSchema(user.token, record.vertical, record.resourceType)
      // Never cached: a revealed record must not outlive the request in any
      // cache, and a masked one is still customer data.
      reply.header('Cache-Control', 'no-store')
      reply.header('Pragma', 'no-cache')
      return reply.view('data/record.ejs', {
        user,
        record,
        revealed,
        schema,
        classOf: classMap(schema),
        canReadPii: hasPermission(user, 'data:read_pii'),
        title: `${record.resourceType} ${record.id}`,
      })
    }

    fastify.get<{ Params: { id: string; type: string; rid: string } }>(
      '/data/connections/:id/records/:type/:rid',
      async (request, reply) => {
        const { id, type, rid } = request.params
        const view = await apiClient.getDataRecord(request.sessionUser!.token, id, type, rid)
        if (!view?.record) {
          return notFound(request, reply, 'No such record, or it is outside your scope.')
        }
        return renderRecord(request, reply, view.record, false)
      },
    )

    fastify.post<{ Params: { id: string; type: string; rid: string }; Body: { reason?: string } }>(
      '/data/connections/:id/records/:type/:rid/reveal',
      { preHandler: requirePermission('data:read_pii') },
      async (request, reply) => {
        const { id, type, rid } = request.params
        const reason = (request.body?.reason ?? '').trim().slice(0, 500) || null
        let view
        try {
          view = await apiClient.revealDataRecord(request.sessionUser!.token, id, type, rid, reason)
        } catch (err) {
          if (status(err) === 404) {
            return notFound(request, reply, 'No such record, or it is outside your scope.')
          }
          throw err
        }
        return renderRecord(request, reply, view.record, true)
      },
    )
  }
}
