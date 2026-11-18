/**
 * Journey: sorting and per-column filtering on /sync-jobs, and the bug this
 * whole part exists to close — a sync job past row 200 being unreachable.
 *
 * admin-api used to ask integration-server for `Math.min(page * limit + 1,
 * 200)` rows and slice locally, so the table was hard-capped at 200 rows / 4
 * pages, `_pagination.ejs` permanently disabled Next at page 4, and
 * `meta.total` reported the size of that window rather than a count. Paging,
 * sorting and filtering now all happen in SQL (`SyncStore.list`/`count`), and
 * this route forwards rather than applying anything locally.
 *
 * The single most important assertion is the first one: that sort/dir/every
 * filter reach `apiClient.listSyncJobsPaged` — i.e. admin-api, which pages at
 * the store. A route that quietly filtered or sorted the page already in hand
 * would still pass every OTHER assertion below while narrowing only that page.
 *
 * The second most important is the Connection one. Its filter maps to
 * `connection_id_contains` and NEVER to `connection_id`: the latter is the
 * exact match `GET /v1/{vertical}/sync` uses for ownership scoping, and it
 * would return nothing for the eight-character prefix the cell shows.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const TENANTS = [
  { id: 'default', name: 'Default', createdAt: 0, updatedAt: 0 },
  { id: 't-northwind', name: 'Northwind', createdAt: 0, updatedAt: 0 },
]

/**
 * Two jobs whose every filterable field differs, so a filter wired to the
 * wrong column narrows to the wrong row rather than coincidentally to the
 * right one. The first is RUNNING on purpose: without a cancelable row the
 * viewer-role `not.toContain('>Cancel<')` assertion below is vacuous, since
 * the button would be absent for every role anyway.
 */
const JOBS = [
  {
    id: 'job_7f3c1a2b-4d5e-6f70-8111-000000000001',
    vertical: 'accounting',
    connectionId: 'conn_9f8e7d6c-1111-4a2b-8c3d-000000000001',
    platform: 'fortnox',
    tenantId: 'default',
    status: 'running',
    progress: null,
    error: null,
    callbackUrl: null,
    createdAt: '2026-01-15T09:30:00.000Z',
    startedAt: null,
    completedAt: null,
  },
  {
    id: 'job_2b4d5e6f-7081-9a2b-3c4d-000000000002',
    vertical: 'ecommerce',
    connectionId: 'conn_1a2b3c4d-2222-4e5f-9a0b-000000000002',
    platform: 'shopify',
    tenantId: 't-northwind',
    status: 'failed',
    progress: null,
    error: 'rate limited by shopify',
    callbackUrl: null,
    createdAt: '2026-01-16T09:30:00.000Z',
    startedAt: null,
    completedAt: null,
  },
]

/**
 * A small stand-in for admin-api's own filtering and sorting (which really
 * happens in `SyncStore.syncWhere` / `SYNC_SORT_COLUMNS`), so the "narrows the
 * table" pins exercise something real rather than a canned response that would
 * pass unchanged whichever params reached it.
 */
function filterAndSortJobs(filters?: Record<string, unknown>) {
  let rows = JOBS
  const sub = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : undefined)
  if (typeof filters?.id === 'string')
    rows = rows.filter((j) => j.id.toLowerCase().includes(sub(filters.id)!))
  if (typeof filters?.platform === 'string')
    rows = rows.filter((j) => j.platform.toLowerCase().includes(sub(filters.platform)!))
  if (typeof filters?.connection_id_contains === 'string')
    rows = rows.filter((j) =>
      j.connectionId.toLowerCase().includes(sub(filters.connection_id_contains)!),
    )
  if (typeof filters?.vertical === 'string')
    rows = rows.filter((j) => j.vertical === filters.vertical)
  if (typeof filters?.status === 'string') rows = rows.filter((j) => j.status === filters.status)
  if (typeof filters?.tenant_id === 'string')
    rows = rows.filter((j) => j.tenantId === filters.tenant_id)
  if (typeof filters?.sort === 'string') {
    const key =
      filters.sort === 'connection'
        ? 'connectionId'
        : filters.sort === 'tenant'
          ? 'tenantId'
          : filters.sort === 'created'
            ? 'createdAt'
            : filters.sort
    const sign = filters.dir === 'desc' ? -1 : 1
    rows = [...rows].sort(
      (a, b) =>
        String((a as unknown as Record<string, unknown>)[key]).localeCompare(
          String((b as unknown as Record<string, unknown>)[key]),
        ) * sign,
    )
  }
  return rows
}

const mockListSyncJobsPaged = vi.fn(async (_token: string, filters?: Record<string, unknown>) => {
  const data = filterAndSortJobs(filters)
  return { data, meta: { page: Number(filters?.page ?? 1), limit: 50, total: data.length } }
})
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listSyncJobsPaged: mockListSyncJobsPaged,
      listTenants: mockListTenants,
      getDataStoreMetrics: async () => null,
      getLoginOptions: async () => ({ providers: [], localLoginEnabled: true }),
      getCompanyInfo: async () => null,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'sync-jobs-sort-filter-secret-long-enough'
let fastify: FastifyInstance

beforeEach(async () => {
  mockListSyncJobsPaged.mockClear()
  // Two tenants, so the Tenant column's filter renders at all — the same
  // `tenants.length > 1` rule /customers uses.
  mockListTenants.mockReset().mockResolvedValue(TENANTS)
  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
})

function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'admin') {
  const cookie = fastify.signCookie(
    JSON.stringify({ id: 'u1', username: role, role, token: 'jwt' }),
  )
  return fastify.inject({ method: 'GET', url, cookies: { session: cookie } })
}

/** The table markup only, so a match in the metrics tile or the header cannot
 *  pass for a cell. */
const tableOf = (body: string) => body.slice(body.indexOf('<table'), body.indexOf('</table>'))
const bodyOf = (body: string) => body.slice(body.indexOf('<tbody>'))

describe('Journey: the sort and the filters are forwarded, not applied locally', () => {
  it('sends sort, dir, page and every per-column filter to admin-api', async () => {
    await get(
      '/sync-jobs?sort=status&dir=desc&f_id=job_7f3c&f_platform=fort&f_connection=9f8e&f_vertical=accounting&f_status=running&f_tenant=default&page=3',
    )
    expect(mockListSyncJobsPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({
        sort: 'status',
        dir: 'desc',
        page: 3,
        id: 'job_7f3c',
        platform: 'fort',
        connection_id_contains: '9f8e',
        vertical: 'accounting',
        status: 'running',
        tenant_id: 'default',
      }),
    )
  })

  /**
   * The ownership-scoping guard, at the layer that chooses the param name.
   * `connection_id` is an EXACT match — it is how `GET /v1/{vertical}/sync`
   * scopes a Bearer caller to their own connection — so the Connection column,
   * whose cell shows only the first eight characters of the id, must forward
   * as `connection_id_contains` and nothing else.
   */
  it('forwards the Connection filter as connection_id_contains, never as the exact connection_id', async () => {
    await get('/sync-jobs?f_connection=9f8e')
    const [, filters] = mockListSyncJobsPaged.mock.calls[0]!
    expect(filters).toMatchObject({ connection_id_contains: '9f8e' })
    expect(filters).not.toHaveProperty('connection_id')
  })

  it('omits dir entirely when no column is sorted, rather than sending a bare ascending', async () => {
    await get('/sync-jobs')
    const [, filters] = mockListSyncJobsPaged.mock.calls[0]!
    expect(filters).toMatchObject({ page: 1, sort: undefined, dir: undefined })
  })

  it('still honours the old ?vertical= and ?status= URLs via the legacy aliases', async () => {
    await get('/sync-jobs?vertical=ecommerce&status=failed')
    expect(mockListSyncJobsPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ vertical: 'ecommerce', status: 'failed' }),
    )
    const body = bodyOf((await get('/sync-jobs?vertical=ecommerce')).body)
    expect(body).toContain('shopify')
    expect(body).not.toContain('fortnox')
  })

  it('reaches a page the old 200-row window could not', async () => {
    // Page 5 of 50 is row 201 — unreachable before the store took an offset,
    // because admin-api asked upstream for at most 200 rows and sliced.
    await get('/sync-jobs?page=5')
    expect(mockListSyncJobsPaged).toHaveBeenCalledWith('jwt', expect.objectContaining({ page: 5 }))
  })

  it('renders rows in the order admin-api returned, not a locally re-derived one', async () => {
    // Descending by platform: 'shopify' before 'fortnox'. The fixture's own
    // order is fortnox-then-shopify, so this only passes if the view renders
    // what the (sort-aware) mock returned.
    const body = bodyOf((await get('/sync-jobs?sort=platform&dir=desc')).body)
    expect(body.indexOf('shopify')).toBeLessThan(body.indexOf('fortnox'))
  })

  it('a filter narrows the table, excluding the non-matching row', async () => {
    const body = bodyOf((await get('/sync-jobs?f_platform=fort')).body)
    expect(body).toContain('fortnox')
    expect(body).not.toContain('shopify')
  })

  it('filters on the Connection column by the eight-character prefix the cell shows', async () => {
    // 'conn_9f8' is exactly what the first row's cell renders. The second
    // row's id shares the `conn_` prefix and nothing more, so this only passes
    // if the match runs against the full id rather than that shared stem.
    const body = bodyOf((await get('/sync-jobs?f_connection=conn_9f8')).body)
    expect(body).toContain('fortnox')
    expect(body).not.toContain('shopify')
  })
})

describe('Journey: the controls on the page', () => {
  it('renders a sort link and a filter row, with the form outside the table', async () => {
    const res = await get('/sync-jobs')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/sync-jobs?sort=vertical&amp;dir=asc"')
    expect(res.body).toContain('name="f_platform"')
    expect(res.body).toMatch(/<tr class="table__filters">\s*<th/)
    // The presence check comes first: `indexOf(...).toBeLessThan(...)` alone
    // passes vacuously if the form include were deleted (-1 is less than any
    // real index).
    expect(res.body).toContain('id="sync-jobs-filters"')
    expect(res.body.indexOf('id="sync-jobs-filters"')).toBeLessThan(res.body.indexOf('<table'))
  })

  it('makes every sortable column a header link, and leaves Sync id and Progress inert', async () => {
    const res = await get('/sync-jobs')
    for (const key of ['vertical', 'platform', 'connection', 'tenant', 'status', 'created']) {
      expect(res.body).toContain(`href="/sync-jobs?sort=${key}&amp;dir=asc"`)
    }
    // The id is a randomUUID — ordering by it tells an operator nothing — and
    // Progress is folded together from a JSON blob in the template.
    expect(res.body).not.toContain('sort=id&amp;dir=asc')
    expect(res.body).not.toContain('sort=progress&amp;dir=asc')
  })

  it('renders Sync id, Platform and Connection as text boxes and the other three as selects', async () => {
    const res = await get('/sync-jobs')
    for (const name of ['f_id', 'f_platform', 'f_connection']) {
      expect(res.body).toMatch(new RegExp(`<input[^>]*\\bname="${name}"`))
      expect(res.body).not.toMatch(new RegExp(`<select[^>]*\\bname="${name}"`))
    }
    for (const name of ['f_vertical', 'f_status', 'f_tenant']) {
      expect(res.body).toMatch(new RegExp(`<select[^>]*\\bname="${name}"`))
    }
    // Progress and Created carry no control at all.
    expect(res.body).not.toContain('name="f_progress"')
    expect(res.body).not.toContain('name="f_created"')
  })

  it('offers every vertical in the Vertical select, not the five the old form hard-coded', async () => {
    const res = await get('/sync-jobs')
    for (const v of ['accounting', 'crm', 'ecommerce', 'logistics', 'payments', 'inventory']) {
      expect(res.body).toContain(`<option value="${v}"`)
    }
  })

  it('carries the sort and the filters through the pagination links', async () => {
    // 120 rows over a 50-row page, so a Next link renders at all.
    mockListSyncJobsPaged.mockResolvedValueOnce({
      data: JOBS,
      meta: { page: 1, limit: 50, total: 120 },
    })
    const res = await get('/sync-jobs?sort=status&dir=desc&f_platform=fort')
    expect(res.body).toContain(
      'href="/sync-jobs?sort=status&amp;dir=desc&amp;f_platform=fort&amp;page=2"',
    )
  })
})

describe('Journey: the filter finds nothing', () => {
  /**
   * The table — filter row included — renders even with zero rows. Hiding it
   * would strand an operator with no Clear control and no way back short of
   * hand-editing the URL.
   *
   * The Clear assertion is anchored to its HREF, not to the word: the empty
   * state contains its own `Clear filters` anchor, so `toContain('Clear')`
   * passes even with the top-level control deleted entirely.
   */
  it('keeps the filter row and both Clear controls when a filter matches nothing', async () => {
    const res = await get('/sync-jobs?f_platform=no-such-platform-anywhere')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="f_platform"')
    expect(res.body).toContain('href="/sync-jobs">Clear</a>')
    expect(res.body).toContain('href="/sync-jobs">Clear filters</a>')
    // The empty state is INSIDE the table, spanning every visible column.
    expect(tableOf(res.body)).toMatch(/<td colspan="\d+">/)
  })

  it('names the needle back per filter, and explains the truncated Connection cell', async () => {
    const connection = await get('/sync-jobs?f_connection=no-such-connection')
    expect(connection.body).toContain('No sync job matches “no-such-connection”')
    expect(connection.body).toContain('first eight characters')

    const id = await get('/sync-jobs?f_id=no-such-id')
    expect(id.body).toContain('No sync job matches “no-such-id”')

    const platform = await get('/sync-jobs?f_platform=no-such-platform')
    expect(platform.body).toContain('No sync job matches “no-such-platform”')
  })

  it('falls back to the generic copy for an enum filter, which has no needle to quote', async () => {
    const res = await get('/sync-jobs?f_status=completed')
    expect(res.body).toContain('No sync jobs match this filter')
  })

  it('still reads as “yet”, with no Clear control, when nothing is filtered', async () => {
    mockListSyncJobsPaged.mockResolvedValueOnce({
      data: [],
      meta: { page: 1, limit: 50, total: 0 },
    })
    const res = await get('/sync-jobs')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('No sync jobs yet')
    expect(res.body).not.toContain('Clear filters')
    expect(res.body).not.toContain('href="/sync-jobs">Clear</a>')
  })
})

describe('Journey: the Actions column is operator-only', () => {
  /**
   * The header/row alignment pin, plus the assertion that actually catches a
   * fixed (module-level) column list. `_table-head.ejs` builds BOTH header
   * rows from ONE loop over `tableSpec.columns`, so comparing those two counts
   * is equal by construction and catches nothing; comparing the header against
   * the rendered ROW is what catches a spec that stopped varying by role. The
   * explicit `viewer === operator - 1` is what catches an Actions column made
   * unconditional in BOTH — where header and row would still agree.
   */
  const headerCount = (body: string) =>
    (body.match(/<tr class="table__headers[^"]*">([\s\S]*?)<\/tr>/)?.[1].match(/<th/g) ?? []).length
  const rowCount = (body: string) =>
    (body.match(/<tbody>[\s\S]*?<tr>([\s\S]*?)<\/tr>/)?.[1].match(/<td/g) ?? []).length

  it('gives a viewer one column fewer than an operator, and no Cancel button', async () => {
    const viewer = await get('/sync-jobs', 'viewer')
    const operator = await get('/sync-jobs', 'operator')
    expect(viewer.statusCode).toBe(200)
    expect(headerCount(viewer.body)).toBeGreaterThan(0)
    expect(headerCount(viewer.body)).toBe(headerCount(operator.body) - 1)
    // The fixture's first job is RUNNING, so the button is genuinely
    // renderable — without that this assertion would hold for any fixture.
    expect(operator.body).toContain('>Cancel<')
    expect(viewer.body).not.toContain('>Cancel<')
  })

  it('keeps the header aligned with the rendered row for both roles', async () => {
    for (const role of ['viewer', 'operator'] as const) {
      const res = await get('/sync-jobs', role)
      expect(rowCount(res.body)).toBe(headerCount(res.body))
      expect(rowCount(res.body)).toBeGreaterThan(0)
    }
  })
})

describe('Journey: the Tenant column when the tenant list is unavailable', () => {
  /**
   * The defect /customers had to fix, repeated here. `listTenants` is
   * non-fatal, and a rejected fetch leaves `tenants` at `[]` — which is
   * indistinguishable from "this deployment has one tenant" unless the failure
   * is tracked separately. Collapsing the two would build the Tenant column
   * with no `filter`, `parseTableQuery` would skip it, and an active
   * `?f_tenant=` would be silently dropped: admin-api returns EVERY tenant's
   * jobs with nothing on screen to say the scope widened.
   */
  it('keeps the Tenant filter, and the active tenant scope, when listTenants fails', async () => {
    mockListTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await get('/sync-jobs?f_tenant=t-northwind')
    expect(res.statusCode).toBe(200)
    // The control is still on screen — with no options it can offer, since the
    // fetch that would supply them is the one that failed.
    expect(res.body).toMatch(/<select[^>]*\bname="f_tenant"/)
    // And the scope is still applied upstream, which is the half that matters.
    expect(mockListSyncJobsPaged).toHaveBeenCalledWith(
      'jwt',
      expect.objectContaining({ tenant_id: 't-northwind' }),
    )
  })

  it('drops the Tenant filter on a single-tenant deployment, where it could only say All', async () => {
    mockListTenants.mockResolvedValue([{ id: 'default', name: 'Default', createdAt: 0, updatedAt: 0 }])
    const res = await get('/sync-jobs')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toMatch(/<select[^>]*\bname="f_tenant"/)
    // The COLUMN itself stays: the Tenant cell has always rendered regardless
    // of how many tenants exist, and it is still sortable.
    expect(res.body).toContain('href="/sync-jobs?sort=tenant&amp;dir=asc"')
  })
})
