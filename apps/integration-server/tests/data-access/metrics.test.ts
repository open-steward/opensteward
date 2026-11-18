/**
 * `/admin/data/metrics*` and `/admin/data/currencies` — the catalog and metric
 * values the dashboards chart. Runs on SQLite always and on Postgres when
 * TEST_DATABASE_URL is set (the schema is dropped per test).
 *
 * Pins: scope filtering by owner tenant (and per-tenant verticals); every
 * metric kind; currency separation (a series / total / KPI per currency,
 * nothing summed or shared across currencies, `currencies` listed before the
 * filter); the currency filter on money kinds and on counts with a
 * `currencyField`; granularity auto / week / month; `compare`; every filter
 * op incl. the now-relative ones; field comparisons; percentiles, aging,
 * concentration (shares, HHI, effective N) against hand-computed values;
 * unnest and lookup labels that never cross the scope; financial masking; the
 * cache key; the 400s; and the passthrough 409.
 *
 * Every expectation below is computed by hand from the seed data.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  CredentialStore,
  ResourceStore,
  SyncStore,
  openDb,
  type DbHandle,
} from '@opensteward/shared'
import { createDataAccessRouter, DATA_SCOPE_HEADER } from '../../src/data-access/router'
import {
  createMetricsEngine,
  parseRange,
  resolveGranularity,
  type MetricsEngine,
} from '../../src/data-access/metrics/engine'
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import { ISSUED_AR, OPEN_AR } from '../../src/data-access/metrics/catalog/accounting'
import {
  bandLabels,
  concentration,
  percentile,
  summarize,
} from '../../src/data-access/metrics/stats'
import { isoWeek, parseRange as rangeOf } from '../../src/data-access/metrics/time'
import { runKind, type KindContext } from '../../src/data-access/metrics/kinds'
import type {
  MetricFilter,
  MetricKpi,
  MetricResult,
  ResourceMetricDefinition,
} from '../../src/data-access/metrics/types'

const SECRET = 'b'.repeat(40)
const ADMIN = 'metrics-admin-secret'
const OLD_ADMIN = process.env['ADMIN_SECRET']

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env['TEST_DATABASE_URL']) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env['TEST_DATABASE_URL'] }),
  })
}

const ALL = { tenants: '*' as const }
const A = { tenants: ['tenant-a'] }
const RANGE = 'from=2026-03-01&to=2026-03-03'
/** "Now" for every engine-level test: Wednesday 2026-03-18, 12:00 UTC. */
const NOW = new Date('2026-03-18T12:00:00Z')
const MARCH = { from: '2026-03-01', to: '2026-03-18' }

type Row = { id: string } & Record<string, unknown>

// ── Seed: accounting (tenant-a books; one tenant-b invoice in GBP) ─────────
//
// today = 2026-03-18. Open AR = inv1, inv2 (USD), inv3 (EUR), inv8 (no currency).
const INVOICES_A: Row[] = [
  {
    id: 'inv1',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'USD',
    totalAmount: 100000,
    balanceAmount: 100000,
    postedAt: '2026-03-01',
    dueAt: '2026-03-10',
    contactId: 'c1',
  },
  {
    id: 'inv2',
    type: 'INVOICE',
    status: 'PARTIALLY_PAID',
    currency: 'USD',
    totalAmount: 50000,
    paidAmount: 20000,
    balanceAmount: 30000,
    postedAt: '2026-02-01',
    dueAt: '2026-01-01',
    contactId: 'c2',
  },
  {
    id: 'inv3',
    status: 'AUTHORIZED',
    currency: 'EUR',
    totalAmount: 20000,
    balanceAmount: 20000,
    postedAt: '2026-03-15',
    dueAt: '2026-04-15',
    contactId: 'c1',
  },
  {
    id: 'inv4',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'USD',
    totalAmount: 30000,
    paidAmount: 30000,
    balanceAmount: 0,
    postedAt: '2026-03-02',
    dueAt: '2026-03-12',
    paidAt: '2026-03-12T10:00:00Z',
    contactId: 'c3',
  },
  {
    id: 'inv5',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'USD',
    totalAmount: 10000,
    paidAmount: 10000,
    balanceAmount: 0,
    postedAt: '2026-03-03',
    dueAt: '2026-03-05',
    paidAt: '2026-03-13T09:00:00Z',
    contactId: 'c1',
  },
  {
    id: 'inv6',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'JPY',
    totalAmount: 5000,
    paidAmount: 5000,
    balanceAmount: 0,
    postedAt: '2026-03-04',
    paidAt: '2026-03-14T00:00:00Z',
    contactId: 'c9',
  },
  {
    id: 'inv7',
    type: 'INVOICE',
    status: 'DRAFT',
    currency: 'USD',
    totalAmount: 99999,
    balanceAmount: 99999,
    postedAt: '2026-03-05',
    dueAt: '2026-03-06',
    contactId: 'c1',
  },
  {
    id: 'inv8',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    totalAmount: 1000,
    balanceAmount: 1000,
    postedAt: '2026-03-06',
    dueAt: '2026-02-01',
    contactId: 'c4',
  },
  {
    id: 'inv9',
    type: 'INVOICE',
    status: 'PAID',
    currency: 'USD',
    totalAmount: 1000,
    paidAmount: 1000,
    balanceAmount: 0,
    postedAt: '2026-02-01',
    dueAt: '2026-02-20',
    paidAt: '2026-02-15T00:00:00Z',
    contactId: 'c3',
  },
  {
    id: 'bill1',
    type: 'BILL',
    status: 'AUTHORIZED',
    currency: 'USD',
    totalAmount: 777,
    balanceAmount: 777,
    postedAt: '2026-03-01',
    dueAt: '2026-03-01',
  },
  {
    id: 'cm1',
    type: 'CREDITMEMO',
    status: 'AUTHORIZED',
    currency: 'USD',
    totalAmount: 500,
    balanceAmount: 500,
    postedAt: '2026-03-01',
  },
]
const INVOICES_B: Row[] = [
  {
    id: 'invB1',
    type: 'INVOICE',
    status: 'AUTHORIZED',
    currency: 'GBP',
    totalAmount: 40000,
    balanceAmount: 40000,
    postedAt: '2026-03-01',
    dueAt: '2026-03-01',
    contactId: 'cb',
  },
]
const BILLS_A: Row[] = [
  {
    id: 'b1',
    status: 'AUTHORIZED',
    currency: 'USD',
    totalAmount: 60000,
    balanceAmount: 60000,
    postedAt: '2026-03-01',
    dueAt: '2026-03-31',
  },
  {
    id: 'b2',
    status: 'PAID',
    currency: 'USD',
    totalAmount: 30000,
    balanceAmount: 0,
    postedAt: '2026-02-15',
    dueAt: '2026-03-01',
  },
]

// ── Seed: customer support (t3 is 23:30 −05:00 = Wed 04:30 UTC) ────────────
const TICKETS_A: Row[] = [
  {
    id: 't1',
    status: 'solved',
    priority: 'high',
    channel: 'email',
    tagIds: ['tg1', 'tg2'],
    satisfactionRating: 5,
    createdAt: '2026-03-16T09:00:00Z',
    resolvedAt: '2026-03-16T10:00:00Z',
  },
  {
    id: 't2',
    status: 'solved',
    priority: 'high',
    channel: 'email',
    tagIds: ['tg1'],
    satisfactionRating: 3,
    createdAt: '2026-03-16T09:30:00Z',
    resolvedAt: '2026-03-16T11:30:00Z',
  },
  {
    id: 't3',
    status: 'open',
    priority: 'low',
    channel: 'chat',
    tagIds: ['tg3'],
    createdAt: '2026-03-17T23:30:00-05:00',
    resolvedAt: '2026-03-18T07:30:00Z',
  },
  {
    id: 't4',
    status: 'solved',
    priority: 'low',
    channel: 'email',
    tagIds: [],
    satisfactionRating: 4,
    createdAt: '2026-03-10T14:00:00Z',
    resolvedAt: '2026-03-10T18:00:00Z',
  },
  {
    id: 't5',
    status: 'pending',
    priority: 'urgent',
    channel: 'phone',
    tagIds: ['tg2'],
    createdAt: '2026-03-11T08:00:00Z',
    resolvedAt: '2026-03-11T18:00:00Z',
  },
]
const TAGS_A: Row[] = [
  { id: 'tg1', name: 'Login' },
  { id: 'tg2', name: 'Billing' },
]
// Another tenant's labels: must never appear in tenant-a's results.
const TAGS_B: Row[] = [
  { id: 'tg1', name: 'Other tenant login' },
  { id: 'tg3', name: 'Secret tenant tag' },
]

// ── Seed: payments charges (USD / JPY / KWD have exponents 2 / 0 / 3) ──────
const CHARGES_A: Row[] = [
  {
    id: 'ch1',
    amount: 1500,
    currency: 'USD',
    status: 'succeeded',
    createdAt: '2026-03-02T10:00:00Z',
  },
  {
    id: 'ch2',
    amount: 999,
    currency: 'USD',
    status: 'succeeded',
    createdAt: '2026-03-02T10:00:00Z',
  },
  {
    id: 'ch3',
    amount: 60000,
    currency: 'USD',
    status: 'succeeded',
    createdAt: '2026-03-03T10:00:00Z',
  },
  {
    id: 'ch4',
    amount: 20,
    currency: 'JPY',
    status: 'succeeded',
    createdAt: '2026-03-03T10:00:00Z',
  },
  {
    id: 'ch5',
    amount: 20000,
    currency: 'KWD',
    status: 'succeeded',
    createdAt: '2026-03-03T10:00:00Z',
  },
  {
    id: 'ch6',
    amount: 99999,
    currency: 'USD',
    status: 'failed',
    createdAt: '2026-03-03T10:00:00Z',
  },
]

const base = { title: 't', description: 'd' }

/** Every filter op, as a snapshot count over tenant-a's eleven invoices. */
const FILTER_CASES: Array<[MetricFilter, number]> = [
  [{ field: 'status', op: 'eq', value: 'PAID' }, 4],
  [{ field: 'totalAmount', op: 'eq', value: 1000 }, 2],
  [{ field: 'type', op: 'ne', value: 'BILL' }, 10],
  [{ field: 'status', op: 'in', value: ['DRAFT', 'PARTIALLY_PAID'] }, 2],
  [{ field: 'type', op: 'not_in', value: ['BILL', 'CREDITMEMO'] }, 9],
  [{ field: 'status', op: 'in_ci', value: ['paid', 'draft'] }, 5],
  [{ field: 'dueAt', op: 'is_null' }, 2],
  [{ field: 'paidAt', op: 'not_null' }, 4],
  [{ field: 'balanceAmount', op: 'gt', value: 20000 }, 3],
  [{ field: 'balanceAmount', op: 'gte', value: 20000 }, 4],
  [{ field: 'balanceAmount', op: 'lt', value: 777 }, 5],
  [{ field: 'balanceAmount', op: 'lte', value: 777 }, 6],
  [{ field: 'dueAt', op: 'gt', value: '2026-03-10' }, 2],
  [{ field: 'dueAt', op: 'before_now' }, 8],
  [{ field: 'dueAt', op: 'after_now' }, 1],
  [{ field: 'dueAt', op: 'older_than_days', value: 10 }, 6],
  [{ field: 'dueAt', op: 'within_last_days', value: 10 }, 2],
  [{ field: 'dueAt', op: 'within_next_days', value: 30 }, 1],
]

const TEST_METRICS: ResourceMetricDefinition[] = [
  ...FILTER_CASES.map(([f], i): ResourceMetricDefinition => ({
    ...base,
    id: `accounting.test_filter_${i}`,
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'overview',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    filters: [f],
  })),
  {
    ...base,
    id: 'accounting.test_partly_paid',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    compare: [{ left: 'paidAmount', op: 'lt', right: 'totalAmount' }],
  },
  {
    ...base,
    id: 'accounting.test_fully_paid',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'value',
    snapshot: true,
    measure: { op: 'count' },
    compare: [{ left: 'paidAmount', op: 'eq', right: 'totalAmount' }],
  },
  {
    ...base,
    id: 'accounting.test_overdue_pct',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'risk',
    kind: 'ratio',
    snapshot: true,
    filters: OPEN_AR,
    numerator: {
      measure: { op: 'sum', field: 'balanceAmount', currencyField: 'currency' },
      filters: [{ field: 'dueAt', op: 'before_now' }],
    },
    denominator: { measure: { op: 'sum', field: 'balanceAmount', currencyField: 'currency' } },
  },
  {
    ...base,
    id: 'accounting.test_open_by_customer',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'breakdown',
    snapshot: true,
    filters: OPEN_AR,
    measure: { op: 'sum', field: 'balanceAmount', currencyField: 'currency' },
    group: { field: 'contactId' },
  },
  {
    ...base,
    // Bands over a quantity (amounts would mix currencies: §2 refuses them).
    id: 'customer-support.test_rating_bands',
    vertical: 'customer-support',
    resourceType: 'tickets',
    section: 'satisfaction',
    kind: 'breakdown',
    snapshot: true,
    measure: { op: 'count' },
    group: { field: 'satisfactionRating', bands: [2, 4] },
  },
  {
    // Financial through its filter; comparable, with coverage.
    ...base,
    id: 'accounting.test_masked_days_to_pay',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'duration',
    dateField: 'paidAt',
    from: 'postedAt',
    to: 'paidAt',
    unit: 'days',
    buckets: [0, 30],
    filters: [{ field: 'balanceAmount', op: 'lte', value: 0 }],
    coverage: ['dueAt'],
  },
  {
    ...base,
    id: 'accounting.test_avg_open',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'value',
    dateField: 'postedAt',
    measure: { op: 'avg', field: 'totalAmount', currencyField: 'currency' },
    coverage: ['dueAt'],
  },
  {
    // A count part on another resource type, currency-aware through its own field.
    ...base,
    id: 'accounting.test_credit_note_count_rate',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'risk',
    kind: 'ratio',
    dateField: 'postedAt',
    filters: ISSUED_AR,
    currencyField: 'currency',
    numerator: { measure: { op: 'count' }, resourceType: 'creditmemos', currencyField: 'currency' },
    denominator: { measure: { op: 'count' } },
  },
  {
    ...base,
    id: 'accounting.test_net_documents',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'overview',
    kind: 'composition',
    dateField: 'postedAt',
    filters: ISSUED_AR,
    currencyField: 'currency',
    components: [
      { label: 'Invoices', sign: 1, measure: { op: 'count' } },
      {
        label: 'Credit notes',
        sign: -1,
        measure: { op: 'count' },
        resourceType: 'creditmemos',
        currencyField: 'currency',
      },
    ],
  },
  {
    ...base,
    id: 'accounting.test_due_soon',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'aging',
    snapshot: true,
    filters: OPEN_AR,
    field: 'dueAt',
    direction: 'future',
    buckets: [0, 7, 30],
    measure: { op: 'count' },
  },
  {
    ...base,
    id: 'customer-support.test_resolution',
    vertical: 'customer-support',
    resourceType: 'tickets',
    section: 'speed',
    kind: 'duration',
    dateField: 'createdAt',
    from: 'createdAt',
    to: 'resolvedAt',
    unit: 'hours',
    buckets: [2, 4, 8],
    group: { field: 'priority' },
  },
  {
    ...base,
    id: 'customer-support.test_csat',
    vertical: 'customer-support',
    resourceType: 'tickets',
    section: 'satisfaction',
    kind: 'value',
    dateField: 'createdAt',
    measure: { op: 'avg', field: 'satisfactionRating' },
  },
  {
    ...base,
    id: 'customer-support.test_by_priority',
    vertical: 'customer-support',
    resourceType: 'tickets',
    section: 'workload',
    kind: 'timeseries',
    dateField: 'createdAt',
    measure: { op: 'count' },
    splitBy: { field: 'priority' },
  },
  {
    ...base,
    id: 'customer-support.test_monthly',
    vertical: 'customer-support',
    resourceType: 'tickets',
    section: 'workload',
    kind: 'timeseries',
    dateField: 'createdAt',
    measure: { op: 'count' },
    granularity: 'month',
  },
]

describe.each(BACKENDS)('metrics [$name]', (backend) => {
  let app: FastifyInstance
  let handle: DbHandle
  let creds: CredentialStore
  let resources: ResourceStore
  let sync: SyncStore
  let shopA: string
  let shopB: string
  let crmA: string

  async function build(withStore = true) {
    app = Fastify({ logger: false })
    await app.register(
      createDataAccessRouter({
        credentialStore: creds,
        resourceStore: withStore ? resources : undefined,
        syncStore: withStore ? sync : undefined,
        storeSecret: SECRET,
      }),
    )
    await app.ready()
  }

  function get(url: string, scope: unknown = ALL) {
    return app.inject({
      method: 'GET',
      url,
      headers: { 'x-admin-secret': ADMIN, [DATA_SCOPE_HEADER]: JSON.stringify(scope) },
    })
  }

  /** An engine at NOW, serving the catalog plus the test-only definitions. */
  function engine(extra: { valuesCap?: number } = {}): MetricsEngine {
    return createMetricsEngine({
      credentialStore: creds,
      resourceStore: resources,
      syncStore: sync,
      now: () => NOW,
      resourceMetrics: [...RESOURCE_METRICS, ...TEST_METRICS],
      ...extra,
    })
  }

  const conn = { accessToken: 'x' } as never

  async function seedAccounting() {
    const booksA = await creds.create('xero', null, conn, 'Books A', 'accounting', 'tenant-a')
    const booksB = await creds.create('xero', null, conn, 'Books B', 'accounting', 'tenant-b')
    await resources.upsertMany('accounting', 'xero', booksA, 'invoices', INVOICES_A)
    await resources.upsertMany('accounting', 'xero', booksB, 'invoices', INVOICES_B)
    await resources.upsertMany('accounting', 'xero', booksA, 'bills', BILLS_A)
  }

  async function seedSupport() {
    const deskA = await creds.create(
      'zendesk',
      null,
      conn,
      'Desk A',
      'customer-support',
      'tenant-a',
    )
    const deskB = await creds.create(
      'zendesk',
      null,
      conn,
      'Desk B',
      'customer-support',
      'tenant-b',
    )
    await resources.upsertMany('customer-support', 'zendesk', deskA, 'tickets', TICKETS_A)
    await resources.upsertMany('customer-support', 'zendesk', deskA, 'tags', TAGS_A)
    await resources.upsertMany('customer-support', 'zendesk', deskB, 'tags', TAGS_B)
    await resources.upsert('customer-support', 'zendesk', deskB, 'tickets', 'tb1', {
      id: 'tb1',
      status: 'open',
      tagIds: ['tg3'],
      createdAt: '2026-03-16T09:00:00Z',
    })
  }

  async function seedPayments() {
    const payA = await creds.create('stripe', null, conn, 'Pay A', 'payments', 'tenant-a')
    await resources.upsertMany('payments', 'stripe', payA, 'charges', CHARGES_A)
  }

  const kpi = (r: MetricResult, key: string, currency?: string | null) =>
    r.kpis?.find(
      (k: MetricKpi) => k.key === key && (currency === undefined || k.currency === currency),
    )?.value

  beforeEach(async () => {
    process.env['ADMIN_SECRET'] = ADMIN
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    creds = await CredentialStore.create(handle, SECRET)
    resources = await ResourceStore.create(handle)
    sync = await SyncStore.create(handle)
    shopA = await creds.create('shopify', null, conn, 'Shop A', 'ecommerce', 'tenant-a')
    shopB = await creds.create('shopify', null, conn, 'Shop B', 'ecommerce', 'tenant-b')
    crmA = await creds.create('hubspot', null, conn, 'CRM A', 'crm', 'tenant-a')
    await resources.upsertMany('ecommerce', 'shopify', shopA, 'orders', [
      {
        id: 'a1',
        createdAt: '2026-03-01T09:00:00Z',
        financialStatus: 'PAID',
        email: 'jane@example.com',
        totalPrice: { amount: 1999, currency: 'USD' },
      },
      {
        id: 'a2',
        createdAt: '2026-03-03T09:00:00Z',
        financialStatus: 'PENDING',
        totalPrice: { amount: 1000, currency: 'JPY' },
      },
      {
        id: 'a3',
        createdAt: '2026-02-01T09:00:00Z',
        financialStatus: 'PAID',
        totalPrice: { amount: 5, currency: 'USD' },
      },
    ] as Row[])
    await resources.upsert('ecommerce', 'shopify', shopB, 'orders', 'b1', {
      id: 'b1',
      createdAt: '2026-03-01T10:00:00Z',
      financialStatus: 'PAID',
      totalPrice: { amount: 500000, currency: 'USD' },
    })
    await resources.upsert('crm', 'hubspot', crmA, 'deals', 'd1', {
      id: 'd1',
      title: 'Deal',
      stage: 'Negotiation',
      created_at: '2026-03-02T00:00:00Z',
    })
    await handle.kysely
      .insertInto('sync_jobs')
      .values({
        id: 'j1',
        vertical: 'ecommerce',
        connection_id: shopA,
        platform: 'shopify',
        tenant_id: 'tenant-a',
        status: 'completed',
        created_at: Date.parse('2026-03-02T12:00:00Z'),
      })
      .execute()
    await handle.kysely
      .insertInto('sync_jobs')
      .values({
        id: 'j2',
        vertical: 'ecommerce',
        connection_id: shopB,
        platform: 'shopify',
        tenant_id: 'tenant-b',
        status: 'failed',
        created_at: Date.parse('2026-03-02T13:00:00Z'),
      })
      .execute()
  })

  afterEach(async () => {
    await app?.close()
    await handle.close()
    if (OLD_ADMIN === undefined) delete process.env['ADMIN_SECRET']
    else process.env['ADMIN_SECRET'] = OLD_ADMIN
  })

  // ── Routes, scope and the v1 behaviour ─────────────────────────────────

  it('lists the catalog, narrowed to the verticals in scope', async () => {
    await build()
    const all = (await get('/admin/data/metrics')).json().data as Array<{ id: string }>
    expect(all.map((m) => m.id)).toContain('ecommerce.revenue_per_day')
    expect(all.map((m) => m.id)).toContain('system.data_freshness')
    const crmOnly = (
      await get('/admin/data/metrics', { tenants: '*', verticals: { crm: '*' } })
    ).json().data as Array<{ id: string }>
    expect(crmOnly.some((m) => m.id.startsWith('ecommerce.'))).toBe(false)
    expect(crmOnly.some((m) => m.id === 'crm.deals_by_stage')).toBe(true)
    // A metric reading a type outside the scope is not listed (dpo reads bills).
    const invoicesOnly = (
      await get('/admin/data/metrics', { tenants: '*', verticals: { accounting: ['invoices'] } })
    ).json().data as Array<{ id: string }>
    expect(invoicesOnly.map((m) => m.id)).toContain('accounting.dso')
    expect(invoicesOnly.map((m) => m.id)).not.toContain('accounting.dpo')
  })

  it('counts per day, zero-filled across the range', async () => {
    await build()
    const res = await get(`/admin/data/metrics/ecommerce.orders_per_day?${RANGE}`)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.granularity).toBe('day')
    expect(data.series).toEqual([
      {
        name: 'Records',
        points: [
          { x: '2026-03-01', y: 2 },
          { x: '2026-03-02', y: 0 },
          { x: '2026-03-03', y: 1 },
        ],
      },
    ])
    expect(data.value).toBe(3)
  })

  it('only aggregates connections owned by tenants in scope', async () => {
    await build()
    const res = await get(`/admin/data/metrics/ecommerce.orders_total?${RANGE}`, A)
    expect(res.json().data.value).toBe(2)
    const none = await get(`/admin/data/metrics/ecommerce.orders_total?${RANGE}`, {
      tenants: ['tenant-a'],
      tenantVerticals: { 'tenant-a': ['crm'] },
    })
    expect(none.json().data.value).toBe(0)
  })

  it('sums minor units per currency and reports major units with the right exponent', async () => {
    await build()
    const res = await get(`/admin/data/metrics/ecommerce.revenue_per_day?${RANGE}`, A)
    const data = res.json().data
    expect(data.metric.unit).toBe('money')
    expect(data.value).toBeNull()
    expect(data.currencies).toEqual(['JPY', 'USD'])
    expect(data.totals).toEqual([
      { currency: 'JPY', amount: 1000, amountMinor: 1000 },
      { currency: 'USD', amount: 19.99, amountMinor: 1999 },
    ])
    const usd = data.series.find((s: { name: string }) => s.name === 'USD')
    expect(usd.currency).toBe('USD')
    expect(usd.points).toEqual([
      { x: '2026-03-01', y: 19.99 },
      { x: '2026-03-02', y: 0 },
      { x: '2026-03-03', y: 0 },
    ])
  })

  it('withholds financial sums when the deployment masks financial values', async () => {
    await build()
    const res = await get(`/admin/data/metrics/ecommerce.revenue_per_day?${RANGE}`, {
      tenants: '*',
      maskFinancial: true,
    })
    const data = res.json().data
    expect(data.masked).toBe(true)
    expect(data.series).toEqual([])
    expect(data.totals).toEqual([])
    expect(data.kpis).toBeUndefined()
    // A count whose only financial-looking field is the currency code stays visible.
    const count = await get(`/admin/data/metrics/ecommerce.orders_total?${RANGE}`, {
      tenants: '*',
      maskFinancial: true,
    })
    expect(count.json().data).toMatchObject({ masked: false, value: 3 })
  })

  it('groups by a field', async () => {
    await build()
    const res = await get(`/admin/data/metrics/ecommerce.orders_by_financial_status?${RANGE}`)
    expect(res.json().data.series[0].points).toEqual([
      { x: 'PAID', y: 2 },
      { x: 'PENDING', y: 1 },
    ])
    expect(res.json().data.table.rows).toEqual([
      { key: 'PAID', label: 'PAID', value: 2, records: 2, share: 66.67 },
      { key: 'PENDING', label: 'PENDING', value: 1, records: 1, share: 33.33 },
    ])
  })

  it('serves the system metrics, scoped', async () => {
    await build()
    const perVertical = (
      await get(`/admin/data/metrics/system.records_per_vertical?${RANGE}`, A)
    ).json().data
    expect(perVertical.series[0].points).toEqual([
      { x: 'ecommerce', y: 3 },
      { x: 'crm', y: 1 },
    ])
    const outcomes = (
      await get(`/admin/data/metrics/system.sync_outcomes_per_day?${RANGE}`, A)
    ).json().data
    expect(outcomes.series).toEqual([
      {
        name: 'completed',
        points: [
          { x: '2026-03-01', y: 0 },
          { x: '2026-03-02', y: 1 },
          { x: '2026-03-03', y: 0 },
        ],
      },
    ])
    const weekly = (
      await get(`/admin/data/metrics/system.sync_outcomes_per_day?${RANGE}&granularity=week`, A)
    ).json().data
    expect(weekly.granularity).toBe('week')
    expect(weekly.series[0].points).toEqual([
      { x: '2026-W09', y: 0 },
      { x: '2026-W10', y: 1 },
    ])
    const freshness = (await get(`/admin/data/metrics/system.data_freshness`, ALL)).json().data
    expect(freshness.table.rows.map((r: { connectionId: string }) => r.connectionId)).toEqual([
      shopA,
      crmA,
      shopB,
    ])
  })

  it('answers 404 for an unknown or out-of-scope metric and 400 for a bad range', async () => {
    await build()
    expect((await get('/admin/data/metrics/nope')).statusCode).toBe(404)
    const outOfScope = await get('/admin/data/metrics/ecommerce.orders_total', {
      tenants: '*',
      verticals: { crm: '*' },
    })
    expect(outOfScope.statusCode).toBe(404)
    const bad = await get(
      '/admin/data/metrics/ecommerce.orders_total?from=2026-03-05&to=2026-03-01',
    )
    expect(bad.statusCode).toBe(400)
    expect(bad.json().error.code).toBe('INVALID_RANGE')
    const long = await get(
      '/admin/data/metrics/ecommerce.orders_total?from=2024-01-01&to=2026-01-01',
    )
    expect(long.statusCode).toBe(400)
  })

  it('answers 400 for a bad granularity, currency or compare parameter', async () => {
    await build()
    for (const q of [
      'granularity=hourly',
      'granularity=DAY',
      'currency=usd',
      'currency=US',
      'currency=USDX',
      'compare=yes',
    ]) {
      const res = await get(`/admin/data/metrics/ecommerce.revenue_per_day?${RANGE}&${q}`)
      expect(res.statusCode, q).toBe(400)
      expect(res.json().error.code, q).toBe('INVALID_QUERY')
    }
    for (const q of ['granularity=auto', 'granularity=month', 'currency=EUR', 'compare=1']) {
      expect(
        (await get(`/admin/data/metrics/ecommerce.revenue_per_day?${RANGE}&${q}`)).statusCode,
        q,
      ).toBe(200)
    }
  })

  it('answers 409 in passthrough mode', async () => {
    await build(false)
    const res = await get('/admin/data/metrics/ecommerce.orders_total')
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('DATA_STORE_DISABLED')
    expect((await get('/admin/data/currencies')).statusCode).toBe(409)
  })

  it('lists the in-scope currencies, sorted, without null, cached per scope', async () => {
    await seedAccounting()
    await seedPayments()
    await build()
    const a = await get('/admin/data/currencies', A)
    expect(a.statusCode).toBe(200)
    // orders USD/JPY, invoices USD/EUR/JPY (inv8 has none), bills USD, charges USD/JPY/KWD
    expect(a.json().data).toEqual(['EUR', 'JPY', 'KWD', 'USD'])
    // GBP lives on a tenant-b invoice only
    expect((await get('/admin/data/currencies', ALL)).json().data).toEqual([
      'EUR',
      'GBP',
      'JPY',
      'KWD',
      'USD',
    ])
    expect(
      (await get('/admin/data/currencies', { tenants: '*', verticals: { crm: '*' } })).json().data,
    ).toEqual([])
    const e = engine()
    expect(await e.currencies(A)).toEqual(['EUR', 'JPY', 'KWD', 'USD'])
    await resources.upsert('ecommerce', 'shopify', shopA, 'orders', 'chf', {
      id: 'chf',
      createdAt: '2026-03-01T00:00:00Z',
      totalPrice: { amount: 1, currency: 'CHF' },
    })
    expect(await e.currencies(A)).not.toContain('CHF')
    e.clear()
    expect(await e.currencies(A)).toContain('CHF')
  })

  // ── Cache key ──────────────────────────────────────────────────────────

  it('caches per (metric, scope, range, currency, granularity, compare)', async () => {
    const e = createMetricsEngine({ credentialStore: creds, resourceStore: resources })
    const run = (p: Parameters<MetricsEngine['run']>[2] = {}) =>
      e.run('ecommerce.orders_total', ALL, { from: '2026-03-01', to: '2026-03-03', ...p })
    const first = await run()
    expect(first.value).toBe(3)
    await resources.upsert('ecommerce', 'shopify', shopA, 'orders', 'a9', {
      id: 'a9',
      createdAt: '2026-03-02T00:00:00Z',
      totalPrice: { amount: 1, currency: 'USD' },
    })
    expect((await run()).value).toBe(3) // cached
    expect(
      (await e.run('ecommerce.orders_total', A, { from: '2026-03-01', to: '2026-03-03' })).value,
    ).toBe(3)
    expect((await run({ currency: 'USD' })).value).toBe(3) // a1, b1, a9
    expect((await run({ granularity: 'week' })).value).toBe(4)
    expect((await run({ compare: true })).value).toBe(4)
    expect((await run({ to: '2026-03-04' })).value).toBe(4)
    expect((await run()).value).toBe(3) // the original entry is still cached
    e.clear()
    expect((await run()).value).toBe(4)
  })

  // ── Currency separation and the currency filter ────────────────────────

  it('reports open AR per currency: one series each, no Total, unknown currency kept apart', async () => {
    await seedAccounting()
    const r = await engine().run('accounting.outstanding_amount', A, MARCH)
    expect(r.range).toEqual({ from: '2026-03-18', to: '2026-03-18' })
    expect(r.value).toBeNull()
    expect(r.currencies).toEqual(['EUR', 'USD'])
    // DRAFT, PAID, BILL and CREDITMEMO rows are not open AR.
    expect(r.totals).toEqual([
      { currency: 'EUR', amount: 200, amountMinor: 20000 },
      { currency: 'USD', amount: 1300, amountMinor: 130000 },
      { currency: null, amount: 10, amountMinor: 1000 },
    ])
    expect(r.series).toEqual([
      { name: 'EUR', currency: 'EUR', points: [{ x: 'EUR', y: 200 }] },
      { name: 'USD', currency: 'USD', points: [{ x: 'USD', y: 1300 }] },
      { name: 'Unknown currency', currency: null, points: [{ x: 'Unknown currency', y: 10 }] },
    ])
    expect(r.series.some((s) => s.name === 'Total')).toBe(false)
    expect(kpi(r, 'records', 'USD')).toBe(2)
    // The filter keeps one currency and still lists every code present before it.
    const usd = await engine().run('accounting.outstanding_amount', A, { currency: 'USD' })
    expect(usd.currency).toBe('USD')
    expect(usd.currencies).toEqual(['EUR', 'USD'])
    expect(usd.totals).toEqual([{ currency: 'USD', amount: 1300, amountMinor: 130000 }])
    // A code with no records yields nothing, not another currency's numbers.
    const gbp = await engine().run('accounting.outstanding_amount', A, { currency: 'GBP' })
    expect(gbp.totals).toEqual([])
    expect(gbp.series).toEqual([])
  })

  it('filters counts with a currencyField by currency, and ignores the filter elsewhere', async () => {
    await seedSupport()
    const e = engine()
    const usd = await e.run('ecommerce.orders_total', A, { ...MARCH, currency: 'USD' })
    expect(usd).toMatchObject({ value: 1, currency: 'USD', currencies: ['JPY', 'USD'] })
    const jpy = await e.run('ecommerce.orders_per_day', A, {
      from: '2026-03-01',
      to: '2026-03-03',
      currency: 'JPY',
    })
    expect(jpy.series[0]!.points.map((p) => p.y)).toEqual([0, 0, 1])
    // Tickets carry no currency: the filter does not apply.
    const t = await e.run('customer-support.tickets_created_per_day', A, {
      ...MARCH,
      currency: 'USD',
    })
    expect(t).toMatchObject({ value: 5, currency: null, currencies: [] })
  })

  it('never adds money across currencies in a series over time', async () => {
    const r = await engine().run('ecommerce.revenue_per_day', ALL, {
      from: '2026-03-01',
      to: '2026-03-03',
      currency: 'USD',
    })
    expect(r.series.map((s) => [s.name, s.currency])).toEqual([['USD', 'USD']])
    expect(r.totals).toEqual([{ currency: 'USD', amount: 5019.99, amountMinor: 501999 }])
    expect(r.currencies).toEqual(['JPY', 'USD'])
  })

  // ── Granularity and compare ────────────────────────────────────────────

  it('buckets by auto, week and month granularity', async () => {
    const e = engine()
    const q = { from: '2026-01-01', to: '2026-03-31' }
    const auto = await e.run('ecommerce.orders_per_day', A, q)
    expect(auto.granularity).toBe('week') // 90 days
    const points = auto.series[0]!.points
    expect(points[0]!.x).toBe('2026-W01')
    expect(points[points.length - 1]!.x).toBe('2026-W14')
    expect(points.filter((p) => p.y !== 0)).toEqual([
      { x: '2026-W05', y: 1 }, // a3 Sun 2026-02-01
      { x: '2026-W09', y: 1 }, // a1 Sun 2026-03-01
      { x: '2026-W10', y: 1 }, // a2 Tue 2026-03-03
    ])
    const month = await e.run('ecommerce.orders_per_day', A, { ...q, granularity: 'month' })
    expect(month.granularity).toBe('month')
    expect(month.series[0]!.points).toEqual([
      { x: '2026-01', y: 0 },
      { x: '2026-02', y: 1 },
      { x: '2026-03', y: 2 },
    ])
    const day = await e.run('ecommerce.orders_per_day', A, { ...q, granularity: 'day' })
    expect(day.series[0]!.points).toHaveLength(90)
    const long = await e.run('ecommerce.orders_per_day', A, {
      from: '2025-09-13',
      to: '2026-03-31',
    })
    expect(long.granularity).toBe('month')
    expect(long.series[0]!.points).toHaveLength(7)
    // A kind with no time axis has no granularity.
    expect((await e.run('ecommerce.orders_total', A, q)).granularity).toBeNull()
  })

  it('adds the prior equal-length range with compare=1', async () => {
    const e = engine()
    const count = await e.run('ecommerce.orders_total', A, {
      from: '2026-03-01',
      to: '2026-03-31',
      compare: true,
    })
    expect(count.value).toBe(2)
    expect(count.previous).toEqual({ value: 1, range: { from: '2026-01-29', to: '2026-02-28' } })
    const money = await e.run('ecommerce.revenue_per_day', A, {
      from: '2026-03-01',
      to: '2026-03-31',
      compare: true,
    })
    expect(money.previous).toEqual({
      value: null,
      totals: [{ currency: 'USD', amount: 0.05, amountMinor: 5 }],
      range: { from: '2026-01-29', to: '2026-02-28' },
    })
    expect((await e.run('ecommerce.orders_total', A, MARCH)).previous).toBeUndefined()
  })

  // ── Filters and field comparisons ──────────────────────────────────────

  it('applies every filter op, the now-relative ones against the injected now', async () => {
    await seedAccounting()
    const e = engine()
    for (const [i, [f, expected]] of FILTER_CASES.entries()) {
      const r = await e.run(`accounting.test_filter_${i}`, A)
      expect(r.value, `${f.field} ${f.op} ${JSON.stringify(f.value)}`).toBe(expected)
    }
    // A later "now" moves the relative filters.
    const later = createMetricsEngine({
      credentialStore: creds,
      resourceStore: resources,
      now: () => new Date('2026-05-01T00:00:00Z'),
      resourceMetrics: [...RESOURCE_METRICS, ...TEST_METRICS],
    })
    const beforeNow = FILTER_CASES.findIndex(([f]) => f.op === 'before_now')
    expect((await later.run(`accounting.test_filter_${beforeNow}`, A)).value).toBe(9)
  })

  it('compares two fields of a record', async () => {
    await seedAccounting()
    const e = engine()
    expect((await e.run('accounting.test_partly_paid', A)).value).toBe(1) // inv2
    expect((await e.run('accounting.test_fully_paid', A)).value).toBe(4) // inv4, inv5, inv6, inv9
  })

  // ── Kinds ──────────────────────────────────────────────────────────────

  it('value: averages a currency-free field', async () => {
    await seedSupport()
    const r = await engine().run('customer-support.test_csat', A, MARCH)
    expect(r).toMatchObject({ value: 4, currencies: [], masked: false })
    expect(r.metric.unit).toBe('index')
  })

  it('timeseries: splits by a field, top values first', async () => {
    await seedSupport()
    const r = await engine().run('customer-support.test_by_priority', A, {
      from: '2026-03-10',
      to: '2026-03-18',
    })
    expect(r.metric.charts).toContain('stacked_bar')
    expect(r.series.map((s) => s.name)).toEqual(['high', 'low', 'urgent'])
    const at = (name: string) =>
      Object.fromEntries(
        r.series
          .find((s) => s.name === name)!
          .points.filter((p) => p.y)
          .map((p) => [p.x, p.y]),
      )
    expect(at('high')).toEqual({ '2026-03-16': 2 })
    // t3's day is the stored text's own day (2026-03-17), as in the range filter
    expect(at('low')).toEqual({ '2026-03-10': 1, '2026-03-17': 1 })
    expect(at('urgent')).toEqual({ '2026-03-11': 1 })
    expect(r.value).toBe(5)
  })

  it('breakdown: money per currency with shares inside each currency, and numeric bands', async () => {
    await seedAccounting()
    const e = engine()
    const r = await e.run('accounting.test_open_by_customer', A)
    expect(r.series).toEqual([
      { name: 'EUR', currency: 'EUR', points: [{ x: 'c1', y: 200 }] },
      {
        name: 'USD',
        currency: 'USD',
        points: [
          { x: 'c1', y: 1000 },
          { x: 'c2', y: 300 },
        ],
      },
      { name: 'Unknown currency', currency: null, points: [{ x: 'c4', y: 10 }] },
    ])
    expect(r.table!.rows.filter((x) => x['currency'] === 'USD').map((x) => x['share'])).toEqual([
      76.92, 23.08,
    ])
    await seedSupport()
    // ratings: t1 5, t2 3, t4 4; t3 and t5 have none
    const bands = await e.run('customer-support.test_rating_bands', A)
    expect(bands.series[0]!.points).toEqual([
      { x: '< 2', y: 0 },
      { x: '2–4', y: 1 },
      { x: '≥ 4', y: 2 },
      { x: '(none)', y: 2 },
    ])
  })

  it('breakdown: unnests string arrays and labels ids from the same scope only', async () => {
    await seedSupport()
    const e = engine()
    const r = await e.run('customer-support.tickets_by_tag', A, MARCH)
    expect(r.series).toEqual([
      {
        name: 'Records',
        points: [
          { x: 'Login', y: 2 },
          { x: 'Billing', y: 2 },
          { x: 'tg3', y: 1 }, // tg3's only label is tenant-b's: fall back to the id
        ],
      },
    ])
    const json = JSON.stringify(r)
    expect(json).not.toContain('Secret tenant tag')
    expect(json).not.toContain('Other tenant login')
    // Tags out of scope: every label falls back to its id.
    const noTags = await e.run(
      'customer-support.tickets_by_tag',
      { tenants: ['tenant-a'], verticals: { 'customer-support': ['tickets'] } },
      MARCH,
    )
    expect(noTags.series[0]!.points.map((p) => p.x)).toEqual(['tg1', 'tg2', 'tg3'])
    // Both tenants in scope: tg3 is now labelled (and counted twice).
    const all = await e.run('customer-support.tickets_by_tag', ALL, MARCH)
    expect(all.series[0]!.points).toContainEqual({ x: 'Secret tenant tag', y: 2 })
  })

  it('ratio: counts with a field comparison, over time, with compare and coverage', async () => {
    await seedAccounting()
    const r = await engine().run('accounting.on_time_payment_rate', A, { ...MARCH, compare: true })
    // paid in range: inv4 on time, inv5 late, inv6 has no due date (left out)
    expect(r.value).toBe(50)
    expect(kpi(r, 'numerator')).toBe(1)
    expect(kpi(r, 'denominator')).toBe(2)
    expect(r.coverage).toEqual({ eligible: 2, total: 3 })
    expect(r.previous).toEqual({ value: 100, range: { from: '2026-02-11', to: '2026-02-28' } })
    expect(r.thresholds).toEqual({ warn: 80, crit: 60, direction: 'below' })
    const pts = r.series[0]!.points
    expect(r.series[0]!.name).toBe('Rate')
    expect(pts).toHaveLength(18)
    expect(pts.find((p) => p.x === '2026-03-12')!.y).toBe(100)
    expect(pts.find((p) => p.x === '2026-03-13')!.y).toBe(0)
    expect(pts.find((p) => p.x === '2026-03-14')!.y).toBeNull()
    const usd = await engine().run('accounting.on_time_payment_rate', A, {
      ...MARCH,
      currency: 'USD',
    })
    expect(usd.value).toBe(50)
    const jpy = await engine().run('accounting.on_time_payment_rate', A, {
      ...MARCH,
      currency: 'JPY',
    })
    expect(jpy.value).toBeNull()
  })

  it('applies the currency filter to count parts on another resource type', async () => {
    await seedAccounting()
    const booksA = (await creds.listForOwner('tenant-a')).find((c) => c.vertical === 'accounting')!
    await resources.upsertMany('accounting', 'xero', booksA.id, 'creditmemos', [
      { id: 'cmx1', currency: 'USD', postedAt: '2026-03-05' },
      { id: 'cmx2', currency: 'EUR', postedAt: '2026-03-06' },
      { id: 'cmx3', currency: 'USD', postedAt: '2026-03-07' },
    ] as Row[])
    const e = engine()
    // issued invoices in March: USD 3 (inv1, inv4, inv5), EUR 1, JPY 1, none 1
    const all = await e.run('accounting.test_credit_note_count_rate', A, MARCH)
    expect(all.value).toBe(50) // 3 / 6
    expect(all.currencies).toEqual(['EUR', 'JPY', 'USD'])
    expect(all.metric.currencyAware).toBe(true)
    const usd = await e.run('accounting.test_credit_note_count_rate', A, {
      ...MARCH,
      currency: 'USD',
    })
    expect(usd.value).toBe(66.67) // 2 / 3 — both sides in USD
    const eur = await e.run('accounting.test_credit_note_count_rate', A, {
      ...MARCH,
      currency: 'EUR',
    })
    expect(eur.value).toBe(100) // 1 / 1
    expect((await e.run('accounting.test_net_documents', A, MARCH)).value).toBe(3) // 6 − 3
    const net = await e.run('accounting.test_net_documents', A, { ...MARCH, currency: 'USD' })
    expect(net.value).toBe(1) // 3 − 2
  })

  it('ratio: money divided within each currency, never across', async () => {
    await seedAccounting()
    const r = await engine().run('accounting.test_overdue_pct', A)
    expect(r.value).toBeNull() // several currencies: no single headline
    expect(r.currencies).toEqual(['EUR', 'USD'])
    expect(kpi(r, 'ratio', 'USD')).toBe(100) // inv1 + inv2 overdue of 1300
    expect(kpi(r, 'ratio', 'EUR')).toBe(0) // inv3 due next month
    expect(kpi(r, 'ratio', null)).toBe(100) // inv8
    expect(kpi(r, 'denominator', 'USD')).toBe(1300)
    const eur = await engine().run('accounting.test_overdue_pct', A, { currency: 'EUR' })
    expect(eur.value).toBe(0)
    expect(eur.kpis!.every((k) => k.currency === 'EUR')).toBe(true)
  })

  it('duration: reads an offset-less datetime as UTC, whatever the host zone', async () => {
    await seedSupport()
    const desk = (await creds.listForOwner('tenant-a')).find(
      (c) => c.vertical === 'customer-support',
    )!
    await resources.upsert('customer-support', 'zendesk', desk.id, 'tickets', 'tz1', {
      id: 'tz1',
      priority: 'high',
      createdAt: '2026-03-09T10:00:00', // no offset: UTC, as the store reads it
      resolvedAt: '2026-03-09T12:00:00Z',
    })
    const old = process.env['TZ']
    process.env['TZ'] = 'America/New_York'
    try {
      // The zone switch took effect (else this test proves nothing).
      expect(Date.parse('2026-03-09T10:00:00')).not.toBe(Date.UTC(2026, 2, 9, 10))
      const r = await engine().run('customer-support.test_resolution', A, {
        from: '2026-03-09',
        to: '2026-03-09',
      })
      expect(r.stats![0]).toMatchObject({ n: 1, mean: 2 }) // not −2 (EDT is UTC−4)
    } finally {
      if (old === undefined) delete process.env['TZ']
      else process.env['TZ'] = old
    }
  })

  it('duration: percentiles, per-group stats and a histogram, hand-computed', async () => {
    await seedSupport()
    const r = await engine().run('customer-support.test_resolution', A, MARCH)
    // hours: t1 1, t2 2, t3 3 (23:30 −05:00 → 07:30Z), t4 4, t5 10
    expect(r.stats![0]).toEqual({
      group: 'All',
      n: 5,
      min: 1,
      p25: 2,
      p50: 3,
      p75: 4,
      p90: 7.6, // h = 0.9·4 = 3.6 → 4 + 0.6·(10 − 4)
      max: 10,
      mean: 4,
    })
    expect(r.stats!.slice(1).map((s) => [s.group, s.n, s.p50])).toEqual([
      ['high', 2, 1.5],
      ['low', 2, 3.5],
      ['urgent', 1, 10],
    ])
    expect(r.stats![1]!.p90).toBe(1.9)
    expect(r.value).toBe(4)
    expect(kpi(r, 'p90')).toBe(7.6)
    expect(r.series[0]!.points).toEqual([
      { x: '< 2 h', y: 1 },
      { x: '2–4 h', y: 2 },
      { x: '4–8 h', y: 1 },
      { x: '≥ 8 h', y: 1 },
    ])
    expect(r.metric.charts).toContain('boxplot')
  })

  it('duration: days to pay, with the currency filter on a count with a currencyField', async () => {
    await seedAccounting()
    const r = await engine().run('accounting.avg_days_to_pay', A, MARCH)
    // inv4 10 d 10 h, inv5 10 d 9 h, inv6 10 d
    expect(r.stats![0]).toMatchObject({ n: 3, min: 10, p50: 10.38, max: 10.42, mean: 10.26 })
    expect(r.currencies).toEqual(['JPY', 'USD'])
    expect(r.coverage).toEqual({ eligible: 3, total: 3 })
    const usd = await engine().run('accounting.avg_days_to_pay', A, { ...MARCH, currency: 'USD' })
    expect(usd.stats![0]).toMatchObject({ n: 2, mean: 10.4 })
  })

  it('aging: past buckets per currency and future buckets', async () => {
    await seedAccounting()
    const e = engine()
    const r = await e.run('accounting.ar_aging', A)
    const labels = ['Current', '1–30 days', '31–60 days', '61–90 days', '91+ days']
    const ys = (cur: string | null) =>
      r.series.find((s) => s.currency === cur)!.points.map((p) => [p.x, p.y])
    expect(ys('EUR')).toEqual(labels.map((l, i) => [l, [200, 0, 0, 0, 0][i]]))
    expect(ys('USD')).toEqual(labels.map((l, i) => [l, [0, 1000, 0, 300, 0][i]]))
    expect(ys(null)).toEqual(labels.map((l, i) => [l, [0, 0, 10, 0, 0][i]]))
    expect(r.totals!.map((t) => [t.currency, t.amount])).toEqual([
      ['EUR', 200],
      ['USD', 1300],
      [null, 10],
    ])
    const soon = await e.run('accounting.test_due_soon', A)
    expect(soon.series[0]!.points).toEqual([
      { x: 'Today or past', y: 3 },
      { x: '1–7 days', y: 0 },
      { x: '8–30 days', y: 1 },
      { x: '31+ days', y: 0 },
    ])
    expect(soon.value).toBe(4)
  })

  it('concentration: shares, HHI and effective N per currency', async () => {
    await seedAccounting()
    const e = engine()
    const r = await e.run('accounting.customer_concentration', A, MARCH)
    // March USD: c1 110000 (inv1 + inv5), c3 30000 → 11/14, 3/14
    expect(kpi(r, 'top1_share', 'USD')).toBe(78.57)
    expect(kpi(r, 'top5_share', 'USD')).toBe(100)
    expect(kpi(r, 'hhi', 'USD')).toBe(6633) // (121 + 9) / 196 · 10 000
    expect(kpi(r, 'effective_n', 'USD')).toBe(1.51) // 196 / 130
    expect(kpi(r, 'groups', 'USD')).toBe(2)
    expect(kpi(r, 'hhi', 'EUR')).toBe(10000)
    expect(kpi(r, 'effective_n', 'EUR')).toBe(1)
    expect(r.value).toBeNull()
    expect(r.table!.rows.filter((x) => x['currency'] === 'USD')).toEqual([
      {
        currency: 'USD',
        rank: 1,
        key: 'c1',
        label: 'c1',
        value: 1100,
        share: 78.57,
        cumulative: 78.57,
      },
      {
        currency: 'USD',
        rank: 2,
        key: 'c3',
        label: 'c3',
        value: 300,
        share: 21.43,
        cumulative: 100,
      },
    ])
    const usd = await e.run('accounting.customer_concentration', A, { ...MARCH, currency: 'USD' })
    expect(usd.value).toBe(78.57)
    expect(usd.series).toHaveLength(1)
  })

  it('matrix: weekday × hour in UTC, every cell present', async () => {
    await seedSupport()
    const r = await engine().run('customer-support.volume_heatmap', A, MARCH)
    expect(r.matrix!.x).toHaveLength(24)
    expect(r.matrix!.x[9]).toBe('09:00 UTC')
    expect(r.matrix!.y).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(r.matrix!.cells).toHaveLength(24 * 7)
    const nonZero = r.matrix!.cells.filter((c) => c[2] !== 0)
    expect(nonZero.sort()).toEqual(
      [
        [9, 0, 2], // t1, t2 Mon 09
        [14, 1, 1], // t4 Tue 14
        [4, 2, 1], // t3 Wed 04:30 UTC
        [8, 2, 1], // t5 Wed 08
      ].sort(),
    )
    expect(r.value).toBe(5)
    expect(r.note).toContain('UTC')
  })

  it('histogram: bands each currency with its own exponent', async () => {
    await seedPayments()
    const e = engine()
    const r = await e.run('payments.charge_amount_histogram', A, MARCH)
    expect(r.currencies).toEqual(['JPY', 'KWD', 'USD'])
    const ys = (c: string) => r.series.find((s) => s.currency === c)!.points.map((p) => p.y)
    expect(r.series[0]!.points.map((p) => p.x)).toEqual(bandLabels([10, 50, 100, 500, 1000, 5000]))
    expect(ys('USD')).toEqual([1, 1, 0, 0, 1, 0, 0]) // 9.99, 15.00, 600.00; the failed charge is out
    expect(ys('JPY')).toEqual([0, 1, 0, 0, 0, 0, 0]) // ¥20
    expect(ys('KWD')).toEqual([0, 1, 0, 0, 0, 0, 0]) // 20.000 KWD
    expect(r.value).toBe(5)
    const usd = await e.run('payments.charge_amount_histogram', A, { ...MARCH, currency: 'USD' })
    expect(usd.series.map((s) => s.currency)).toEqual(['USD'])
    expect(usd.currencies).toEqual(['JPY', 'KWD', 'USD'])
    expect(usd.value).toBe(3)
  })

  it('composition: signed components and a net, per currency', async () => {
    await resources.upsertMany('ecommerce', 'shopify', shopA, 'orders', [
      {
        id: 'o-usd',
        createdAt: '2026-03-02T00:00:00Z',
        subtotalPrice: { amount: 1000, currency: 'USD' },
        totalShipping: { amount: 200, currency: 'USD' },
        totalTax: { amount: 100, currency: 'USD' },
      },
      {
        id: 'o-eur',
        createdAt: '2026-03-02T00:00:00Z',
        subtotalPrice: { amount: 500, currency: 'EUR' },
        totalShipping: { amount: 0, currency: 'EUR' },
        totalTax: { amount: 50, currency: 'EUR' },
      },
    ] as Row[])
    const r = await engine().run('ecommerce.revenue_composition', A, {
      from: '2026-03-01',
      to: '2026-03-03',
    })
    // a1 / a2 have no subtotal etc.: they add no currency group
    expect(r.currencies).toEqual(['EUR', 'USD'])
    expect(r.series).toEqual([
      {
        name: 'EUR',
        currency: 'EUR',
        points: [
          { x: 'Subtotal', y: 5 },
          { x: 'Shipping', y: 0 },
          { x: 'Tax', y: 0.5 },
          { x: 'Net', y: 5.5 },
        ],
      },
      {
        name: 'USD',
        currency: 'USD',
        points: [
          { x: 'Subtotal', y: 10 },
          { x: 'Shipping', y: 2 },
          { x: 'Tax', y: 1 },
          { x: 'Net', y: 13 },
        ],
      },
    ])
    expect(r.totals).toEqual([
      { currency: 'EUR', amount: 5.5, amountMinor: 550 },
      { currency: 'USD', amount: 13, amountMinor: 1300 },
    ])
  })

  it('uses a definition default granularity unless the request names one', async () => {
    await seedSupport()
    const e = engine()
    const def = await e.run('customer-support.test_monthly', A, MARCH)
    expect(def.metric.defaultGranularity).toBe('month')
    expect(def.granularity).toBe('month') // omitted → the definition's
    expect(def.series[0]!.points).toEqual([{ x: '2026-03', y: 5 }])
    const auto = await e.run('customer-support.test_monthly', A, { ...MARCH, granularity: 'auto' })
    expect(auto.granularity).toBe('month') // auto → the definition's
    const day = await e.run('customer-support.test_monthly', A, { ...MARCH, granularity: 'day' })
    expect(day.granularity).toBe('day') // an explicit request wins
    expect(day.series[0]!.points).toHaveLength(18)
    // No default: auto still follows the range.
    const plain = await e.run('customer-support.tickets_created_per_day', A, MARCH)
    expect(plain.granularity).toBe('day')
    expect(plain.metric.defaultGranularity).toBeUndefined()
  })

  it('ccc: DSO − DPO per currency, inventory excluded', async () => {
    await seedAccounting()
    const e = engine()
    const r = await e.run('accounting.cash_conversion_cycle', A)
    expect(r.metric).toMatchObject({ kind: 'ccc', unit: 'days', money: true, snapshot: true })
    expect(r.metric.charts).toEqual(['number', 'gauge', 'table'])
    expect(r.range).toEqual({ from: '2025-12-19', to: '2026-03-18' })
    // USD: DSO 130000 / 191000 × 90 = 61.26; DPO 60000 / 90000 × 90 = 60
    expect(kpi(r, 'dso', 'USD')).toBe(61.3)
    expect(kpi(r, 'dpo', 'USD')).toBe(60)
    expect(kpi(r, 'ccc', 'USD')).toBe(1.3)
    // EUR has receivables but no payables: no cycle, not a made-up one.
    expect(kpi(r, 'dso', 'EUR')).toBe(90)
    expect(kpi(r, 'dpo', 'EUR')).toBeNull()
    expect(kpi(r, 'ccc', 'EUR')).toBeNull()
    expect(r.value).toBeNull() // several currencies
    expect(r.note).toContain('Inventory')
    expect((await e.run('accounting.cash_conversion_cycle', A, { currency: 'USD' })).value).toBe(
      1.3,
    )
    const masked = await e.run('accounting.cash_conversion_cycle', {
      tenants: ['tenant-a'],
      maskFinancial: true,
    })
    expect(masked).toMatchObject({ masked: true, value: null, series: [] })
  })

  it('dso / dpo: balance ÷ trailing-window sales × days, per currency', async () => {
    await seedAccounting()
    const e = engine()
    const dso = await e.run('accounting.dso', A)
    expect(dso.range).toEqual({ from: '2025-12-19', to: '2026-03-18' })
    expect(dso.currencies).toEqual(['EUR', 'JPY', 'USD'])
    // USD: open 130000 ÷ issued in window 191000 × 90
    expect(kpi(dso, 'dso', 'USD')).toBe(61.3)
    expect(kpi(dso, 'dso', 'EUR')).toBe(90)
    expect(kpi(dso, 'dso', 'JPY')).toBe(0)
    expect(kpi(dso, 'balance', 'USD')).toBe(1300)
    expect(kpi(dso, 'sales', 'USD')).toBe(1910)
    expect(dso.value).toBeNull()
    expect((await e.run('accounting.dso', A, { currency: 'USD' })).value).toBe(61.3)
    const dpo = await e.run('accounting.dpo', A)
    expect(dpo.value).toBe(60) // 60000 ÷ 90000 × 90
    expect(dpo.metric.unit).toBe('days')
  })

  it('says so in `note` when a duration is computed from a sample', async () => {
    await seedSupport()
    // Five resolution times; a cap of 2 keeps every 3rd row by pk (t1, t4).
    const r = await engine({ valuesCap: 2 }).run('customer-support.test_resolution', A, MARCH)
    expect(r.note).toBe('Based on a systematic sample of 2 of 5 records (cap 2).')
    expect(r.stats![0]).toMatchObject({ n: 2, min: 1, max: 4 })
    const full = await engine().run('customer-support.test_resolution', A, MARCH)
    expect(full.note).toBeUndefined()
  })

  it('withholds previous, coverage, kpis and stats of a masked metric under compare=1', async () => {
    await seedAccounting()
    const masked = { tenants: ['tenant-a'], maskFinancial: true }
    for (const id of ['accounting.test_masked_days_to_pay', 'accounting.test_avg_open']) {
      const r = await engine().run(id, masked, { ...MARCH, compare: true })
      expect(r.masked, id).toBe(true)
      expect(r.metric.comparable, id).toBe(true)
      for (const k of ['previous', 'coverage', 'kpis', 'stats', 'table', 'matrix'] as const) {
        expect(r[k], `${id} ${k}`).toBeUndefined()
      }
      // Unmasked, the same request does return them.
      const open = await engine().run(id, A, { ...MARCH, compare: true })
      expect(open.previous, id).toBeDefined()
      expect(open.coverage, id).toBeDefined()
    }
  })

  it('masks every metric reading a financial field, including ratio, concentration and histogram', async () => {
    await seedAccounting()
    await seedPayments()
    const e = engine()
    const masked = { tenants: ['tenant-a'], maskFinancial: true }
    for (const id of [
      'accounting.outstanding_amount',
      'accounting.dso',
      'accounting.dpo',
      'accounting.customer_concentration',
      'accounting.test_overdue_pct',
      'accounting.test_open_by_customer',
      'accounting.ar_aging',
      'payments.charge_amount_histogram',
      // a count, but filtered on a financial field
      `accounting.test_filter_${FILTER_CASES.findIndex(([f]) => f.field === 'balanceAmount')}`,
    ]) {
      const r = await e.run(id, masked, MARCH)
      expect(r.masked, id).toBe(true)
      expect(r.value, id).toBeNull()
      expect(r.series, id).toEqual([])
      expect(r.kpis, id).toBeUndefined()
      expect(r.table, id).toBeUndefined()
      expect(r.totals ?? [], id).toEqual([])
    }
    // Counts and dates only: still visible.
    const onTime = await e.run('accounting.on_time_payment_rate', masked, MARCH)
    expect(onTime).toMatchObject({ masked: false, value: 50 })
    expect((await e.run('accounting.invoices_by_status', masked, MARCH)).masked).toBe(false)
    expect((await e.run('customer-support.volume_heatmap', masked, MARCH)).masked).toBe(false)
  })
})

describe('parseRange', () => {
  const now = new Date('2026-03-31T15:00:00Z')
  it('defaults to the 30 days ending today', () => {
    const r = parseRange(undefined, undefined, now)
    expect(r).toMatchObject({ from: '2026-03-02', to: '2026-03-31' })
    expect(r.days).toHaveLength(30)
  })
  it('allows 366 days and refuses more', () => {
    expect(parseRange('2025-03-31', '2026-03-31', now).days).toHaveLength(366)
    expect(() => parseRange('2025-03-30', '2026-03-31', now)).toThrow(/at most 366/)
  })
  it('refuses impossible dates', () => {
    expect(() => parseRange('2026-02-30', undefined, now)).toThrow(/real date/)
  })
})

describe('granularity and ISO weeks', () => {
  const now = new Date('2026-03-31T00:00:00Z')
  it('resolves auto by range length: ≤ 62 day, ≤ 182 week, else month', () => {
    expect(resolveGranularity('auto', parseRange('2026-01-29', '2026-03-31', now))).toBe('day') // 62
    expect(resolveGranularity(undefined, parseRange('2026-01-28', '2026-03-31', now))).toBe('week') // 63
    expect(resolveGranularity('auto', parseRange('2025-10-01', '2026-03-31', now))).toBe('week') // 182
    expect(resolveGranularity('auto', parseRange('2025-09-30', '2026-03-31', now))).toBe('month') // 183
    expect(resolveGranularity('day', parseRange('2025-09-30', '2026-03-31', now))).toBe('day')
  })
  it('names ISO weeks across year boundaries', () => {
    expect(isoWeek('2026-01-01')).toBe('2026-W01') // Thursday
    expect(isoWeek('2025-12-29')).toBe('2026-W01') // Monday of the same week
    expect(isoWeek('2027-01-01')).toBe('2026-W53') // Friday
    expect(isoWeek('2026-03-02')).toBe('2026-W10')
  })
})

describe('stats', () => {
  it('interpolates percentiles between closest ranks (R-7)', () => {
    const xs = [1, 2, 3, 4, 10]
    expect(percentile(xs, 0)).toBe(1)
    expect(percentile(xs, 0.25)).toBe(2)
    expect(percentile(xs, 0.5)).toBe(3)
    expect(percentile(xs, 0.9)).toBeCloseTo(7.6)
    expect(percentile(xs, 1)).toBe(10)
    expect(percentile([5], 0.9)).toBe(5)
    expect(percentile([1, 2], 0.5)).toBe(1.5)
    expect(summarize('g', [4, 1, 3, 2])).toEqual({
      group: 'g',
      n: 4,
      min: 1,
      p25: 1.75,
      p50: 2.5,
      p75: 3.25,
      p90: 3.7,
      max: 4,
      mean: 2.5,
    })
  })
  it('computes concentration: top shares, HHI and effective N', () => {
    const c = concentration(
      new Map([
        ['a', 50],
        ['b', 30],
        ['c', 20],
        ['z', 0],
      ]),
      [1, 2],
    )
    expect(c.topShares).toEqual([
      { k: 1, share: 50 },
      { k: 2, share: 80 },
    ])
    expect(c.hhi).toBe(3800) // 2500 + 900 + 400
    expect(c.effectiveN).toBe(2.63) // 1 / 0.38
    expect(c.groups).toBe(3)
    expect(c.ranked.map((r) => r.cumulative)).toEqual([50, 80, 100])
    expect(concentration(new Map(), [1])).toMatchObject({ hhi: null, effectiveN: null, groups: 0 })
  })
})

/**
 * Shaping a result must stay linear in the rows the store returns: 60 000
 * groups once blocked the event loop for seconds (arrays rebuilt per row),
 * and every key — not just the shown top-N — was sent for a label lookup.
 * The store is stubbed so only the TypeScript side is timed.
 */
describe('large results stay linear', () => {
  const N = 60_000
  /** Generous: the linear code takes well under 100 ms here. */
  const BOUND_MS = 1_500

  function stub(rows: unknown[], values: unknown[][] = []) {
    const lookups: string[][] = []
    const store = {
      aggregateV2: async () => rows,
      fetchValues: async () => ({ rows: values, total: values.length, sampled: false }),
      lookupLabels: async (o: { keys: string[] }) => {
        lookups.push([...o.keys])
        return new Map<string, string>()
      },
    }
    return { store, lookups }
  }

  function ctx(def: object, store: object): KindContext {
    return {
      store: store as never,
      def: {
        title: 't',
        description: 'd',
        vertical: 'customer-support',
        resourceType: 'tickets',
        section: 'workload',
        dateField: 'createdAt',
        ...def,
      } as ResourceMetricDefinition,
      connIds: ['c'],
      lookupConnIds: () => ['c'],
      range: rangeOf('2026-03-01', '2026-03-01', NOW),
      granularity: 'day',
      currency: null,
      now: NOW,
      today: '2026-03-18',
    }
  }
  const lookup = { resourceType: 'tags', key: 'id' as const, label: 'name' }
  const timed = async (fn: () => Promise<unknown>) => {
    const t = performance.now()
    await fn()
    return performance.now() - t
  }

  it('breakdown: 60k money groups in one currency, labels only the shown keys', async () => {
    const rows = Array.from({ length: N }, (_, i) => ({
      keys: [`g${i}`, 'USD'],
      count: 1,
      sum: i + 1,
      valueCount: 1,
      avg: i + 1,
    }))
    const { store, lookups } = stub(rows)
    const def = {
      id: 'customer-support.perf',
      kind: 'breakdown',
      measure: { op: 'sum', field: 'x', currencyField: 'currency' },
      group: { field: 'g', lookup },
    }
    expect(await timed(() => runKind(ctx(def, store)))).toBeLessThan(BOUND_MS)
    expect(lookups).toHaveLength(1)
    expect(lookups[0]!.length).toBeLessThanOrEqual(12)
  })

  it('timeseries: 60k split values in one currency, labels only the shown splits', async () => {
    const rows = Array.from({ length: N }, (_, i) => ({
      keys: ['2026-03-01', `s${i}`, 'USD'],
      count: 1,
      sum: i + 1,
      valueCount: 1,
      avg: i + 1,
    }))
    const { store, lookups } = stub(rows)
    const def = {
      id: 'customer-support.perf',
      kind: 'timeseries',
      measure: { op: 'sum', field: 'x', currencyField: 'currency' },
      splitBy: { field: 's', lookup },
    }
    expect(await timed(() => runKind(ctx(def, store)))).toBeLessThan(BOUND_MS)
    expect(lookups).toHaveLength(1)
    expect(lookups[0]!.length).toBeLessThanOrEqual(8)
  })

  it('duration: 60k values in one group, 60k distinct groups labelled top-N only', async () => {
    const one = Array.from({ length: N }, () => [
      '2026-03-01T00:00:00Z',
      '2026-03-02T00:00:00Z',
      'g',
    ])
    const def = {
      id: 'customer-support.perf',
      kind: 'duration',
      from: 'createdAt',
      to: 'resolvedAt',
      unit: 'days',
      buckets: [1],
      group: { field: 'g', lookup },
    }
    expect(await timed(() => runKind(ctx(def, stub([], one).store)))).toBeLessThan(BOUND_MS)
    const many = one.map((r, i) => [r[0], r[1], `g${i}`])
    const s = stub([], many)
    expect(await timed(() => runKind(ctx(def, s.store)))).toBeLessThan(BOUND_MS)
    expect(s.lookups).toHaveLength(1)
    expect(s.lookups[0]!.length).toBeLessThanOrEqual(12)
  })
})
