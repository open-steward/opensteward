/**
 * public/js/dashboard.js — the pure helpers behind the dashboard renderer.
 *
 * The rule under test above all: money in different currencies is never
 * combined. A result holding several currencies splits into one part per
 * currency (small multiples), each carrying only its own series, totals, KPIs
 * and table rows, with its own headline. The rest pins how each chart type
 * reads its data: pareto shares on one axis, waterfall floats ending in a Net
 * from zero, calendar days, a stale chart falling back to the metric's
 * default, and the URL a widget fetches.
 *
 * Loaded the way tests/unit/connect-link-label.test.ts loads its script: in a
 * sandbox with no `document`, so only the logic runs — the drawing needs a
 * browser and ECharts.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Point = { x: string; y: number | null }
type Series = { name: string; currency?: string | null; kind?: string; points: Point[] }
type Result = Record<string, unknown> & {
  metric: Record<string, unknown>
  series: Series[]
}
type Part = { currency: string | null; label: string | null; result: Result }

interface Charts {
  currenciesOf(r: Result): Array<string | null>
  splitByCurrency(r: Result): Part[]
  needsCurrencyFanOut(r: Result, chart: string): boolean
  effectiveChart(chart: string, r: Result): string
  seriesUnit(r: Result): string
  headline(r: Result): { value: number; unit: string; currency: string | null } | null
  previousHeadline(r: Result): number | null
  deltaOf(
    cur: number,
    prev: number | null,
    unit: string,
    t?: { warn: number; crit: number; direction: string } | null,
  ): { diff: number; pct: number | null; direction: string; tone: string } | null
  deltaText(d: unknown, unit: string, currency: string | null): string | null
  thresholdLevel(v: number, t: { warn: number; crit: number; direction: string }): string | null
  paretoData(
    r: Result,
  ): Array<{ x: string; y: number; share: number | null; cumulative: number | null }>
  waterfallData(
    points: Point[],
  ): Array<{ x: string; low: number; high: number; value: number; kind: string }>
  calendarData(r: Result): Array<[string, number]>
  foldSeries(series: Series[], unit: string): Series[]
  metricUrl(id: string, p: Record<string, unknown>): string
  fmtValue(v: number | null, unit: string, currency?: string | null, compact?: boolean): string
  fmtCell(v: unknown, key: string, r: Result): string
  esc(v: string): string
}

function load(): Charts {
  const source = readFileSync(join(import.meta.dirname, '../../public/js/dashboard.js'), 'utf8')
  const sandbox: Record<string, unknown> = {}
  new Function('globalThis', 'window', 'document', source)(sandbox, undefined, undefined)
  return sandbox['__dashboardCharts'] as Charts
}

const c = load()

function metric(over: Record<string, unknown>) {
  return {
    id: 'm',
    title: 'M',
    kind: 'value',
    unit: 'count',
    money: false,
    currencyAware: false,
    snapshot: false,
    charts: ['number', 'table'],
    ...over,
  }
}

function result(over: Partial<Result> & { metric: Record<string, unknown> }): Result {
  return {
    range: { from: '2026-03-01', to: '2026-03-30' },
    granularity: null,
    currency: null,
    currencies: [],
    value: null,
    series: [],
    masked: false,
    ...over,
  } as Result
}

const MONEY_VALUE = result({
  metric: metric({ kind: 'value', unit: 'money', money: true, currencyAware: true }),
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
    ],
    rows: [
      { currency: 'EUR', amount: 200 },
      { currency: 'USD', amount: 1300.5 },
      { currency: 'Unknown currency', amount: 5 },
    ],
  },
  previous: {
    value: null,
    totals: [{ currency: 'USD', amount: 1000, amountMinor: 100000 }],
    range: { from: '2026-01-30', to: '2026-02-28' },
  },
})

describe('splitByCurrency — never combine currencies', () => {
  it('splits a multi-currency money result into one part per currency, unknown last', () => {
    const parts = c.splitByCurrency(MONEY_VALUE)
    expect(parts.map((p) => [p.currency, p.label])).toEqual([
      ['EUR', 'EUR'],
      ['USD', 'USD'],
      [null, 'Unknown currency'],
    ])
  })

  it('gives each part only its own series, totals, KPIs, table rows and prior totals', () => {
    const usd = c.splitByCurrency(MONEY_VALUE)[1]!.result
    expect(usd['currency']).toBe('USD')
    expect(usd.series.map((s) => s.currency)).toEqual(['USD'])
    expect(usd['totals']).toEqual([{ currency: 'USD', amount: 1300.5, amountMinor: 130050 }])
    expect((usd['kpis'] as Array<{ value: number }>).map((k) => k.value)).toEqual([3])
    // The currency column goes: the part's title names it.
    expect(usd['table']).toEqual({
      columns: [{ key: 'amount', label: 'Revenue' }],
      rows: [{ currency: 'USD', amount: 1300.5 }],
    })
    expect((usd['previous'] as { totals: unknown[] }).totals).toEqual([
      { currency: 'USD', amount: 1000, amountMinor: 100000 },
    ])
    const unknown = c.splitByCurrency(MONEY_VALUE)[2]!.result
    expect(unknown.series.map((s) => s.currency)).toEqual([null])
    expect((unknown['table'] as { rows: unknown[] }).rows).toEqual([
      { currency: 'Unknown currency', amount: 5 },
    ])
  })

  it('keeps every split series of a timeseries inside its own currency', () => {
    const r = result({
      metric: metric({ kind: 'timeseries', unit: 'money', money: true, charts: ['stacked_bar'] }),
      series: [
        { name: 'Paid', currency: 'EUR', points: [{ x: '2026-03-01', y: 1 }] },
        { name: 'Open', currency: 'EUR', points: [{ x: '2026-03-01', y: 2 }] },
        { name: 'Paid', currency: 'JPY', points: [{ x: '2026-03-01', y: 300 }] },
      ],
      totals: [
        { currency: 'EUR', amount: 3, amountMinor: 300 },
        { currency: 'JPY', amount: 300, amountMinor: 300 },
      ],
    })
    const parts = c.splitByCurrency(r)
    expect(parts).toHaveLength(2)
    for (const p of parts) {
      expect(new Set(p.result.series.map((s) => s.currency))).toEqual(new Set([p.currency]))
    }
    expect(parts[0]!.result.series.map((s) => s.name)).toEqual(['Paid', 'Open'])
  })

  it('keeps a single-currency result as one untitled part, and never splits what is not money', () => {
    const one = result({
      metric: metric({ unit: 'money', money: true }),
      totals: [{ currency: 'EUR', amount: 1, amountMinor: 100 }],
    })
    const [only, ...rest] = c.splitByCurrency(one)
    expect(rest).toEqual([])
    expect(only).toMatchObject({ currency: 'EUR', label: null })
    // Its slice, so the currency travels with it (axis, tooltip, cells).
    expect(only!.result).toMatchObject({ currency: 'EUR', totals: one['totals'] })
    // Counts add up across currencies; they are never split.
    const count = result({
      metric: metric({ currencyAware: true }),
      value: 7,
      currencies: ['EUR', 'USD'],
    })
    expect(c.splitByCurrency(count)).toEqual([{ currency: null, label: null, result: count }])
  })

  it('derives each part’s headline: ratio, days outstanding, top-1 share, banded records', () => {
    const ratio = result({
      metric: metric({ kind: 'ratio', unit: 'percent', money: true }),
      kpis: [
        { key: 'ratio', label: 'R', value: 50, unit: 'percent', currency: 'EUR' },
        { key: 'ratio', label: 'R', value: 12.5, unit: 'percent', currency: 'USD' },
      ],
    })
    expect(c.splitByCurrency(ratio).map((p) => p.result['value'])).toEqual([50, 12.5])

    for (const kind of ['dso', 'dpo', 'ccc']) {
      const days = result({
        metric: metric({ kind, unit: 'days', money: true }),
        kpis: [
          { key: kind, label: 'D', value: 40, unit: 'days', currency: 'EUR' },
          { key: 'balance', label: 'B', value: 10, unit: 'money', currency: 'EUR' },
          { key: kind, label: 'D', value: null, unit: 'days', currency: 'USD' },
        ],
      })
      expect(
        c.splitByCurrency(days).map((p) => p.result['value']),
        kind,
      ).toEqual([40, null])
    }

    const conc = result({
      metric: metric({ kind: 'concentration', unit: 'percent', money: true }),
      kpis: [{ key: 'hhi', label: 'HHI', value: 5000, unit: 'index', currency: 'EUR' }],
      series: [
        { name: 'EUR', currency: 'EUR', points: [] },
        { name: 'USD', currency: 'USD', points: [] },
      ],
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'rank', label: 'Rank' },
          { key: 'share', label: 'Share %' },
        ],
        rows: [
          { currency: 'EUR', rank: 1, share: 70 },
          { currency: 'USD', rank: 1, share: 30 },
        ],
      },
    })
    expect(c.splitByCurrency(conc).map((p) => p.result['value'])).toEqual([70, 30])

    const hist = result({
      metric: metric({ kind: 'histogram', unit: 'count', money: true }),
      value: 5,
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
    })
    expect(c.splitByCurrency(hist).map((p) => p.result['value'])).toEqual([3, 2])
  })
})

describe('headline and change', () => {
  it('a money headline is the part’s one total; the prior total is matched by currency', () => {
    const usd = c.splitByCurrency(MONEY_VALUE)[1]!.result
    expect(c.headline(usd)).toEqual({ value: 1300.5, unit: 'money', currency: 'USD' })
    expect(c.previousHeadline(usd)).toBe(1000)
    // EUR had nothing in the prior period: zero, not "no comparison".
    expect(c.previousHeadline(c.splitByCurrency(MONEY_VALUE)[0]!.result)).toBe(0)
    // The unsplit multi-currency result has no single money headline.
    expect(c.headline(MONEY_VALUE)).toBeNull()
  })

  it('percent moves in points, everything else in percent of the prior value', () => {
    expect(c.deltaOf(30, 25, 'percent')).toMatchObject({ diff: 5, pct: null, direction: 'up' })
    expect(c.deltaText(c.deltaOf(30, 25, 'percent'), 'percent', null)).toBe(
      '▲ 5 pts vs prior period',
    )
    const d = c.deltaOf(90, 120, 'count')!
    expect(d.direction).toBe('down')
    expect(d.pct).toBeCloseTo(-25)
    expect(c.deltaText(d, 'count', null)).toBe('▼ 25% vs prior period')
    expect(c.deltaOf(5, null, 'count')).toBeNull()
  })

  it('colours a change good or bad only when thresholds say which way is worse', () => {
    const above = { warn: 20, crit: 40, direction: 'above' }
    expect(c.deltaOf(30, 20, 'percent', above)!.tone).toBe('bad')
    expect(c.deltaOf(10, 20, 'percent', above)!.tone).toBe('good')
    expect(c.deltaOf(10, 20, 'percent', { ...above, direction: 'below' })!.tone).toBe('bad')
    expect(c.deltaOf(10, 20, 'percent')!.tone).toBe('neutral')
  })

  it('reads threshold levels in both directions', () => {
    const above = { warn: 20, crit: 40, direction: 'above' }
    expect([10, 20, 39, 40].map((v) => c.thresholdLevel(v, above))).toEqual([
      'ok',
      'warn',
      'warn',
      'crit',
    ])
    const below = { warn: 80, crit: 60, direction: 'below' }
    expect([90, 80, 61, 60].map((v) => c.thresholdLevel(v, below))).toEqual([
      'ok',
      'warn',
      'warn',
      'crit',
    ])
  })
})

describe('chart choice', () => {
  it('draws a chart the metric no longer offers as its default', () => {
    const r = result({ metric: metric({ charts: ['line', 'bar'] }) })
    expect(c.effectiveChart('pie', r)).toBe('line')
    expect(c.effectiveChart('bar', r)).toBe('bar')
  })

  it('draws a calendar only over day buckets', () => {
    const r = result({ metric: metric({ charts: ['line', 'calendar'] }), granularity: 'week' })
    expect(c.effectiveChart('calendar', r)).toBe('line')
    expect(c.effectiveChart('calendar', { ...r, granularity: 'day' })).toBe('calendar')
  })

  it('fetches a money heatmap once per currency when the engine could not draw one', () => {
    const r = result({
      metric: metric({ kind: 'matrix', unit: 'money', money: true, charts: ['heatmap'] }),
      currencies: ['EUR', 'USD'],
    })
    expect(c.needsCurrencyFanOut(r, 'heatmap')).toBe(true)
    expect(c.needsCurrencyFanOut({ ...r, currency: 'EUR' }, 'heatmap')).toBe(false)
    // One code, yet no matrix: records without a code are there too — still fanned out.
    expect(c.needsCurrencyFanOut({ ...r, currencies: ['EUR'] }, 'heatmap')).toBe(true)
    expect(c.needsCurrencyFanOut({ ...r, currencies: [] }, 'heatmap')).toBe(false)
    expect(c.needsCurrencyFanOut({ ...r, matrix: { x: [], y: [], cells: [] } }, 'heatmap')).toBe(
      false,
    )
  })

  it('knows the unit of each kind’s series', () => {
    const u = (over: Record<string, unknown>) => c.seriesUnit(result({ metric: metric(over) }))
    expect(u({ kind: 'duration', unit: 'days' })).toBe('count')
    expect(u({ kind: 'concentration', unit: 'percent', money: true })).toBe('money')
    expect(u({ kind: 'concentration', unit: 'percent' })).toBe('quantity')
    expect(u({ kind: 'ratio', unit: 'percent', money: true })).toBe('percent')
    expect(u({ kind: 'dso', unit: 'days', money: true })).toBe('days')
    expect(u({ kind: 'timeseries', unit: 'money', money: true })).toBe('money')
  })
})

describe('chart data', () => {
  it('pareto: share and cumulative share from a concentration table, Other last', () => {
    const r = result({
      metric: metric({ kind: 'concentration', unit: 'percent' }),
      series: [
        {
          name: 'Records',
          points: [
            { x: 'c1', y: 5 },
            { x: 'c2', y: 3 },
            { x: 'Other', y: 2 },
          ],
        },
      ],
      table: {
        columns: [],
        rows: [
          { rank: 1, label: 'c1', value: 5, share: 50, cumulative: 50 },
          { rank: 2, label: 'c2', value: 3, share: 30, cumulative: 80 },
        ],
      },
    })
    expect(c.paretoData(r)).toEqual([
      { x: 'c1', y: 5, share: 50, cumulative: 50 },
      { x: 'c2', y: 3, share: 30, cumulative: 80 },
      { x: 'Other', y: 2, share: 20, cumulative: 100 },
    ])
  })

  it('pareto: a breakdown sorted largest first, Other last, cumulative to 100', () => {
    const r = result({
      metric: metric({ kind: 'breakdown' }),
      series: [
        {
          name: 'Records',
          points: [
            { x: 'Other', y: 1 },
            { x: 'b', y: 1 },
            { x: 'a', y: 2 },
          ],
        },
      ],
    })
    expect(c.paretoData(r).map((p) => [p.x, p.share, p.cumulative])).toEqual([
      ['a', 50, 50],
      ['b', 25, 75],
      ['Other', 25, 100],
    ])
  })

  it('waterfall: components float from the running total; Net stands on zero', () => {
    expect(
      c.waterfallData([
        { x: 'In', y: 400 },
        { x: 'Out', y: -250 },
        { x: 'Fees', y: -200 },
        { x: 'Net', y: -50 },
      ]),
    ).toEqual([
      { x: 'In', low: 0, high: 400, value: 400, kind: 'up' },
      { x: 'Out', low: 150, high: 400, value: -250, kind: 'down' },
      { x: 'Fees', low: -50, high: 150, value: -200, kind: 'down' },
      { x: 'Net', low: -50, high: 0, value: -50, kind: 'net' },
    ])
  })

  it('calendar: one value per day, split series summed', () => {
    const r = result({
      metric: metric({ kind: 'timeseries' }),
      series: [
        {
          name: 'a',
          points: [
            { x: '2026-03-01', y: 1 },
            { x: '2026-03-02', y: 0 },
          ],
        },
        {
          name: 'b',
          points: [
            { x: '2026-03-01', y: 2 },
            { x: '2026-03-02', y: null },
          ],
        },
      ],
    })
    expect(c.calendarData(r)).toEqual([
      ['2026-03-01', 3],
      ['2026-03-02', 0],
    ])
  })

  it('folds a count’s 7th series and beyond into Other, and never folds money', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      name: `s${i}`,
      points: [{ x: 'd', y: i }],
    }))
    const folded = c.foldSeries(many, 'count')
    expect(folded.map((s) => s.name)).toEqual(['s0', 's1', 's2', 's3', 's4', 'Other'])
    expect(folded[5]!.points).toEqual([{ x: 'd', y: 5 + 6 + 7 + 8 }])
    expect(c.foldSeries(many, 'money')).toHaveLength(9)
  })
})

describe('fetching and formatting', () => {
  it('builds the widget URL with only the parameters that are set', () => {
    expect(
      c.metricUrl('ecommerce.revenue', {
        from: '2026-03-01',
        to: '2026-03-30',
        dashboard: 'dsh_1',
        currency: 'EUR',
        granularity: 'week',
        compare: true,
      }),
    ).toBe(
      '/dashboards/metric/ecommerce.revenue?from=2026-03-01&to=2026-03-30&dashboard=dsh_1&currency=EUR&granularity=week&compare=1',
    )
    // `auto` defers to the metric's own default; a malformed code is not sent.
    expect(c.metricUrl('a b', { granularity: 'auto', currency: 'eur', compare: false })).toBe(
      '/dashboards/metric/a%20b',
    )
  })

  it('carries the connection and adapter filter, and drops malformed values', () => {
    expect(
      c.metricUrl('ecommerce.orders_total', {
        from: '2026-03-01',
        dashboard: 'builtin:ecommerce',
        connection: '9f8e7d6c-0001-4aaa-8bbb-000000000001',
        platform: 'shopify',
      }),
    ).toBe(
      '/dashboards/metric/ecommerce.orders_total?from=2026-03-01&dashboard=builtin%3Aecommerce&connection=9f8e7d6c-0001-4aaa-8bbb-000000000001&platform=shopify',
    )
    expect(c.metricUrl('m', { platform: 'square', vertical: 'ecommerce' })).toBe(
      '/dashboards/metric/m?platform=square&vertical=ecommerce',
    )
    for (const bad of [
      { vertical: 'Ecommerce' },
      { vertical: 'e' },
      { connection: 'a b' },
      { connection: 'a&platform=x' },
      { connection: 'x'.repeat(101) },
      { platform: 'Shopify' },
      { platform: '-shop' },
      { connection: '', platform: '' },
    ]) {
      expect(c.metricUrl('m', bad), JSON.stringify(bad)).toBe('/dashboards/metric/m')
    }
  })

  it('formats by unit, with the currency a value belongs to', () => {
    expect(c.fmtValue(12.345, 'percent')).toMatch(/^12[.,]3%$/)
    expect(c.fmtValue(3.25, 'days')).toMatch(/^3[.,]3 d$/)
    expect(c.fmtValue(1234.5, 'money', 'EUR')).toContain('€')
    expect(c.fmtValue(1234.5, 'money', 'JPY')).toMatch(/¥|JPY/)
    expect(c.fmtValue(null, 'count')).toBe('—')
    const money = result({
      metric: metric({ kind: 'breakdown', unit: 'money', money: true }),
      currency: 'USD',
    })
    expect(c.fmtCell(12, 'value', money)).toContain('$')
    expect(c.fmtCell(40, 'share', money)).toMatch(/^40%$/)
    expect(c.fmtCell(null, 'value', money)).toBe('—')
  })

  it('escapes labels before they reach an HTML tooltip', () => {
    expect(c.esc('<img src=x onerror="a()">&\'')).toBe(
      '&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;',
    )
  })
})

// ── Review fixes: escaping, single currencies, fan-out ─────────────────────

const EVIL = '<img src=x onerror=alert(1)>'

type Opts = Record<string, (...args: unknown[]) => Record<string, unknown> | null>
const O = (c as unknown as { options: Opts }).options
const H = c as unknown as {
  fanOutPlan(r: Result): { fetch: string[]; dropped: string[]; unknownLeftOut: boolean }
  fanOutNotes(plan: { dropped: string[]; unknownLeftOut: boolean }, failed: string[]): string[]
  drawAsMultiples(parts: Part[], fanned: boolean): boolean
}

/** Colour tokens: any strings do, the builders only pass them through. */
const T = {
  palette: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
  seq: ['s1', 's2', 's3', 's4', 's5'],
  other: 'o',
  ink: 'i',
  ink2: 'i2',
  muted: 'm',
  grid: 'g',
  axis: 'a',
  surface: 's',
  surface1: 's1',
  good: 'g',
  warn: 'w',
  bad: 'b',
  status: {},
  font: 'f',
}

/** Every function an option installs (formatters), with its path; `renderItem` draws, it does not format. */
function formatters(
  o: unknown,
  path = 'option',
): Array<{ path: string; fn: (...a: unknown[]) => unknown }> {
  if (typeof o === 'function') return [{ path, fn: o as (...a: unknown[]) => unknown }]
  if (!o || typeof o !== 'object') return []
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    k === 'renderItem' ? [] : formatters(v, `${path}.${k}`),
  )
}

/** The param shapes ECharts hands a formatter: a value, an item, an axis list, matrix and calendar cells. */
const PARAMS: unknown[] = [
  5,
  { name: EVIL, seriesName: EVIL, value: 5, percent: 50, dataIndex: 0 },
  [{ name: EVIL, seriesName: EVIL, value: 5, dataIndex: 0 }],
  { name: EVIL, value: [0, 0, 5], dataIndex: 0 },
  { name: EVIL, value: [EVIL, 5], dataIndex: 0 },
]

/** Call every formatter with every shape; each must accept one, and none may emit a raw `<`. */
function expectNoMarkup(option: unknown, label: string) {
  const fns = formatters(option)
  for (const { path, fn } of fns) {
    let answered = 0
    for (const p of PARAMS) {
      let out: unknown
      try {
        out = fn(p)
      } catch {
        continue
      }
      answered++
      // `<br>` is the tooltips' own line break; nothing else may be markup.
      if (typeof out === 'string') {
        expect(out.split('<br>').join(''), `${label} ${path}`).not.toContain('<')
      }
    }
    expect(answered, `${label} ${path} accepted no param shape`).toBeGreaterThan(0)
  }
  return fns.length
}

/** A two-currency money result whose groups, series and one currency are hostile. */
function hostileMoney(kind: string, points: Point[]): Result {
  return result({
    metric: metric({ kind, unit: 'money', money: true, currencyAware: true, charts: [] }),
    currencies: ['USD', EVIL],
    totals: [
      { currency: 'USD', amount: 1, amountMinor: 100 },
      { currency: EVIL, amount: 2, amountMinor: 200 },
    ],
    series: [
      { name: EVIL, currency: 'USD', points },
      { name: EVIL, currency: EVIL, points },
    ],
  })
}

const GROUPS: Point[] = [
  { x: EVIL, y: 5 },
  { x: 'b', y: 3 },
  { x: 'Other', y: 1 },
]

describe('escaping — every chart type, hostile group names and a hostile currency', () => {
  const byChart: Record<string, () => Array<Record<string, unknown> | null>> = {}
  const parts = (r: Result) => c.splitByCurrency(r).map((p) => p.result)
  for (const chart of [
    'line',
    'area',
    'stacked_area',
    'bar',
    'hbar',
    'stacked_bar',
    'combo',
    'histogram',
  ]) {
    byChart[chart] = () =>
      parts(hostileMoney('timeseries', GROUPS)).map((r) => O['cartesian']!(T, r, chart))
  }
  for (const chart of ['pie', 'donut', 'rose']) {
    byChart[chart] = () =>
      parts(hostileMoney('breakdown', GROUPS)).map((r) => O['pie']!(T, r, chart))
  }
  for (const chart of ['treemap', 'funnel', 'radar', 'pareto']) {
    byChart[chart] = () => parts(hostileMoney('breakdown', GROUPS)).map((r) => O[chart]!(T, r))
  }
  byChart['waterfall'] = () =>
    parts(
      hostileMoney('composition', [
        { x: EVIL, y: 5 },
        { x: 'Net', y: 5 },
      ]),
    ).map((r) => O['waterfall']!(T, r))
  byChart['boxplot'] = () => [
    O['boxplot']!(
      T,
      result({
        metric: metric({ kind: 'duration', unit: 'days' }),
        stats: [{ group: EVIL, n: 1, min: 1, p25: 1, p50: 1, p75: 1, p90: 1, max: 1, mean: 1 }],
      }),
    ),
  ]
  byChart['heatmap'] = () =>
    [EVIL, 'USD'].map((cur) =>
      O['heatmap']!(
        T,
        result({
          metric: metric({ kind: 'matrix', unit: 'money', money: true }),
          currency: cur,
          matrix: { x: [EVIL], y: [EVIL], cells: [[0, 0, 5]] },
        }),
      ),
    )
  byChart['calendar'] = () => [
    O['calendar']!(
      T,
      result({
        metric: metric({ kind: 'timeseries' }),
        series: [{ name: EVIL, points: [{ x: EVIL, y: 1 }] }],
      }),
    ),
  ]
  byChart['gauge'] = () =>
    parts(hostileMoney('value', [])).map((r) =>
      O['gauge']!(T, r, c.headline(r) ?? { value: 1, unit: 'money', currency: EVIL }, false),
    )

  it.each(Object.keys(byChart))('%s', (chart) => {
    let found = 0
    for (const option of byChart[chart]!()) {
      expect(option, chart).not.toBeNull()
      found += expectNoMarkup(option, chart)
    }
    expect(found, `${chart} installs no formatter at all`).toBeGreaterThan(0)
  })

  it('number and table: values and cells never carry a hostile currency', () => {
    for (const part of c.splitByCurrency(hostileMoney('value', []))) {
      const h = c.headline(part.result)!
      expect(c.fmtValue(h.value, h.unit, h.currency)).not.toContain('<')
      expect(c.fmtCell(3, 'value', part.result)).not.toContain('<')
    }
  })

  it('covers all 22 chart types', () => {
    expect([...Object.keys(byChart), 'number', 'table'].sort()).toEqual(
      [
        'number',
        'gauge',
        'table',
        'line',
        'area',
        'stacked_area',
        'bar',
        'hbar',
        'stacked_bar',
        'combo',
        'pareto',
        'pie',
        'donut',
        'rose',
        'treemap',
        'funnel',
        'radar',
        'histogram',
        'boxplot',
        'waterfall',
        'heatmap',
        'calendar',
      ].sort(),
    )
  })

  it('formats money with a code only when it is one', () => {
    expect(c.fmtValue(1, 'money', EVIL)).not.toContain('<')
    expect(c.fmtValue(1, 'money', EVIL)).toBe(c.fmtValue(1, 'money', null))
    expect(c.fmtValue(1, 'money', 'usd')).toBe(c.fmtValue(1, 'money', null))
    expect(c.fmtValue(1, 'money', 'USD')).toContain('$')
  })
})

describe('a single-currency money result', () => {
  const eurOnly = result({
    metric: metric({ kind: 'timeseries', unit: 'money', money: true, charts: ['line', 'table'] }),
    currencies: ['EUR'],
    totals: [{ currency: 'EUR', amount: 12, amountMinor: 1200 }],
    series: [{ name: 'EUR', currency: 'EUR', points: [{ x: '2026-03-01', y: 12 }] }],
    table: {
      columns: [
        { key: 'currency', label: 'Currency' },
        { key: 'value', label: 'Revenue' },
      ],
      rows: [{ currency: 'EUR', value: 12 }],
    },
  })

  it('is one untitled part that knows its currency', () => {
    const parts = c.splitByCurrency(eurOnly)
    expect(parts).toHaveLength(1)
    expect(parts[0]!.label).toBeNull()
    expect(parts[0]!.currency).toBe('EUR')
    expect(parts[0]!.result['currency']).toBe('EUR')
  })

  it('draws its axis, tooltip and table cells in that currency', () => {
    const part = c.splitByCurrency(eurOnly)[0]!.result
    const option = O['cartesian']!(T, part, 'line') as {
      tooltip: { valueFormatter: (v: number) => string }
      yAxis: { axisLabel: { formatter: (v: number) => string } }
    }
    expect(option.tooltip.valueFormatter(12)).toContain('€')
    expect(option.yAxis.axisLabel.formatter(12)).toContain('€')
    expect(c.fmtCell(12, 'value', part)).toContain('€')
  })
})

describe('money heatmap fan-out', () => {
  const matrix = (currencies: string[]) =>
    result({
      metric: metric({ kind: 'matrix', unit: 'money', money: true, charts: ['heatmap'] }),
      currencies,
      note: 'Several currencies: choose one currency to see this matrix.',
    })

  it('fans out one ISO code when records without a code kept the engine from drawing it', () => {
    expect(c.needsCurrencyFanOut(matrix(['EUR']), 'heatmap')).toBe(true)
    expect(H.fanOutPlan(matrix(['EUR']))).toEqual({
      fetch: ['EUR'],
      dropped: [],
      unknownLeftOut: true,
    })
  })

  it('fetches at most eight currencies and names the rest', () => {
    const codes = ['AUD', 'CAD', 'CHF', 'EUR', 'GBP', 'JPY', 'NOK', 'SEK', 'USD', 'ZAR']
    expect(H.fanOutPlan(matrix(codes))).toEqual({
      fetch: codes.slice(0, 8),
      dropped: ['USD', 'ZAR'],
      unknownLeftOut: false,
    })
  })

  it('says what is missing: dropped and failed currencies, and records without a code', () => {
    const notes = H.fanOutNotes({ dropped: ['USD', 'ZAR'], unknownLeftOut: true }, ['EUR'])
    const text = notes.join(' ')
    expect(text).toContain('EUR could not be loaded')
    expect(text).toContain('USD, ZAR')
    expect(text).toMatch(/without a currency/i)
    expect(H.fanOutNotes({ dropped: [], unknownLeftOut: false }, [])).toEqual([])
  })

  it('titles a lone surviving part with its currency', () => {
    const one: Part[] = [{ currency: 'EUR', label: 'EUR', result: matrix(['EUR']) }]
    expect(H.drawAsMultiples(one, true)).toBe(true)
    expect(H.drawAsMultiples([{ ...one[0]!, label: null }], false)).toBe(false)
  })
})
