/**
 * The metric catalog may not read personal or secret fields: every dashboard
 * viewer sees a metric's output, and `dashboards:view` implies no PII
 * permission. `assertCatalogValid` enforces this at boot; this pins it in CI
 * and proves the check bites in EVERY slot a definition can name a field —
 * filters, comparisons, groups, lookup labels, measures, duration endpoints,
 * aging / histogram fields, coverage, ratio parts, composition components and
 * DSO inputs — plus the structural rules and the chart lists per kind.
 */
import { describe, it, expect } from 'vitest'
import { CHART_TYPES, METRIC_SECTIONS } from '@opensteward/shared'
import {
  RESOURCE_METRICS,
  SYSTEM_METRICS,
  defaultCharts,
  resourceMetricInfo,
  systemMetricInfo,
} from '../../src/data-access/metrics/catalog'
import { catalogProblems } from '../../src/data-access/metrics/validate'
import { isFinancial } from '../../src/data-access/metrics/engine'
import type { ResourceMetricDefinition } from '../../src/data-access/metrics/types'

/** A valid crm/contacts breakdown the cases below break one slot at a time. */
const base: ResourceMetricDefinition = {
  id: 'crm.test_metric',
  title: 't',
  description: 'd',
  vertical: 'crm',
  resourceType: 'contacts',
  section: 'customers',
  kind: 'breakdown',
  measure: { op: 'count' },
  group: { field: 'title' },
  dateField: 'created_at',
}

function messages(def: ResourceMetricDefinition): string[] {
  return catalogProblems([def]).map((p) => p.message)
}

describe('metric catalog', () => {
  it('reads no pii or secret field, and only fields the schemas have', () => {
    expect(catalogProblems(RESOURCE_METRICS)).toEqual([])
  })

  it('has unique ids across resource and system metrics', () => {
    const ids = [...RESOURCE_METRICS.map((m) => m.id), ...SYSTEM_METRICS.map((m) => m.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('covers the verticals the built-in dashboards chart', () => {
    const verticals = new Set(RESOURCE_METRICS.map((m) => m.vertical))
    for (const v of ['ecommerce', 'accounting', 'crm', 'customer-support', 'payments']) {
      expect(verticals.has(v)).toBe(true)
    }
  })

  it('keeps the ids of the fifteen v1 metrics', () => {
    const ids = new Set([...RESOURCE_METRICS, ...SYSTEM_METRICS].map((m) => m.id))
    for (const id of [
      'ecommerce.orders_total',
      'ecommerce.orders_per_day',
      'ecommerce.revenue_per_day',
      'ecommerce.orders_by_financial_status',
      'accounting.invoices_issued_per_day',
      'accounting.outstanding_amount',
      'accounting.invoices_by_status',
      'crm.contacts_created_per_day',
      'crm.deals_by_stage',
      'crm.deals_created_per_day',
      'customer-support.tickets_by_status',
      'customer-support.tickets_created_per_day',
      'system.records_per_vertical',
      'system.sync_outcomes_per_day',
      'system.data_freshness',
    ]) {
      expect(ids.has(id), id).toBe(true)
    }
  })

  it('has an exemplar of every kind', () => {
    const kinds = new Set(RESOURCE_METRICS.map((m) => m.kind))
    for (const k of [
      'value',
      'timeseries',
      'breakdown',
      'ratio',
      'duration',
      'aging',
      'concentration',
      'matrix',
      'histogram',
      'composition',
      'dso',
      'dpo',
    ]) {
      expect(kinds.has(k as never), k).toBe(true)
    }
  })

  it('describes every metric with a unit, a section and charts from the shared list', () => {
    const charts = new Set<string>(CHART_TYPES)
    for (const def of RESOURCE_METRICS) {
      const info = resourceMetricInfo(def)
      expect(METRIC_SECTIONS).toContain(info.section)
      expect(info.charts.length).toBeGreaterThan(0)
      for (const c of info.charts) expect(charts.has(c), `${def.id} → ${c}`).toBe(true)
      // Never stack across currencies: stacked only for a splitBy.
      if (info.charts.some((c) => c.startsWith('stacked_'))) {
        expect(def.kind === 'timeseries' && !!def.splitBy, def.id).toBe(true)
      }
    }
    const info = (id: string) => resourceMetricInfo(RESOURCE_METRICS.find((d) => d.id === id)!)
    expect(info('ecommerce.revenue_per_day')).toMatchObject({
      unit: 'money',
      money: true,
      currencyAware: true,
      granular: true,
      comparable: true,
    })
    expect(info('ecommerce.orders_total')).toMatchObject({
      unit: 'count',
      money: false,
      currencyAware: true,
    })
    expect(info('customer-support.tickets_by_status')).toMatchObject({
      money: false,
      currencyAware: false,
    })
    expect(info('accounting.outstanding_amount')).toMatchObject({
      snapshot: true,
      comparable: false,
    })
    expect(info('accounting.dso')).toMatchObject({ unit: 'days', money: true })
    expect(info('accounting.on_time_payment_rate').unit).toBe('percent')
  })

  it('offers the default charts per kind', () => {
    const d = (over: Partial<ResourceMetricDefinition>) =>
      defaultCharts({ ...base, ...over } as ResourceMetricDefinition)
    expect(d({ kind: 'value', measure: { op: 'count' } } as never)).toEqual(['number', 'table'])
    expect(
      d({ kind: 'value', measure: { op: 'sum', field: 'x', currencyField: 'c' } } as never),
    ).toEqual(['number', 'bar', 'table'])
    expect(d({ kind: 'timeseries', measure: { op: 'count' } } as never)).toEqual([
      'line',
      'area',
      'bar',
      'calendar',
      'table',
      'number',
    ])
    expect(
      d({
        kind: 'timeseries',
        measure: { op: 'sum', field: 'x', currencyField: 'c' },
        splitBy: { field: 'stage' },
      } as never),
    ).toEqual(['line', 'area', 'bar', 'table', 'number', 'stacked_bar', 'stacked_area'])
    expect(d({})).toEqual([
      'bar',
      'hbar',
      'donut',
      'pie',
      'rose',
      'treemap',
      'pareto',
      'table',
      'number',
    ])
    expect(d({ group: { field: 'stage', order: ['a', 'b', 'c'] } } as never)).toEqual([
      'bar',
      'hbar',
      'donut',
      'pie',
      'rose',
      'treemap',
      'pareto',
      'funnel',
      'radar',
      'table',
      'number',
    ])
    expect(d({ kind: 'ratio', overTime: true } as never)).toEqual([
      'gauge',
      'number',
      'line',
      'table',
    ])
    expect(d({ kind: 'ratio' } as never)).toEqual(['gauge', 'number', 'table'])
    expect(d({ kind: 'duration', group: { field: 'x' } } as never)).toContain('boxplot')
    expect(d({ kind: 'duration', group: undefined } as never)).not.toContain('boxplot')
    expect(d({ kind: 'aging' } as never)).toEqual(['bar', 'hbar', 'donut', 'table'])
    expect(d({ kind: 'concentration' } as never)).toEqual([
      'gauge',
      'pareto',
      'treemap',
      'hbar',
      'donut',
      'table',
      'number',
    ])
    expect(d({ kind: 'matrix' } as never)).toEqual(['heatmap', 'table'])
    expect(d({ kind: 'histogram' } as never)).toEqual(['histogram', 'table'])
    expect(d({ kind: 'composition' } as never)).toEqual(['waterfall', 'table'])
    expect(d({ kind: 'dso' } as never)).toEqual(['number', 'gauge', 'table'])
    expect(d({ kind: 'dpo' } as never)).toEqual(['number', 'gauge', 'table'])
    // A definition's own list wins.
    expect(resourceMetricInfo({ ...base, charts: ['table', 'bar'] }).charts).toEqual([
      'table',
      'bar',
    ])
  })

  it('rejects grouping by a pii field', () => {
    expect(messages({ ...base, group: { field: 'email' } })).toEqual([
      expect.stringContaining('classified pii'),
    ])
  })

  it('rejects a path under a pii parent (address.city)', () => {
    expect(messages({ ...base, group: { field: 'address.city' } })[0]).toContain('pii')
  })

  it('rejects the raw upstream payload, which is pii by default', () => {
    expect(messages({ ...base, group: { field: 'metadata.source' } })[0]).toContain('pii')
  })

  // Every slot a field can sit in, each given a pii field: the role must be named.
  const piiSlots: Array<[string, ResourceMetricDefinition]> = [
    ['dateField', { ...base, dateField: 'email' }],
    ['filters[0]', { ...base, filters: [{ field: 'email', op: 'not_null' }] }],
    ['compare[0].left', { ...base, compare: [{ left: 'email', op: 'eq', right: 'title' }] }],
    ['compare[0].right', { ...base, compare: [{ left: 'title', op: 'eq', right: 'phone' }] }],
    ['currencyField', { ...base, currencyField: 'email' }],
    ['coverage[0]', { ...base, coverage: ['email'] }],
    [
      'measure.field',
      { ...base, measure: { op: 'avg', field: 'email' } } as ResourceMetricDefinition,
    ],
    [
      'splitBy.field',
      {
        ...base,
        kind: 'timeseries',
        measure: { op: 'count' },
        splitBy: { field: 'name' },
      } as ResourceMetricDefinition,
    ],
    [
      'x.field',
      {
        ...base,
        kind: 'matrix',
        x: { field: 'email' },
        y: 'weekday',
        measure: { op: 'count' },
      } as ResourceMetricDefinition,
    ],
    [
      'y.field',
      {
        ...base,
        kind: 'matrix',
        x: 'hour',
        y: { field: 'mobile' },
        measure: { op: 'count' },
      } as ResourceMetricDefinition,
    ],
    [
      'from',
      {
        ...base,
        kind: 'duration',
        from: 'email',
        to: 'now',
        unit: 'days',
        buckets: [1],
      } as ResourceMetricDefinition,
    ],
    [
      'to',
      {
        ...base,
        kind: 'duration',
        from: 'created_at',
        to: 'phone',
        unit: 'days',
        buckets: [1],
      } as ResourceMetricDefinition,
    ],
    [
      'field',
      {
        ...base,
        kind: 'aging',
        field: 'email',
        direction: 'past',
        buckets: [0, 30],
        measure: { op: 'count' },
      } as ResourceMetricDefinition,
    ],
    [
      'field',
      { ...base, kind: 'histogram', field: 'phone', edges: [1, 2] } as ResourceMetricDefinition,
    ],
    [
      'numerator.filters[0]',
      {
        ...base,
        kind: 'ratio',
        numerator: { measure: { op: 'count' }, filters: [{ field: 'email', op: 'not_null' }] },
        denominator: { measure: { op: 'count' } },
      } as ResourceMetricDefinition,
    ],
    [
      'denominator.compare[0].left',
      {
        ...base,
        kind: 'ratio',
        numerator: { measure: { op: 'count' } },
        denominator: {
          measure: { op: 'count' },
          compare: [{ left: 'name', op: 'eq', right: 'title' }],
        },
      } as ResourceMetricDefinition,
    ],
    [
      'components[0].measure.field',
      {
        ...base,
        kind: 'composition',
        components: [{ label: 'a', sign: 1, measure: { op: 'sum_quantity', field: 'email' } }],
      } as ResourceMetricDefinition,
    ],
    [
      'components[0].filters[0]',
      {
        ...base,
        kind: 'composition',
        components: [
          {
            label: 'a',
            sign: 1,
            measure: { op: 'count' },
            filters: [{ field: 'address.city', op: 'eq', value: 'x' }],
          },
        ],
      } as ResourceMetricDefinition,
    ],
    [
      'balance.measure.field',
      {
        ...base,
        kind: 'dso',
        snapshot: true,
        balance: { measure: { op: 'sum', field: 'email', currencyField: 'title' } },
        sales: {
          measure: { op: 'sum', field: 'title', currencyField: 'title' },
          dateField: 'created_at',
        },
        windowDays: 90,
      } as ResourceMetricDefinition,
    ],
  ]
  it.each(piiSlots)('rejects a pii field in %s', (role, def) => {
    const found = messages(def)
    expect(
      found.some((m) => m.startsWith(`${role} `) && m.includes('classified pii')),
      found.join('; '),
    ).toBe(true)
  })

  it('checks a lookup label on the lookup resource type', () => {
    const tickets: ResourceMetricDefinition = {
      id: 'customer-support.test',
      title: 't',
      description: 'd',
      vertical: 'customer-support',
      resourceType: 'tickets',
      section: 'workload',
      kind: 'breakdown',
      measure: { op: 'count' },
      dateField: 'createdAt',
      group: {
        field: 'assigneeId',
        lookup: { resourceType: 'users', key: 'id', label: 'name' },
      },
    }
    // users.name is an agent's name: pii.
    expect(messages(tickets)).toEqual([expect.stringContaining('group.lookup.label')])
    expect(messages(tickets)[0]).toContain('classified pii')
    const tags = {
      ...tickets,
      group: {
        field: 'tagIds',
        unnest: true,
        lookup: { resourceType: 'tags', key: 'id', label: 'name' },
      },
    } as ResourceMetricDefinition
    expect(messages(tags)).toEqual([])
    const unsynced = {
      ...tickets,
      group: { field: 'teamId', lookup: { resourceType: 'nope', key: 'id', label: 'name' } },
    } as ResourceMetricDefinition
    expect(messages(unsynced)[0]).toContain('not a listable')
  })

  it('checks a part on another resource type against that type', () => {
    const def = {
      id: 'accounting.test',
      title: 't',
      description: 'd',
      vertical: 'accounting',
      resourceType: 'invoices',
      section: 'risk',
      kind: 'ratio',
      dateField: 'postedAt',
      numerator: {
        resourceType: 'creditmemos',
        measure: { op: 'sum', field: 'notes', currencyField: 'currency' },
      },
      denominator: { measure: { op: 'sum', field: 'totalAmount', currencyField: 'currency' } },
    } as ResourceMetricDefinition
    expect(messages(def)).toEqual([
      expect.stringMatching(/numerator\.measure\.field 'notes' is classified pii/),
    ])
  })

  it('rejects unknown fields, unsynced types and malformed paths', () => {
    expect(messages({ ...base, group: { field: 'nope' } })[0]).toContain('not a field')
    expect(messages({ ...base, resourceType: 'unicorns' })[0]).toContain('not a listable')
    expect(messages({ ...base, group: { field: "x'--" } })[0]).toContain('plain dotted path')
    expect(messages({ ...base, filters: [{ field: 'a..b', op: 'is_null' }] })[0]).toContain(
      'plain dotted path',
    )
  })

  it('rejects definitions the engine cannot run honestly', () => {
    const bad = (over: object, needle: string) => {
      const found = messages({ ...base, ...over } as ResourceMetricDefinition)
      expect(
        found.some((m) => m.includes(needle)),
        `${needle} in ${found.join('; ')}`,
      ).toBe(true)
    }
    bad({ id: 'other.x' }, "must start with 'crm.'")
    bad({ section: 'nope' }, 'unknown section')
    bad({ dateField: undefined }, 'needs `dateField`')
    bad({ measure: { op: 'sum', field: 'title' } }, 'needs `currencyField`')
    bad({ measure: { op: 'sum_quantity' } }, 'needs `field`')
    bad(
      {
        measure: { op: 'sum', field: 'title', currencyField: 'title' },
        group: { field: 'tags', unnest: true },
      },
      'unnest only counts',
    )
    bad({ group: { field: 'title', bands: [5, 1] } }, 'bands must ascend')
    bad({ charts: ['stacked_bar'] }, 'stacked charts need')
    bad({ charts: ['sparkline'] }, 'unknown chart')
    bad({ charts: [] }, 'may not be empty')
    bad({ thresholds: { warn: 50, crit: 20, direction: 'above' } }, 'warn must come before crit')
    bad({ filters: [{ field: 'title', op: 'in', value: [] }] }, 'needs a list')
    bad(
      { filters: [{ field: 'title', op: 'older_than_days', value: 1.5 }] },
      'whole number of days',
    )
    bad({ filters: [{ field: 'title', op: 'before_now', value: 1 }] }, 'takes no value')
    bad({ filters: [{ field: 'title', op: 'like', value: 1 }] }, 'unknown filter op')
    bad({ compare: [{ left: 'title', op: 'like', right: 'title' }] }, 'unknown comparison')
    bad({ top: 0 }, 'positive whole number')
    bad({ kind: 'timeseries', snapshot: true }, 'cannot be a snapshot')
    bad(
      {
        kind: 'ratio',
        numerator: { measure: { op: 'count' } },
        denominator: { measure: { op: 'sum', field: 'title', currencyField: 'title' } },
      },
      'never a mix',
    )
    bad(
      {
        kind: 'aging',
        field: 'created_at',
        direction: 'past',
        buckets: [30, 0],
        measure: { op: 'count' },
      },
      'ascending whole days',
    )
    bad({ kind: 'histogram', field: 'title', edges: [] }, 'edges must ascend')
    bad(
      { kind: 'duration', from: 'created_at', to: 'now', unit: 'weeks', buckets: [1] },
      'unknown duration unit',
    )
    bad(
      {
        kind: 'composition',
        components: [
          { label: 'a', sign: 1, measure: { op: 'count' } },
          { label: 'b', sign: 1, measure: { op: 'sum', field: 'title', currencyField: 'title' } },
        ],
      },
      'all money or all counts',
    )
    bad(
      { kind: 'composition', components: [{ label: 'a', sign: 2, measure: { op: 'count' } }] },
      'sign is 1 or -1',
    )
    bad(
      {
        kind: 'dso',
        snapshot: true,
        balance: { measure: { op: 'count' } },
        sales: { measure: { op: 'count' } },
        windowDays: 0,
      },
      'windowDays must be',
    )
    bad(
      { kind: 'matrix', x: 'minute', y: 'weekday', measure: { op: 'count' } },
      'unknown matrix axis',
    )
    bad({ kind: 'value', measure: { op: 'count' }, granularity: 'month' }, '`granularity`')
    bad({ kind: 'timeseries', measure: { op: 'count' }, granularity: 'year' }, '`granularity`')
    const part = { measure: { op: 'count' } }
    bad(
      {
        kind: 'ccc',
        snapshot: true,
        dso: { balance: part, sales: part },
        dpo: { balance: part, sales: part },
        windowDays: 0,
      },
      'windowDays must be',
    )
    bad(
      {
        kind: 'ccc',
        snapshot: true,
        dso: { balance: part, sales: part },
        dpo: { balance: part, sales: part },
        windowDays: 90,
      },
      'dso.balance is a money sum',
    )
  })

  it('accepts a default granularity on a series over time', () => {
    const series = {
      ...base,
      kind: 'timeseries',
      measure: { op: 'count' },
      granularity: 'week',
    } as ResourceMetricDefinition
    expect(messages(series)).toEqual([])
    expect(resourceMetricInfo(series).defaultGranularity).toBe('week')
  })

  it('still allows every chart a v1 widget of a migrated metric could store', () => {
    // v1 kinds and their chart lists (catalog.ts before engine v2).
    const V1: Record<string, string[]> = {
      count: ['number'],
      count_by_day: ['line', 'bar', 'number', 'table'],
      sum_by_day: ['line', 'bar', 'number', 'table'],
      sum: ['number', 'bar', 'table'],
      group_count: ['bar', 'pie', 'table', 'number'],
      table: ['table'],
    }
    const MIGRATED: Record<string, keyof typeof V1> = {
      'ecommerce.orders_total': 'count',
      'ecommerce.orders_per_day': 'count_by_day',
      'ecommerce.revenue_per_day': 'sum_by_day',
      'ecommerce.orders_by_financial_status': 'group_count',
      'accounting.invoices_issued_per_day': 'count_by_day',
      'accounting.outstanding_amount': 'sum',
      'accounting.invoices_by_status': 'group_count',
      'crm.contacts_created_per_day': 'count_by_day',
      'crm.deals_by_stage': 'group_count',
      'crm.deals_created_per_day': 'count_by_day',
      'customer-support.tickets_by_status': 'group_count',
      'customer-support.tickets_created_per_day': 'count_by_day',
      'system.records_per_vertical': 'group_count',
      'system.sync_outcomes_per_day': 'count_by_day',
      'system.data_freshness': 'table',
    }
    for (const [id, kind] of Object.entries(MIGRATED)) {
      const resource = RESOURCE_METRICS.find((d) => d.id === id)
      const system = SYSTEM_METRICS.find((d) => d.id === id)
      const charts = resource
        ? resourceMetricInfo(resource).charts
        : systemMetricInfo(system!).charts
      for (const chart of V1[kind]!) {
        expect(charts, `${id} (v1 ${kind}) → ${chart}`).toContain(chart)
      }
    }
  })

  it('rejects duplicate ids', () => {
    expect(catalogProblems([base, base]).map((p) => p.message)).toContain('duplicate metric id')
  })

  it('treats every financial field a metric reads as financial, but not currency codes', () => {
    const byId = (id: string) => RESOURCE_METRICS.find((d) => d.id === id)!
    expect(isFinancial(byId('ecommerce.revenue_per_day'))).toBe(true)
    expect(isFinancial(byId('accounting.outstanding_amount'))).toBe(true)
    expect(isFinancial(byId('accounting.invoices_by_status'))).toBe(false)
    expect(isFinancial(byId('accounting.on_time_payment_rate'))).toBe(false)
    expect(isFinancial(byId('accounting.dso'))).toBe(true)
    expect(isFinancial(byId('accounting.customer_concentration'))).toBe(true)
    expect(isFinancial(byId('payments.charge_amount_histogram'))).toBe(true)
    // totalPrice.currency is financial only by inheritance; a count on it is not masked
    expect(isFinancial(byId('ecommerce.orders_total'))).toBe(false)
    // a filter on a financial field makes a count financial
    expect(
      isFinancial({
        ...byId('accounting.invoices_by_status'),
        filters: [{ field: 'balanceAmount', op: 'gt', value: 0 }],
      } as ResourceMetricDefinition),
    ).toBe(true)
  })
})

/**
 * Design §2 in the validator: money is never averaged, summed as a quantity,
 * banded, histogrammed or grouped across currencies, and a "currency field"
 * must really hold a currency code — otherwise it would also slip past
 * financial masking, which exempts currency codes.
 */
describe('currency rules (§2)', () => {
  const inv: ResourceMetricDefinition = {
    id: 'accounting.test_money',
    title: 't',
    description: 'd',
    vertical: 'accounting',
    resourceType: 'invoices',
    section: 'receivables',
    kind: 'value',
    measure: { op: 'count' },
    dateField: 'postedAt',
  }
  const with_ = (over: object) => ({ ...inv, ...over }) as ResourceMetricDefinition
  const rejects = (over: object, needle: string) => {
    const found = messages(with_(over))
    expect(
      found.some((m) => m.includes(needle)),
      `${needle} in [${found.join('; ')}]`,
    ).toBe(true)
  }
  const accepts = (over: object) => expect(messages(with_(over))).toEqual([])

  it('rejects an average of a financial field without a currencyField', () => {
    rejects({ measure: { op: 'avg', field: 'totalAmount' } }, 'needs `currencyField`')
    accepts({ measure: { op: 'avg', field: 'totalAmount', currencyField: 'currency' } })
  })

  it('rejects sum_quantity of a money field', () => {
    rejects({ measure: { op: 'sum_quantity', field: 'totalAmount' } }, 'sum_quantity')
  })

  it('rejects bands over an amount', () => {
    rejects(
      { kind: 'breakdown', group: { field: 'balanceAmount', bands: [100, 1000] } },
      'bands over a financial field',
    )
  })

  it('rejects grouping by a raw amount, but not by a currency code', () => {
    rejects({ kind: 'breakdown', group: { field: 'totalAmount' } }, 'grouping by a financial field')
    accepts({ kind: 'breakdown', group: { field: 'currency' } })
  })

  it('rejects a histogram of amounts without a currencyField', () => {
    rejects({ kind: 'histogram', field: 'totalAmount', edges: [1, 2] }, 'needs `currencyField`')
    accepts({ kind: 'histogram', field: 'totalAmount', edges: [1, 2], currencyField: 'currency' })
  })

  it('rejects a concentration over sum_quantity of a financial field', () => {
    rejects(
      {
        kind: 'concentration',
        group: { field: 'contactId' },
        measure: { op: 'sum_quantity', field: 'totalAmount' },
      },
      'sum_quantity',
    )
  })

  it('requires every currencyField to be a currency-code field', () => {
    // an amount disguised as a currency
    rejects({ currencyField: 'balanceAmount' }, "currencyField 'balanceAmount' is not a currency")
    rejects(
      { measure: { op: 'sum', field: 'totalAmount', currencyField: 'balanceAmount' } },
      "measure.currencyField 'balanceAmount' is not a currency",
    )
    rejects(
      { kind: 'histogram', field: 'totalAmount', edges: [1], currencyField: 'reference' },
      "currencyField 'reference' is not a currency",
    )
    // ISO 4217 by schema type, nested or top-level
    accepts({ currencyField: 'currency' })
    expect(
      messages({
        ...inv,
        id: 'ecommerce.test_money',
        vertical: 'ecommerce',
        resourceType: 'orders',
        section: 'sales',
        dateField: 'createdAt',
        measure: { op: 'sum', field: 'totalPrice.amount', currencyField: 'totalPrice.currency' },
      } as ResourceMetricDefinition),
    ).toEqual([])
    // a plain string whose name says it is a currency code
    expect(
      messages({
        ...inv,
        id: 'inventory.test_money',
        vertical: 'inventory',
        resourceType: 'suppliers',
        section: 'purchasing',
        snapshot: true,
        dateField: undefined,
        currencyField: 'defaultCurrency',
      } as ResourceMetricDefinition),
    ).toEqual([])
  })

  it('masks a metric whose "currency field" is not a currency code', () => {
    // Exempt from masking only when the field is a verified currency code.
    expect(isFinancial(with_({ currencyField: 'currency' }))).toBe(false)
    expect(isFinancial(with_({ currencyField: 'balanceAmount' }))).toBe(true)
  })

  it('needs a currencyField on a count part that reads another resource type', () => {
    const ratio = (numerator: object) =>
      with_({
        kind: 'ratio',
        currencyField: 'currency',
        numerator,
        denominator: { measure: { op: 'count' } },
      })
    const other = { measure: { op: 'count' }, resourceType: 'creditmemos' }
    expect(messages(ratio(other)).some((m) => m.includes('numerator'))).toBe(true)
    expect(messages(ratio({ ...other, currencyField: 'currency' }))).toEqual([])
    expect(messages(ratio({ ...other, currencyField: 'notes' })).join(';')).toContain(
      'is not a currency',
    )
    // same resource type: the metric's own currencyField applies
    expect(messages(ratio({ measure: { op: 'count' } }))).toEqual([])
    const composition = with_({
      kind: 'composition',
      currencyField: 'currency',
      components: [
        { label: 'a', sign: 1, measure: { op: 'count' } },
        { label: 'b', sign: -1, measure: { op: 'count' }, resourceType: 'creditmemos' },
      ],
    })
    expect(messages(composition).some((m) => m.startsWith('components[1]'))).toBe(true)
  })

  it('passes every current catalog', () => {
    expect(catalogProblems(RESOURCE_METRICS)).toEqual([])
  })
})
