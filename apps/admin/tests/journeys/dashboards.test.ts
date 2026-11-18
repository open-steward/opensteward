/**
 * Dashboards: the list, a dashboard page wired for dashboard.js (widgets,
 * range, currency filter, vendored ECharts, strict CSP), the same-origin
 * metric JSON route and the parameters it forwards, the no-script edit form
 * (add / move / remove re-render the draft; only Save writes; per-widget
 * chart, currency, granularity and compare; metrics grouped by vertical and
 * section), permission gating and the vendored library itself.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'crypto'

const mockGetMyAccess = vi.fn()
const mockListDashboards = vi.fn()
const mockGetDashboard = vi.fn()
const mockListDashboardMetrics = vi.fn()
const mockGetDashboardMetric = vi.fn()
const mockCreateDashboard = vi.fn()
const mockUpdateDashboard = vi.fn()
const mockListTenants = vi.fn()
const mockListDashboardCurrencies = vi.fn()
const mockGetDashboardConnections = vi.fn()

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      getMyAccess: mockGetMyAccess,
      listDashboards: mockListDashboards,
      getDashboard: mockGetDashboard,
      listDashboardMetrics: mockListDashboardMetrics,
      getDashboardMetric: mockGetDashboardMetric,
      createDashboard: mockCreateDashboard,
      updateDashboard: mockUpdateDashboard,
      listTenants: mockListTenants,
      listDashboardCurrencies: mockListDashboardCurrencies,
      getDashboardConnections: mockGetDashboardConnections,
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const {
  applyAction,
  currencyChoices,
  dashboardVertical,
  dataFromLabel,
  draftFromForm,
  fitCharts,
  groupCatalog,
  groupDashboards,
  metricQuery,
  rangeFromQuery,
  sharingFromForm,
  tenantChoices,
} =
  await import('../../src/core/routes/dashboards')

const SESSION_SECRET = 'dashboards-session-secret-long-enough'
let fastify: FastifyInstance
let seq = 0

const VIEWER = ['connections:read', 'dashboards:view']
const OPERATOR = [...VIEWER, 'dashboards:edit', 'data:read']

const ECOMMERCE = {
  id: 'builtin:ecommerce',
  name: 'Ecommerce',
  description: 'Orders and revenue.',
  widgets: [
    { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 },
    { metricId: 'ecommerce.revenue_per_day', chart: 'bar', width: 6, title: 'Revenue' },
  ],
  builtin: true,
  vertical: 'ecommerce',
  ownerUserId: null,
  audience: { kind: 'everyone' },
  pinnedTenants: null,
  editable: false,
  createdAt: null,
  updatedAt: null,
}

const FLAGS = {
  money: false,
  currencyAware: false,
  snapshot: false,
  granular: false,
  comparable: false,
}
const CATALOG = [
  {
    id: 'ecommerce.orders_per_day',
    title: 'Orders per day',
    description: 'Orders created per day.',
    kind: 'timeseries',
    unit: 'count',
    section: 'sales',
    vertical: 'ecommerce',
    resourceType: 'orders',
    charts: ['line', 'area', 'bar', 'calendar', 'table', 'number'],
    ...FLAGS,
    granular: true,
    comparable: true,
  },
  {
    id: 'ecommerce.revenue_per_day',
    title: 'Revenue per day',
    description: 'Order totals per day.',
    kind: 'timeseries',
    unit: 'money',
    section: 'sales',
    vertical: 'ecommerce',
    resourceType: 'orders',
    charts: ['line', 'area', 'bar', 'table', 'number'],
    ...FLAGS,
    money: true,
    currencyAware: true,
    granular: true,
    comparable: true,
  },
  {
    id: 'ecommerce.customer_concentration',
    title: 'Customer concentration',
    description: 'Revenue share of the largest customers.',
    kind: 'concentration',
    unit: 'percent',
    section: 'risk',
    vertical: 'ecommerce',
    resourceType: 'orders',
    charts: ['gauge', 'pareto', 'treemap', 'table'],
    ...FLAGS,
    money: true,
    currencyAware: true,
    snapshot: true,
  },
  {
    id: 'accounting.ar_aging',
    title: 'AR aging',
    description: 'Open receivables by age.',
    kind: 'aging',
    unit: 'money',
    section: 'receivables',
    vertical: 'accounting',
    resourceType: 'invoices',
    charts: ['bar', 'hbar', 'donut', 'table'],
    ...FLAGS,
    money: true,
    currencyAware: true,
    snapshot: true,
  },
  {
    id: 'system.records_per_vertical',
    title: 'Stored records per vertical',
    description: 'Records.',
    kind: 'breakdown',
    unit: 'count',
    section: 'system',
    vertical: null,
    resourceType: null,
    charts: ['bar', 'pie', 'table', 'number'],
    ...FLAGS,
    snapshot: true,
  },
]

/** What admin-api's `/api/dashboards/connections` holds for the caller. */
const SHOPS = [
  { id: '9f8e7d6c-0001-4aaa-8bbb-000000000001', label: 'Acme main shop', platform: 'shopify', vertical: 'ecommerce' },
  { id: '9f8e7d6c-0002-4aaa-8bbb-000000000002', label: 'Acme outlet', platform: 'shopify', vertical: 'ecommerce' },
  { id: '9f8e7d6c-0003-4aaa-8bbb-000000000003', label: 'Woo <b>store</b>', platform: 'woocommerce', vertical: 'ecommerce' },
  { id: '9f8e7d6c-0004-4aaa-8bbb-000000000004', label: null, platform: 'woocommerce', vertical: 'ecommerce' },
]
const [MAIN, OUTLET, WOO, UNLABELLED] = SHOPS as [
  (typeof SHOPS)[number],
  (typeof SHOPS)[number],
  (typeof SHOPS)[number],
  (typeof SHOPS)[number],
]
const PLATFORMS = [
  { slug: 'shopify', name: 'Shopify', count: 2 },
  { slug: 'woocommerce', name: 'WooCommerce', count: 2 },
]

/** admin-api's matching, in miniature: platform, then search (an exact id first), then limit. */
async function fakeConnections(
  _token: string,
  q: { platform?: string; search?: string; limit?: number },
) {
  let list = SHOPS.filter((c) => !q.platform || c.platform === q.platform)
  const s = q.search?.trim().toLowerCase()
  if (s) {
    list = list
      .filter((c) => c.id.includes(s) || (c.label ?? '').toLowerCase().includes(s))
      .sort((a, b) => Number(b.id === s) - Number(a.id === s))
  }
  return { connections: list.slice(0, q.limit ?? 50), platforms: PLATFORMS, total: list.length }
}

function session(role: 'viewer' | 'operator' | 'admin') {
  seq += 1
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: role, role, token: `jwt-${seq}` }))
}
function access(permissions: string[]) {
  mockGetMyAccess.mockResolvedValue({
    roleId: 'r',
    roleName: 'r',
    permissions,
    scope: { mode: 'all', grants: [] },
  })
}
function get(url: string, role: 'viewer' | 'operator' | 'admin' = 'operator') {
  return fastify.inject({ method: 'GET', url, cookies: { session: session(role) } })
}
function post(
  url: string,
  role: 'viewer' | 'operator' | 'admin',
  body: Record<string, string | string[]>,
) {
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
    mockListDashboards,
    mockGetDashboard,
    mockListDashboardMetrics,
    mockGetDashboardMetric,
    mockCreateDashboard,
    mockUpdateDashboard,
    mockListTenants,
    mockListDashboardCurrencies,
    mockGetDashboardConnections,
  ]) {
    m.mockReset()
  }
  mockListDashboardCurrencies.mockResolvedValue(['EUR', 'GBP', 'USD'])
  mockGetDashboardConnections.mockImplementation(fakeConnections)
  mockListTenants.mockResolvedValue([
    { id: 'acme', name: 'Acme', createdAt: 0, updatedAt: 0 },
    { id: 'globex', name: 'Globex', createdAt: 0, updatedAt: 0 },
  ])
  mockListDashboards.mockResolvedValue([ECOMMERCE])
  mockGetDashboard.mockResolvedValue(ECOMMERCE)
  mockListDashboardMetrics.mockResolvedValue(CATALOG)
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

describe('dashboard pages', () => {
  it('lists dashboards for a viewer, without the New button', async () => {
    access(VIEWER)
    const res = await get('/dashboards', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('href="/dashboards"')
    expect(res.body).toContain('Ecommerce')
    expect(res.body).not.toContain('href="/dashboards/new"')
  })

  it('groups the built-in cards under one heading per vertical, in the order served', async () => {
    access(VIEWER)
    const card = (id: string, name: string, vertical: string | null) => ({
      ...ECOMMERCE,
      id,
      name,
      vertical,
    })
    mockListDashboards.mockResolvedValue([
      card('builtin:overview', 'System health', null),
      card('builtin:ecommerce', 'Ecommerce', 'ecommerce'),
      card('builtin:ecommerce-risk', 'Ecommerce risk', 'ecommerce'),
      card('builtin:support', 'Support', 'customer-support'),
    ])
    const res = await get('/dashboards', 'viewer')
    expect(res.statusCode).toBe(200)
    const groups = [...res.body.matchAll(/data-dashboards-group="([^"]+)">([^<]+)</g)].map(
      (m) => [m[1], m[2]],
    )
    expect(groups).toEqual([
      ['system', 'System'],
      ['ecommerce', 'Ecommerce'],
      // VERTICAL_LABELS, not the key title-cased.
      ['customer-support', 'Customer Support'],
    ])
    const order = ['System health', 'Ecommerce', 'Ecommerce risk', 'Support'].map((n) =>
      res.body.indexOf('<strong>' + n + '</strong>'),
    )
    expect(order.every((i) => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('renders a dashboard wired for dashboard.js under a strict CSP', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?days=7', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-metric-id="ecommerce.orders_per_day"')
    expect(res.body).toContain('data-chart="line"')
    expect(res.body).toContain('grid-column: span 6')
    expect(res.body).toContain('>Revenue</h2>')
    expect(res.body).toContain('src="/vendor/echarts.min.js"')
    expect(res.body).toContain('src="/public/js/dashboard.js"')
    expect(res.body).toMatch(/data-from="\d{4}-\d{2}-\d{2}"/)
    expect(res.body).not.toContain('href="/dashboards/builtin:ecommerce/edit"')
    const csp = String(res.headers['content-security-policy'])
    expect(csp).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; font-src 'self' data:",
    )
    expect(res.body).not.toMatch(/\son(click|submit)="/)
  })

  it('marks a widget whose metric is not in the viewer’s catalog', async () => {
    access(VIEWER)
    mockListDashboardMetrics.mockResolvedValue([CATALOG[0]])
    const res = await get('/dashboards/builtin:ecommerce', 'viewer')
    expect(res.body).toContain('This metric is not available to you.')
  })

  it('refuses a user without dashboards:view', async () => {
    access(['connections:read'])
    expect((await get('/dashboards', 'viewer')).statusCode).toBe(403)
  })

  it('serves the vendored ECharts build, and nothing else from the package', async () => {
    access(VIEWER)
    const ok = await fastify.inject({ method: 'GET', url: '/vendor/echarts.min.js' })
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toContain('javascript')
    const other = await fastify.inject({ method: 'GET', url: '/vendor/echarts.js' })
    expect(other.statusCode).toBe(404)
  })
})

describe('metric JSON route', () => {
  it('proxies the metric with the range', async () => {
    access(VIEWER)
    mockGetDashboardMetric.mockResolvedValue({ value: 3, series: [] })
    const res = await get(
      '/dashboards/metric/ecommerce.orders_per_day?from=2026-03-01&to=2026-03-07',
      'viewer',
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: { value: 3, series: [] } })
    expect(mockGetDashboardMetric).toHaveBeenCalledWith(
      expect.any(String),
      'ecommerce.orders_per_day',
      {
        from: '2026-03-01',
        to: '2026-03-07',
      },
    )
  })

  it('relays a refusal as JSON with its status', async () => {
    access(VIEWER)
    mockGetDashboardMetric.mockRejectedValue(
      Object.assign(new Error('404'), {
        response: {
          status: 404,
          data: { error: { code: 'METRIC_NOT_FOUND', message: 'No such metric.' } },
        },
      }),
    )
    const res = await get('/dashboards/metric/nope', 'viewer')
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('METRIC_NOT_FOUND')
  })
})

describe('edit form', () => {
  it('adds a widget without saving', async () => {
    access(OPERATOR)
    const res = await post('/dashboards', 'operator', {
      name: 'Mine',
      audience: 'private',
      action: 'add',
      add_metric: 'system.records_per_vertical',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('value="system.records_per_vertical"')
    expect(mockCreateDashboard).not.toHaveBeenCalled()
  })

  it('saves the draft and redirects to it', async () => {
    access(OPERATOR)
    mockCreateDashboard.mockResolvedValue({
      ...ECOMMERCE,
      id: 'dsh_1',
      name: 'Mine',
      builtin: false,
    })
    const res = await post('/dashboards', 'operator', {
      name: 'Mine',
      audience: 'tenants',
      audience_tenant: 'acme',
      w_metric: ['ecommerce.orders_per_day', 'system.records_per_vertical'],
      w_chart: ['line', 'pie'],
      w_width: ['8', '4'],
      w_title: ['', 'All data'],
      action: 'save',
    })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/dashboards/dsh_1')
    expect(mockCreateDashboard).toHaveBeenCalledWith(expect.any(String), {
      name: 'Mine',
      description: null,
      audience: { kind: 'tenants', tenants: ['acme'] },
      pinnedTenants: null,
      widgets: [
        { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 8 },
        { metricId: 'system.records_per_vertical', chart: 'pie', width: 4, title: 'All data' },
      ],
    })
  })

  it('shows admin-api’s validation error on the form', async () => {
    access(OPERATOR)
    mockCreateDashboard.mockRejectedValue(
      Object.assign(new Error('400'), {
        response: { status: 400, data: { error: 'Unknown metric: x.y' } },
      }),
    )
    const res = await post('/dashboards', 'operator', {
      name: 'Mine',
      w_metric: 'x.y',
      w_chart: 'bar',
      w_width: '6',
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Unknown metric: x.y')
  })

  it('will not open the editor for a built-in', async () => {
    access(OPERATOR)
    expect((await get('/dashboards/builtin:ecommerce/edit')).statusCode).toBe(403)
  })

  it('refuses a viewer', async () => {
    access(VIEWER)
    expect((await get('/dashboards/new', 'viewer')).statusCode).toBe(403)
    expect((await post('/dashboards', 'viewer', { name: 'x' })).statusCode).toBe(403)
  })
})

describe('draft helpers', () => {
  const draft = draftFromForm({
    name: ' A ',
    w_metric: ['a', 'b', 'c'],
    // `sparkline` is not a chart type at all (`radar` is, since metrics v2).
    w_chart: ['line', 'sparkline', 'pie'],
    w_width: ['0', '20', '4'],
  })

  it('clamps widths and falls back to a bar for an unknown chart', () => {
    expect(draft.name).toBe('A')
    expect(draft.widgets.map((w) => [w.chart, w.width])).toEqual([
      ['line', 1],
      ['bar', 12],
      ['pie', 4],
    ])
  })

  it('moves and removes widgets', () => {
    expect(applyAction(draft, 'up:1', '', [])!.widgets.map((w) => w.metricId)).toEqual([
      'b',
      'a',
      'c',
    ])
    expect(applyAction(draft, 'down:2', '', [])!.widgets.map((w) => w.metricId)).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(applyAction(draft, 'remove:0', '', [])!.widgets.map((w) => w.metricId)).toEqual([
      'b',
      'c',
    ])
    expect(applyAction(draft, 'save', '', [])).toBeNull()
  })

  it('computes preset and explicit ranges', () => {
    const now = new Date('2026-03-31T12:00:00Z')
    expect(rangeFromQuery({ days: '7' }, now)).toEqual({
      from: '2026-03-25',
      to: '2026-03-31',
      days: 7,
      currency: null,
    })
    expect(rangeFromQuery({ from: '2026-01-01', to: '2026-01-31' }, now)).toEqual({
      from: '2026-01-01',
      to: '2026-01-31',
      days: null,
      currency: null,
    })
    expect(rangeFromQuery({ days: '13' }, now).days).toBe(30)
    // The filter form posts dates; a window that is a preset keeps it pressed.
    expect(rangeFromQuery({ from: '2026-03-25', to: '2026-03-31' }, now).days).toBe(7)
  })
})

describe('sharing', () => {
  const names = new Map([
    ['acme', 'Acme'],
    ['globex', 'Globex'],
  ])
  const restricted = {
    mode: 'restricted' as const,
    grants: [{ tenantId: 'acme', verticals: '*' as const }],
  }

  it('sharingFromForm reads the audience radio, tenant boxes and pins', () => {
    expect(
      sharingFromForm({ audience: 'tenants', audience_tenant: ['globex', 'acme'], pin_tenant: 'acme' }),
    ).toEqual({
      audience: { kind: 'tenants', tenants: ['acme', 'globex'] },
      pinnedTenants: ['acme'],
    })
    expect(sharingFromForm({ audience: 'everyone' })).toEqual({
      audience: { kind: 'everyone' },
      pinnedTenants: null,
    })
    expect(sharingFromForm({})).toEqual({ audience: { kind: 'private' }, pinnedTenants: null })
    expect(draftFromForm({ name: 'x', audience: 'everyone' })).toMatchObject({
      audience: { kind: 'everyone' },
      pinnedTenants: null,
    })
  })

  it('tenantChoices keeps stored tenants the editor cannot list', () => {
    const tenants = [{ id: 'acme', name: 'Acme', createdAt: 0, updatedAt: 0 }]
    expect(tenantChoices(tenants as never, ['acme', 'deleted-tenant'], null)).toEqual([
      { id: 'acme', name: 'Acme' },
      { id: 'deleted-tenant', name: 'deleted-tenant' },
    ])
  })

  it('dataFromLabel explains where the numbers come from', () => {
    expect(dataFromLabel(null, { mode: 'all', grants: [] }, names)).toBe('every tenant you can see')
    expect(dataFromLabel(null, restricted, names)).toBe('your tenants (Acme)')
    expect(dataFromLabel(['acme', 'globex'], { mode: 'all', grants: [] }, names)).toBe(
      'Acme, Globex',
    )
    expect(dataFromLabel(['acme', 'globex'], restricted, names)).toBe('Acme')
  })

  it('groupDashboards sorts into mine / tenants / everyone / others', () => {
    const d = (id: string, ownerUserId: string, audience: unknown) =>
      ({ ...ECOMMERCE, id, builtin: false, ownerUserId, audience }) as never
    const g = groupDashboards(
      [
        d('m', 'u1', { kind: 'private' }),
        d('t', 'u2', { kind: 'tenants', tenants: ['acme'] }),
        d('e', 'u2', { kind: 'everyone' }),
        d('o', 'u2', { kind: 'private' }),
      ],
      'u1',
    )
    expect([g.mine, g.tenants, g.everyone, g.others].map((x) => x.map((y: { id: string }) => y.id))).toEqual([
      ['m'],
      ['t'],
      ['e'],
      ['o'],
    ])
  })

  it('the edit form offers only listed tenants and hides "everyone" without share_all', async () => {
    access(OPERATOR)
    mockListDashboardMetrics.mockResolvedValue(CATALOG)
    const res = await get('/dashboards/new')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="audience_tenant" value="acme"')
    expect(res.body).not.toContain('value="everyone"')
    access([...OPERATOR, 'dashboards:share_all'])
    expect((await get('/dashboards/new')).body).toContain('value="everyone"')
  })

  it('the dashboard page shows "Data from" and passes its id to metric fetches', async () => {
    access(VIEWER)
    mockListDashboardMetrics.mockResolvedValue(CATALOG)
    mockGetDashboard.mockResolvedValue({
      ...ECOMMERCE,
      id: 'dsh_1',
      builtin: false,
      ownerUserId: 'u2',
      audience: { kind: 'everyone' },
      pinnedTenants: ['acme'],
    })
    const res = await get('/dashboards/dsh_1', 'viewer')
    expect(res.body).toContain('Data from: Acme')
    expect(res.body).toContain('data-dashboard-id="dsh_1"')
    mockGetDashboardMetric.mockResolvedValue({})
    await get(
      '/dashboards/metric/ecommerce.orders_per_day?from=2026-03-01&to=2026-03-30&dashboard=dsh_1',
      'viewer',
    )
    expect(mockGetDashboardMetric).toHaveBeenLastCalledWith(
      expect.any(String),
      'ecommerce.orders_per_day',
      {
        from: '2026-03-01',
        to: '2026-03-30',
        dashboard: 'dsh_1',
      },
    )
  })

  it('the list groups dashboards under Mine / Shared with your tenants / Shared with everyone', async () => {
    access(VIEWER)
    mockListDashboards.mockResolvedValue([
      ECOMMERCE,
      {
        ...ECOMMERCE,
        id: 'dsh_t',
        name: 'Tenant one',
        builtin: false,
        ownerUserId: 'u2',
        audience: { kind: 'tenants', tenants: ['acme'] },
      },
      {
        ...ECOMMERCE,
        id: 'dsh_e',
        name: 'Everyone one',
        builtin: false,
        ownerUserId: 'u2',
        audience: { kind: 'everyone' },
      },
    ])
    const body = (await get('/dashboards', 'viewer')).body
    expect(body).toContain('Shared with your tenants')
    expect(body).toContain('Shared with everyone')
    expect(body.indexOf('Tenant one')).toBeLessThan(body.indexOf('Everyone one'))
    expect(body).toContain('Acme')
  })
})

describe('editing a dashboard with stored tenants the editor cannot list', () => {
  it('renders stored and deleted tenants ticked so a save does not drop them', async () => {
    access(OPERATOR)
    mockListDashboardMetrics.mockResolvedValue(CATALOG)
    mockGetDashboard.mockResolvedValue({
      ...ECOMMERCE,
      id: 'dsh_2',
      builtin: false,
      ownerUserId: 'u1',
      editable: true,
      audience: { kind: 'tenants', tenants: ['acme', 'deleted-tenant'] },
      pinnedTenants: ['deleted-tenant'],
    })
    const res = await get('/dashboards/dsh_2/edit')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('name="audience_tenant" value="deleted-tenant" checked')
    expect(res.body).toContain('name="audience_tenant" value="acme" checked')
    expect(res.body).toContain('name="pin_tenant" value="deleted-tenant" checked')
  })
})

describe('currency filter on the dashboard page', () => {
  const PINNED = {
    ...ECOMMERCE,
    id: 'dsh_money',
    builtin: false,
    ownerUserId: 'u1',
    widgets: [
      { metricId: 'ecommerce.revenue_per_day', chart: 'bar', width: 6 },
      { metricId: 'ecommerce.revenue_per_day', chart: 'line', width: 6, currency: 'GBP' },
      {
        metricId: 'ecommerce.orders_per_day',
        chart: 'line',
        width: 12,
        granularity: 'week',
        compare: true,
      },
    ],
  }

  it('offers "All currencies (each separately)" plus the scope’s currencies', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<select class="select select--sm" name="currency" data-autosubmit>')
    expect(res.body).toContain('<option value="" selected>All currencies (each separately)</option>')
    for (const c of ['EUR', 'GBP', 'USD']) expect(res.body).toContain(`<option value="${c}">${c}</option>`)
    expect(mockListDashboardCurrencies).toHaveBeenCalledWith(
      expect.any(String),
      'builtin:ecommerce',
      {},
    )
    // No filter: every widget draws every currency separately.
    expect(res.body).toContain('data-currency=""')
  })

  it('carries the chosen currency into the presets and every widget without a pin', async () => {
    access(VIEWER)
    mockGetDashboard.mockResolvedValue(PINNED)
    const res = await get('/dashboards/dsh_money?days=30&currency=EUR', 'viewer')
    expect(res.body).toContain('<option value="EUR" selected>EUR</option>')
    expect(res.body).toContain('href="/dashboards/dsh_money?days=7&amp;currency=EUR"')
    const widgets = res.body.split('data-widget\n').slice(1)
    expect(widgets[0]).toContain('data-currency="EUR"')
    expect(widgets[0]).toContain('EUR</span>')
    // A pinned widget keeps its own currency whatever the filter says.
    expect(widgets[1]).toContain('data-currency="GBP"')
    expect(widgets[1]).toContain('GBP · pinned')
    // Options travel with the widget; `auto` is never sent.
    expect(widgets[2]).toContain('data-granularity="week" data-compare="1"')
    expect(widgets[0]).toContain('data-granularity="" data-compare=""')
    expect(res.body).toContain('data-dashboard-id="dsh_money"')
  })

  it('falls back to every currency for a code outside the list', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?currency=JPY', 'viewer')
    expect(res.body).toContain('<option value="" selected>All currencies (each separately)</option>')
    expect(res.body).not.toContain('currency=JPY')
    expect(res.body).not.toContain('data-currency="JPY"')
  })

  it('still renders, and says so, when the currency list cannot be loaded', async () => {
    access(VIEWER)
    mockListDashboardCurrencies.mockRejectedValue(new Error('down'))
    const res = await get('/dashboards/builtin:ecommerce?currency=EUR', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('The currency list could not be loaded.')
    // The filter being viewed is kept rather than silently widened.
    expect(res.body).toContain('<option value="EUR" selected>EUR</option>')
  })

  it('draws a stored chart the metric no longer offers as the metric’s default', async () => {
    access(VIEWER)
    mockGetDashboard.mockResolvedValue({
      ...PINNED,
      widgets: [{ metricId: 'ecommerce.revenue_per_day', chart: 'pie', width: 6 }],
    })
    const res = await get('/dashboards/dsh_money', 'viewer')
    expect(res.body).toContain('data-chart="line"')
    expect(res.body).not.toContain('data-chart="pie"')
  })
})

describe('metric JSON route parameters', () => {
  it('forwards currency, granularity, compare and dashboard', async () => {
    access(VIEWER)
    mockGetDashboardMetric.mockResolvedValue({})
    await get(
      '/dashboards/metric/ecommerce.revenue_per_day?from=2026-03-01&to=2026-03-30&dashboard=dsh_1&currency=EUR&granularity=month&compare=1',
      'viewer',
    )
    expect(mockGetDashboardMetric).toHaveBeenLastCalledWith(
      expect.any(String),
      'ecommerce.revenue_per_day',
      {
        from: '2026-03-01',
        to: '2026-03-30',
        dashboard: 'dsh_1',
        currency: 'EUR',
        granularity: 'month',
        compare: true,
      },
    )
  })

  it('drops malformed values and never sends auto', () => {
    expect(
      metricQuery({ currency: 'eur', granularity: 'auto', compare: 'yes', dashboard: '' }),
    ).toEqual({ from: undefined, to: undefined, dashboard: undefined })
    expect(metricQuery({ granularity: 'year', currency: 'EURO' })).not.toHaveProperty('granularity')
    expect(metricQuery({ compare: 'true', granularity: 'day' })).toMatchObject({
      compare: true,
      granularity: 'day',
    })
  })
})

describe('edit form options', () => {
  function editing(widgets: unknown[]) {
    mockGetDashboard.mockResolvedValue({
      ...ECOMMERCE,
      id: 'dsh_3',
      builtin: false,
      ownerUserId: 'u1',
      editable: true,
      widgets,
    })
  }

  it('offers only the metric’s charts, and the options that apply to it', async () => {
    access(OPERATOR)
    editing([
      { metricId: 'ecommerce.revenue_per_day', chart: 'area', width: 6, currency: 'GBP', compare: true },
      { metricId: 'system.records_per_vertical', chart: 'pie', width: 6 },
    ])
    const res = await get('/dashboards/dsh_3/edit')
    expect(res.statusCode).toBe(200)
    const [money, system] = res.body.split('<tr data-widget-row>').slice(1) as [string, string]
    // Chart select: the metric's charts, labelled, the stored one selected.
    expect(money).toContain('<option value="area" selected>Area</option>')
    expect(money).not.toContain('value="pie"')
    expect(money).not.toContain('value="calendar"')
    // Currency: "Follow dashboard filter" plus each currency, the pin selected.
    expect(money).toContain('name="w_currency"')
    expect(money).toContain('>Follow dashboard filter</option>')
    expect(money).toContain('<option value="GBP" selected>Only GBP</option>')
    expect(money).toContain('<option value="EUR">Only EUR</option>')
    // Granularity for a series over time; compare for a comparable metric.
    expect(money).toContain('name="w_granularity" aria-label')
    expect(money).toContain('<option value="week">By week</option>')
    expect(money).toContain('name="w_compare" value="0" checked')
    // A count with no currency, buckets or prior period: hidden, aligned lists.
    expect(system).toContain('<option value="pie" selected>Pie</option>')
    expect(system).toContain('<input type="hidden" name="w_currency" value="">')
    expect(system).toContain('<input type="hidden" name="w_granularity" value="">')
    expect(system).not.toContain('w_compare')
  })

  it('groups the metric picker by vertical, then section', async () => {
    access(OPERATOR)
    const body = (await get('/dashboards/new')).body
    const labels = [...body.matchAll(/<optgroup label="([^"]+)">/g)].map((m) => m[1])
    expect(labels).toEqual([
      'Accounting · Receivables',
      'Ecommerce · Sales',
      'Ecommerce · Risk',
      'System',
    ])
    expect(body).toContain('Revenue per day (per currency)</option>')
  })

  it('resets a saved chart that no longer fits its metric, so Save cannot fail on it', async () => {
    access(OPERATOR)
    editing([{ metricId: 'ecommerce.revenue_per_day', chart: 'pie', width: 6 }])
    const body = (await get('/dashboards/dsh_3/edit')).body
    expect(body).toContain('<option value="line" selected>Line</option>')
    expect(body).toContain('data-chart-reset')
  })

  it('saves the options it was given', async () => {
    access(OPERATOR)
    mockCreateDashboard.mockResolvedValue({ ...ECOMMERCE, id: 'dsh_4', builtin: false })
    const res = await post('/dashboards', 'operator', {
      name: 'Money',
      audience: 'private',
      w_metric: ['ecommerce.revenue_per_day', 'ecommerce.orders_per_day', 'system.records_per_vertical'],
      w_chart: ['bar', 'calendar', 'pie'],
      w_width: ['6', '12', '6'],
      w_title: ['', '', ''],
      w_currency: ['EUR', '', ''],
      w_granularity: ['', 'day', ''],
      w_compare: ['0'],
      action: 'save',
    })
    expect(res.statusCode).toBe(302)
    expect(mockCreateDashboard.mock.calls[0]![1].widgets).toEqual([
      { metricId: 'ecommerce.revenue_per_day', chart: 'bar', width: 6, currency: 'EUR', compare: true },
      { metricId: 'ecommerce.orders_per_day', chart: 'calendar', width: 12, granularity: 'day' },
      { metricId: 'system.records_per_vertical', chart: 'pie', width: 6 },
    ])
  })

  it('shows admin-api’s chart-fit refusal on the form', async () => {
    access(OPERATOR)
    mockCreateDashboard.mockRejectedValue(
      Object.assign(new Error('400'), {
        response: {
          status: 400,
          data: { error: 'Chart heatmap does not fit ecommerce.orders_per_day' },
        },
      }),
    )
    const res = await post('/dashboards', 'operator', {
      name: 'Mine',
      w_metric: 'ecommerce.orders_per_day',
      w_chart: 'heatmap',
      w_width: '6',
    })
    expect(res.statusCode).toBe(400)
    expect(res.body).toContain('Chart heatmap does not fit ecommerce.orders_per_day')
  })
})

describe('widget option helpers', () => {
  it('draftFromForm round-trips currency, granularity and compare through the edit form', async () => {
    const draft = draftFromForm({
      name: 'x',
      w_metric: ['a', 'b', 'c', 'd'],
      w_chart: ['line', 'bar', 'number', 'table'],
      w_width: ['6', '6', '6', '6'],
      w_currency: ['USD', '', 'usd', ''],
      w_granularity: ['week', 'auto', 'year', ''],
      w_compare: ['1', '3', 'x'],
    })
    expect(draft.widgets).toEqual([
      { metricId: 'a', chart: 'line', width: 6, currency: 'USD', granularity: 'week' },
      { metricId: 'b', chart: 'bar', width: 6, compare: true },
      { metricId: 'c', chart: 'number', width: 6 },
      { metricId: 'd', chart: 'table', width: 6, compare: true },
    ])
    // Moving a row keeps its options with it.
    expect(applyAction(draft, 'down:0', '', [])!.widgets[1]).toEqual(draft.widgets[0])
  })

  it('applyAction adds a widget with the metric’s default chart, no pin, auto buckets and compare when it can', () => {
    const empty = draftFromForm({ name: 'x' })
    const catalog = CATALOG as never
    expect(applyAction(empty, 'add', 'ecommerce.revenue_per_day', catalog)!.widgets).toEqual([
      { metricId: 'ecommerce.revenue_per_day', chart: 'line', width: 6, compare: true },
    ])
    expect(applyAction(empty, 'add', 'accounting.ar_aging', catalog)!.widgets).toEqual([
      { metricId: 'accounting.ar_aging', chart: 'bar', width: 6 },
    ])
  })

  it('fitCharts resets only widgets whose chart their metric no longer lists', () => {
    const { draft, reset } = fitCharts(
      draftFromForm({
        name: 'x',
        w_metric: ['ecommerce.revenue_per_day', 'ecommerce.revenue_per_day', 'gone.metric'],
        w_chart: ['pie', 'area', 'pie'],
        w_width: ['6', '6', '6'],
      }),
      CATALOG as never,
    )
    expect(draft.widgets.map((w) => w.chart)).toEqual(['line', 'area', 'pie'])
    expect(reset).toEqual([0])
  })

  it('currencyChoices keeps pinned currencies the list no longer holds', () => {
    expect(
      currencyChoices(['USD', 'EUR'], [{ metricId: 'a', chart: 'number', width: 4, currency: 'CHF' }]),
    ).toEqual(['CHF', 'EUR', 'USD'])
  })

  it('rangeFromQuery validates the currency against the list', () => {
    const now = new Date('2026-03-31T12:00:00Z')
    expect(rangeFromQuery({ currency: 'EUR' }, now, ['EUR']).currency).toBe('EUR')
    expect(rangeFromQuery({ currency: 'JPY' }, now, ['EUR']).currency).toBeNull()
    expect(rangeFromQuery({ currency: 'EUR' }, now).currency).toBeNull()
    // The list could not be loaded: a well-formed code is kept, junk is not.
    expect(rangeFromQuery({ currency: 'EUR' }, now, null).currency).toBe('EUR')
    expect(rangeFromQuery({ currency: 'eur' }, now, null).currency).toBeNull()
  })

  it('groupCatalog orders verticals as the console does, sections as the catalog does, system last', () => {
    expect(groupCatalog(CATALOG as never).map((g) => [g.label, g.metrics.map((m) => m.id)])).toEqual([
      ['Accounting · Receivables', ['accounting.ar_aging']],
      ['Ecommerce · Sales', ['ecommerce.orders_per_day', 'ecommerce.revenue_per_day']],
      ['Ecommerce · Risk', ['ecommerce.customer_concentration']],
      ['System', ['system.records_per_vertical']],
    ])
  })
})

describe('currency choices are ISO codes only', () => {
  const RAW = ['eur', 'USD', ' gbp ', '<img src=x onerror=alert(1)>', 'US Dollar', 'usd']

  it('the view offers upper-cased codes, drops junk, and matches the filter against them', async () => {
    access(VIEWER)
    mockListDashboardCurrencies.mockResolvedValue(RAW)
    const res = await get('/dashboards/builtin:ecommerce?currency=EUR', 'viewer')
    // The currency select's options (the page also has the adapter select and a datalist).
    const select = res.body.split('name="currency"')[1]!.split('</select>')[0]!
    const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>/g)].map((m) => m[1])
    expect(options).toEqual(['', 'EUR', 'GBP', 'USD'])
    expect(res.body).toContain('<option value="EUR" selected>EUR</option>')
    expect(res.body).not.toContain('onerror')
    expect(res.body).not.toContain('US Dollar')
  })

  it('the editor offers the same codes for a widget pin', async () => {
    access(OPERATOR)
    mockListDashboardCurrencies.mockResolvedValue(RAW)
    mockGetDashboard.mockResolvedValue({
      ...ECOMMERCE,
      id: 'dsh_5',
      builtin: false,
      ownerUserId: 'u1',
      editable: true,
      widgets: [{ metricId: 'ecommerce.revenue_per_day', chart: 'line', width: 6 }],
    })
    const body = (await get('/dashboards/dsh_5/edit')).body
    const pins = [...body.matchAll(/>Only ([^<]*)<\/option>/g)].map((m) => m[1])
    expect(pins).toEqual(['EUR', 'GBP', 'USD'])
    expect(body).not.toContain('onerror')
  })

  it('currencyChoices normalises what it is given and what widgets are pinned to', () => {
    expect(
      currencyChoices(['usd', 'junk', ' eur '], [{ metricId: 'a', chart: 'number', width: 4, currency: 'chf' }]),
    ).toEqual(['CHF', 'EUR', 'USD'])
  })
})

describe('built-in groups on the dashboards page', () => {
  it('label each vertical with the console’s own name for it', async () => {
    access(VIEWER)
    const builtin = (id: string, vertical: string | null) => ({
      ...ECOMMERCE,
      id,
      name: id,
      vertical,
    })
    mockListDashboards.mockResolvedValue([
      builtin('builtin:system-health', null),
      builtin('builtin:crm', 'crm'),
      builtin('builtin:crm-risk', 'crm'),
      builtin('builtin:support', 'customer-support'),
      builtin('builtin:docsign', 'docsign'),
    ])
    const body = (await get('/dashboards', 'viewer')).body
    const labels = [...body.matchAll(/data-dashboards-group="([^"]+)">([^<]+)</g)].map((m) => [
      m[1],
      m[2],
    ])
    expect(labels).toEqual([
      ['system', 'System'],
      ['crm', 'CRM'],
      ['customer-support', 'Customer Support'],
      ['docsign', 'Docsign'],
    ])
  })
})

describe('connection and adapter filter', () => {
  const OVERVIEW = {
    ...ECOMMERCE,
    id: 'builtin:overview',
    name: 'System health',
    vertical: null,
    widgets: [{ metricId: 'system.records_per_vertical', chart: 'bar', width: 12 }],
  }
  const userDashboard = (widgets: unknown[]) => ({
    ...ECOMMERCE,
    id: 'dsh_shop',
    builtin: false,
    vertical: null,
    ownerUserId: 'u1',
    widgets,
  })
  const SINGLE = userDashboard([
    { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 },
    { metricId: 'ecommerce.customer_concentration', chart: 'gauge', width: 6 },
    // A system widget does not make a dashboard mixed.
    { metricId: 'system.records_per_vertical', chart: 'bar', width: 12 },
  ])
  const MIXED = userDashboard([
    { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 },
    { metricId: 'accounting.ar_aging', chart: 'bar', width: 6 },
  ])
  const widgetsOf = (body: string) => body.split('data-widget\n').slice(1)
  const NO_FILTER_BAR = 'data-connection-filter'

  it('shows on a built-in vertical dashboard: adapters with counts, a datalist of connections', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('data-connection-filter')
    expect(mockGetDashboardConnections).toHaveBeenCalledWith(expect.any(String), {
      dashboard: 'builtin:ecommerce',
      vertical: 'ecommerce',
      limit: 200,
    })
    expect(res.body).toContain('<option value="" selected>All adapters</option>')
    expect(res.body).toContain('<option value="shopify">Shopify (2)</option>')
    expect(res.body).toContain('<option value="woocommerce">WooCommerce (2)</option>')
    // The input searches the datalist natively: value = id, text = label · adapter · id.
    expect(res.body).toMatch(/<input[^>]+name="connection"[^>]+list="dash-connections"/)
    expect(res.body).toContain(`<option value="${MAIN.id}">Acme main shop · Shopify · ${MAIN.id}</option>`)
    expect(res.body).toContain(`<option value="${UNLABELLED.id}">WooCommerce · ${UNLABELLED.id}</option>`)
    // Third-party text is escaped.
    expect(res.body).toContain('Woo &lt;b&gt;store&lt;/b&gt; · WooCommerce')
    expect(res.body).not.toContain('<b>store</b>')
    // Nothing applied: no chip, widgets unfiltered.
    expect(res.body).not.toContain('data-connection-chip')
    for (const w of widgetsOf(res.body)) {
      expect(w).toContain('data-connection="" data-platform="" data-vertical=""')
    }
    expect(res.body).not.toMatch(/\son(click|submit|input|change)="/)
  })

  it('shows on a user dashboard whose widgets share one vertical, system widgets aside', async () => {
    access(VIEWER)
    mockGetDashboard.mockResolvedValue(SINGLE)
    const res = await get('/dashboards/dsh_shop', 'viewer')
    expect(res.body).toContain('data-connection-filter')
    expect(mockGetDashboardConnections).toHaveBeenCalledWith(expect.any(String), {
      dashboard: 'dsh_shop',
      vertical: 'ecommerce',
      limit: 200,
    })
    // System charts are filtered too, and the bar says so.
    expect(res.body).toContain('system charts included')
  })

  it('is hidden on the system overview, a mixed dashboard, and without connections:read', async () => {
    access(VIEWER)
    mockGetDashboard.mockResolvedValue(OVERVIEW)
    const overview = await get('/dashboards/builtin:overview?connection=' + MAIN.id, 'viewer')
    expect(overview.statusCode).toBe(200)
    expect(overview.body).not.toContain(NO_FILTER_BAR)
    // Hidden means not applied either: a stray parameter is ignored.
    for (const w of widgetsOf(overview.body)) expect(w).toContain('data-connection="" data-platform=""')

    mockGetDashboard.mockResolvedValue(MIXED)
    const mixed = await get('/dashboards/dsh_shop?platform=shopify', 'viewer')
    expect(mixed.body).not.toContain(NO_FILTER_BAR)
    for (const w of widgetsOf(mixed.body)) expect(w).toContain('data-connection="" data-platform=""')

    access(['dashboards:view'])
    mockGetDashboard.mockResolvedValue(ECOMMERCE)
    const noRead = await get(`/dashboards/builtin:ecommerce?connection=${MAIN.id}`, 'viewer')
    expect(noRead.statusCode).toBe(200)
    expect(noRead.body).not.toContain(NO_FILTER_BAR)
    for (const w of widgetsOf(noRead.body)) expect(w).toContain('data-connection="" data-platform=""')
    expect(mockGetDashboardConnections).not.toHaveBeenCalled()
  })

  it('applies an exact in-scope id: a chip with label and adapter, and every widget filtered', async () => {
    access(VIEWER)
    const res = await get(`/dashboards/builtin:ecommerce?connection=${OUTLET.id}`, 'viewer')
    expect(res.body).toContain('data-connection-chip')
    expect(res.body).toMatch(/data-connection-chip[^>]*>[\s\S]*Acme outlet · Shopify/)
    expect(res.body).toContain(`name="connection" value="${OUTLET.id}"`)
    for (const w of widgetsOf(res.body)) {
      // The dashboard's vertical travels with the filter, so an adapter slug
      // shared by two verticals stays inside this one.
      expect(w).toContain(`data-connection="${OUTLET.id}" data-platform="" data-vertical="ecommerce"`)
    }
    // The currency list is the filtered one.
    expect(mockListDashboardCurrencies).toHaveBeenCalledWith(
      expect.any(String),
      'builtin:ecommerce',
      { connection: OUTLET.id, vertical: 'ecommerce' },
    )
    // Clear keeps the range and drops the connection.
    expect(res.body).toContain('href="/dashboards/builtin%3Aecommerce?days=30" data-connection-clear')
  })

  it('applies the one connection a search finds, and carries its id rather than the search', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?days=7&connection=OUTLET', 'viewer')
    expect(res.body).toMatch(/data-connection-chip[^>]*>[\s\S]*Acme outlet · Shopify/)
    expect(mockGetDashboardConnections).toHaveBeenCalledWith(expect.any(String), {
      dashboard: 'builtin:ecommerce',
      vertical: 'ecommerce',
      search: 'OUTLET',
      limit: 10,
    })
    expect(res.body).toContain(`href="/dashboards/builtin%3Aecommerce?days=30&amp;connection=${OUTLET.id}"`)
    expect(res.body).not.toContain('connection=OUTLET')
    for (const w of widgetsOf(res.body)) expect(w).toContain(`data-connection="${OUTLET.id}"`)
  })

  it('offers "Did you mean" links when a search finds several, and applies none', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?days=7&currency=EUR&connection=acme', 'viewer')
    expect(res.body).toContain('data-connection-suggestions')
    expect(res.body).toContain('Did you mean')
    for (const c of [MAIN, OUTLET]) {
      expect(res.body).toContain(
        `href="/dashboards/builtin%3Aecommerce?days=7&amp;currency=EUR&amp;connection=${c.id}"`,
      )
    }
    expect(res.body).not.toContain('data-connection-chip')
    // What was typed stays in the box, so it can be refined.
    expect(res.body).toContain('name="connection" value="acme"')
    for (const w of widgetsOf(res.body)) expect(w).toContain('data-connection=""')
  })

  it('says so when nothing matches, and applies nothing', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?connection=%3Cscript%3Ezzz', 'viewer')
    expect(res.body).toContain('data-connection-none')
    expect(res.body).toContain('No connection matches “&lt;script&gt;zzz”')
    expect(res.body).not.toContain('<script>zzz')
    expect(res.body).not.toContain('data-connection-chip')
    for (const w of widgetsOf(res.body)) expect(w).toContain('data-connection=""')
  })

  it('narrows by adapter, and searches within it', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?platform=woocommerce', 'viewer')
    expect(res.body).toContain('<option value="woocommerce" selected>WooCommerce (2)</option>')
    expect(res.body).not.toContain(`<option value="${MAIN.id}">`)
    expect(res.body).toContain(`<option value="${WOO.id}">`)
    for (const w of widgetsOf(res.body)) expect(w).toContain('data-platform="woocommerce"')
    expect(mockListDashboardCurrencies).toHaveBeenLastCalledWith(
      expect.any(String),
      'builtin:ecommerce',
      { platform: 'woocommerce', vertical: 'ecommerce' },
    )
    // A Shopify connection under the WooCommerce adapter: no match.
    const none = await get(
      `/dashboards/builtin:ecommerce?platform=woocommerce&connection=${MAIN.id}`,
      'viewer',
    )
    expect(none.body).toContain('data-connection-none')
    for (const w of widgetsOf(none.body)) expect(w).toContain('data-connection="" data-platform="woocommerce"')
  })

  it('falls back to every adapter for one outside the list', async () => {
    access(VIEWER)
    const res = await get('/dashboards/builtin:ecommerce?platform=magento', 'viewer')
    expect(res.body).toContain('<option value="" selected>All adapters</option>')
    for (const w of widgetsOf(res.body)) expect(w).toContain('data-platform=""')
    expect(res.body).not.toContain('platform=magento')
  })

  it('carries connection and adapter through presets, both forms and every widget', async () => {
    access(VIEWER)
    const res = await get(
      `/dashboards/builtin:ecommerce?days=7&currency=EUR&platform=shopify&connection=${MAIN.id}`,
      'viewer',
    )
    const carried = `platform=shopify&amp;connection=${MAIN.id}`
    expect(res.body).toContain(`href="/dashboards/builtin%3Aecommerce?days=30&amp;currency=EUR&amp;${carried}"`)
    // The range and currency form carries the filter…
    const rangeForm = res.body.split('data-dashboard-filter')[1]!.split('</form>')[0]!
    expect(rangeForm).toContain('<input type="hidden" name="platform" value="shopify">')
    expect(rangeForm).toContain(`<input type="hidden" name="connection" value="${MAIN.id}">`)
    // …and the filter form carries the range and currency.
    const filterForm = res.body.split('data-connection-filter')[1]!.split('</form>')[0]!
    expect(filterForm).toContain('<input type="hidden" name="days" value="7">')
    expect(filterForm).toContain('<input type="hidden" name="currency" value="EUR">')
    for (const w of widgetsOf(res.body)) {
      expect(w).toContain(`data-connection="${MAIN.id}" data-platform="shopify"`)
    }
    // A custom range is carried as dates.
    const custom = await get(
      `/dashboards/builtin:ecommerce?from=2026-01-01&to=2026-01-31&connection=${MAIN.id}`,
      'viewer',
    )
    const customFilter = custom.body.split('data-connection-filter')[1]!.split('</form>')[0]!
    expect(customFilter).toContain('<input type="hidden" name="from" value="2026-01-01">')
    expect(customFilter).toContain('<input type="hidden" name="to" value="2026-01-31">')
    expect(mockListDashboardCurrencies).toHaveBeenLastCalledWith(
      expect.any(String),
      'builtin:ecommerce',
      { connection: MAIN.id, vertical: 'ecommerce' },
    )
  })

  it('still renders when the connection list cannot be loaded, keeping a well-formed filter', async () => {
    access(VIEWER)
    mockGetDashboardConnections.mockRejectedValue(new Error('down'))
    const res = await get(
      `/dashboards/builtin:ecommerce?platform=shopify&connection=${MAIN.id}`,
      'viewer',
    )
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('The connection list could not be loaded.')
    // The select still reads true, so the adapter can be seen and cleared.
    expect(res.body).toContain('<option value="shopify" selected>shopify</option>')
    // Kept rather than silently widened to every connection.
    for (const w of widgetsOf(res.body)) {
      expect(w).toContain(`data-connection="${MAIN.id}" data-platform="shopify"`)
    }
    // Without the list a value cannot be told from a search: a well-formed one
    // is kept as an id (no data rather than every connection's)…
    const search = await get('/dashboards/builtin:ecommerce?connection=acme', 'viewer')
    for (const w of widgetsOf(search.body)) expect(w).toContain('data-connection="acme"')
    // …and a malformed one is dropped.
    const junk = await get('/dashboards/builtin:ecommerce?connection=acme%20shop', 'viewer')
    for (const w of widgetsOf(junk.body)) expect(w).toContain('data-connection=""')
  })

  it('forwards connection, platform and vertical from the metric JSON route, dropping malformed values', async () => {
    access(VIEWER)
    mockGetDashboardMetric.mockResolvedValue({})
    await get(
      `/dashboards/metric/ecommerce.orders_per_day?dashboard=builtin:ecommerce&connection=${MAIN.id}&platform=shopify&vertical=ecommerce`,
      'viewer',
    )
    expect(mockGetDashboardMetric).toHaveBeenLastCalledWith(
      expect.any(String),
      'ecommerce.orders_per_day',
      {
        from: undefined,
        to: undefined,
        dashboard: 'builtin:ecommerce',
        connection: MAIN.id,
        platform: 'shopify',
        vertical: 'ecommerce',
      },
    )
    expect(metricQuery({ connection: 'a b', platform: 'Shopify', vertical: 'E' }, true)).toEqual({
      from: undefined,
      to: undefined,
      dashboard: undefined,
    })
    expect(
      metricQuery({ connection: 'x'.repeat(101), platform: '-shop' }, true),
    ).not.toHaveProperty('connection')
  })

  it('drops the filter from the metric JSON route without connections:read', async () => {
    access(['dashboards:view'])
    mockGetDashboardMetric.mockResolvedValue({})
    const res = await get(
      `/dashboards/metric/ecommerce.orders_per_day?dashboard=builtin:ecommerce&currency=EUR&connection=${MAIN.id}&platform=shopify&vertical=ecommerce`,
      'viewer',
    )
    expect(res.statusCode).toBe(200)
    expect(mockGetDashboardMetric).toHaveBeenLastCalledWith(
      expect.any(String),
      'ecommerce.orders_per_day',
      { from: undefined, to: undefined, dashboard: 'builtin:ecommerce', currency: 'EUR' },
    )
    expect(
      metricQuery({ connection: MAIN.id, platform: 'shopify', vertical: 'ecommerce' }, false),
    ).toEqual({ from: undefined, to: undefined, dashboard: undefined })
  })

  it('dashboardVertical: a built-in’s vertical, else the one vertical its non-system widgets share', () => {
    const catalog = CATALOG as never
    expect(dashboardVertical(ECOMMERCE as never, catalog)).toBe('ecommerce')
    expect(dashboardVertical(OVERVIEW as never, catalog)).toBeNull()
    expect(dashboardVertical(SINGLE as never, catalog)).toBe('ecommerce')
    expect(dashboardVertical(MIXED as never, catalog)).toBeNull()
    expect(dashboardVertical(userDashboard([]) as never, catalog)).toBeNull()
    // A metric outside the viewer's catalog still counts by its id's vertical.
    expect(
      dashboardVertical(
        userDashboard([
          { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 },
          { metricId: 'accounting.dso', chart: 'number', width: 6 },
        ]) as never,
        catalog,
      ),
    ).toBeNull()
    expect(
      dashboardVertical(
        userDashboard([{ metricId: 'crm.deals_by_stage', chart: 'bar', width: 6 }]) as never,
        catalog,
      ),
    ).toBe('crm')
  })
})

describe('the connection datalist JSON route', () => {
  const SHOP_DASHBOARD = {
    ...ECOMMERCE,
    id: 'dsh_shop',
    builtin: false,
    vertical: null,
    ownerUserId: 'u1',
    widgets: [{ metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 }],
  }

  it('lists options for a search through admin-api, with the dashboard’s pins and vertical', async () => {
    access(VIEWER)
    mockGetDashboard.mockResolvedValue(SHOP_DASHBOARD)
    // The vertical comes from the dashboard; one in the query is ignored.
    const res = await get(
      '/dashboards/dsh_shop/connections?vertical=accounting&search=acme&platform=shopify',
      'viewer',
    )
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(mockGetDashboardConnections).toHaveBeenLastCalledWith(expect.any(String), {
      dashboard: 'dsh_shop',
      vertical: 'ecommerce',
      platform: 'shopify',
      search: 'acme',
      limit: 200,
    })
    expect(res.json()).toEqual({
      data: {
        options: [
          { value: MAIN.id, text: `Acme main shop · Shopify · ${MAIN.id}` },
          { value: OUTLET.id, text: `Acme outlet · Shopify · ${OUTLET.id}` },
        ],
        total: 2,
      },
    })
  })

  it('needs connections:read and a vertical dashboard, and relays admin-api’s 404', async () => {
    access(['dashboards:view'])
    expect((await get('/dashboards/dsh_shop/connections', 'viewer')).statusCode).toBe(403)
    access(VIEWER)
    // A dashboard you cannot see, and one with no single vertical, offer nothing.
    mockGetDashboard.mockResolvedValue(null)
    expect((await get('/dashboards/dsh_hidden/connections', 'viewer')).statusCode).toBe(404)
    mockGetDashboard.mockResolvedValue({
      ...SHOP_DASHBOARD,
      widgets: [
        { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 },
        { metricId: 'accounting.ar_aging', chart: 'bar', width: 6 },
      ],
    })
    expect(
      (await get('/dashboards/dsh_shop/connections?vertical=ecommerce', 'viewer')).statusCode,
    ).toBe(404)
    expect(mockGetDashboardConnections).not.toHaveBeenCalled()
    mockGetDashboard.mockResolvedValue(SHOP_DASHBOARD)
    mockGetDashboardConnections.mockRejectedValue(
      Object.assign(new Error('404'), {
        response: { status: 404, data: { error: 'Dashboard not found' } },
      }),
    )
    expect((await get('/dashboards/dsh_shop/connections', 'viewer')).statusCode).toBe(404)
  })

  it('is wired only when the page could not list every connection', async () => {
    access(VIEWER)
    const all = await get('/dashboards/builtin:ecommerce', 'viewer')
    expect(all.body).toContain(
      'data-connections-url="/dashboards/builtin%3Aecommerce/connections"',
    )
    expect(all.body).not.toContain('data-more')
    mockGetDashboardConnections.mockImplementation(async (...args: Parameters<typeof fakeConnections>) => ({
      ...(await fakeConnections(...args)),
      total: 500,
    }))
    const capped = await get('/dashboards/builtin:ecommerce', 'viewer')
    expect(capped.body).toContain('data-more')
    expect(capped.body).toContain('Suggestions show 4 of 500 connections')
  })
})

describe('the dashboards index: compact rows, search, vertical chips', () => {
  const builtin = (id: string, name: string, vertical: string | null, description: string) => ({
    ...ECOMMERCE,
    id,
    name,
    vertical,
    description,
  })
  const custom = (id: string, name: string, metricIds: string[], over: Record<string, unknown> = {}) => ({
    ...ECOMMERCE,
    id,
    name,
    description: null,
    builtin: false,
    vertical: null,
    ownerUserId: 'u1',
    audience: { kind: 'private' },
    editable: true,
    widgets: metricIds.map((metricId) => ({ metricId, chart: 'bar', width: 6 })),
    updatedAt: '2026-10-08T09:00:00.000Z',
    ...over,
  })
  const LIST = [
    builtin('builtin:overview', 'System health', null, 'How syncing is going.'),
    builtin('builtin:accounting', 'Accounting', 'accounting', 'Revenue, expenses and tax.'),
    builtin('builtin:accounting-risk', 'Accounting risk', 'accounting', 'Overdue exposure and gaps.'),
    builtin('builtin:ecommerce', 'Ecommerce', 'ecommerce', 'Orders and revenue.'),
    builtin('builtin:crm', 'CRM', 'crm', 'Pipeline and win rate.'),
    custom('dsh_shop', 'Shop board', ['ecommerce.orders_per_day', 'system.records_per_vertical']),
    custom('dsh_books', 'Books board', ['accounting.ar_aging'], {
      ownerUserId: 'u2',
      audience: { kind: 'everyone' },
      editable: false,
    }),
  ]
  /** Names of the dashboards listed, in page order — tiles and table rows alike. */
  const listed = (body: string) => [...body.matchAll(/<strong>([^<]+)<\/strong>/g)].map((m) => m[1])

  beforeEach(() => {
    access(VIEWER)
    mockListDashboards.mockResolvedValue(LIST)
  })

  it('puts your dashboards above the built-in ones', async () => {
    const body = (await get('/dashboards', 'viewer')).body
    const yours = body.indexOf('data-dashboards-yours')
    const builtins = body.indexOf('data-dashboards-builtin')
    expect(yours).toBeGreaterThan(0)
    expect(yours).toBeLessThan(builtins)
    expect(listed(body)).toEqual([
      'Shop board',
      'Books board',
      'System health',
      'Accounting',
      'Accounting risk',
      'Ecommerce',
      'CRM',
    ])
  })

  it('lays the built-ins out one row per vertical, each tile keeping its count and description', async () => {
    const body = (await get('/dashboards', 'viewer')).body
    const rows = body.split('class="dash-row"').slice(1)
    expect(rows).toHaveLength(4)
    const accounting = rows[1]!
    expect(accounting).toContain('data-dashboards-group="accounting">Accounting<')
    expect(accounting).toContain('href="/dashboards/builtin%3Aaccounting-risk"')
    // The description is shown on one line, and whole on hover.
    expect(accounting).toContain('title="Overdue exposure and gaps."')
    expect(accounting).toMatch(/class="dash-tile__desc">Overdue exposure and gaps\.</)
    expect(accounting).toMatch(/class="dash-tile__count">2 charts</)
  })

  it('offers a chip per vertical in the order served, All selected', async () => {
    const body = (await get('/dashboards', 'viewer')).body
    const chips = [...body.matchAll(/data-dashboards-chip="([^"]*)"[^>]*>([^<]+)</g)].map((m) => [m[1], m[2]])
    expect(chips).toEqual([
      ['', 'All'],
      ['system', 'System'],
      ['accounting', 'Accounting'],
      ['ecommerce', 'Ecommerce'],
      ['crm', 'CRM'],
    ])
    expect(body).toMatch(/aria-current="true"[^>]*data-dashboards-chip=""/)
  })

  it('searches names and descriptions, ignoring case, across built-in and your own', async () => {
    const byDescription = await get('/dashboards?q=REVENUE', 'viewer')
    expect(listed(byDescription.body)).toEqual(['Accounting', 'Ecommerce'])
    expect(byDescription.body).toContain('value="REVENUE"')
    const byName = await get('/dashboards?q=board', 'viewer')
    expect(listed(byName.body)).toEqual(['Shop board', 'Books board'])
  })

  it('narrows to one vertical, taking your dashboards by the verticals of their charts', async () => {
    const res = await get('/dashboards?vertical=ecommerce', 'viewer')
    expect(listed(res.body)).toEqual(['Shop board', 'Ecommerce'])
    expect(res.body).toMatch(/aria-current="true"[^>]*data-dashboards-chip="ecommerce"/)
    // A system chart puts a dashboard under System too.
    expect(listed((await get('/dashboards?vertical=system', 'viewer')).body)).toEqual([
      'Shop board',
      'System health',
    ])
  })

  it('combines search and chip, and each keeps the other', async () => {
    const res = await get('/dashboards?vertical=accounting&q=risk', 'viewer')
    expect(listed(res.body)).toEqual(['Accounting risk'])
    expect(res.body).toContain('<input type="hidden" name="vertical" value="accounting">')
    expect(res.body).toContain('href="/dashboards?vertical=crm&amp;q=risk"')
  })

  it('ignores a vertical it does not offer, and caps a runaway search', async () => {
    expect(listed((await get('/dashboards?vertical=nope', 'viewer')).body)).toHaveLength(7)
    const long = await get('/dashboards?q=' + 'x'.repeat(500), 'viewer')
    expect(long.statusCode).toBe(200)
    expect(long.body).not.toContain('x'.repeat(101))
  })

  it('says when nothing matches, with a way back', async () => {
    const res = await get('/dashboards?q=zzz', 'viewer')
    expect(listed(res.body)).toEqual([])
    expect(res.body).toContain('No dashboards match')
    expect(res.body).toMatch(/href="\/dashboards"[^>]*>Clear</)
    expect(res.body).not.toContain('data-dashboards-builtin')
  })

  it('shrinks the no-custom-dashboards prompt to one line', async () => {
    access(OPERATOR)
    mockListDashboards.mockResolvedValue(LIST.filter((d) => d.builtin))
    const body = (await get('/dashboards')).body
    const prompt = body.split('data-dashboards-none')[1]!.split('</div>')[0]!
    expect(prompt).toContain('No custom dashboards yet')
    expect(prompt).toContain('href="/dashboards/new"')
    expect(body).not.toContain('empty-state__icon"><i class="ph ph-chart-line')
    access(VIEWER)
    expect((await get('/dashboards', 'viewer')).body).toContain('needs the dashboards:edit permission')
  })
})

describe('switching dashboards from a dashboard page', () => {
  const LIST = [
    { ...ECOMMERCE, id: 'builtin:overview', name: 'System health', vertical: null },
    ECOMMERCE,
    { ...ECOMMERCE, id: 'builtin:crm', name: 'CRM', vertical: 'crm' },
    { ...ECOMMERCE, id: 'dsh_mine', name: 'Mine one', builtin: false, vertical: null, ownerUserId: 'u1', audience: { kind: 'private' } },
    { ...ECOMMERCE, id: 'dsh_all', name: 'Everyone one', builtin: false, vertical: null, ownerUserId: 'u2', audience: { kind: 'everyone' } },
  ]

  beforeEach(() => {
    access(VIEWER)
    mockListDashboards.mockResolvedValue(LIST)
  })

  it('lists every dashboard, yours first, then by vertical, with this one selected', async () => {
    const res = await get('/dashboards/builtin:ecommerce', 'viewer')
    const form = res.body
      .split('<form')
      .find((f) => f.includes('data-dashboard-switcher'))!
      .split('</form>')[0]!
    expect(form).toContain('action="/dashboards/open"')
    expect(form).toContain('data-autosubmit')
    const groups = [...form.matchAll(/<optgroup label="([^"]+)"/g)].map((m) => m[1])
    expect(groups).toEqual(['Mine', 'Shared with everyone', 'System', 'Ecommerce', 'CRM'])
    expect(form).toMatch(/<option value="builtin:ecommerce" selected>Ecommerce</)
    expect(form.match(/<option /g)).toHaveLength(5)
    // Works without script too.
    expect(form).toContain('<noscript>')
  })

  it('opens the chosen dashboard, and never leaves /dashboards/', async () => {
    const res = await get('/dashboards/open?id=builtin:crm', 'viewer')
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe('/dashboards/builtin%3Acrm')
    const sneaky = await get('/dashboards/open?id=' + encodeURIComponent('../../users'), 'viewer')
    expect(sneaky.headers.location).toBe('/dashboards/..%2F..%2Fusers')
    expect((await get('/dashboards/open', 'viewer')).headers.location).toBe('/dashboards')
  })

  it('still renders the dashboard, without the menu, when the list cannot be loaded', async () => {
    mockListDashboards.mockRejectedValue(new Error('down'))
    const res = await get('/dashboards/builtin:ecommerce', 'viewer')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('data-dashboard-switcher')
  })

  it('is refused without dashboards:view, like every dashboards route', async () => {
    access(['connections:read'])
    expect((await get('/dashboards/open?id=builtin:crm', 'viewer')).statusCode).toBe(403)
  })
})
