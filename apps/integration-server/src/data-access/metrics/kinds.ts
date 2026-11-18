/**
 * One function per metric kind: compile the definition into store queries
 * (`aggregateV2`, `fetchValues`, `lookupLabels`), then shape the result.
 *
 * Currency rules (design §2), enforced here and nowhere else:
 * - money is grouped by its currency field in SQL and never added, stacked,
 *   compared or shared across currencies — every money series, total, KPI and
 *   table row carries its `currency`;
 * - a record with no currency is its own group (`currency: null`, labelled
 *   "Unknown currency"), never merged with a real code;
 * - `currencies` lists every code present BEFORE the `currency` filter, which
 *   is applied after grouping so one query answers both;
 * - a count with a `currencyField` groups by currency only so the filter can
 *   apply; counts may then be added across currencies.
 */
import {
  FETCH_VALUES_CAP,
  minorToMajor,
  minorUnitExponent,
  type AggregateDimension,
  type AggregateV2Row,
  type MetricStoreFilter,
  type ResourceStore,
} from '@opensteward/shared'
import { isMoneyMeasure, measureCurrencyField, measureField } from './definition'
import {
  agingLabels,
  bandIndex,
  bandLabels,
  concentration,
  percentile,
  round,
  summarize,
} from './stats'
import { DAY_MS, bucketsFor, monthsFor, parseInstant, rangeEnding, type MetricRange } from './time'
import type {
  AgingMetric,
  BreakdownMetric,
  CashConversionMetric,
  CompositionMetric,
  ConcentrationMetric,
  DaysOutstandingMetric,
  DurationMetric,
  FieldCompare,
  Granularity,
  GroupSpec,
  HistogramMetric,
  MatrixAxis,
  MatrixMetric,
  Measure,
  MetricFilter,
  MetricKpi,
  MetricResult,
  MetricSeries,
  MetricTable,
  MetricTotal,
  MetricUnit,
  Part,
  RatioMetric,
  ResourceMetricDefinition,
  TimeseriesMetric,
  ValueMetric,
} from './types'

/** Breakdown groups kept before the rest folds into "Other". */
export const GROUP_TOP_N = 12
/** `splitBy` series kept per chart before the rest folds into "Other". */
export const SPLIT_TOP_N = 8
/** Rows of a concentration table / pareto, per currency. */
export const CONCENTRATION_ROWS = 20
export const UNKNOWN_CURRENCY = 'Unknown currency'
export const NONE_LABEL = '(none)'
export const OTHER_LABEL = 'Other'
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const UTC_NOTE = 'Weekday and hour are UTC.'

export interface KindContext {
  store: ResourceStore
  def: ResourceMetricDefinition
  connIds: string[]
  /** Connection ids a lookup resource type may be read from ([] when out of scope). */
  lookupConnIds: (resourceType: string) => string[]
  /** The range evaluated (a snapshot's is today). */
  range: MetricRange
  granularity: Granularity | null
  currency: string | null
  now: Date
  today: string
  /** Row cap of a `fetchValues` read (default and maximum `FETCH_VALUES_CAP`). */
  valuesCap?: number
}

export type KindResult = Pick<
  MetricResult,
  'value' | 'series' | 'totals' | 'kpis' | 'table' | 'matrix' | 'stats' | 'currencies'
> & { note?: string; range?: { from: string; to: string } }

// ── Query plumbing ─────────────────────────────────────────────────────────

interface Slice {
  resourceType: string
  dateField?: string
  range: MetricRange | null
  filters: MetricFilter[]
  compare: FieldCompare[]
}

/** The metric's own records: its filters, its date field over the range (none for a snapshot). */
function mainSlice(ctx: KindContext, extra: MetricFilter[] = [], range?: MetricRange): Slice {
  const d = ctx.def
  const snapshot = d.snapshot === true
  return {
    resourceType: d.resourceType,
    dateField: snapshot ? undefined : d.dateField,
    range: snapshot ? null : (range ?? ctx.range),
    filters: [...(d.filters ?? []), ...extra],
    compare: [...(d.compare ?? [])],
  }
}

/**
 * A ratio part, composition component or DSO input. The metric's filters
 * apply only when it reads the metric's own resource type. `range: null`
 * reads every record (a balance "as of now").
 */
function partSlice(
  ctx: KindContext,
  p: {
    resourceType?: string
    dateField?: string
    filters?: MetricFilter[]
    compare?: FieldCompare[]
  },
  range: MetricRange | null,
): Slice {
  const d = ctx.def
  const rt = p.resourceType ?? d.resourceType
  const same = rt === d.resourceType
  return {
    resourceType: rt,
    dateField: range ? (p.dateField ?? d.dateField) : undefined,
    range,
    filters: [...(same ? (d.filters ?? []) : []), ...(p.filters ?? [])],
    compare: [...(same ? (d.compare ?? []) : []), ...(p.compare ?? [])],
  }
}

function storeFilters(fs: readonly MetricFilter[]): MetricStoreFilter[] {
  return fs.map((f) => ({ path: f.field, op: f.op, value: f.value }))
}

function sliceQuery(ctx: KindContext, s: Slice) {
  return {
    connectionIds: ctx.connIds,
    vertical: ctx.def.vertical,
    resourceType: s.resourceType,
    dateField: s.dateField,
    from: s.dateField && s.range ? s.range.from : undefined,
    to: s.dateField && s.range ? s.range.to : undefined,
    filters: storeFilters(s.filters),
    compare: s.compare.map((c) => ({ left: c.left, op: c.op, right: c.right })),
    now: ctx.now,
  }
}

function agg(
  ctx: KindContext,
  s: Slice,
  dimensions: AggregateDimension[],
  valueField?: string,
): Promise<AggregateV2Row[]> {
  return ctx.store.aggregateV2({ ...sliceQuery(ctx, s), dimensions, valueField })
}

/** The currency path a measure is grouped by: its own, or the metric's for counts on its type. */
/**
 * The currency path a measure is grouped by: the money measure's own, else
 * the part's / component's `currencyField`, else — on the metric's own
 * resource type — the metric's. So `?currency=` reaches every count part
 * that declares where its records keep their currency.
 */
function currencyPathFor(
  ctx: KindContext,
  m: Measure,
  resourceType: string,
  partCurrencyField?: string,
): string | undefined {
  return (
    measureCurrencyField(m) ??
    partCurrencyField ??
    (resourceType === ctx.def.resourceType ? ctx.def.currencyField : undefined)
  )
}

function currencyDim(path: string): AggregateDimension {
  return { type: 'field', path }
}

function groupDim(g: GroupSpec): AggregateDimension {
  return g.bands
    ? { type: 'band', path: g.field, edges: g.bands }
    : { type: 'field', path: g.field, unnest: g.unnest === true }
}

// ── Currency and measure arithmetic ────────────────────────────────────────

export function currencyLabel(c: string | null): string {
  return c ?? UNKNOWN_CURRENCY
}

const ISO_4217 = /^[A-Z]{3}$/

/**
 * A stored currency value as it leaves the engine: trimmed and upper-cased
 * when that makes a three-letter code (`usd`, ` Usd ` → `USD`), otherwise
 * the unknown currency (`null`). Stored values are whatever a platform — or
 * whoever controls its data — sent, and the dashboard puts codes into HTML,
 * so nothing else ever reaches a series, total, KPI, table row or list.
 */
export function normaliseCurrency(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const code = raw.trim().toUpperCase()
  return ISO_4217.test(code) ? code : null
}

/** A row with its currency key (at `idx`) normalised. */
function withCurrency(r: AggregateV2Row, idx: number): AggregateV2Row {
  const keys = [...r.keys]
  keys[idx] = normaliseCurrency(keys[idx])
  return { ...r, keys }
}

/**
 * The stored spellings of one normalised code, from rows grouped by the raw
 * currency value (key 0) — what a SQL-level currency filter has to match.
 */
async function currencySpellings(
  ctx: KindContext,
  slice: Slice,
  path: string,
): Promise<Map<string | null, Array<string | null>>> {
  const rows = await agg(ctx, slice, [currencyDim(path)])
  const out = new Map<string | null, Array<string | null>>()
  for (const r of rows) {
    const raw = r.keys[0] ?? null
    const code = normaliseCurrency(raw)
    const list = out.get(code)
    if (list) list.push(raw)
    else out.set(code, [raw])
  }
  return out
}

/** A filter matching the stored spellings of `code` (it matches nothing when there are none). */
function spellingFilter(
  path: string,
  spellings: Array<string | null> | undefined,
  code: string,
): MetricFilter {
  const raw = (spellings ?? []).filter((s): s is string => s !== null)
  return { field: path, op: 'in', value: raw.length > 0 ? raw : [code] }
}

/** Alphabetical, the unknown currency last. */
function sortCurrencies(cs: Iterable<string | null>): Array<string | null> {
  return [...new Set(cs)].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
}

/**
 * Codes present (before the filter), and the rows the filter keeps. For a
 * money measure only rows that carry an amount count: a record with no
 * amount says nothing about money, and would otherwise surface as an empty
 * group (often "Unknown currency", as its currency sits beside the amount).
 */
function byCurrency(
  ctx: KindContext,
  all: AggregateV2Row[],
  idx: number | null,
  money = false,
): { currencies: string[]; kept: AggregateV2Row[] } {
  const amounts = money ? all.filter((r) => r.valueCount > 0) : all
  if (idx === null) return { currencies: [], kept: amounts }
  // Normalised here, before anything groups by it: rows whose codes normalise
  // equal then accumulate into one currency wherever they are summed.
  const rows = amounts.map((r) => withCurrency(r, idx))
  const currencies = sortCurrencies(
    rows.map((r) => r.keys[idx] ?? null).filter((c): c is string => c !== null),
  ) as string[]
  const kept =
    ctx.currency === null ? rows : rows.filter((r) => (r.keys[idx] ?? null) === ctx.currency)
  return { currencies, kept }
}

interface Acc {
  count: number
  sum: number
  n: number
}

const emptyAcc = (): Acc => ({ count: 0, sum: 0, n: 0 })

function addTo(acc: Acc, r: { count: number; sum: number | null; valueCount: number }): Acc {
  acc.count += r.count
  if (r.sum !== null) acc.sum += r.sum
  acc.n += r.valueCount
  return acc
}

function merge(a: Acc, b: Acc): Acc {
  return { count: a.count + b.count, sum: a.sum + b.sum, n: a.n + b.n }
}

/** Rows by key, appending in place — linear, however many rows share a key. */
function groupRows<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>()
  for (const r of rows) {
    const k = keyOf(r)
    const list = out.get(k)
    if (list) list.push(r)
    else out.set(k, [r])
  }
  return out
}

function accIn<K>(map: Map<K, Acc>, key: K): Acc {
  let acc = map.get(key)
  if (!acc) {
    acc = emptyAcc()
    map.set(key, acc)
  }
  return acc
}

/** The measure over an accumulator, in stored units. Null: an average of nothing. */
function measureValue(m: Measure, acc: Acc | undefined): number | null {
  const a = acc ?? emptyAcc()
  switch (m.op) {
    case 'count':
      return a.count
    case 'sum':
    case 'sum_quantity':
      return a.sum
    case 'avg':
      return a.n > 0 ? a.sum / a.n : null
  }
}

/** Stored units → display units: money to major with the currency's exponent. */
function display(m: Measure, raw: number | null, currency: string | null): number | null {
  if (raw === null) return null
  if (!isMoneyMeasure(m)) return round(raw, 4)
  const unit = m.op === 'sum' || m.op === 'avg' ? (m.amountUnit ?? 'minor') : 'minor'
  return unit === 'major' ? round(raw, 6) : round(minorToMajor(raw, currency) ?? 0, 6)
}

function moneyTotal(m: Measure, raw: number, currency: string | null): MetricTotal {
  const unit = m.op === 'sum' || m.op === 'avg' ? (m.amountUnit ?? 'minor') : 'minor'
  if (unit === 'major') {
    return {
      currency,
      amount: round(raw, 6),
      amountMinor: Math.round(raw * 10 ** minorUnitExponent(currency)),
    }
  }
  return {
    currency,
    amount: round(minorToMajor(raw, currency) ?? 0, 6),
    amountMinor: Math.round(raw),
  }
}

function measureUnit(ctx: KindContext, m: Measure): MetricUnit {
  if (m.op === 'count') return 'count'
  if (isMoneyMeasure(m)) return 'money'
  return ctx.def.unit ?? (m.op === 'sum_quantity' ? 'quantity' : 'index')
}

/** Name of the single series of a currency-free measure. */
function plainSeriesName(m: Measure): string {
  return m.op === 'count' ? 'Records' : m.op === 'avg' ? 'Average' : 'Total'
}

/** Whether empty buckets are zero (additive measures) or undefined (averages). */
function zeroFor(m: Measure): number | null {
  return m.op === 'avg' ? null : 0
}

function rate(num: number | null, den: number | null): number | null {
  return num !== null && den !== null && den > 0 ? round((num / den) * 100, 2) : null
}

// ── Group labels and ordering ──────────────────────────────────────────────

/**
 * Display labels for group keys: enum `labels`, then `lookup` (ONE batched
 * read from the same in-scope connections), then the raw key. Bands get
 * their range label; a null key is "(none)". Two keys that resolve to the
 * same label are told apart by their key.
 */
async function labeler(
  ctx: KindContext,
  g: GroupSpec | undefined,
  keys: Iterable<string | null>,
): Promise<(k: string | null) => string> {
  const all = [...new Set(keys)]
  if (!g) return (k) => k ?? NONE_LABEL
  if (g.bands) {
    const labels = bandLabels(g.bands)
    return (k) => (k === null ? NONE_LABEL : (labels[Number(k)] ?? k))
  }
  let looked = new Map<string, string>()
  if (g.lookup) {
    const want = all.filter((k): k is string => k !== null && !(g.labels && k in g.labels))
    const conns = ctx.lookupConnIds(g.lookup.resourceType)
    if (want.length > 0 && conns.length > 0) {
      looked = await ctx.store.lookupLabels({
        connectionIds: conns,
        vertical: ctx.def.vertical,
        resourceType: g.lookup.resourceType,
        keyPath: g.lookup.key,
        labelPath: g.lookup.label,
        keys: want,
      })
    }
  }
  const base = (k: string | null): string =>
    k === null
      ? NONE_LABEL
      : g.labels && Object.hasOwn(g.labels, k)
        ? g.labels[k]!
        : (looked.get(k) ?? k)
  const counts = new Map<string, number>()
  for (const k of all) counts.set(base(k), (counts.get(base(k)) ?? 0) + 1)
  return (k) => {
    const l = base(k)
    return (counts.get(l) ?? 0) > 1 && k !== null && l !== k ? `${l} (${k})` : l
  }
}

/**
 * Keys in display order: bands in band order and `order` values first
 * (both zero-filled), then the rest by weight, largest first, null last.
 * Past `top`, the tail is returned separately to fold into "Other".
 */
function orderGroups(
  weights: ReadonlyMap<string | null, number>,
  g: GroupSpec | undefined,
  top: number,
): { shown: Array<string | null>; other: Array<string | null> } {
  const fixed: Array<string | null> = g?.bands
    ? g.bands.map((_, i) => String(i)).concat(String(g.bands.length))
    : [...(g?.order ?? [])]
  const fixedSet = new Set(fixed)
  const rest = [...weights.keys()]
    .filter((k) => !fixedSet.has(k))
    .sort((a, b) =>
      a === null
        ? 1
        : b === null
          ? -1
          : (weights.get(b) ?? 0) - (weights.get(a) ?? 0) || a.localeCompare(b),
    )
  const all = [...fixed, ...rest]
  return all.length <= top
    ? { shown: all, other: [] }
    : { shown: all.slice(0, top), other: all.slice(top) }
}

// ── value ──────────────────────────────────────────────────────────────────

async function runValue(ctx: KindContext, def: ValueMetric): Promise<KindResult> {
  const m = def.measure
  const cp = currencyPathFor(ctx, m, def.resourceType)
  const rows = await agg(ctx, mainSlice(ctx), cp ? [currencyDim(cp)] : [], measureField(m))
  const { currencies, kept } = byCurrency(ctx, rows, cp ? 0 : null, isMoneyMeasure(m))
  if (isMoneyMeasure(m)) {
    const per = new Map<string | null, Acc>()
    for (const r of kept) addTo(accIn(per, r.keys[0] ?? null), r)
    const curs = sortCurrencies(per.keys()).filter((c) => per.get(c)!.n > 0)
    const totals = curs.map((c) => moneyTotal(m, measureValue(m, per.get(c))!, c))
    return {
      currencies,
      value: null,
      totals,
      series: totals.map((t) => ({
        name: currencyLabel(t.currency),
        currency: t.currency,
        points: [{ x: currencyLabel(t.currency), y: t.amount }],
      })),
      kpis: curs.map((c) => ({
        key: 'records',
        label: 'Records',
        value: per.get(c)!.count,
        unit: 'count' as const,
        currency: c,
      })),
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'amount', label: def.title },
          { key: 'records', label: 'Records' },
        ],
        rows: totals.map((t) => ({
          currency: currencyLabel(t.currency),
          amount: t.amount,
          records: per.get(t.currency)!.count,
        })),
      },
    }
  }
  const acc = kept.reduce((a, r) => addTo(a, r), emptyAcc())
  const value = display(m, measureValue(m, acc), null)
  return {
    currencies,
    value,
    series: [],
    table: { columns: [{ key: 'value', label: def.title }], rows: [{ value }] },
  }
}

// ── timeseries ─────────────────────────────────────────────────────────────

async function runTimeseries(ctx: KindContext, def: TimeseriesMetric): Promise<KindResult> {
  const m = def.measure
  const g = ctx.granularity ?? 'day'
  const buckets = bucketsFor(ctx.range, g)
  const dims: AggregateDimension[] = [{ type: 'date', path: def.dateField!, unit: g }]
  if (def.splitBy) dims.push(groupDim(def.splitBy))
  const cp = currencyPathFor(ctx, m, def.resourceType)
  if (cp) dims.push(currencyDim(cp))
  const curIdx = cp ? dims.length - 1 : null
  const rows = await agg(ctx, mainSlice(ctx), dims, measureField(m))
  const money = isMoneyMeasure(m)
  const { currencies, kept } = byCurrency(ctx, rows, curIdx, money)

  // 1. Plan each series set (per currency for money) — linear in the rows.
  const plan = (subset: AggregateV2Row[]) => {
    const bySplit = new Map<string | null, Map<string, Acc>>()
    const weights = new Map<string | null, number>()
    const total = emptyAcc()
    for (const r of subset) {
      const bucket = r.keys[0]
      if (bucket === null || bucket === undefined) continue
      const split = def.splitBy ? (r.keys[1] ?? null) : null
      let inner = bySplit.get(split)
      if (!inner) {
        inner = new Map<string, Acc>()
        bySplit.set(split, inner)
      }
      addTo(accIn(inner, bucket), r)
      addTo(total, r)
      weights.set(split, (weights.get(split) ?? 0) + (m.op === 'count' ? r.count : (r.sum ?? 0)))
    }
    const order = def.splitBy
      ? orderGroups(weights, def.splitBy, SPLIT_TOP_N)
      : { shown: [null], other: [] }
    return { bySplit, total, ...order }
  }
  const byCur = money ? groupRows(kept, (r) => r.keys[curIdx!] ?? null) : null
  const sets: Array<{ currency: string | null | undefined; p: ReturnType<typeof plan> }> = byCur
    ? sortCurrencies(byCur.keys()).map((c) => ({ currency: c, p: plan(byCur.get(c)!) }))
    : [{ currency: undefined, p: plan(kept) }]

  // 2. Label only the splits that are shown — one batched lookup.
  const label = await labeler(ctx, def.splitBy, def.splitBy ? sets.flatMap((s) => s.p.shown) : [])

  // 3. Render.
  const render = (p: ReturnType<typeof plan>, currency: string | null | undefined) => {
    const cur = currency ?? null
    const point = (acc: Acc | undefined) => display(m, acc ? measureValue(m, acc) : zeroFor(m), cur)
    const line = (name: string, inner: Map<string, Acc> | undefined): MetricSeries => {
      const s: MetricSeries = { name, points: buckets.map((x) => ({ x, y: point(inner?.get(x)) })) }
      return currency === undefined ? s : { name: s.name, currency: cur, points: s.points }
    }
    if (!def.splitBy) {
      return [line(money ? currencyLabel(cur) : plainSeriesName(m), p.bySplit.get(null))]
    }
    const series = p.shown.map((k) => line(label(k), p.bySplit.get(k)))
    if (p.other.some((k) => p.bySplit.has(k))) {
      const folded = new Map<string, Acc>()
      for (const k of p.other) {
        for (const [b, acc] of p.bySplit.get(k) ?? []) {
          folded.set(b, merge(folded.get(b) ?? emptyAcc(), acc))
        }
      }
      series.push(line(OTHER_LABEL, folded))
    }
    return series
  }

  if (money) {
    const series: MetricSeries[] = []
    const totals: MetricTotal[] = []
    for (const { currency, p } of sets) {
      if (p.total.n === 0) continue
      series.push(...render(p, currency))
      totals.push(moneyTotal(m, measureValue(m, p.total) ?? 0, currency ?? null))
    }
    return { currencies, value: null, series, totals }
  }
  const only = sets[0]!.p
  return {
    currencies,
    value: display(m, measureValue(m, only.total), null),
    series: render(only, undefined),
  }
}

// ── breakdown ──────────────────────────────────────────────────────────────

async function runBreakdown(ctx: KindContext, def: BreakdownMetric): Promise<KindResult> {
  const m = def.measure
  const g = def.group
  const top = def.top ?? GROUP_TOP_N
  const cp = currencyPathFor(ctx, m, def.resourceType)
  const dims: AggregateDimension[] = [groupDim(g)]
  if (cp) dims.push(currencyDim(cp))
  const rows = await agg(ctx, mainSlice(ctx), dims, measureField(m))
  const money = isMoneyMeasure(m)
  const { currencies, kept } = byCurrency(ctx, rows, cp ? 1 : null, money)
  const additive = m.op !== 'avg'

  // 1. Plan per currency (one set for a currency-free measure) — linear.
  const plan = (subset: AggregateV2Row[]) => {
    const per = new Map<string | null, Acc>()
    const total = emptyAcc()
    for (const r of subset) {
      addTo(accIn(per, r.keys[0] ?? null), r)
      addTo(total, r)
    }
    const weights = new Map<string | null, number>()
    for (const [k, a] of per) weights.set(k, measureValue(m, a) ?? 0)
    return { per, total, ...orderGroups(weights, g, top) }
  }
  const byCur = money ? groupRows(kept, (r) => r.keys[1] ?? null) : null
  const sets = byCur
    ? sortCurrencies(byCur.keys()).map((c) => ({ currency: c, p: plan(byCur.get(c)!) }))
    : [{ currency: null, p: plan(kept) }]

  // 2. Label only the shown groups — one batched lookup.
  const label = await labeler(
    ctx,
    g,
    sets.flatMap((s) => s.p.shown),
  )

  // 3. Render.
  const render = (p: ReturnType<typeof plan>, currency: string | null) => {
    const entries: Array<{ key: string | null; label: string; acc: Acc }> = p.shown.map((k) => ({
      key: k,
      label: label(k),
      acc: p.per.get(k) ?? emptyAcc(),
    }))
    let folded = emptyAcc()
    for (const k of p.other) folded = merge(folded, p.per.get(k) ?? emptyAcc())
    if (folded.count > 0) entries.push({ key: null, label: OTHER_LABEL, acc: folded })
    const totalRaw = measureValue(m, p.total) ?? 0
    const points = entries.map((e) => ({
      x: e.label,
      y: display(m, measureValue(m, e.acc) ?? zeroFor(m), currency),
    }))
    const rowsOut = entries.map((e) => {
      const raw = measureValue(m, e.acc)
      const row: Record<string, string | number | null> = {
        key: e.key,
        label: e.label,
        value: display(m, raw ?? zeroFor(m), currency),
        records: e.acc.count,
        share: additive && totalRaw > 0 && raw !== null ? round((raw / totalRaw) * 100, 2) : null,
      }
      if (money) row['currency'] = currencyLabel(currency)
      return row
    })
    return { points, rows: rowsOut }
  }

  const columns = (money: boolean): MetricTable['columns'] => [
    ...(money ? [{ key: 'currency', label: 'Currency' }] : []),
    { key: 'label', label: 'Group' },
    { key: 'value', label: def.title },
    { key: 'records', label: 'Records' },
    { key: 'share', label: 'Share %' },
  ]

  if (money) {
    const series: MetricSeries[] = []
    const totals: MetricTotal[] = []
    const tableRows: MetricTable['rows'] = []
    for (const { currency, p } of sets) {
      if (p.total.n === 0) continue
      const out = render(p, currency)
      series.push({ name: currencyLabel(currency), currency, points: out.points })
      totals.push(moneyTotal(m, measureValue(m, p.total) ?? 0, currency))
      tableRows.push(...out.rows)
    }
    return {
      currencies,
      value: null,
      series,
      totals,
      table: { columns: columns(true), rows: tableRows },
    }
  }
  const only = sets[0]!.p
  const out = render(only, null)
  return {
    currencies,
    value: display(m, measureValue(m, only.total), null),
    series: [{ name: plainSeriesName(m), points: out.points }],
    table: { columns: columns(false), rows: out.rows },
  }
}

// ── ratio ──────────────────────────────────────────────────────────────────

async function runRatio(ctx: KindContext, def: RatioMetric): Promise<KindResult> {
  const g = def.overTime ? (ctx.granularity ?? 'day') : null
  const buckets = g ? bucketsFor(ctx.range, g) : null
  const money = isMoneyMeasure(def.numerator.measure)
  const SENT = '\u0000'
  // currency (SENT when currency-free) → bucket (SENT when not over time) → num/den
  const cells = new Map<string | null, Map<string, { num: Acc; den: Acc }>>()
  const present = new Set<string>()
  for (const [which, p] of [
    ['num', def.numerator],
    ['den', def.denominator],
  ] as const) {
    const slice = partSlice(ctx, p, def.snapshot ? null : ctx.range)
    const dims: AggregateDimension[] = []
    if (g) dims.push({ type: 'date', path: slice.dateField!, unit: g })
    const cp = currencyPathFor(ctx, p.measure, slice.resourceType, p.currencyField)
    if (cp) dims.push(currencyDim(cp))
    const curIdx = cp ? dims.length - 1 : null
    const rows = await agg(ctx, slice, dims, measureField(p.measure))
    const { currencies, kept } = byCurrency(ctx, rows, curIdx, isMoneyMeasure(p.measure))
    for (const c of currencies) present.add(c)
    for (const r of kept) {
      const cur = money ? (r.keys[curIdx!] ?? null) : SENT
      const bucket = g ? (r.keys[0] ?? null) : SENT
      if (bucket === null) continue
      const inner = cells.get(cur) ?? new Map<string, { num: Acc; den: Acc }>()
      cells.set(cur, inner)
      const cell = inner.get(bucket) ?? { num: emptyAcc(), den: emptyAcc() }
      inner.set(bucket, cell)
      addTo(cell[which], r)
    }
  }
  const currencies = sortCurrencies(present) as string[]
  const nm = def.numerator.measure
  const dm = def.denominator.measure
  const totalsOf = (inner: Map<string, { num: Acc; den: Acc }> | undefined) => {
    const num = emptyAcc()
    const den = emptyAcc()
    for (const c of inner?.values() ?? []) {
      Object.assign(num, merge(num, c.num))
      Object.assign(den, merge(den, c.den))
    }
    return { num: measureValue(nm, num), den: measureValue(dm, den) }
  }
  const seriesPoints = (inner: Map<string, { num: Acc; den: Acc }> | undefined) =>
    (buckets ?? []).map((x) => {
      const c = inner?.get(x)
      return { x, y: c ? rate(measureValue(nm, c.num), measureValue(dm, c.den)) : null }
    })

  if (money) {
    const curs = sortCurrencies(cells.keys())
    const kpis: MetricKpi[] = []
    const series: MetricSeries[] = []
    const tableRows: MetricTable['rows'] = []
    const rates: Array<number | null> = []
    for (const c of curs) {
      const inner = cells.get(c)
      const t = totalsOf(inner)
      const r = rate(t.num, t.den)
      rates.push(r)
      const numD = display(nm, t.num, c)
      const denD = display(dm, t.den, c)
      kpis.push(
        { key: 'ratio', label: def.title, value: r, unit: 'percent', currency: c },
        { key: 'numerator', label: 'Numerator', value: numD, unit: 'money', currency: c },
        { key: 'denominator', label: 'Denominator', value: denD, unit: 'money', currency: c },
      )
      tableRows.push({ currency: currencyLabel(c), numerator: numD, denominator: denD, ratio: r })
      if (buckets) series.push({ name: currencyLabel(c), currency: c, points: seriesPoints(inner) })
    }
    return {
      currencies,
      value: curs.length === 1 ? (rates[0] ?? null) : null,
      series,
      kpis,
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'numerator', label: 'Numerator' },
          { key: 'denominator', label: 'Denominator' },
          { key: 'ratio', label: `${def.title} %` },
        ],
        rows: tableRows,
      },
    }
  }
  const inner = cells.get(SENT)
  const t = totalsOf(inner)
  const value = rate(t.num, t.den)
  const numD = display(nm, t.num, null)
  const denD = display(dm, t.den, null)
  return {
    currencies,
    value,
    series: buckets ? [{ name: 'Rate', points: seriesPoints(inner) }] : [],
    kpis: [
      { key: 'ratio', label: def.title, value, unit: 'percent' },
      { key: 'numerator', label: 'Numerator', value: numD, unit: measureUnit(ctx, nm) },
      { key: 'denominator', label: 'Denominator', value: denD, unit: measureUnit(ctx, dm) },
    ],
    table: {
      columns: [
        { key: 'numerator', label: 'Numerator' },
        { key: 'denominator', label: 'Denominator' },
        { key: 'ratio', label: `${def.title} %` },
      ],
      rows: [{ numerator: numD, denominator: denD, ratio: value }],
    },
  }
}

// ── duration ───────────────────────────────────────────────────────────────

async function runDuration(ctx: KindContext, def: DurationMetric): Promise<KindResult> {
  const filters: MetricFilter[] = [{ field: def.from, op: 'not_null' }]
  if (def.to !== 'now') filters.push({ field: def.to, op: 'not_null' })
  let currencies: string[] = []
  if (def.currencyField) {
    const rows = await agg(ctx, mainSlice(ctx, filters), [currencyDim(def.currencyField)])
    currencies = byCurrency(ctx, rows, 0).currencies
    if (ctx.currency !== null) {
      // The values are fetched raw, so the filter names every stored spelling.
      const spellings = await currencySpellings(ctx, mainSlice(ctx, filters), def.currencyField)
      filters.push(spellingFilter(def.currencyField, spellings.get(ctx.currency), ctx.currency))
    }
  }
  const fields: Array<{ path: string; as: 'text' | 'number' }> = [{ path: def.from, as: 'text' }]
  if (def.to !== 'now') fields.push({ path: def.to, as: 'text' })
  if (def.group) fields.push({ path: def.group.field, as: 'text' })
  const cap = ctx.valuesCap ?? FETCH_VALUES_CAP
  const res = await ctx.store.fetchValues({
    ...sliceQuery(ctx, mainSlice(ctx, filters)),
    fields,
    limit: cap,
  })
  const unitMs = def.unit === 'days' ? DAY_MS : 3_600_000
  const nowMs = ctx.now.getTime()
  const values: number[] = []
  const byGroup = new Map<string | null, number[]>()
  for (const row of res.rows) {
    const f = parseInstant(row[0])
    const t = def.to === 'now' ? nowMs : parseInstant(row[1])
    if (f === null || t === null) continue
    const v = (t - f) / unitMs
    values.push(v)
    if (def.group) {
      const k = row[fields.length - 1] === null ? null : String(row[fields.length - 1])
      const list = byGroup.get(k)
      if (list) list.push(v)
      else byGroup.set(k, [v])
    }
  }
  const suffix = def.unit === 'days' ? 'd' : 'h'
  const labels = bandLabels(def.buckets, suffix)
  const hist = labels.map(() => 0)
  for (const v of values) hist[bandIndex(v, def.buckets)]!++
  const all = values.length ? summarize('All', values) : null
  const topGroups = [...byGroup.entries()]
    .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])))
    .slice(0, GROUP_TOP_N)
  // Label only the groups shown — one batched lookup.
  const label = await labeler(
    ctx,
    def.group,
    topGroups.map(([k]) => k),
  )
  const groups = topGroups.map(([k, vs]) => summarize(label(k), vs))
  const stats = all ? [all, ...groups] : []
  const headline = def.headline ?? 'mean'
  const sorted = [...values].sort((a, b) => a - b)
  const value = all
    ? headline === 'mean'
      ? all.mean
      : round(percentile(sorted, headline === 'p50' ? 0.5 : 0.9))
    : null
  const unit: MetricUnit = def.unit
  const result: KindResult = {
    currencies,
    value,
    series: [{ name: 'Records', points: labels.map((x, i) => ({ x, y: hist[i]! })) }],
    kpis: [
      { key: 'n', label: 'Records', value: values.length, unit: 'count' },
      { key: 'mean', label: 'Mean', value: all?.mean ?? null, unit },
      { key: 'p50', label: 'Median', value: all?.p50 ?? null, unit },
      { key: 'p90', label: '90th percentile', value: all?.p90 ?? null, unit },
    ],
    stats,
    table: {
      columns: ['group', 'n', 'min', 'p25', 'p50', 'p75', 'p90', 'max', 'mean'].map((k) => ({
        key: k,
        label: k === 'group' ? 'Group' : k === 'n' ? 'Records' : k,
      })),
      rows: stats.map((s) => ({ ...s })),
    },
  }
  if (res.sampled) {
    result.note = `Based on a systematic sample of ${res.rows.length} of ${res.total} records (cap ${cap}).`
  }
  return result
}

// ── aging ──────────────────────────────────────────────────────────────────

async function runAging(ctx: KindContext, def: AgingMetric): Promise<KindResult> {
  const m = def.measure
  const cp = currencyPathFor(ctx, m, def.resourceType)
  const dims: AggregateDimension[] = [
    { type: 'age', path: def.field, direction: def.direction, edges: def.buckets },
  ]
  if (cp) dims.push(currencyDim(cp))
  const rows = await agg(ctx, mainSlice(ctx), dims, measureField(m))
  const { currencies, kept } = byCurrency(ctx, rows, cp ? 1 : null, isMoneyMeasure(m))
  const labels = agingLabels(def.direction, def.buckets)
  const money = isMoneyMeasure(m)

  const build = (subset: AggregateV2Row[], currency: string | null) => {
    const per = new Map<string | null, Acc>()
    const total = emptyAcc()
    for (const r of subset) {
      addTo(accIn(per, r.keys[0] ?? null), r)
      addTo(total, r)
    }
    const keys: Array<string | null> = labels.map((_, i) => String(i))
    if (per.has(null)) keys.push(null)
    const entries = keys.map((k) => ({
      label: k === null ? 'No date' : labels[Number(k)]!,
      acc: per.get(k),
    }))
    return {
      total,
      points: entries.map((e) => ({
        x: e.label,
        y: display(m, e.acc ? measureValue(m, e.acc) : zeroFor(m), currency),
      })),
      rows: entries.map((e) => {
        const row: Record<string, string | number | null> = {
          bucket: e.label,
          value: display(m, e.acc ? measureValue(m, e.acc) : zeroFor(m), currency),
          records: e.acc?.count ?? 0,
        }
        if (money) row['currency'] = currencyLabel(currency)
        return row
      }),
    }
  }
  const columns = (money: boolean): MetricTable['columns'] => [
    ...(money ? [{ key: 'currency', label: 'Currency' }] : []),
    { key: 'bucket', label: 'Age' },
    { key: 'value', label: def.title },
    { key: 'records', label: 'Records' },
  ]
  if (money) {
    const perCur = groupRows(kept, (r) => r.keys[1] ?? null)
    const series: MetricSeries[] = []
    const totals: MetricTotal[] = []
    const tableRows: MetricTable['rows'] = []
    for (const c of sortCurrencies(perCur.keys())) {
      const out = build(perCur.get(c)!, c)
      if (out.total.n === 0) continue
      series.push({ name: currencyLabel(c), currency: c, points: out.points })
      totals.push(moneyTotal(m, measureValue(m, out.total) ?? 0, c))
      tableRows.push(...out.rows)
    }
    return {
      currencies,
      value: null,
      series,
      totals,
      table: { columns: columns(true), rows: tableRows },
    }
  }
  const out = build(kept, null)
  return {
    currencies,
    value: display(m, measureValue(m, out.total), null),
    series: [{ name: plainSeriesName(m), points: out.points }],
    table: { columns: columns(false), rows: out.rows },
  }
}

// ── concentration ──────────────────────────────────────────────────────────

async function runConcentration(ctx: KindContext, def: ConcentrationMetric): Promise<KindResult> {
  const m = def.measure
  const topN = def.topN ?? [1, 5, 10]
  const cp = currencyPathFor(ctx, m, def.resourceType)
  const dims: AggregateDimension[] = [groupDim(def.group)]
  if (cp) dims.push(currencyDim(cp))
  const rows = await agg(ctx, mainSlice(ctx), dims, measureField(m))
  const { currencies, kept } = byCurrency(ctx, rows, cp ? 1 : null, isMoneyMeasure(m))
  const money = isMoneyMeasure(m)
  const unit = measureUnit(ctx, m)

  const perCur = new Map<string | null, Map<string | null, Acc>>()
  for (const r of kept) {
    const c = money ? (r.keys[1] ?? null) : null
    const inner = perCur.get(c) ?? new Map<string | null, Acc>()
    perCur.set(c, inner)
    addTo(accIn(inner, r.keys[0] ?? null), r)
  }
  const computed = sortCurrencies(perCur.keys()).map((c) => {
    const inner = perCur.get(c)!
    const values = new Map<string, number>()
    for (const [k, a] of inner) if (k !== null) values.set(k, measureValue(m, a) ?? 0)
    const unattributed = measureValue(m, inner.get(null)) ?? 0
    // topShares[0] is the top-1 share (the headline); the rest are `topN`.
    return { currency: c, stats: concentration(values, [1, ...topN]), unattributed }
  })
  const label = await labeler(
    ctx,
    def.group,
    computed.flatMap((x) => x.stats.ranked.slice(0, CONCENTRATION_ROWS).map((r) => r.key)),
  )

  const kpis: MetricKpi[] = []
  const series: MetricSeries[] = []
  const tableRows: MetricTable['rows'] = []
  for (const { currency, stats, unattributed } of computed) {
    const cur = money ? { currency } : {}
    for (const { k, share } of stats.topShares.slice(1)) {
      kpis.push({
        key: `top${k}_share`,
        label: `Top ${k} share`,
        value: share,
        unit: 'percent',
        ...cur,
      })
    }
    kpis.push(
      { key: 'hhi', label: 'HHI', value: stats.hhi, unit: 'index', ...cur },
      {
        key: 'effective_n',
        label: 'Effective number',
        value: stats.effectiveN,
        unit: 'index',
        ...cur,
      },
      { key: 'groups', label: 'Groups', value: stats.groups, unit: 'count', ...cur },
      {
        key: 'unattributed',
        label: `Without ${def.group.field}`,
        value: display(m, unattributed, currency),
        unit,
        ...cur,
      },
    )
    const shown = stats.ranked.slice(0, CONCENTRATION_ROWS)
    const rest = stats.ranked.slice(CONCENTRATION_ROWS).reduce((n, r) => n + r.value, 0)
    const points = shown.map((r) => ({ x: label(r.key), y: display(m, r.value, currency) }))
    if (rest > 0) points.push({ x: OTHER_LABEL, y: display(m, rest, currency) })
    series.push(
      money
        ? { name: currencyLabel(currency), currency, points }
        : { name: plainSeriesName(m), points },
    )
    shown.forEach((r, i) => {
      const row: Record<string, string | number | null> = {
        rank: i + 1,
        key: r.key,
        label: label(r.key),
        value: display(m, r.value, currency),
        share: r.share,
        cumulative: r.cumulative,
      }
      if (money) row['currency'] = currencyLabel(currency)
      tableRows.push(row)
    })
  }
  const headline = computed.length === 1 ? (computed[0]!.stats.topShares[0]?.share ?? null) : null
  return {
    currencies,
    value: headline,
    series,
    kpis,
    table: {
      columns: [
        ...(money ? [{ key: 'currency', label: 'Currency' }] : []),
        { key: 'rank', label: 'Rank' },
        { key: 'label', label: def.group.field },
        { key: 'value', label: def.title },
        { key: 'share', label: 'Share %' },
        { key: 'cumulative', label: 'Cumulative %' },
      ],
      rows: tableRows,
    },
  }
}

// ── matrix ─────────────────────────────────────────────────────────────────

interface AxisPlan {
  dim: AggregateDimension
  /** Fixed keys (temporal axes); null = order by weight. */
  fixed: string[] | null
  label: (k: string | null) => string
  group?: GroupSpec
  temporal: boolean
}

function temporalAxis(
  ctx: KindContext,
  axis: 'weekday' | 'hour' | 'month',
  dateField: string,
): AxisPlan {
  if (axis === 'weekday') {
    return {
      dim: { type: 'date', path: dateField, unit: 'weekday' },
      fixed: ['1', '2', '3', '4', '5', '6', '7'],
      label: (k) => WEEKDAYS[Number(k) - 1] ?? String(k),
      temporal: true,
    }
  }
  if (axis === 'hour') {
    return {
      dim: { type: 'date', path: dateField, unit: 'hour' },
      fixed: Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
      label: (k) => `${k}:00 UTC`,
      temporal: true,
    }
  }
  return {
    dim: { type: 'date', path: dateField, unit: 'month' },
    fixed: ctx.def.snapshot ? null : monthsFor(ctx.range),
    label: (k) => k ?? NONE_LABEL,
    temporal: true,
  }
}

async function runMatrix(ctx: KindContext, def: MatrixMetric): Promise<KindResult> {
  const m = def.measure
  const plan = (axis: MatrixAxis): AxisPlan =>
    typeof axis === 'string'
      ? temporalAxis(ctx, axis, def.dateField!)
      : {
          dim: groupDim(axis),
          fixed: null,
          label: (k) => k ?? NONE_LABEL,
          group: axis,
          temporal: false,
        }
  const xp = plan(def.x)
  const yp = plan(def.y)
  const cp = currencyPathFor(ctx, m, def.resourceType)
  const dims = [xp.dim, yp.dim]
  if (cp) dims.push(currencyDim(cp))
  const rows = await agg(ctx, mainSlice(ctx), dims, measureField(m))
  const { currencies, kept } = byCurrency(ctx, rows, cp ? 2 : null, isMoneyMeasure(m))
  const money = isMoneyMeasure(m)
  const notes: string[] = []
  if (xp.temporal || yp.temporal) notes.push(UTC_NOTE)
  const moneyCurrencies = money ? sortCurrencies(kept.map((r) => r.keys[2] ?? null)) : []
  if (money && moneyCurrencies.length > 1) {
    notes.push('Several currencies: choose one currency to see this matrix.')
    return { currencies, value: null, series: [], note: notes.join(' ') }
  }
  const currency = moneyCurrencies[0] ?? null

  const cells = new Map<string, Acc>()
  const xw = new Map<string | null, number>()
  const yw = new Map<string | null, number>()
  const total = emptyAcc()
  for (const r of kept) {
    const x = r.keys[0] ?? null
    const y = r.keys[1] ?? null
    // A temporal axis with no value (a bare date has no hour) is not a cell.
    if ((xp.temporal && x === null) || (yp.temporal && y === null)) continue
    addTo(accIn(cells, JSON.stringify([x, y])), r)
    addTo(total, r)
    const w = m.op === 'count' ? r.count : (r.sum ?? 0)
    xw.set(x, (xw.get(x) ?? 0) + w)
    yw.set(y, (yw.get(y) ?? 0) + w)
  }
  const keysOf = (p: AxisPlan, weights: Map<string | null, number>) => {
    if (p.fixed)
      return { shown: p.fixed as Array<string | null>, other: [] as Array<string | null> }
    if (!p.group) return { shown: [...weights.keys()].sort(), other: [] }
    return orderGroups(weights, p.group, GROUP_TOP_N)
  }
  const xk = keysOf(xp, xw)
  const yk = keysOf(yp, yw)
  const xl = xp.group ? await labeler(ctx, xp.group, xk.shown) : xp.label
  const yl = yp.group ? await labeler(ctx, yp.group, yk.shown) : yp.label
  const xs: Array<Array<string | null>> = xk.shown.map((k) => [k])
  if (xk.other.length) xs.push(xk.other)
  const ys: Array<Array<string | null>> = yk.shown.map((k) => [k])
  if (yk.other.length) ys.push(yk.other)
  const out: Array<[number, number, number]> = []
  const tableRows: MetricTable['rows'] = []
  xs.forEach((xg, xi) =>
    ys.forEach((yg, yi) => {
      let acc = emptyAcc()
      for (const x of xg)
        for (const y of yg) acc = merge(acc, cells.get(JSON.stringify([x, y])) ?? emptyAcc())
      const v = display(m, measureValue(m, acc), currency)
      if (v === null) return
      out.push([xi, yi, v])
      if (acc.count > 0) {
        tableRows.push({
          x: xi < xk.shown.length ? xl(xg[0]!) : OTHER_LABEL,
          y: yi < yk.shown.length ? yl(yg[0]!) : OTHER_LABEL,
          value: v,
        })
      }
    }),
  )
  const result: KindResult = {
    currencies,
    value: money ? null : display(m, measureValue(m, total), null),
    series: [],
    matrix: {
      x: [...xk.shown.map(xl), ...(xk.other.length ? [OTHER_LABEL] : [])],
      y: [...yk.shown.map(yl), ...(yk.other.length ? [OTHER_LABEL] : [])],
      cells: out,
    },
    table: {
      columns: [
        ...(money ? [{ key: 'currency', label: 'Currency' }] : []),
        { key: 'x', label: typeof def.x === 'string' ? def.x : def.x.field },
        { key: 'y', label: typeof def.y === 'string' ? def.y : def.y.field },
        { key: 'value', label: def.title },
      ],
      rows: money ? tableRows.map((r) => ({ currency: currencyLabel(currency), ...r })) : tableRows,
    },
  }
  if (money && total.n > 0) result.totals = [moneyTotal(m, measureValue(m, total) ?? 0, currency)]
  if (notes.length) result.note = notes.join(' ')
  return result
}

// ── histogram ──────────────────────────────────────────────────────────────

async function runHistogram(ctx: KindContext, def: HistogramMetric): Promise<KindResult> {
  const labels = bandLabels(def.edges)
  const series: MetricSeries[] = []
  const tableRows: MetricTable['rows'] = []
  let value = 0
  const points = (rows: AggregateV2Row[]) => {
    const counts = labels.map(() => 0)
    for (const r of rows) {
      const k = r.keys[0]
      if (k === null || k === undefined) continue
      counts[Number(k)]! += r.count
    }
    value += counts.reduce((a, b) => a + b, 0)
    return labels.map((x, i) => ({ x, y: counts[i]! }))
  }
  if (!def.currencyField) {
    const rows = await agg(ctx, mainSlice(ctx), [
      { type: 'band', path: def.field, edges: def.edges },
    ])
    const pts = points(rows)
    series.push({ name: 'Records', points: pts })
    for (const p of pts) tableRows.push({ bucket: p.x, records: p.y })
    return {
      currencies: [],
      value,
      series,
      table: {
        columns: [
          { key: 'bucket', label: def.field },
          { key: 'records', label: 'Records' },
        ],
        rows: tableRows,
      },
    }
  }
  const cp = def.currencyField
  const withAmount = mainSlice(ctx, [{ field: def.field, op: 'not_null' }])
  // Normalised code → the stored spellings it covers (`null`: no value, or
  // one that is not a code).
  const spellings = await currencySpellings(ctx, withAmount, cp)
  const present = sortCurrencies(spellings.keys())
  const currencies = present.filter((c): c is string => c !== null)
  const targets = ctx.currency === null ? present : present.filter((c) => c === ctx.currency)
  // Edges are major units; stored amounts are minor unless `amountUnit: 'major'`,
  // so each currency is banded with its own exponent — one query per stored
  // spelling, summed into its code.
  for (const c of targets) {
    const scale = def.amountUnit === 'major' ? 1 : 10 ** minorUnitExponent(c)
    const edges = def.edges.map((e) => round(e * scale, 6))
    const rows: AggregateV2Row[] = []
    for (const raw of spellings.get(c) ?? []) {
      const filter: MetricFilter =
        raw === null ? { field: cp, op: 'is_null' } : { field: cp, op: 'eq', value: raw }
      rows.push(
        ...(await agg(ctx, mainSlice(ctx, [filter]), [{ type: 'band', path: def.field, edges }])),
      )
    }
    const pts = points(rows)
    series.push({ name: currencyLabel(c), currency: c, points: pts })
    for (const p of pts) tableRows.push({ currency: currencyLabel(c), bucket: p.x, records: p.y })
  }
  return {
    currencies,
    value,
    series,
    table: {
      columns: [
        { key: 'currency', label: 'Currency' },
        { key: 'bucket', label: def.field },
        { key: 'records', label: 'Records' },
      ],
      rows: tableRows,
    },
  }
}

// ── composition ────────────────────────────────────────────────────────────

async function runComposition(ctx: KindContext, def: CompositionMetric): Promise<KindResult> {
  const money = isMoneyMeasure(def.components[0]!.measure)
  const present = new Set<string>()
  const per: Array<Map<string | null, Acc>> = []
  for (const comp of def.components) {
    const slice = partSlice(ctx, comp, def.snapshot ? null : ctx.range)
    const cp = currencyPathFor(ctx, comp.measure, slice.resourceType, comp.currencyField)
    const rows = await agg(ctx, slice, cp ? [currencyDim(cp)] : [], measureField(comp.measure))
    const { currencies, kept } = byCurrency(ctx, rows, cp ? 0 : null, isMoneyMeasure(comp.measure))
    for (const c of currencies) present.add(c)
    const map = new Map<string | null, Acc>()
    for (const r of kept) addTo(accIn(map, money ? (r.keys[0] ?? null) : null), r)
    per.push(map)
  }
  const currencies = sortCurrencies(present) as string[]
  const NET = 'Net'
  if (money) {
    const curs = sortCurrencies(per.flatMap((m) => [...m.keys()]))
    const series: MetricSeries[] = []
    const totals: MetricTotal[] = []
    const tableRows: MetricTable['rows'] = []
    for (const c of curs) {
      let net = 0
      const pts = def.components.map((comp, i) => {
        const v =
          (display(comp.measure, measureValue(comp.measure, per[i]!.get(c)), c) ?? 0) * comp.sign
        net += v
        tableRows.push({ currency: currencyLabel(c), component: comp.label, amount: round(v, 6) })
        return { x: comp.label, y: round(v, 6) }
      })
      net = round(net, 6)
      pts.push({ x: NET, y: net })
      tableRows.push({ currency: currencyLabel(c), component: NET, amount: net })
      series.push({ name: currencyLabel(c), currency: c, points: pts })
      totals.push({
        currency: c,
        amount: net,
        amountMinor: Math.round(net * 10 ** minorUnitExponent(c)),
      })
    }
    return {
      currencies,
      value: null,
      series,
      totals,
      table: {
        columns: [
          { key: 'currency', label: 'Currency' },
          { key: 'component', label: 'Component' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: tableRows,
      },
    }
  }
  let net = 0
  const pts = def.components.map((comp, i) => {
    const v =
      (display(comp.measure, measureValue(comp.measure, per[i]!.get(null)), null) ?? 0) * comp.sign
    net += v
    return { x: comp.label, y: round(v, 4) }
  })
  net = round(net, 4)
  pts.push({ x: NET, y: net })
  return {
    currencies,
    value: net,
    series: [{ name: 'Total', points: pts }],
    table: {
      columns: [
        { key: 'component', label: 'Component' },
        { key: 'value', label: 'Value' },
      ],
      rows: pts.map((p) => ({ component: p.x, value: p.y })),
    },
  }
}

// ── dso / dpo / ccc ────────────────────────────────────────────────────────

interface DaysOutstanding {
  /** Codes present before the currency filter. */
  currencies: Set<string>
  /** Per currency (after the filter): balance and sales in stored units, days or null. */
  per: Map<string | null, { balance: number; sales: number; days: number | null }>
}

/**
 * Balance now ÷ sales in the trailing `windowDays` × `windowDays`, per
 * currency (unrounded). A currency with no sales in the window has no days.
 */
async function daysOutstanding(
  ctx: KindContext,
  balance: Part,
  sales: Part,
  windowDays: number,
  window: MetricRange,
): Promise<DaysOutstanding> {
  const currencies = new Set<string>()
  const sums: Array<Map<string | null, Acc>> = []
  for (const [p, range] of [
    [balance, null],
    [sales, window],
  ] as const) {
    const slice = partSlice(ctx, p, range)
    const cp = currencyPathFor(ctx, p.measure, slice.resourceType, p.currencyField)!
    const rows = await agg(ctx, slice, [currencyDim(cp)], measureField(p.measure))
    const found = byCurrency(ctx, rows, 0, true)
    for (const c of found.currencies) currencies.add(c)
    const map = new Map<string | null, Acc>()
    for (const r of found.kept) addTo(accIn(map, r.keys[0] ?? null), r)
    sums.push(map)
  }
  const [bal, sal] = sums as [Map<string | null, Acc>, Map<string | null, Acc>]
  const per: DaysOutstanding['per'] = new Map()
  for (const c of sortCurrencies([...bal.keys(), ...sal.keys()])) {
    const b = measureValue(balance.measure, bal.get(c)) ?? 0
    const s = measureValue(sales.measure, sal.get(c)) ?? 0
    per.set(c, { balance: b, sales: s, days: s > 0 ? (b / s) * windowDays : null })
  }
  return { currencies, per }
}

const roundDays = (d: number | null | undefined) =>
  d === null || d === undefined ? null : round(d, 1)

async function runDaysOutstanding(
  ctx: KindContext,
  def: DaysOutstandingMetric,
): Promise<KindResult> {
  const window = rangeEnding(ctx.today, def.windowDays)
  const out = await daysOutstanding(ctx, def.balance, def.sales, def.windowDays, window)
  const kpis: MetricKpi[] = []
  const series: MetricSeries[] = []
  const tableRows: MetricTable['rows'] = []
  const label = def.kind === 'dso' ? 'DSO' : 'DPO'
  for (const [c, v] of out.per) {
    const d = roundDays(v.days)
    const bD = display(def.balance.measure, v.balance, c)
    const sD = display(def.sales.measure, v.sales, c)
    kpis.push(
      { key: def.kind, label, value: d, unit: 'days', currency: c },
      { key: 'balance', label: 'Balance', value: bD, unit: 'money', currency: c },
      { key: 'sales', label: `Last ${def.windowDays} days`, value: sD, unit: 'money', currency: c },
    )
    series.push({ name: currencyLabel(c), currency: c, points: [{ x: currencyLabel(c), y: d }] })
    tableRows.push({ currency: currencyLabel(c), balance: bD, sales: sD, days: d })
  }
  const only = out.per.size === 1 ? [...out.per.values()][0] : undefined
  return {
    currencies: sortCurrencies(out.currencies) as string[],
    value: only ? roundDays(only.days) : null,
    series,
    kpis,
    table: {
      columns: [
        { key: 'currency', label: 'Currency' },
        { key: 'balance', label: 'Balance' },
        { key: 'sales', label: `Last ${def.windowDays} days` },
        { key: 'days', label },
      ],
      rows: tableRows,
    },
    range: { from: window.from, to: window.to },
  }
}

/** DSO − DPO per currency; null unless the currency has both. Inventory is not modelled. */
async function runCashConversion(ctx: KindContext, def: CashConversionMetric): Promise<KindResult> {
  const window = rangeEnding(ctx.today, def.windowDays)
  const dso = await daysOutstanding(ctx, def.dso.balance, def.dso.sales, def.windowDays, window)
  const dpo = await daysOutstanding(ctx, def.dpo.balance, def.dpo.sales, def.windowDays, window)
  const kpis: MetricKpi[] = []
  const series: MetricSeries[] = []
  const tableRows: MetricTable['rows'] = []
  const cycles: Array<number | null> = []
  const curs = sortCurrencies([...dso.per.keys(), ...dpo.per.keys()])
  for (const c of curs) {
    const r = dso.per.get(c)?.days ?? null
    const p = dpo.per.get(c)?.days ?? null
    const cycle = r !== null && p !== null ? round(r - p, 1) : null
    cycles.push(cycle)
    kpis.push(
      { key: 'ccc', label: 'Cash conversion cycle', value: cycle, unit: 'days', currency: c },
      { key: 'dso', label: 'DSO', value: roundDays(r), unit: 'days', currency: c },
      { key: 'dpo', label: 'DPO', value: roundDays(p), unit: 'days', currency: c },
    )
    series.push({
      name: currencyLabel(c),
      currency: c,
      points: [{ x: currencyLabel(c), y: cycle }],
    })
    tableRows.push({
      currency: currencyLabel(c),
      dso: roundDays(r),
      dpo: roundDays(p),
      ccc: cycle,
    })
  }
  return {
    currencies: sortCurrencies([...dso.currencies, ...dpo.currencies]) as string[],
    value: curs.length === 1 ? (cycles[0] ?? null) : null,
    series,
    kpis,
    table: {
      columns: [
        { key: 'currency', label: 'Currency' },
        { key: 'dso', label: 'DSO' },
        { key: 'dpo', label: 'DPO' },
        { key: 'ccc', label: 'Cycle (days)' },
      ],
      rows: tableRows,
    },
    range: { from: window.from, to: window.to },
  }
}

// ── Dispatch and coverage ──────────────────────────────────────────────────

export function runKind(ctx: KindContext): Promise<KindResult> {
  const def = ctx.def
  switch (def.kind) {
    case 'value':
      return runValue(ctx, def)
    case 'timeseries':
      return runTimeseries(ctx, def)
    case 'breakdown':
      return runBreakdown(ctx, def)
    case 'ratio':
      return runRatio(ctx, def)
    case 'duration':
      return runDuration(ctx, def)
    case 'aging':
      return runAging(ctx, def)
    case 'concentration':
      return runConcentration(ctx, def)
    case 'matrix':
      return runMatrix(ctx, def)
    case 'histogram':
      return runHistogram(ctx, def)
    case 'composition':
      return runComposition(ctx, def)
    case 'dso':
    case 'dpo':
      return runDaysOutstanding(ctx, def)
    case 'ccc':
      return runCashConversion(ctx, def)
  }
}

/** Records carrying every `coverage` field, of the metric's records in scope and range. */
export async function runCoverage(
  ctx: KindContext,
  fields: readonly string[],
): Promise<{ eligible: number; total: number }> {
  const def = ctx.def
  const extra: MetricFilter[] = []
  const main =
    'measure' in def
      ? measureCurrencyField(def.measure)
      : def.kind === 'histogram'
        ? def.currencyField
        : undefined
  const cp = main ?? def.currencyField
  if (cp && ctx.currency !== null) {
    const spellings = await currencySpellings(ctx, mainSlice(ctx), cp)
    extra.push(spellingFilter(cp, spellings.get(ctx.currency), ctx.currency))
  }
  const count = async (fs: MetricFilter[]) =>
    (await agg(ctx, mainSlice(ctx, fs), [])).reduce((n, r) => n + r.count, 0)
  const total = await count(extra)
  const eligible = await count([
    ...extra,
    ...fields.map((f): MetricFilter => ({ field: f, op: 'not_null' })),
  ])
  return { eligible, total }
}
