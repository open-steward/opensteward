/**
 * The data viewer: connections in scope, a paginated record table rendered
 * with the masked values admin-api returns, a record page whose Reveal form
 * is offered only to `data:read_pii` holders, a reveal that renders the
 * unmasked record uncached, a restricted user's 404 for another tenant's
 * connection, export streaming, and the strict CSP on every data page.
 */
import type { FastifyInstance } from 'fastify'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetMyAccess = vi.fn()
const mockListDataConnections = vi.fn()
const mockGetDataSchema = vi.fn()
const mockGetDataRecordPage = vi.fn()
const mockGetDataRecord = vi.fn()
const mockRevealDataRecord = vi.fn()
const mockOpenDataExport = vi.fn()
const mockGetConnection = vi.fn()
const mockListTenants = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listTenants: mockListTenants,
      listDataConnections: mockListDataConnections,
      getDataSchema: mockGetDataSchema,
      getDataRecordPage: mockGetDataRecordPage,
      getDataRecord: mockGetDataRecord,
      revealDataRecord: mockRevealDataRecord,
      openDataExport: mockOpenDataExport,
      getConnection: mockGetConnection,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')

const SESSION_SECRET = 'data-viewer-session-secret-long-enough'
let fastify: FastifyInstance
let seq = 0

const OPERATOR = ['connections:read', 'data:read', 'data:export', 'dashboards:view']
const ADMIN = [...OPERATOR, 'data:read_pii']

const CONN = {
  connectionId: 'conn-acme',
  vertical: 'crm',
  platform: 'hubspot',
  label: 'Acme CRM',
  ownerTenantId: 'acme',
  resources: [
    {
      resourceType: 'contacts',
      count: 2,
      latestChangedAt: Date.now() - 60_000,
      collectionCompletedAt: null,
      classified: true,
    },
  ],
}

const SCHEMA = {
  vertical: 'crm',
  resourceType: 'contacts',
  classified: true,
  defaultClass: 'internal',
  fields: [
    {
      path: 'id',
      class: 'internal',
      mask: null,
      classified: false,
      inSchema: true,
      searchable: true,
    },
    {
      path: 'email',
      class: 'pii',
      mask: 'email',
      classified: true,
      inSchema: true,
      searchable: false,
    },
    {
      path: 'title',
      class: 'internal',
      mask: null,
      classified: false,
      inSchema: true,
      searchable: true,
    },
  ],
}

function record(email: string) {
  return {
    id: 'ct1',
    resourceType: 'contacts',
    vertical: 'crm',
    platform: 'hubspot',
    connectionId: 'conn-acme',
    fetchedAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
    changedAt: '2026-03-01T10:00:00.000Z',
    normVersion: '1',
    data: { id: 'ct1', email, title: 'CFO' },
  }
}

function session(role: 'viewer' | 'operator' | 'admin') {
  seq += 1
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: `jwt-${seq}` }))
}
function access(permissions: string[], scope = { mode: 'all', grants: [] }) {
  mockGetMyAccess.mockResolvedValue({ roleId: 'r', roleName: 'r', permissions, scope })
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'operator') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
function post(url: string, role: 'viewer' | 'operator' | 'admin', body: Record<string, string>) {
  const c = session(role)
  const _csrf = createHmac('sha256', SESSION_SECRET).update(c).digest('hex').slice(0, 32)
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: c },
    payload: { _csrf, ...body },
  })
}

beforeEach(async () => {
  for (const m of [
    mockGetMyAccess,
    mockListDataConnections,
    mockGetDataSchema,
    mockGetDataRecordPage,
    mockGetDataRecord,
    mockRevealDataRecord,
    mockOpenDataExport,
    mockListTenants,
  ]) {
    m.mockReset()
  }
  mockListTenants.mockResolvedValue([
    { id: 'acme', name: 'Acme Corp' },
    { id: 'beta', name: 'Beta Inc' },
  ])
  mockListDataConnections.mockResolvedValue([CONN])
  mockGetDataSchema.mockResolvedValue(SCHEMA)
  mockGetDataRecordPage.mockResolvedValue({
    data: [record('j***@example.com')],
    meta: { nextCursor: 'CUR2', total: 2, totalCapped: false, piiRevealed: false },
  })
  mockGetDataRecord.mockResolvedValue({ record: record('j***@example.com'), meta: {} })
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

describe('navigation and gating', () => {
  it('shows the Data link and page to a data:read holder, with a strict CSP', async () => {
    access(OPERATOR)
    const res = await get('/data')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/data"')
    expect(res.body).toContain('Acme CRM')
    const csp = String(res.headers['content-security-policy'])
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    // The shell carries no inline script, so the policy does not break it.
    expect(res.body).not.toMatch(/<script>(?!\s*<\/script>)/)
    expect(res.body).not.toMatch(/\sonclick="/)
  })

  it('refuses a viewer and hides the nav item', async () => {
    access(['connections:read', 'dashboards:view'])
    const res = await get('/data', 'viewer')
    expect(res.statusCode).toBe(403)
    const home = await get('/connections', 'viewer')
    expect(home.body).not.toContain('href="/data"')
  })
})

/**
 * The overview table's search, filters and sorting — the shared
 * `?sort=&dir=&f_<key>=` contract (views/table-controls.ts). Which value each
 * column sorts on is pinned per column in sort-key-cell-parity.test.ts; this
 * covers what an operator does with the controls.
 */
describe('overview search, filters and sorting', () => {
  const resource = (resourceType: string, count: number, ageMs: number) => ({
    resourceType,
    count,
    latestChangedAt: Date.now() - ageMs,
    collectionCompletedAt: null,
    classified: true,
  })
  const BOOKS = {
    connectionId: 'conn-books-7c1e',
    vertical: 'accounting',
    platform: 'xero',
    label: 'Books',
    ownerTenantId: 'beta',
    resources: [resource('accounts', 300, 86_400_000), resource('invoices', 7, 3_600_000)],
  }
  // Unlabelled: the Label cell, and the Label filter, read its platform.
  const SHIP = {
    connectionId: 'conn-ship-9f3a',
    vertical: 'logistics',
    platform: 'shipbob',
    label: null,
    ownerTenantId: 'acme',
    resources: [resource('shipments', 50, 600_000)],
  }

  beforeEach(() => {
    access(OPERATOR)
    mockListDataConnections.mockResolvedValue([CONN, BOOKS, SHIP])
  })

  /** Row labels in the order the table renders them. */
  function labels(body: string): string[] {
    const tbody = body.slice(body.indexOf('<tbody'), body.indexOf('</tbody>'))
    return [...tbody.matchAll(/href="\/data\/connections\/[^"?]+"[^>]*>([^<]+)<\/a>/g)].map(
      (m) => m[1],
    )
  }

  it('renders the shared filter form, Search, a sort link per column and copyable ids', async () => {
    const res = await get('/data')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('id="data-filters"')
    expect(res.body).toContain('form="data-filters">Search</button>')
    for (const key of [
      'label',
      'id',
      'vertical',
      'tenant',
      'platform',
      'resources',
      'records',
      'lastChange',
    ]) {
      expect(res.body, key).toContain(`href="/data?sort=${key}&amp;dir=asc"`)
    }
    for (const key of ['label', 'id', 'tenant', 'platform', 'resources']) {
      expect(res.body, key).toContain(`name="f_${key}"`)
    }
    expect(res.body).toContain(
      '<select class="select select--sm" form="data-filters" name="f_vertical"',
    )
    expect(res.body).toContain('data-copy="conn-books-7c1e"')
    // Tenant: the name an operator recognises, and the id keys carry.
    expect(res.body).toMatch(/Beta Inc <span class="mono muted">beta<\/span>/)
    // No filter is active, so there is nothing to clear.
    expect(res.body).not.toContain('>Clear</a>')
  })

  it.each([
    ['label', 'acme', ['Acme CRM']],
    // An unlabelled connection is found by the platform its Label cell shows.
    ['label', 'shipbob', ['shipbob']],
    ['id', 'conn-bo', ['Books']],
    ['vertical', 'accounting', ['Books']],
    ['tenant', 'Beta', ['Books']],
    ['tenant', 'acme', ['Acme CRM', 'shipbob']],
    ['platform', 'xero', ['Books']],
    ['resources', 'invoices', ['Books']],
  ])('f_%s=%s keeps only the matching rows', async (key, needle, want) => {
    const res = await get(`/data?f_${key}=${encodeURIComponent(needle)}`)
    expect(res.statusCode).toBe(200)
    expect(labels(res.body)).toEqual(want)
    expect(res.body).toContain('>Clear</a>')
  })

  it('sorts by Records and by Last change, in both directions', async () => {
    expect(labels((await get('/data?sort=records&dir=desc')).body)).toEqual([
      'Books',
      'shipbob',
      'Acme CRM',
    ])
    // Newest change first: Acme (1 min), shipbob (10 min), Books (1 h — its
    // newest type, not its day-old accounts).
    expect(labels((await get('/data?sort=lastChange&dir=desc')).body)).toEqual([
      'Acme CRM',
      'shipbob',
      'Books',
    ])
    expect(labels((await get('/data?sort=lastChange&dir=asc')).body)).toEqual([
      'Books',
      'shipbob',
      'Acme CRM',
    ])
  })

  it('keeps the submitted filters on every sort link', async () => {
    const res = await get('/data?f_vertical=crm')
    expect(res.body).toContain('href="/data?sort=records&amp;dir=asc&amp;f_vertical=crm"')
  })

  it('names the search back and offers Clear when nothing matches', async () => {
    const res = await get('/data?f_label=zzz')
    expect(res.statusCode).toBe(200)
    expect(labels(res.body)).toEqual([])
    expect(res.body).toContain('No connection matches “zzz”')
    expect(res.body).toContain('>Clear filters</a>')
    // The controls stay, so the operator is never stranded.
    expect(res.body).toContain('id="data-filters"')
    expect(res.body).not.toContain('No stored data yet')
  })

  it('still says "No stored data yet" when there is nothing at all', async () => {
    mockListDataConnections.mockResolvedValue([])
    const res = await get('/data')
    expect(res.body).toContain('No stored data yet')
    expect(res.body).not.toContain('Clear filters')
  })

  it('shows the raw tenant id when the tenant list cannot be fetched', async () => {
    mockListTenants.mockRejectedValue(new Error('admin-api down'))
    const res = await get('/data?f_tenant=beta')
    expect(res.statusCode).toBe(200)
    expect(labels(res.body)).toEqual(['Books'])
    expect(res.body).not.toContain('Beta Inc')
  })

  it('renders no controls when the data store is turned off', async () => {
    mockListDataConnections.mockRejectedValue(
      Object.assign(new Error('conflict'), { response: { status: 409 } }),
    )
    const res = await get('/data')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('The data store is turned off')
    expect(res.body).not.toContain('id="data-filters"')
  })
})

describe('record table', () => {
  it('renders masked values, class badges, cursor paging and export links', async () => {
    access(OPERATOR)
    const res = await get('/data/connections/conn-acme?type=contacts&q=cfo&f_title=CF')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('j***@example.com')
    expect(res.body).not.toContain('jane@example.com')
    expect(res.body).toContain('>PII</span>')
    expect(res.body).toContain('cursor=CUR2')
    expect(res.body).toContain('action="/data/connections/conn-acme/export"')
    // A data:export holder without data:read_pii is not offered a PII export.
    expect(res.body).not.toContain('name="include_pii"')
    const [, id, type, query] = mockGetDataRecordPage.mock.calls[0]!
    expect([id, type]).toEqual(['conn-acme', 'contacts'])
    expect(query).toMatchObject({ q: 'cfo' })
    expect(JSON.parse(query.filters)).toEqual([{ path: 'title', op: 'contains', value: 'CF' }])
  })

  it('never sends a filter on a field the schema says is not searchable', async () => {
    access(OPERATOR)
    await get('/data/connections/conn-acme?type=contacts&f_email=jane')
    expect(mockGetDataRecordPage.mock.calls[0]![3].filters).toBeUndefined()
  })

  it('answers 404 for a connection outside the scope', async () => {
    access(OPERATOR, {
      mode: 'restricted',
      grants: [{ tenantId: 'globex', verticals: '*' }],
    } as never)
    mockListDataConnections.mockResolvedValue([])
    const res = await get('/data/connections/conn-acme')
    expect(res.statusCode).toBe(404)
    expect(mockGetDataRecordPage).not.toHaveBeenCalled()
  })

  it('shows a refused filter as an error, not a crash', async () => {
    access(OPERATOR)
    mockGetDataRecordPage.mockRejectedValue(
      Object.assign(new Error('400'), {
        response: {
          status: 400,
          data: {
            error: { code: 'FIELD_NOT_SEARCHABLE', message: "Field 'x' cannot be filtered." },
          },
        },
      }),
    )
    const res = await get('/data/connections/conn-acme?type=contacts')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('That filter is not allowed.')
  })
})

describe('record and reveal', () => {
  it('renders the masked record without a Reveal form for an operator', async () => {
    access(OPERATOR)
    const res = await get('/data/connections/conn-acme/records/contacts/ct1')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('j***@example.com')
    expect(res.body).toContain('data-json-view')
    expect(res.body).not.toContain('data-reveal-form')
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('offers Reveal to a data:read_pii holder and renders the unmasked record uncached', async () => {
    access(ADMIN)
    const page = await get('/data/connections/conn-acme/records/contacts/ct1', 'admin')
    expect(page.body).toContain('data-reveal-form')
    mockRevealDataRecord.mockResolvedValue({
      record: record('jane@example.com'),
      meta: { piiRevealed: true },
    })
    const res = await post('/data/connections/conn-acme/records/contacts/ct1/reveal', 'admin', {
      reason: 'ticket 42',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('jane@example.com')
    expect(res.body).toContain('data-pii-revealed')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(mockRevealDataRecord).toHaveBeenCalledWith(
      expect.any(String),
      'conn-acme',
      'contacts',
      'ct1',
      'ticket 42',
    )
  })

  it('refuses a reveal without data:read_pii before asking admin-api', async () => {
    access(OPERATOR)
    const res = await post(
      '/data/connections/conn-acme/records/contacts/ct1/reveal',
      'operator',
      {},
    )
    expect(res.statusCode).toBe(403)
    expect(mockRevealDataRecord).not.toHaveBeenCalled()
  })

  it('refuses a reveal without a CSRF token', async () => {
    access(ADMIN)
    const res = await fastify.inject({
      method: 'POST',
      url: '/data/connections/conn-acme/records/contacts/ct1/reveal',
      cookies: { session: session('admin') },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
    expect(mockRevealDataRecord).not.toHaveBeenCalled()
  })
})

describe('export', () => {
  it('streams the export through', async () => {
    access(OPERATOR)
    mockOpenDataExport.mockResolvedValue({
      stream: Readable.from(['_id,title\r\n', 'ct1,CFO\r\n']),
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="x.csv"',
      },
    })
    const res = await get('/data/connections/conn-acme/export?type=contacts&format=csv')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.body).toBe('_id,title\r\nct1,CFO\r\n')
    expect(mockOpenDataExport.mock.calls[0]![3]).toMatchObject({ format: 'csv' })
    expect(mockOpenDataExport.mock.calls[0]![3].include_pii).toBeUndefined()
  })

  it('refuses include_pii without data:read_pii', async () => {
    access(OPERATOR)
    const res = await get('/data/connections/conn-acme/export?type=contacts&include_pii=1')
    expect(res.statusCode).toBe(403)
    expect(mockOpenDataExport).not.toHaveBeenCalled()
  })
})

describe('connection detail', () => {
  const CONNECTION = {
    id: 'conn-acme',
    vertical: 'crm',
    platform: 'hubspot',
    tenantId: 'acme',
    label: 'Acme CRM',
    status: 'valid',
    expiresAt: null,
    createdAt: '2026-01-15T09:30:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    lastRefreshAt: null,
    lastRefreshStatus: null,
  }

  it('links to the data viewer for a data:read holder only', async () => {
    mockGetConnection.mockResolvedValue(CONNECTION)
    access(OPERATOR)
    const res = await get('/connections/crm/conn-acme')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/data/connections/conn-acme"')
    access(['connections:read', 'dashboards:view'])
    const viewer = await get('/connections/crm/conn-acme', 'viewer')
    expect(viewer.body).not.toContain('href="/data/connections/conn-acme"')
  })
})
