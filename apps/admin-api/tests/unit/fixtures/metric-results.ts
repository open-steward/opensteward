/**
 * One integration-server metric result per kind (and per currency shape),
 * built the way `data-access/metrics/kinds.ts` shapes them: money split per
 * currency, an unknown currency as null, null points, stats with `All`
 * first, a composition's `Net` last, a concentration's cumulative share.
 *
 * Typed against the engine's own `MetricResult`, so a field the engine adds
 * or renames breaks this file's types — and the round-trip test in
 * `dashboards-routes.test.ts` fails if admin-api's zod mirror would strip or
 * refuse any of it.
 */
import type {
  MetricInfo,
  MetricResult,
} from '../../../../integration-server/src/data-access/metrics/types'

export function metricInfo(
  over: Partial<MetricInfo> & Pick<MetricInfo, 'id' | 'kind'>,
): MetricInfo {
  return {
    title: over.id,
    description: `About ${over.id}.`,
    unit: 'count',
    section: 'overview',
    vertical: 'accounting',
    resourceType: 'invoices',
    charts: ['table'],
    money: false,
    currencyAware: false,
    snapshot: false,
    granular: false,
    comparable: false,
    ...over,
  }
}

const RANGE = { from: '2026-03-01', to: '2026-03-30' }
const PREV = { from: '2026-01-30', to: '2026-02-28' }

function result(metric: MetricInfo, extra: Partial<MetricResult>): MetricResult {
  return {
    metric,
    range: RANGE,
    granularity: null,
    currency: null,
    currencies: [],
    value: null,
    series: [],
    masked: false,
    generatedAt: '2026-03-30T10:00:00.000Z',
    ...extra,
  }
}

const money = { unit: 'money' as const, money: true, currencyAware: true }

export const RESULTS: Record<string, MetricResult> = {
  value_money_multi_currency: result(
    metricInfo({
      id: 'accounting.revenue',
      kind: 'value',
      ...money,
      comparable: true,
      charts: ['number', 'table'],
    }),
    {
      currencies: ['EUR', 'USD'],
      totals: [
        { currency: 'EUR', amount: 200, amountMinor: 20000 },
        { currency: 'USD', amount: 1300.5, amountMinor: 130050 },
        { currency: null, amount: 5, amountMinor: 500 },
      ],
      series: [
        { name: 'EUR', currency: 'EUR', points: [{ x: 'EUR', y: 200 }] },
        { name: 'USD', currency: 'USD', points: [{ x: 'USD', y: 1300.5 }] },
        { name: 'Unknown currency', currency: null, points: [{ x: 'Unknown currency', y: 5 }] },
      ],
      kpis: [
        { key: 'records', label: 'Records', value: 1, unit: 'count', currency: 'EUR' },
        { key: 'records', label: 'Records', value: 3, unit: 'count', currency: 'USD' },
        { key: 'records', label: 'Records', value: 1, unit: 'count', currency: null },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'amount', label: 'Revenue' },
          { key: 'records', label: 'Records' },
        ],
        rows: [
          { currency: 'EUR', amount: 200, records: 1 },
          { currency: 'USD', amount: 1300.5, records: 3 },
          { currency: 'Unknown currency', amount: 5, records: 1 },
        ],
      },
      previous: {
        value: null,
        totals: [{ currency: 'USD', amount: 900, amountMinor: 90000 }],
        range: PREV,
      },
    },
  ),
  value_count_compared: result(
    metricInfo({
      id: 'accounting.invoice_count',
      kind: 'value',
      comparable: true,
      charts: ['number', 'table'],
    }),
    {
      value: 42,
      table: { columns: [{ key: 'value', label: 'Invoices' }], rows: [{ value: 42 }] },
      previous: { value: 40, range: PREV },
    },
  ),
  timeseries_money_split_weekly: result(
    metricInfo({
      id: 'accounting.revenue_per_week',
      kind: 'timeseries',
      ...money,
      granular: true,
      comparable: true,
      charts: ['line', 'area', 'bar', 'table', 'number', 'stacked_bar', 'stacked_area'],
    }),
    {
      granularity: 'week',
      currency: 'EUR',
      currencies: ['EUR', 'USD'],
      totals: [{ currency: 'EUR', amount: 10.5, amountMinor: 1050 }],
      series: [
        {
          name: 'PAID',
          currency: 'EUR',
          points: [
            { x: '2026-W10', y: 10.5 },
            { x: '2026-W11', y: 0 },
          ],
        },
        {
          name: 'Other',
          currency: 'EUR',
          points: [
            { x: '2026-W10', y: 0 },
            { x: '2026-W11', y: 0 },
          ],
        },
      ],
    },
  ),
  timeseries_average_with_gaps: result(
    metricInfo({
      id: 'accounting.avg_invoice_value_per_month',
      kind: 'timeseries',
      unit: 'index',
      granular: true,
      charts: ['line', 'area', 'bar', 'table', 'number'],
    }),
    {
      granularity: 'month',
      value: 12.25,
      series: [
        {
          name: 'Average',
          points: [
            { x: '2026-02', y: null },
            { x: '2026-03', y: 12.25 },
          ],
        },
      ],
    },
  ),
  breakdown_count: result(
    metricInfo({
      id: 'accounting.invoices_by_status',
      kind: 'breakdown',
      charts: ['bar', 'hbar', 'donut', 'pie', 'rose', 'treemap', 'pareto', 'funnel', 'table'],
      comparable: true,
    }),
    {
      value: 7,
      series: [
        {
          name: 'Records',
          points: [
            { x: 'Paid', y: 4 },
            { x: 'Authorised', y: 2 },
            { x: 'Other', y: 1 },
          ],
        },
      ],
      table: {
        columns: [
          { key: 'label', label: 'Group' },
          { key: 'value', label: 'Invoices by status' },
          { key: 'records', label: 'Records' },
          { key: 'share', label: 'Share %' },
        ],
        rows: [
          { key: 'PAID', label: 'Paid', value: 4, records: 4, share: 57.14 },
          { key: 'AUTHORISED', label: 'Authorised', value: 2, records: 2, share: 28.57 },
          { key: null, label: 'Other', value: 1, records: 1, share: 14.29 },
        ],
      },
    },
  ),
  ratio_money_over_time: result(
    metricInfo({
      id: 'accounting.overdue_pct',
      kind: 'ratio',
      unit: 'percent',
      money: true,
      currencyAware: true,
      granular: true,
      comparable: true,
      charts: ['gauge', 'number', 'line', 'table'],
      thresholds: { warn: 20, crit: 40, direction: 'above' },
    }),
    {
      granularity: 'month',
      currencies: ['EUR', 'USD'],
      thresholds: { warn: 20, crit: 40, direction: 'above' },
      series: [
        {
          name: 'EUR',
          currency: 'EUR',
          points: [
            { x: '2026-02', y: null },
            { x: '2026-03', y: 50 },
          ],
        },
        {
          name: 'USD',
          currency: 'USD',
          points: [
            { x: '2026-02', y: 10 },
            { x: '2026-03', y: 12.5 },
          ],
        },
      ],
      kpis: [
        { key: 'ratio', label: 'Overdue %', value: 50, unit: 'percent', currency: 'EUR' },
        { key: 'numerator', label: 'Numerator', value: 100, unit: 'money', currency: 'EUR' },
        { key: 'denominator', label: 'Denominator', value: 200, unit: 'money', currency: 'EUR' },
        { key: 'ratio', label: 'Overdue %', value: 12.5, unit: 'percent', currency: 'USD' },
        { key: 'numerator', label: 'Numerator', value: 25, unit: 'money', currency: 'USD' },
        { key: 'denominator', label: 'Denominator', value: 200, unit: 'money', currency: 'USD' },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'numerator', label: 'Numerator' },
          { key: 'denominator', label: 'Denominator' },
          { key: 'ratio', label: 'Overdue % %' },
        ],
        rows: [
          { currency: 'EUR', numerator: 100, denominator: 200, ratio: 50 },
          { currency: 'USD', numerator: 25, denominator: 200, ratio: 12.5 },
        ],
      },
    },
  ),
  duration_grouped_sampled: result(
    metricInfo({
      id: 'accounting.avg_days_to_pay',
      kind: 'duration',
      unit: 'days',
      section: 'receivables',
      comparable: true,
      charts: ['number', 'histogram', 'boxplot', 'table'],
    }),
    {
      value: 3.2,
      series: [
        {
          name: 'Records',
          points: [
            { x: '≤ 1d', y: 2 },
            { x: '1–7d', y: 7 },
            { x: '> 7d', y: 1 },
          ],
        },
      ],
      kpis: [
        { key: 'n', label: 'Records', value: 10, unit: 'count' },
        { key: 'mean', label: 'Mean', value: 3.2, unit: 'days' },
        { key: 'p50', label: 'Median', value: 3, unit: 'days' },
        { key: 'p90', label: '90th percentile', value: null, unit: 'days' },
      ],
      stats: [
        { group: 'All', n: 10, min: 0.5, p25: 1, p50: 3, p75: 4, p90: 7, max: 9, mean: 3.2 },
        { group: 'c1', n: 6, min: 0.5, p25: 1, p50: 2, p75: 4, p90: 6, max: 7, mean: 2.9 },
      ],
      table: {
        columns: [
          { key: 'group', label: 'Group' },
          { key: 'n', label: 'Records' },
          { key: 'p50', label: 'p50' },
        ],
        rows: [
          { group: 'All', n: 10, p50: 3 },
          { group: 'c1', n: 6, p50: 2 },
        ],
      },
      coverage: { eligible: 10, total: 16 },
      note: 'Based on a systematic sample of 50000 of 61234 records (cap 50000).',
    },
  ),
  aging_money_snapshot: result(
    metricInfo({
      id: 'accounting.ar_aging',
      kind: 'aging',
      ...money,
      section: 'receivables',
      snapshot: true,
      charts: ['bar', 'hbar', 'donut', 'table'],
    }),
    {
      range: { from: '2026-03-30', to: '2026-03-30' },
      currencies: ['USD'],
      totals: [{ currency: 'USD', amount: 1300, amountMinor: 130000 }],
      series: [
        {
          name: 'USD',
          currency: 'USD',
          points: [
            { x: 'Current', y: 1000 },
            { x: '1–30', y: 300 },
            { x: 'No date', y: 0 },
          ],
        },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'bucket', label: 'Age' },
          { key: 'value', label: 'AR aging' },
          { key: 'records', label: 'Records' },
        ],
        rows: [
          { bucket: 'Current', value: 1000, records: 1, currency: 'USD' },
          { bucket: '1–30', value: 300, records: 1, currency: 'USD' },
          { bucket: 'No date', value: 0, records: 0, currency: 'USD' },
        ],
      },
    },
  ),
  concentration_count: result(
    metricInfo({
      id: 'accounting.customer_concentration_count',
      kind: 'concentration',
      unit: 'percent',
      section: 'risk',
      charts: ['gauge', 'pareto', 'treemap', 'hbar', 'donut', 'table', 'number'],
      thresholds: { warn: 20, crit: 40, direction: 'above' },
    }),
    {
      value: 45.5,
      thresholds: { warn: 20, crit: 40, direction: 'above' },
      series: [
        {
          name: 'Records',
          points: [
            { x: 'c1', y: 5 },
            { x: 'c2', y: 4 },
            { x: 'Other', y: 2 },
          ],
        },
      ],
      kpis: [
        { key: 'top1_share', label: 'Top 1 share', value: 45.5, unit: 'percent' },
        { key: 'top5_share', label: 'Top 5 share', value: 100, unit: 'percent' },
        { key: 'hhi', label: 'HHI', value: 3884, unit: 'index' },
        { key: 'effective_n', label: 'Effective number', value: 2.57, unit: 'index' },
        { key: 'groups', label: 'Groups', value: 3, unit: 'count' },
        { key: 'unattributed', label: 'Without contactId', value: 0, unit: 'quantity' },
      ],
      table: {
        columns: [
          { key: 'rank', label: 'Rank' },
          { key: 'label', label: 'contactId' },
          { key: 'value', label: 'Customer concentration' },
          { key: 'share', label: 'Share %' },
          { key: 'cumulative', label: 'Cumulative %' },
        ],
        rows: [
          { rank: 1, key: 'c1', label: 'c1', value: 5, share: 45.5, cumulative: 45.5 },
          { rank: 2, key: 'c2', label: 'c2', value: 4, share: 36.4, cumulative: 81.9 },
        ],
      },
    },
  ),
  matrix_count_utc: result(
    metricInfo({
      id: 'ecommerce.orders_heatmap',
      kind: 'matrix',
      vertical: 'ecommerce',
      resourceType: 'orders',
      section: 'sales',
      charts: ['heatmap', 'table'],
    }),
    {
      value: 3,
      matrix: {
        x: ['Mon', 'Tue'],
        y: ['00:00 UTC', '01:00 UTC'],
        cells: [
          [0, 0, 1],
          [0, 1, 0],
          [1, 0, 2],
          [1, 1, 0],
        ],
      },
      table: {
        columns: [
          { key: 'x', label: 'weekday' },
          { key: 'y', label: 'hour' },
          { key: 'value', label: 'Orders' },
        ],
        rows: [
          { x: 'Mon', y: '00:00 UTC', value: 1 },
          { x: 'Tue', y: '00:00 UTC', value: 2 },
        ],
      },
      note: 'Weekday and hour are UTC.',
    },
  ),
  matrix_money_several_currencies: result(
    metricInfo({
      id: 'ecommerce.revenue_heatmap',
      kind: 'matrix',
      ...money,
      vertical: 'ecommerce',
      resourceType: 'orders',
      section: 'sales',
      charts: ['heatmap', 'table'],
    }),
    {
      currencies: ['EUR', 'USD'],
      note: 'Weekday and hour are UTC. Several currencies: choose one currency to see this matrix.',
    },
  ),
  histogram_money: result(
    metricInfo({
      id: 'ecommerce.order_value_bands',
      kind: 'histogram',
      ...money,
      vertical: 'ecommerce',
      resourceType: 'orders',
      section: 'sales',
      charts: ['histogram', 'table'],
    }),
    {
      value: 5,
      currencies: ['EUR', 'JPY'],
      series: [
        {
          name: 'EUR',
          currency: 'EUR',
          points: [
            { x: '< 10', y: 1 },
            { x: '≥ 10', y: 2 },
          ],
        },
        {
          name: 'JPY',
          currency: 'JPY',
          points: [
            { x: '< 10', y: 0 },
            { x: '≥ 10', y: 2 },
          ],
        },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'bucket', label: 'totalPrice.amount' },
          { key: 'records', label: 'Records' },
        ],
        rows: [
          { currency: 'EUR', bucket: '< 10', records: 1 },
          { currency: 'JPY', bucket: '≥ 10', records: 2 },
        ],
      },
    },
  ),
  composition_money: result(
    metricInfo({
      id: 'accounting.net_cash_flow',
      kind: 'composition',
      ...money,
      section: 'cash',
      charts: ['waterfall', 'table'],
    }),
    {
      currencies: ['USD'],
      totals: [{ currency: 'USD', amount: 150, amountMinor: 15000 }],
      series: [
        {
          name: 'USD',
          currency: 'USD',
          points: [
            { x: 'Cash in', y: 400 },
            { x: 'Cash out', y: -250 },
            { x: 'Net', y: 150 },
          ],
        },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'component', label: 'Component' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [
          { currency: 'USD', component: 'Cash in', amount: 400 },
          { currency: 'USD', component: 'Cash out', amount: -250 },
          { currency: 'USD', component: 'Net', amount: 150 },
        ],
      },
    },
  ),
  dso_single_currency: result(
    metricInfo({
      id: 'accounting.dso',
      kind: 'dso',
      unit: 'days',
      money: true,
      currencyAware: true,
      section: 'receivables',
      snapshot: true,
      charts: ['number', 'gauge', 'table'],
    }),
    {
      range: { from: '2025-12-31', to: '2026-03-30' },
      currencies: ['USD'],
      value: 45.2,
      series: [{ name: 'USD', currency: 'USD', points: [{ x: 'USD', y: 45.2 }] }],
      kpis: [
        { key: 'dso', label: 'DSO', value: 45.2, unit: 'days', currency: 'USD' },
        { key: 'balance', label: 'Balance', value: 1300, unit: 'money', currency: 'USD' },
        { key: 'sales', label: 'Last 90 days', value: 2588, unit: 'money', currency: 'USD' },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'balance', label: 'Balance' },
          { key: 'sales', label: 'Last 90 days' },
          { key: 'days', label: 'DSO' },
        ],
        rows: [{ currency: 'USD', balance: 1300, sales: 2588, days: 45.2 }],
      },
    },
  ),
  dpo_multi_currency: result(
    metricInfo({
      id: 'accounting.dpo',
      kind: 'dpo',
      unit: 'days',
      money: true,
      currencyAware: true,
      section: 'payables',
      snapshot: true,
      charts: ['number', 'gauge', 'table'],
      thresholds: { warn: 45, crit: 60, direction: 'above' },
    }),
    {
      range: { from: '2025-12-31', to: '2026-03-30' },
      currencies: ['EUR', 'USD'],
      thresholds: { warn: 45, crit: 60, direction: 'above' },
      series: [
        { name: 'EUR', currency: 'EUR', points: [{ x: 'EUR', y: 31.5 }] },
        { name: 'USD', currency: 'USD', points: [{ x: 'USD', y: null }] },
      ],
      kpis: [
        { key: 'dpo', label: 'DPO', value: 31.5, unit: 'days', currency: 'EUR' },
        { key: 'balance', label: 'Balance', value: 700, unit: 'money', currency: 'EUR' },
        { key: 'sales', label: 'Last 90 days', value: 2000, unit: 'money', currency: 'EUR' },
        { key: 'dpo', label: 'DPO', value: null, unit: 'days', currency: 'USD' },
        { key: 'balance', label: 'Balance', value: 10, unit: 'money', currency: 'USD' },
        { key: 'sales', label: 'Last 90 days', value: 0, unit: 'money', currency: 'USD' },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'balance', label: 'Balance' },
          { key: 'sales', label: 'Last 90 days' },
          { key: 'days', label: 'DPO' },
        ],
        rows: [
          { currency: 'EUR', balance: 700, sales: 2000, days: 31.5 },
          { currency: 'USD', balance: 10, sales: 0, days: null },
        ],
      },
    },
  ),
  ccc_mixed: result(
    metricInfo({
      id: 'accounting.cash_conversion_cycle',
      kind: 'ccc',
      unit: 'days',
      money: true,
      currencyAware: true,
      section: 'cash',
      snapshot: true,
      charts: ['number', 'gauge', 'table'],
      note: 'Inventory is excluded: DSO − DPO.',
    }),
    {
      range: { from: '2025-12-31', to: '2026-03-30' },
      currencies: ['EUR', 'USD'],
      note: 'Inventory is excluded: DSO − DPO.',
      series: [
        { name: 'EUR', currency: 'EUR', points: [{ x: 'EUR', y: 13.7 }] },
        { name: 'USD', currency: 'USD', points: [{ x: 'USD', y: null }] },
      ],
      kpis: [
        { key: 'ccc', label: 'Cash conversion cycle', value: 13.7, unit: 'days', currency: 'EUR' },
        { key: 'dso', label: 'DSO', value: 45.2, unit: 'days', currency: 'EUR' },
        { key: 'dpo', label: 'DPO', value: 31.5, unit: 'days', currency: 'EUR' },
        { key: 'ccc', label: 'Cash conversion cycle', value: null, unit: 'days', currency: 'USD' },
        { key: 'dso', label: 'DSO', value: 20, unit: 'days', currency: 'USD' },
        { key: 'dpo', label: 'DPO', value: null, unit: 'days', currency: 'USD' },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'dso', label: 'DSO' },
          { key: 'dpo', label: 'DPO' },
          { key: 'ccc', label: 'Cycle (days)' },
        ],
        rows: [
          { currency: 'EUR', dso: 45.2, dpo: 31.5, ccc: 13.7 },
          { currency: 'USD', dso: 20, dpo: null, ccc: null },
        ],
      },
    },
  ),
  combo_series_kinds: result(
    metricInfo({
      id: 'customer-support.created_vs_solved',
      kind: 'timeseries',
      vertical: 'customer-support',
      resourceType: 'tickets',
      section: 'workload',
      granular: true,
      comparable: true,
      defaultGranularity: 'week',
      charts: ['combo', 'line', 'bar', 'table'],
    }),
    {
      granularity: 'week',
      value: 21,
      series: [
        {
          name: 'Created',
          kind: 'bar',
          points: [
            { x: '2026-W10', y: 8 },
            { x: '2026-W11', y: 3 },
          ],
        },
        {
          name: 'Solved',
          kind: 'line',
          points: [
            { x: '2026-W10', y: 6 },
            { x: '2026-W11', y: 4 },
          ],
        },
      ],
    },
  ),
  system_table: result(
    metricInfo({
      id: 'system.data_freshness',
      kind: 'table',
      section: 'system',
      vertical: null,
      resourceType: null,
      snapshot: true,
      charts: ['table'],
    }),
    {
      value: 1,
      table: {
        columns: [
          { key: 'connection', label: 'Connection' },
          { key: 'latestChangeAt', label: 'Newest change' },
          { key: 'hoursSinceCollection', label: 'Hours since collection' },
        ],
        rows: [{ connection: 'Shop', latestChangeAt: null, hoursSinceCollection: null }],
      },
    },
  ),
  system_timeseries: result(
    metricInfo({
      id: 'system.sync_outcomes_per_day',
      kind: 'timeseries',
      section: 'system',
      vertical: null,
      resourceType: null,
      granular: true,
      charts: ['line', 'area', 'bar', 'stacked_bar', 'stacked_area', 'table', 'number'],
    }),
    {
      granularity: 'day',
      value: 3,
      series: [
        { name: 'completed', points: [{ x: '2026-03-01', y: 2 }] },
        { name: 'failed', points: [{ x: '2026-03-01', y: 1 }] },
      ],
    },
  ),
  masked_money: result(
    metricInfo({
      id: 'accounting.revenue_masked',
      kind: 'value',
      ...money,
      charts: ['number', 'table'],
      note: 'Proxy: postedAt as the sale date.',
    }),
    { masked: true, totals: [], note: 'Proxy: postedAt as the sale date.' },
  ),
  filtered_to_one_connection: result(
    metricInfo({ id: 'ecommerce.orders_total', kind: 'value', vertical: 'ecommerce' }),
    {
      filter: {
        connection: '0b6f3c1e-8a2d-4c55-9e0f-3d1f2a7b9c10',
        platform: 'shopify',
        vertical: 'ecommerce',
      },
      value: 2,
    },
  ),
  filtered_to_one_adapter: result(
    metricInfo({ id: 'ecommerce.orders_total', kind: 'value', vertical: 'ecommerce' }),
    { filter: { connection: null, platform: 'woocommerce', vertical: null }, value: 1 },
  ),
}
