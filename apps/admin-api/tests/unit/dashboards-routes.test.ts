/**
 * `/api/dashboards*` — built-in and user dashboards. Pins: permission gating
 * (viewers view, only dashboards:edit holders write), ownership (only the
 * owner or an admin edits or deletes; someone else's private dashboard is a
 * 404), layout validation (max 24 widgets, chart enum, width 1–12, metrics
 * from the catalog, each chart one of its metric's `charts`), the widget
 * options (currency pin, granularity, compare) surviving a save, built-ins
 * read-only and fitting their metrics, audit rows, metric reads proxied with
 * the viewer's scope and parameters, every kind's result passing through the
 * response schema untouched, and the currencies route.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { openDb, type DbHandle } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { createAccessResolver, invalidateAccess } from '../../src/core/auth/access'
import { AdminStore } from '../../src/core/db/admin-store'
import { DashboardStore } from '../../src/core/db/dashboard-store'
import { createDashboardsRoutes, MAX_WIDGETS } from '../../src/core/routes/dashboards'
import { BUILTIN_DASHBOARDS } from '../../src/core/dashboards/builtin'
import type { UnifiedClient } from '../../src/core/proxy/client'
import {
  RESOURCE_METRICS,
  SYSTEM_METRICS,
  resourceMetricInfo,
  systemMetricInfo,
} from '../../../integration-server/src/data-access/metrics/catalog'
import { RESULTS, metricInfo } from './fixtures/metric-results'

const CATALOG = [
  metricInfo({
    id: 'ecommerce.orders_per_day',
    kind: 'timeseries',
    vertical: 'ecommerce',
    resourceType: 'orders',
    granular: true,
    comparable: true,
    charts: ['line', 'bar'],
  }),
  metricInfo({
    id: 'ecommerce.revenue',
    kind: 'value',
    vertical: 'ecommerce',
    resourceType: 'orders',
    unit: 'money',
    money: true,
    currencyAware: true,
    comparable: true,
    charts: ['number', 'table'],
  }),
  metricInfo({
    id: 'system.records_per_vertical',
    kind: 'breakdown',
    section: 'system',
    vertical: null,
    resourceType: null,
    snapshot: true,
    charts: ['bar', 'pie'],
  }),
]

/** What integration-server's `/connections` lists: every tenant's, with secrets-adjacent fields. */
const conn = (
  id: string,
  platform: string,
  vertical: string,
  tenantId: string | null,
  label: string | null,
) => ({
  id,
  platform,
  vertical,
  tenantId,
  label,
  status: 'valid',
  expiresAt: '2026-04-01T00:00:00.000Z',
  createdAt: '2026-03-01T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
  lastRefreshAt: 1,
  lastRefreshStatus: 'ok',
})
const CONNECTIONS = [
  conn('c-acme-shop', 'shopify', 'ecommerce', 'acme', 'Acme main shop'),
  conn('c-acme-outlet', 'shopify', 'ecommerce', 'acme', 'Acme Outlet'),
  conn('c-acme-woo', 'woocommerce', 'ecommerce', 'acme', 'Woo store'),
  conn('c-globex-shop', 'shopify', 'ecommerce', 'globex', 'Globex shop'),
  conn('c-loose-shop', 'shopify', 'ecommerce', null, 'Unowned shop'),
  conn('c-acme-books', 'xero', 'accounting', 'acme', 'Acme books'),
  conn('c-nolabel', 'woocommerce', 'ecommerce', 'acme', null),
]
const PLATFORM_CATALOG = [
  { slug: 'shopify', name: 'Shopify', vertical: 'ecommerce' },
  { slug: 'woocommerce', name: 'WooCommerce', vertical: 'ecommerce' },
  { slug: 'xero', name: 'Xero', vertical: 'accounting' },
]

let app: FastifyInstance
let handle: DbHandle
let store: AdminStore
let dashboards: DashboardStore
const client = {
  listDataMetrics: vi.fn(),
  getDataMetric: vi.fn(),
  listDataCurrencies: vi.fn(),
  listConnections: vi.fn(),
  listCatalog: vi.fn(),
}

beforeEach(async () => {
  invalidateAccess()
  client.listDataMetrics.mockReset().mockResolvedValue(CATALOG)
  client.getDataMetric.mockReset().mockResolvedValue({
    metric: CATALOG[0],
    range: { from: '2026-03-01', to: '2026-03-30' },
    granularity: 'day',
    currency: null,
    currencies: [],
    value: 3,
    series: [{ name: 'Records', points: [{ x: '2026-03-01', y: 3 }] }],
    masked: false,
    generatedAt: '2026-03-30T10:00:00.000Z',
  })
  client.listDataCurrencies.mockReset().mockResolvedValue(['EUR', 'USD'])
  client.listConnections.mockReset().mockResolvedValue(CONNECTIONS)
  client.listCatalog.mockReset().mockResolvedValue(PLATFORM_CATALOG)
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await AdminStore.create(handle)
  dashboards = await DashboardStore.create(handle)
  await store.createTenant('acme', 'Acme')
  await store.createTenant('globex', 'Globex')
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  app.decorate('accessResolver', createAccessResolver(store))
  await app.register(createDashboardsRoutes(dashboards, client as unknown as UnifiedClient, store))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await store?.close()
})

async function tokenFor(
  role: 'viewer' | 'operator' | 'admin',
  scope: 'all' | Array<{ tenantId: string; verticals: '*' | string[] }> = 'all',
) {
  const user = await store.createUser(`u-${Math.random()}`, 'hash', role)
  if (scope !== 'all') {
    await store.setUserScope(user.id, { mode: 'restricted', grants: scope }, 'manual')
  }
  return { id: user.id, token: app.jwt.sign({ id: user.id, username: user.username, role }) }
}

function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  token: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  })
}

const WIDGET = { metricId: 'ecommerce.orders_per_day', chart: 'line', width: 6 }

async function create(token: string, body: Record<string, unknown> = {}) {
  return call('POST', '/api/dashboards', token, { name: 'Mine', widgets: [WIDGET], ...body })
}

describe('reading', () => {
  it('lists the built-ins for a viewer', async () => {
    const { token } = await tokenFor('viewer')
    const res = await call('GET', '/api/dashboards', token)
    expect(res.statusCode).toBe(200)
    const ids = res.json().data.map((d: { id: string }) => d.id)
    expect(ids).toEqual(BUILTIN_DASHBOARDS.map((d) => d.id))
    const one = await call('GET', '/api/dashboards/builtin:ecommerce', token)
    expect(one.json().data).toMatchObject({ builtin: true, editable: false })
  })

  it('shows own and shared dashboards, hides others’ private ones', async () => {
    const alice = await tokenFor('operator')
    const bob = await tokenFor('operator')
    const priv = (await create(alice.token, { name: 'Alice private' })).json().data
    const shared = (
      await create(alice.token, {
        name: 'Alice shared',
        audience: { kind: 'tenants', tenants: ['acme'] },
      })
    ).json().data
    const bobList = (await call('GET', '/api/dashboards', bob.token)).json().data as Array<{
      id: string
      editable: boolean
    }>
    expect(bobList.map((d) => d.id)).toContain(shared.id)
    expect(bobList.map((d) => d.id)).not.toContain(priv.id)
    expect(bobList.find((d) => d.id === shared.id)!.editable).toBe(false)
    expect((await call('GET', `/api/dashboards/${priv.id}`, bob.token)).statusCode).toBe(404)
    const admin = await tokenFor('admin')
    expect((await call('GET', `/api/dashboards/${priv.id}`, admin.token)).statusCode).toBe(200)
    expect(
      (await call('GET', '/api/dashboards', admin.token))
        .json()
        .data.map((d: { id: string }) => d.id),
    ).toContain(priv.id)
  })

  it('proxies metric reads with the viewer’s scope', async () => {
    const { token } = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    const res = await call(
      'GET',
      '/api/dashboards/metrics/ecommerce.orders_per_day?from=2026-03-01&to=2026-03-30',
      token,
    )
    expect(res.statusCode).toBe(200)
    expect(client.getDataMetric).toHaveBeenCalledWith(
      { tenants: ['acme'], tenantVerticals: { acme: '*' } },
      'ecommerce.orders_per_day',
      { from: '2026-03-01', to: '2026-03-30' },
    )
    const catalog = await call('GET', '/api/dashboards/metrics', token)
    expect(catalog.json().data).toEqual(CATALOG)
  })

  it('passes a metric 404 through', async () => {
    client.getDataMetric.mockRejectedValue(
      Object.assign(new Error('404'), {
        response: {
          status: 404,
          data: { error: { code: 'METRIC_NOT_FOUND', message: 'No such metric.' } },
        },
      }),
    )
    const { token } = await tokenFor('viewer')
    const res = await call('GET', '/api/dashboards/metrics/nope', token)
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('METRIC_NOT_FOUND')
  })

  it('refuses a caller without dashboards:view', async () => {
    const { id, token } = await tokenFor('operator')
    const role = await store.createRole({
      name: 'No dashboards',
      baseRole: 'operator',
      permissions: ['connections:read'],
      createdBy: null,
    })
    await store.assignUserRole(id, role.id)
    invalidateAccess()
    expect((await call('GET', '/api/dashboards', token)).statusCode).toBe(403)
    expect((await call('GET', '/api/dashboards/metrics', token)).statusCode).toBe(403)
  })
})

describe('writing', () => {
  it('refuses a viewer', async () => {
    const { token } = await tokenFor('viewer')
    expect((await create(token)).statusCode).toBe(403)
  })

  it('creates, updates and deletes with audit rows', async () => {
    const { id, token } = await tokenFor('operator')
    const created = await create(token, { description: 'desc' })
    expect(created.statusCode).toBe(201)
    const d = created.json().data
    expect(d).toMatchObject({
      name: 'Mine',
      audience: { kind: 'private' },
      editable: true,
      widgets: [WIDGET],
    })

    const patched = await call('PATCH', `/api/dashboards/${d.id}`, token, {
      name: 'Renamed',
      widgets: [
        WIDGET,
        { metricId: 'system.records_per_vertical', chart: 'bar', width: 12, title: 'All' },
      ],
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json().data.widgets).toHaveLength(2)

    expect((await call('DELETE', `/api/dashboards/${d.id}`, token)).statusCode).toBe(204)
    expect((await call('GET', `/api/dashboards/${d.id}`, token)).statusCode).toBe(404)

    const actions = (await store.listAudit(100, 0, { userId: id }))
      .map((a) => a.action)
      .filter((a) => a.startsWith('dashboard.'))
      .sort()
    expect(actions).toEqual(['dashboard.create', 'dashboard.delete', 'dashboard.update'])
  })

  it('only lets the owner or an admin edit or delete', async () => {
    const alice = await tokenFor('operator')
    const bob = await tokenFor('operator')
    const d = (
      await create(alice.token, { audience: { kind: 'tenants', tenants: ['acme'] } })
    ).json().data
    expect(
      (await call('PATCH', `/api/dashboards/${d.id}`, bob.token, { name: 'x' })).statusCode,
    ).toBe(403)
    expect((await call('DELETE', `/api/dashboards/${d.id}`, bob.token)).statusCode).toBe(403)
    const admin = await tokenFor('admin')
    expect(
      (await call('PATCH', `/api/dashboards/${d.id}`, admin.token, { name: 'Moderated' }))
        .statusCode,
    ).toBe(200)
    expect((await call('DELETE', `/api/dashboards/${d.id}`, admin.token)).statusCode).toBe(204)
  })

  it('keeps built-ins read-only', async () => {
    const admin = await tokenFor('admin')
    expect(
      (await call('PATCH', '/api/dashboards/builtin:overview', admin.token, { name: 'x' }))
        .statusCode,
    ).toBe(409)
    expect((await call('DELETE', '/api/dashboards/builtin:overview', admin.token)).statusCode).toBe(
      409,
    )
  })

  it('validates the layout', async () => {
    const { token } = await tokenFor('operator')
    const tooMany = Array.from({ length: MAX_WIDGETS + 1 }, () => WIDGET)
    expect((await create(token, { widgets: tooMany })).statusCode).toBe(400)
    expect((await create(token, { widgets: [{ ...WIDGET, width: 13 }] })).statusCode).toBe(400)
    expect((await create(token, { widgets: [{ ...WIDGET, width: 0 }] })).statusCode).toBe(400)
    // Not a chart type at all: refused by the schema.
    expect((await create(token, { widgets: [{ ...WIDGET, chart: 'sparkline' }] })).statusCode).toBe(
      400,
    )
    expect(
      (await create(token, { widgets: [{ ...WIDGET, metricId: 'DROP TABLE' }] })).statusCode,
    ).toBe(400)
    const unknown = await create(token, { widgets: [{ ...WIDGET, metricId: 'crm.not_a_metric' }] })
    expect(unknown.statusCode).toBe(400)
    expect(unknown.json().error).toContain('crm.not_a_metric')
    expect((await create(token, { name: '' })).statusCode).toBe(400)
    const full = Array.from({ length: MAX_WIDGETS }, () => WIDGET)
    expect((await create(token, { widgets: full })).statusCode).toBe(201)
  })
})

describe('built-in dashboards', () => {
  const infos = new Map(
    [...RESOURCE_METRICS.map(resourceMetricInfo), ...SYSTEM_METRICS.map(systemMetricInfo)].map(
      (m) => [m.id, m],
    ),
  )

  it('only reference metrics that exist in the integration-server catalog', () => {
    for (const d of BUILTIN_DASHBOARDS) {
      for (const w of d.widgets) expect(infos.has(w.metricId), `${d.id} → ${w.metricId}`).toBe(true)
      expect(d.widgets.length).toBeLessThanOrEqual(MAX_WIDGETS)
    }
  })

  it('draw each metric with a chart that fits it (as a save would require)', () => {
    for (const d of BUILTIN_DASHBOARDS) {
      for (const w of d.widgets) {
        const charts = infos.get(w.metricId)?.charts ?? []
        expect(charts, `${d.id} → ${w.metricId} as ${w.chart}`).toContain(w.chart)
      }
    }
  })

  it('draw what the final review asked for', () => {
    const on = (dashboard: string, metric: string) =>
      BUILTIN_DASHBOARDS.find((d) => d.id === dashboard)!
        .widgets.filter((w) => w.metricId === metric)
        .map((w) => w.chart)
    // A per-agent ranking is not the risk signal; the top-1 share is.
    expect(on('builtin:support-risk', 'customer-support.agent_concentration')).toEqual(['gauge'])
    expect(on('builtin:accounting-ar-ap', 'accounting.cash_conversion_cycle')).toEqual(['gauge'])
    expect([
      ...on('builtin:payments', 'payments.settlement_lag'),
      ...on('builtin:payments-risk', 'payments.settlement_lag'),
    ]).toHaveLength(1)
    expect([
      ...on('builtin:payments', 'payments.payout_delay'),
      ...on('builtin:payments-risk', 'payments.payout_delay'),
    ]).toHaveLength(1)
    expect(on('builtin:inventory-risk', 'inventory.overstock_proxy')).toEqual(['number'])
  })

  it('give both dispute rates the networks’ indicative thresholds', () => {
    for (const id of ['payments.dispute_rate_count', 'payments.dispute_rate_amount']) {
      const m = infos.get(id)!
      expect(m.thresholds, id).toEqual({ warn: 0.9, crit: 1.0, direction: 'above' })
      expect(m.note ?? '', id).toMatch(/indicative/i)
    }
  })

  it('pin only currency codes, and only on metrics the currency changes', () => {
    for (const d of BUILTIN_DASHBOARDS) {
      for (const w of d.widgets) {
        if (w.currency === undefined || w.currency === null) continue
        expect(w.currency, `${d.id} → ${w.metricId}`).toMatch(/^[A-Z]{3}$/)
        expect(infos.get(w.metricId)?.currencyAware, `${d.id} → ${w.metricId}`).toBe(true)
      }
    }
  })

  it('ships every dashboard, once each, in a display order that groups verticals', () => {
    const ids = BUILTIN_DASHBOARDS.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      [
        'overview',
        'accounting',
        'accounting-ar-ap',
        'accounting-risk',
        'payments',
        'payments-subscriptions',
        'payments-risk',
        'ecommerce',
        'ecommerce-operations',
        'ecommerce-risk',
        'crm',
        'crm-risk',
        'support',
        'support-risk',
        'logistics',
        'logistics-risk',
        'inventory',
        'inventory-risk',
        'projects',
        'projects-risk',
        'docsign',
        'docsign-risk',
      ].map((slug) => `builtin:${slug}`),
    )
    // A vertical's dashboards sit together (no vertical reappears after another).
    const seen: Array<string | null> = []
    for (const d of BUILTIN_DASHBOARDS) {
      if (seen[seen.length - 1] !== d.vertical) {
        expect(seen, `${d.id} splits its vertical`).not.toContain(d.vertical)
        seen.push(d.vertical)
      }
    }
    for (const d of BUILTIN_DASHBOARDS) {
      expect(d.name.length, d.id).toBeGreaterThan(0)
      expect(d.description.length, d.id).toBeGreaterThan(20)
    }
  })

  it('lay out sensibly: 4 to 24 widgets, widths 1 to 12, no repeated metric and chart', () => {
    for (const d of BUILTIN_DASHBOARDS) {
      expect(d.widgets.length, d.id).toBeGreaterThanOrEqual(4)
      expect(d.widgets.length, d.id).toBeLessThanOrEqual(MAX_WIDGETS)
      const drawn = new Set<string>()
      for (const w of d.widgets) {
        expect(Number.isInteger(w.width), `${d.id} → ${w.metricId}`).toBe(true)
        expect(w.width, `${d.id} → ${w.metricId}`).toBeGreaterThanOrEqual(1)
        expect(w.width, `${d.id} → ${w.metricId}`).toBeLessThanOrEqual(12)
        const key = `${w.metricId}|${w.chart}`
        expect(drawn.has(key), `${d.id} draws ${key} twice`).toBe(false)
        drawn.add(key)
        // Viewers' currency and granularity filters apply.
        expect(w.granularity, `${d.id} → ${w.metricId}`).toBeUndefined()
        expect(w.currency ?? null, `${d.id} → ${w.metricId}`).toBeNull()
      }
    }
  })

  it('ask for the prior period on every comparable number, and only there', () => {
    for (const d of BUILTIN_DASHBOARDS) {
      for (const w of d.widgets) {
        const comparable = infos.get(w.metricId)?.comparable === true
        expect(w.compare === true, `${d.id} → ${w.metricId} as ${w.chart}`).toBe(
          w.chart === 'number' && comparable,
        )
      }
    }
  })

  it('open every risk dashboard with a strip of numbers and gauges', () => {
    const risk = BUILTIN_DASHBOARDS.filter((d) => d.id.endsWith('-risk'))
    expect(risk.map((d) => d.id)).toHaveLength(9)
    for (const d of risk) {
      let used = 0
      const firstRow = []
      for (const w of d.widgets) {
        if (used + w.width > 12) break
        used += w.width
        firstRow.push(w)
      }
      expect(firstRow.length, d.id).toBeGreaterThanOrEqual(3)
      for (const w of firstRow) {
        expect(['number', 'gauge'], `${d.id} → ${w.metricId} leads as ${w.chart}`).toContain(
          w.chart,
        )
      }
    }
  })

  it('give money and multi-tile widgets room, and keep money matrices off the page', () => {
    for (const d of BUILTIN_DASHBOARDS) {
      for (const w of d.widgets) {
        const info = infos.get(w.metricId)!
        if (info.kind === 'matrix') expect(info.money, `${d.id} → ${w.metricId}`).toBe(false)
        if (info.money && (w.chart === 'number' || w.chart === 'gauge')) {
          expect(w.width, `${d.id} → ${w.metricId}`).toBeGreaterThanOrEqual(4)
        }
        if (w.chart === 'heatmap')
          expect(w.width, `${d.id} → ${w.metricId}`).toBeGreaterThanOrEqual(6)
        if (w.chart === 'pareto')
          expect(w.width, `${d.id} → ${w.metricId}`).toBeGreaterThanOrEqual(6)
      }
    }
  })
})

describe('chart fit', () => {
  it('refuses a chart that is not one of its metric’s charts, on create and on edit', async () => {
    const { token } = await tokenFor('operator')
    // `radar` is a chart type — just not one this timeseries offers.
    const misfit = await create(token, { widgets: [{ ...WIDGET, chart: 'radar' }] })
    expect(misfit.statusCode).toBe(400)
    expect(misfit.json().error).toBe('Chart radar does not fit ecommerce.orders_per_day')

    const d = (await create(token)).json().data
    const patch = await call('PATCH', `/api/dashboards/${d.id}`, token, {
      widgets: [WIDGET, { metricId: 'ecommerce.revenue', chart: 'pie', width: 6 }],
    })
    expect(patch.statusCode).toBe(400)
    expect(patch.json().error).toBe('Chart pie does not fit ecommerce.revenue')
    // Nothing was written.
    expect((await call('GET', `/api/dashboards/${d.id}`, token)).json().data.widgets).toEqual([
      WIDGET,
    ])
  })

  it('checks against the caller’s own catalog', async () => {
    const { token } = await tokenFor('operator')
    client.listDataMetrics.mockResolvedValue([{ ...CATALOG[0], charts: ['table'] }])
    const res = await create(token)
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('Chart line does not fit ecommerce.orders_per_day')
  })
})

describe('widget options', () => {
  it('keep a currency pin, a granularity and compare through create, read and edit', async () => {
    const { token } = await tokenFor('operator')
    const widgets = [
      { metricId: 'ecommerce.revenue', chart: 'number', width: 4, currency: 'EUR', compare: true },
      { ...WIDGET, granularity: 'week', compare: false },
      { ...WIDGET, chart: 'bar', currency: null },
    ]
    const created = await create(token, { widgets })
    expect(created.statusCode).toBe(201)
    const stored = [
      { metricId: 'ecommerce.revenue', chart: 'number', width: 4, currency: 'EUR', compare: true },
      { ...WIDGET, granularity: 'week', compare: false },
      // A null pin and no pin mean the same: follow the view's filter.
      { ...WIDGET, chart: 'bar' },
    ]
    expect(created.json().data.widgets).toEqual(stored)
    const id = created.json().data.id
    expect((await call('GET', `/api/dashboards/${id}`, token)).json().data.widgets).toEqual(stored)

    const edited = await call('PATCH', `/api/dashboards/${id}`, token, {
      widgets: [{ ...stored[0], currency: 'USD', compare: false }, stored[1]],
    })
    expect(edited.statusCode).toBe(200)
    expect(edited.json().data.widgets).toEqual([
      { ...stored[0], currency: 'USD', compare: false },
      stored[1],
    ])
  })

  it('refuses a currency that is not an ISO 4217 code and an unknown granularity', async () => {
    const { token } = await tokenFor('operator')
    for (const bad of ['eur', 'EURO', 'E1R', '']) {
      const res = await create(token, { widgets: [{ ...WIDGET, currency: bad }] })
      expect(res.statusCode, bad).toBe(400)
    }
    expect(
      (await create(token, { widgets: [{ ...WIDGET, granularity: 'year' }] })).statusCode,
    ).toBe(400)
    expect((await create(token, { widgets: [{ ...WIDGET, compare: 'yes' }] })).statusCode).toBe(400)
  })
})

describe('metric results', () => {
  it.each(Object.entries(RESULTS))(
    'pass %s through the response schema untouched',
    async (_name, result) => {
      client.getDataMetric.mockResolvedValue(result)
      const { token } = await tokenFor('viewer')
      const res = await call('GET', `/api/dashboards/metrics/${result.metric.id}`, token)
      expect(res.statusCode, res.body).toBe(200)
      // Deep equality: a field the zod mirror lacks would have been stripped.
      expect(res.json().data).toEqual(result)
    },
  )

  it('relays a metric’s own default granularity in its catalog entry', async () => {
    const monthly = {
      ...RESULTS['timeseries_average_with_gaps']!.metric,
      defaultGranularity: 'month',
    }
    client.listDataMetrics.mockResolvedValue([monthly])
    const { token } = await tokenFor('viewer')
    const res = await call('GET', '/api/dashboards/metrics', token)
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toEqual([monthly])
  })

  it('refuses a result outside the contract rather than relaying it', async () => {
    client.getDataMetric.mockResolvedValue({
      ...RESULTS['value_count_compared'],
      metric: { ...RESULTS['value_count_compared']!.metric, kind: 'count_by_day' },
    })
    const { token } = await tokenFor('viewer')
    const res = await call('GET', '/api/dashboards/metrics/accounting.invoice_count', token)
    expect(res.statusCode).toBe(500)
  })

  it('forwards currency, granularity and compare, and only when set', async () => {
    const { token } = await tokenFor('viewer')
    await call(
      'GET',
      '/api/dashboards/metrics/ecommerce.revenue?from=2026-03-01&to=2026-03-30&currency=EUR&granularity=week&compare=1',
      token,
    )
    expect(client.getDataMetric).toHaveBeenLastCalledWith(expect.anything(), 'ecommerce.revenue', {
      from: '2026-03-01',
      to: '2026-03-30',
      currency: 'EUR',
      granularity: 'week',
      compare: true,
    })
    await call('GET', '/api/dashboards/metrics/ecommerce.revenue?compare=0', token)
    const last = client.getDataMetric.mock.calls.at(-1)![2] as Record<string, unknown>
    expect(Object.keys(last).filter((k) => last[k] !== undefined)).toEqual([])
  })

  it('keeps the pin narrowing when the widget carries options', async () => {
    const admin = await tokenFor('admin')
    const d = (
      await create(admin.token, { audience: { kind: 'everyone' }, pinnedTenants: ['acme'] })
    ).json().data
    await call(
      'GET',
      `/api/dashboards/metrics/ecommerce.revenue?dashboard=${d.id}&currency=USD&compare=1`,
      admin.token,
    )
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: ['acme'] },
      'ecommerce.revenue',
      { from: undefined, to: undefined, currency: 'USD', compare: true },
    )
  })

  it('forwards connection and platform after the pin narrowing, and only when set', async () => {
    const admin = await tokenFor('admin')
    const d = (
      await create(admin.token, { audience: { kind: 'everyone' }, pinnedTenants: ['acme'] })
    ).json().data
    await call(
      'GET',
      `/api/dashboards/metrics/ecommerce.revenue?dashboard=${d.id}&connection=c-acme-shop&platform=shopify`,
      admin.token,
    )
    // The pins narrow the scope header; the engine narrows further by the filter.
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: ['acme'] },
      'ecommerce.revenue',
      {
        from: undefined,
        to: undefined,
        connection: 'c-acme-shop',
        platform: 'shopify',
      },
    )
    const viewer = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    await call(
      'GET',
      '/api/dashboards/metrics/ecommerce.revenue?platform=woocommerce',
      viewer.token,
    )
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: ['acme'], tenantVerticals: { acme: '*' } },
      'ecommerce.revenue',
      { from: undefined, to: undefined, platform: 'woocommerce' },
    )
  })

  it('refuses a malformed connection or platform with 400, before any upstream call', async () => {
    const { token } = await tokenFor('viewer')
    for (const q of [
      'connection=a%20b',
      'connection=a.b',
      `connection=${'x'.repeat(101)}`,
      'connection=',
      'platform=Shopify',
      'platform=-shop',
      'platform=shop_ify',
      `platform=${'p'.repeat(65)}`,
      'vertical=Ecommerce',
      'vertical=e',
      'vertical=e_commerce',
      // A repeated parameter must not quietly become its first or last value.
      'connection=a&connection=b',
      'platform=x&platform=y',
      'vertical=crm&vertical=ecommerce',
    ]) {
      const metric = await call('GET', `/api/dashboards/metrics/ecommerce.revenue?${q}`, token)
      expect(metric.statusCode, q).toBe(400)
      const cur = await call('GET', `/api/dashboards/currencies?${q}`, token)
      expect(cur.statusCode, q).toBe(400)
    }
    expect(client.getDataMetric).not.toHaveBeenCalled()
    expect(client.listDataCurrencies).not.toHaveBeenCalled()
  })

  it('forwards the dashboard’s vertical with a filter', async () => {
    const { token } = await tokenFor('viewer')
    await call(
      'GET',
      '/api/dashboards/metrics/system.records_per_vertical?platform=square&vertical=ecommerce',
      token,
    )
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: '*' },
      'system.records_per_vertical',
      { from: undefined, to: undefined, platform: 'square', vertical: 'ecommerce' },
    )
    await call('GET', '/api/dashboards/currencies?platform=square&vertical=ecommerce', token)
    expect(client.listDataCurrencies).toHaveBeenLastCalledWith(
      { tenants: '*' },
      { platform: 'square', vertical: 'ecommerce' },
    )
  })

  it('needs connections:read for connection or platform, on metrics and currencies', async () => {
    const { id, token } = await tokenFor('viewer')
    const role = await store.createRole({
      name: 'Dashboards, no connections',
      baseRole: 'viewer',
      permissions: ['dashboards:view'],
      createdBy: null,
    })
    await store.assignUserRole(id, role.id)
    invalidateAccess()
    for (const q of [
      'connection=c-acme-shop',
      'platform=shopify',
      'platform=shopify&vertical=ecommerce',
    ]) {
      const metric = await call('GET', `/api/dashboards/metrics/ecommerce.revenue?${q}`, token)
      expect(metric.statusCode, q).toBe(403)
      expect(metric.json().error, q).toContain('connections:read')
      const cur = await call('GET', `/api/dashboards/currencies?${q}`, token)
      expect(cur.statusCode, q).toBe(403)
    }
    expect(client.getDataMetric).not.toHaveBeenCalled()
    expect(client.listDataCurrencies).not.toHaveBeenCalled()
    // Without a filter (a vertical alone is not one) the routes answer as before.
    expect((await call('GET', '/api/dashboards/metrics/ecommerce.revenue', token)).statusCode).toBe(
      200,
    )
    expect(
      (await call('GET', '/api/dashboards/currencies?vertical=ecommerce', token)).statusCode,
    ).toBe(200)
  })

  it('refuses a malformed currency, granularity or compare with 400', async () => {
    const { token } = await tokenFor('viewer')
    for (const q of ['currency=usd', 'currency=US', 'granularity=year', 'compare=yes']) {
      const res = await call('GET', `/api/dashboards/metrics/ecommerce.revenue?${q}`, token)
      expect(res.statusCode, q).toBe(400)
    }
    expect(client.getDataMetric).not.toHaveBeenCalled()
  })
})

describe('GET /api/dashboards/currencies', () => {
  it('proxies the currencies with the viewer’s scope', async () => {
    const { token } = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    const res = await call('GET', '/api/dashboards/currencies', token)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: ['EUR', 'USD'] })
    expect(res.headers['cache-control']).toBe('no-store')
    expect(client.listDataCurrencies).toHaveBeenLastCalledWith(
      { tenants: ['acme'], tenantVerticals: { acme: '*' } },
      {},
    )
  })

  it('forwards connection and platform with the pin narrowing', async () => {
    const admin = await tokenFor('admin')
    const pinned = (
      await create(admin.token, { audience: { kind: 'everyone' }, pinnedTenants: ['acme'] })
    ).json().data
    await call(
      'GET',
      `/api/dashboards/currencies?dashboard=${pinned.id}&connection=c-acme-shop&platform=shopify`,
      admin.token,
    )
    expect(client.listDataCurrencies).toHaveBeenLastCalledWith(
      { tenants: ['acme'] },
      { connection: 'c-acme-shop', platform: 'shopify' },
    )
  })

  it('offers only ISO codes: upper-cased, trimmed, de-duplicated, junk dropped', async () => {
    client.listDataCurrencies.mockResolvedValue([
      'usd',
      'USD',
      ' gbp ',
      'EUR',
      '<img src=x onerror=alert(1)>',
      'US Dollar',
      '',
      null,
    ])
    const { token } = await tokenFor('viewer')
    const res = await call('GET', '/api/dashboards/currencies', token)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ data: ['EUR', 'GBP', 'USD'] })
  })

  it('narrows to a dashboard’s pins, ignores a built-in id and 404s a hidden dashboard', async () => {
    const admin = await tokenFor('admin')
    const pinned = (
      await create(admin.token, { audience: { kind: 'everyone' }, pinnedTenants: ['acme'] })
    ).json().data
    await call('GET', `/api/dashboards/currencies?dashboard=${pinned.id}`, admin.token)
    expect(client.listDataCurrencies).toHaveBeenLastCalledWith({ tenants: ['acme'] }, {})

    await call('GET', '/api/dashboards/currencies?dashboard=builtin:accounting', admin.token)
    expect(client.listDataCurrencies).toHaveBeenLastCalledWith({ tenants: '*' }, {})

    const globex = await tokenFor('viewer', [{ tenantId: 'globex', verticals: '*' }])
    const hidden = await call(
      'GET',
      `/api/dashboards/currencies?dashboard=${pinned.id}`,
      globex.token,
    )
    expect(hidden.statusCode).toBe(404)
    expect(
      (await call('GET', '/api/dashboards/currencies?dashboard=dsh_nope', globex.token)).statusCode,
    ).toBe(404)
  })

  it('passes a passthrough 409 through and needs dashboards:view', async () => {
    client.listDataCurrencies.mockRejectedValue(
      Object.assign(new Error('409'), {
        response: {
          status: 409,
          data: { error: { code: 'DATA_STORE_DISABLED', message: 'The data store is off.' } },
        },
      }),
    )
    const { id, token } = await tokenFor('viewer')
    const res = await call('GET', '/api/dashboards/currencies', token)
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DATA_STORE_DISABLED')

    const role = await store.createRole({
      name: 'No dashboards here',
      baseRole: 'viewer',
      permissions: ['connections:read'],
      createdBy: null,
    })
    await store.assignUserRole(id, role.id)
    invalidateAccess()
    expect((await call('GET', '/api/dashboards/currencies', token)).statusCode).toBe(403)
  })
})

describe('tenant audiences (journey)', () => {
  const ids = (res: { json: () => { data: Array<{ id: string }> } }) =>
    res.json().data.map((d) => d.id)

  it('an Acme-only user sees dashboards shared with Acme, never Globex’s', async () => {
    const admin = await tokenFor('admin')
    const acmeUser = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    const toAcme = (
      await create(admin.token, { name: 'A', audience: { kind: 'tenants', tenants: ['acme'] } })
    ).json().data
    const toGlobex = (
      await create(admin.token, { name: 'G', audience: { kind: 'tenants', tenants: ['globex'] } })
    ).json().data
    const toAll = (await create(admin.token, { name: 'E', audience: { kind: 'everyone' } })).json()
      .data
    const list = ids(await call('GET', '/api/dashboards', acmeUser.token))
    expect(list).toEqual(expect.arrayContaining([toAcme.id, toAll.id]))
    expect(list).not.toContain(toGlobex.id)
    expect((await call('GET', `/api/dashboards/${toGlobex.id}`, acmeUser.token)).statusCode).toBe(
      404,
    )
  })

  it('pinned dashboards narrow metric reads to viewer scope ∩ pins', async () => {
    const admin = await tokenFor('admin')
    const d = (
      await create(admin.token, {
        name: 'Acme only',
        audience: { kind: 'everyone' },
        pinnedTenants: ['acme'],
      })
    ).json().data
    const res = await call(
      'GET',
      `/api/dashboards/metrics/ecommerce.orders_per_day?dashboard=${d.id}`,
      admin.token,
    )
    expect(res.statusCode).toBe(200)
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: ['acme'] },
      'ecommerce.orders_per_day',
      { from: undefined, to: undefined },
    )
    const globexUser = await tokenFor('viewer', [{ tenantId: 'globex', verticals: '*' }])
    expect(ids(await call('GET', '/api/dashboards', globexUser.token))).not.toContain(d.id)
    expect(
      (
        await call(
          'GET',
          `/api/dashboards/metrics/ecommerce.orders_per_day?dashboard=${d.id}`,
          globexUser.token,
        )
      ).statusCode,
    ).toBe(404)
  })

  it('the metric route uses the caller’s own scope without ?dashboard; builtin ids are unpinned; unknown ids are 404', async () => {
    const acmeUser = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    await call('GET', '/api/dashboards/metrics/ecommerce.orders_per_day', acmeUser.token)
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: ['acme'], tenantVerticals: { acme: '*' } },
      'ecommerce.orders_per_day',
      { from: undefined, to: undefined },
    )
    await call(
      'GET',
      '/api/dashboards/metrics/ecommerce.orders_per_day?dashboard=builtin:ecommerce',
      acmeUser.token,
    )
    expect(client.getDataMetric).toHaveBeenLastCalledWith(
      { tenants: ['acme'], tenantVerticals: { acme: '*' } },
      'ecommerce.orders_per_day',
      { from: undefined, to: undefined },
    )
    expect(
      (
        await call(
          'GET',
          '/api/dashboards/metrics/ecommerce.orders_per_day?dashboard=dsh_nope',
          acmeUser.token,
        )
      ).statusCode,
    ).toBe(404)
  })

  it('everyone needs dashboards:share_all; restricted editors share only inside their scope', async () => {
    const op = await tokenFor('operator')
    expect((await create(op.token, { audience: { kind: 'everyone' } })).statusCode).toBe(403)
    const acmeOp = await tokenFor('operator', [{ tenantId: 'acme', verticals: '*' }])
    expect(
      (await create(acmeOp.token, { audience: { kind: 'tenants', tenants: ['globex'] } }))
        .statusCode,
    ).toBe(403)
    expect((await create(acmeOp.token, { pinnedTenants: ['globex'] })).statusCode).toBe(403)
    expect(
      (await create(acmeOp.token, { audience: { kind: 'tenants', tenants: ['acme'] } })).statusCode,
    ).toBe(201)
    expect(
      (await create(op.token, { audience: { kind: 'tenants', tenants: ['nope'] } })).statusCode,
    ).toBe(400)
    expect(
      (await create(op.token, { audience: { kind: 'tenants', tenants: [] } })).statusCode,
    ).toBe(400)
    expect(
      (
        await create(op.token, {
          audience: { kind: 'tenants', tenants: ['acme'] },
          pinnedTenants: ['globex'],
        })
      ).statusCode,
    ).toBe(400)
  })

  it('an unchanged everyone audience survives an edit by an owner without share_all', async () => {
    const op = await tokenFor('operator')
    const created = (await create(op.token)).json().data
    // Simulate a v6-migrated `shared` row: everyone, owned by an operator.
    await dashboards.update(created.id, { audience: { kind: 'everyone' } })
    const res = await call('PATCH', `/api/dashboards/${created.id}`, op.token, {
      name: 'Renamed',
      audience: { kind: 'everyone' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.audience).toEqual({ kind: 'everyone' })
  })

  it('an owner renames a dashboard whose stored tenants they could not set themselves', async () => {
    const acmeOp = await tokenFor('operator', [{ tenantId: 'acme', verticals: '*' }])
    const created = (
      await create(acmeOp.token, { audience: { kind: 'tenants', tenants: ['acme'] } })
    ).json().data
    await dashboards.update(created.id, {
      audience: { kind: 'tenants', tenants: ['acme', 'deleted-tenant'] },
    })
    const res = await call('PATCH', `/api/dashboards/${created.id}`, acmeOp.token, {
      name: 'Renamed',
      audience: { kind: 'tenants', tenants: ['acme', 'deleted-tenant'] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.audience.tenants).toEqual(['acme', 'deleted-tenant'])
  })

  it('a non-editor never sees tenant ids outside their scope', async () => {
    const admin = await tokenFor('admin')
    const d = (
      await create(admin.token, {
        audience: { kind: 'tenants', tenants: ['acme', 'globex'] },
        pinnedTenants: ['acme', 'globex'],
      })
    ).json().data
    const acmeUser = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    const seen = (await call('GET', `/api/dashboards/${d.id}`, acmeUser.token)).json().data
    expect(seen.audience).toEqual({ kind: 'tenants', tenants: ['acme'] })
    expect(seen.pinnedTenants).toEqual(['acme'])
  })

  it('writes dashboard.share when the audience or pins change', async () => {
    const admin = await tokenFor('admin')
    const d = (await create(admin.token)).json().data
    await call('PATCH', `/api/dashboards/${d.id}`, admin.token, {
      audience: { kind: 'tenants', tenants: ['acme'] },
      pinnedTenants: ['acme'],
    })
    const rows = await store.listAudit(10, 0, { action: 'dashboard.share' })
    expect(JSON.parse(rows.at(0)?.detail ?? '{}')).toMatchObject({
      name: 'Mine',
      from: { kind: 'private' },
      to: { kind: 'tenants', tenants: ['acme'] },
      pinnedFrom: null,
      pinnedTo: ['acme'],
    })
  })
})

describe('audience review fixes', () => {
  async function sharer(scope?: Array<{ tenantId: string; verticals: '*' | string[] }>) {
    const user = await store.createUser(`u-${Math.random()}`, 'hash', 'operator')
    const role = await store.createRole({
      name: `r-${Math.random()}`,
      baseRole: 'operator',
      permissions: ['dashboards:view', 'dashboards:edit', 'dashboards:share_all'],
      createdBy: null,
    })
    await store.assignUserRole(user.id, role.id)
    if (scope) await store.setUserScope(user.id, { mode: 'restricted', grants: scope }, 'manual')
    invalidateAccess()
    return {
      id: user.id,
      token: app.jwt.sign({ id: user.id, username: user.username, role: 'operator' }),
    }
  }
  const many = Array.from({ length: 60 }, (_, i) => `t${String(i).padStart(2, '0')}`)

  it('a dashboard with 60 tenants lists, reads and saves; a corrupt audience does not 500', async () => {
    const owner = await tokenFor('operator')
    const d = (await create(owner.token)).json().data
    await dashboards.update(d.id, { audience: { kind: 'tenants', tenants: many } })
    const list = await call('GET', '/api/dashboards', owner.token)
    expect(list.statusCode).toBe(200)
    const one = await call('GET', `/api/dashboards/${d.id}`, owner.token)
    expect(one.statusCode).toBe(200)
    expect(one.json().data.audience.tenants).toHaveLength(60)
    const saved = await call('PATCH', `/api/dashboards/${d.id}`, owner.token, {
      name: 'Renamed',
      audience: { kind: 'tenants', tenants: many },
    })
    expect(saved.statusCode).toBe(200)
    await handle.kysely
      .updateTable('dashboards')
      .set({ audience_tenants_json: 'garbage', pinned_tenants_json: '{"a":1}' })
      .where('id', '=', d.id)
      .execute()
    expect((await call('GET', '/api/dashboards', owner.token)).statusCode).toBe(200)
    expect((await call('GET', `/api/dashboards/${d.id}`, owner.token)).statusCode).toBe(200)
  })

  it('a tenant-restricted share_all holder cannot share with everyone', async () => {
    const r = await sharer([{ tenantId: 'acme', verticals: '*' }])
    expect((await create(r.token, { audience: { kind: 'everyone' } })).statusCode).toBe(403)
    const u = await sharer()
    expect((await create(u.token, { audience: { kind: 'everyone' } })).statusCode).toBe(201)
  })

  it('a restricted owner can add their own tenant to a list holding one they cannot set, but not a foreign one', async () => {
    const acmeOp = await tokenFor('operator', [
      { tenantId: 'acme', verticals: '*' },
      { tenantId: 'globex', verticals: '*' },
    ])
    const d = (
      await create(acmeOp.token, { audience: { kind: 'tenants', tenants: ['acme'] } })
    ).json().data
    await dashboards.update(d.id, {
      audience: { kind: 'tenants', tenants: ['acme', 'deleted-tenant'] },
    })
    const add = await call('PATCH', `/api/dashboards/${d.id}`, acmeOp.token, {
      audience: { kind: 'tenants', tenants: ['acme', 'deleted-tenant', 'globex'] },
    })
    expect(add.statusCode).toBe(200)
    await store.createTenant('initech', 'Initech')
    const foreign = await call('PATCH', `/api/dashboards/${d.id}`, acmeOp.token, {
      audience: { kind: 'tenants', tenants: ['acme', 'deleted-tenant', 'globex', 'initech'] },
    })
    expect(foreign.statusCode).toBe(403)
  })

  it('GET :id is 404 when the audience matches but the pins do not', async () => {
    const admin = await tokenFor('admin')
    const d = (
      await create(admin.token, {
        audience: { kind: 'tenants', tenants: ['acme', 'globex'] },
        pinnedTenants: ['acme'],
      })
    ).json().data
    const globex = await tokenFor('viewer', [{ tenantId: 'globex', verticals: '*' }])
    expect((await call('GET', `/api/dashboards/${d.id}`, globex.token)).statusCode).toBe(404)
  })
})

describe('GET /api/dashboards/connections', () => {
  type Listed = {
    connections: Array<{ id: string; label: string | null; platform: string; vertical: string }>
    platforms: Array<{ slug: string; name: string; count: number }>
    total: number
  }
  const list = async (token: string, query = '') => {
    const res = await call('GET', `/api/dashboards/connections${query}`, token)
    expect(res.statusCode, res.body).toBe(200)
    return res.json().data as Listed
  }
  const idsOf = (l: Listed) => l.connections.map((c) => c.id)

  async function tokenWith(permissions: string[], scope?: 'all') {
    const { id, token } = await tokenFor('viewer', scope)
    const role = await store.createRole({
      name: `r-${Math.random()}`,
      baseRole: 'viewer',
      permissions: permissions as never,
      createdBy: null,
    })
    await store.assignUserRole(id, role.id)
    invalidateAccess()
    return token
  }

  it('needs both dashboards:view and connections:read', async () => {
    const noConnections = await tokenWith(['dashboards:view'])
    const res = await call('GET', '/api/dashboards/connections?vertical=ecommerce', noConnections)
    expect(res.statusCode).toBe(403)
    expect(res.json().error).toContain('connections:read')
    const noDashboards = await tokenWith(['connections:read'])
    expect(
      (await call('GET', '/api/dashboards/connections?vertical=ecommerce', noDashboards))
        .statusCode,
    ).toBe(403)
    const both = await tokenWith(['dashboards:view', 'connections:read'])
    const ok = await call('GET', '/api/dashboards/connections?vertical=ecommerce', both)
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['cache-control']).toBe('no-store')
    expect(client.listConnections).toHaveBeenCalledTimes(1)
  })

  it('lists a vertical’s connections with adapter counts and catalog names, nothing else', async () => {
    const { token } = await tokenFor('viewer')
    const l = await list(token, '?vertical=ecommerce')
    expect(idsOf(l).sort()).toEqual(
      [
        'c-acme-outlet',
        'c-acme-shop',
        'c-acme-woo',
        'c-globex-shop',
        'c-loose-shop',
        'c-nolabel',
      ].sort(),
    )
    expect(l.total).toBe(6)
    expect(l.platforms).toEqual([
      { slug: 'shopify', name: 'Shopify', count: 4 },
      { slug: 'woocommerce', name: 'WooCommerce', count: 2 },
    ])
    // Labelled first, by label; an unlabelled connection last.
    expect(idsOf(l)).toEqual([
      'c-acme-shop',
      'c-acme-outlet',
      'c-globex-shop',
      'c-loose-shop',
      'c-acme-woo',
      'c-nolabel',
    ])
    // Never a tenant id, status, token expiry or any other connection field.
    for (const c of l.connections) {
      expect(Object.keys(c).sort()).toEqual(['id', 'label', 'platform', 'vertical'])
    }
    expect(JSON.stringify(l)).not.toMatch(/acme"|globex"|tenantId|expiresAt|lastRefresh/)
  })

  it('narrows by platform, keeping the adapter list whole', async () => {
    const { token } = await tokenFor('viewer')
    const l = await list(token, '?vertical=ecommerce&platform=woocommerce')
    expect(idsOf(l)).toEqual(['c-acme-woo', 'c-nolabel'])
    expect(l.total).toBe(2)
    expect(l.platforms.map((p) => p.slug)).toEqual(['shopify', 'woocommerce'])
    expect((await list(token, '?vertical=accounting')).platforms).toEqual([
      { slug: 'xero', name: 'Xero', count: 1 },
    ])
  })

  it('searches the label and the id, case-insensitively; the adapter list ignores the search', async () => {
    const { token } = await tokenFor('viewer')
    const byLabel = await list(token, '?vertical=ecommerce&search=OUTLET')
    expect(idsOf(byLabel)).toEqual(['c-acme-outlet'])
    expect(byLabel.total).toBe(1)
    expect(byLabel.platforms).toEqual([
      { slug: 'shopify', name: 'Shopify', count: 4 },
      { slug: 'woocommerce', name: 'WooCommerce', count: 2 },
    ])
    const byIdPrefix = await list(token, '?vertical=ecommerce&search=c-acme-')
    expect(idsOf(byIdPrefix).sort()).toEqual(['c-acme-outlet', 'c-acme-shop', 'c-acme-woo'])
    // An exact id comes first, whatever its label.
    const exact = await list(token, '?vertical=ecommerce&search=C-NOLABEL')
    expect(idsOf(exact)).toEqual(['c-nolabel'])
    const ordered = await list(token, '?vertical=ecommerce&search=shop')
    expect(idsOf(ordered)[0]).toBe('c-acme-shop')
    expect((await list(token, '?vertical=ecommerce&search=nothing-like-it')).total).toBe(0)
  })

  it('never shows a restricted caller another tenant’s connection, even by exact id', async () => {
    const acme = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    const l = await list(acme.token, '?vertical=ecommerce')
    expect(idsOf(l).sort()).toEqual(['c-acme-outlet', 'c-acme-shop', 'c-acme-woo', 'c-nolabel'])
    // Neither the other tenant's shop nor the unowned one counts toward Shopify.
    expect(l.platforms).toEqual([
      { slug: 'shopify', name: 'Shopify', count: 2 },
      { slug: 'woocommerce', name: 'WooCommerce', count: 2 },
    ])
    for (const id of ['c-globex-shop', 'c-loose-shop']) {
      const hit = await list(acme.token, `?vertical=ecommerce&search=${id}`)
      expect(hit).toEqual({ connections: [], platforms: l.platforms, total: 0 })
    }
    // Granted Acme's accounting only: no ecommerce connection at all.
    const books = await tokenFor('viewer', [{ tenantId: 'acme', verticals: ['accounting'] }])
    expect(await list(books.token, '?vertical=ecommerce')).toEqual({
      connections: [],
      platforms: [],
      total: 0,
    })
    expect(idsOf(await list(books.token, '?vertical=accounting'))).toEqual(['c-acme-books'])
  })

  it('narrows to a dashboard’s pins, ignores a built-in id and 404s a dashboard you cannot see', async () => {
    const admin = await tokenFor('admin')
    const pinned = (
      await create(admin.token, { audience: { kind: 'everyone' }, pinnedTenants: ['globex'] })
    ).json().data
    expect(idsOf(await list(admin.token, `?vertical=ecommerce&dashboard=${pinned.id}`))).toEqual([
      'c-globex-shop',
    ])
    expect((await list(admin.token, '?vertical=ecommerce&dashboard=builtin:ecommerce')).total).toBe(
      6,
    )
    // An Acme-only viewer cannot see a Globex-pinned dashboard: 404, not an empty list.
    const acme = await tokenFor('viewer', [{ tenantId: 'acme', verticals: '*' }])
    expect(
      (
        await call(
          'GET',
          `/api/dashboards/connections?vertical=ecommerce&dashboard=${pinned.id}`,
          acme.token,
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (await call('GET', '/api/dashboards/connections?dashboard=dsh_nope', acme.token)).statusCode,
    ).toBe(404)
    const bob = await tokenFor('operator')
    const priv = (await create(bob.token, { name: 'Bob private' })).json().data
    const alice = await tokenFor('operator')
    expect(
      (await call('GET', `/api/dashboards/connections?dashboard=${priv.id}`, alice.token))
        .statusCode,
    ).toBe(404)
  })

  it('pins narrow a restricted viewer to scope ∩ pins', async () => {
    const admin = await tokenFor('admin')
    const acmeOnly = (
      await create(admin.token, { audience: { kind: 'everyone' }, pinnedTenants: ['acme'] })
    ).json().data
    // The viewer may see both tenants; the dashboard is pinned to one of them.
    const both = await tokenFor('viewer', [
      { tenantId: 'acme', verticals: '*' },
      { tenantId: 'globex', verticals: '*' },
    ])
    expect(idsOf(await list(both.token, '?vertical=ecommerce')).sort()).toEqual([
      'c-acme-outlet',
      'c-acme-shop',
      'c-acme-woo',
      'c-globex-shop',
      'c-nolabel',
    ])
    const l = await list(both.token, `?vertical=ecommerce&dashboard=${acmeOnly.id}`)
    expect(idsOf(l).sort()).toEqual(['c-acme-outlet', 'c-acme-shop', 'c-acme-woo', 'c-nolabel'])
    expect(l.platforms).toEqual([
      { slug: 'shopify', name: 'Shopify', count: 2 },
      { slug: 'woocommerce', name: 'WooCommerce', count: 2 },
    ])
  })

  it('caps the list at limit (default 50, at most 200) without changing the total', async () => {
    client.listConnections.mockResolvedValue(
      Array.from({ length: 250 }, (_, i) =>
        conn(`c-${String(i).padStart(3, '0')}`, 'shopify', 'ecommerce', 'acme', `Shop ${i}`),
      ),
    )
    const { token } = await tokenFor('viewer')
    const def = await list(token, '?vertical=ecommerce')
    expect(def.connections).toHaveLength(50)
    expect(def.total).toBe(250)
    expect((await list(token, '?vertical=ecommerce&limit=10')).connections).toHaveLength(10)
    expect((await list(token, '?vertical=ecommerce&limit=500')).connections).toHaveLength(200)
    expect((await list(token, '?vertical=ecommerce&limit=0')).connections).toHaveLength(1)
    expect((await list(token, '?vertical=ecommerce&limit=junk')).connections).toHaveLength(50)
  })

  it('falls back to the slug when the platform catalog is unavailable', async () => {
    client.listCatalog.mockRejectedValue(new Error('down'))
    const { token } = await tokenFor('viewer')
    expect((await list(token, '?vertical=ecommerce')).platforms).toEqual([
      { slug: 'shopify', name: 'shopify', count: 4 },
      { slug: 'woocommerce', name: 'woocommerce', count: 2 },
    ])
  })

  it('refuses an unknown vertical or a malformed platform with 400', async () => {
    const { token } = await tokenFor('viewer')
    for (const q of [
      'vertical=nope',
      'platform=Shopify',
      'platform=a_b',
      `search=${'x'.repeat(201)}`,
    ]) {
      expect((await call('GET', `/api/dashboards/connections?${q}`, token)).statusCode, q).toBe(400)
    }
  })
})
