/**
 * Metric catalog types — the vocabulary built-in and user dashboards chart.
 *
 * A metric is a named, reviewed aggregate over the stored records (or over
 * the sync job history). Dashboards reference metrics by id; they never send
 * SQL, field paths or filters of their own, so what a dashboard can reveal is
 * bounded by this catalog, which `validate.ts` checks against the field
 * classification at load (no PII, no secrets).
 *
 * Money is never combined across currencies — there is no FX data anywhere.
 * Every money series, total, KPI and table row carries its `currency`; a
 * record with none is grouped as `currency: null` ("Unknown currency").
 */
import type {
  ChartType,
  FieldCompareOp,
  Granularity,
  MetricFilterOp,
  MetricKind,
  MetricSection,
  MetricUnit,
} from '@opensteward/shared'

export type {
  ChartType,
  Granularity,
  GranularityParam,
  MetricKind,
  MetricSection,
  MetricUnit,
} from '@opensteward/shared'

/** Row predicate ops — semantics in `@opensteward/shared` `METRIC_FILTER_OPS`. */
export type FilterOp = MetricFilterOp

export interface MetricFilter {
  field: string
  op: FilterOp
  value?: string | number | boolean | Array<string | number>
}

/** Row-level comparison of two fields of one record (both dates, or both numbers). */
export interface FieldCompare {
  left: string
  op: FieldCompareOp
  right: string
}

/**
 * What is measured per group. Canonical amounts are integer minor units
 * (`amountUnit: 'minor'`, the default); CRM stores major units.
 */
export type Measure =
  | { op: 'count' }
  | { op: 'sum'; field: string; currencyField: string; amountUnit?: 'minor' | 'major' }
  | { op: 'avg'; field: string; currencyField?: string; amountUnit?: 'minor' | 'major' }
  /** A non-money numeric sum (units on hand, quantities). */
  | { op: 'sum_quantity'; field: string }

export interface GroupSpec {
  field: string
  /** Display labels for enum values. */
  labels?: Record<string, string>
  /** Fixed display order (zero-filled); unknown values fall after them. */
  order?: string[]
  /** Resolve ids to a non-PII display label from another listable resource in scope. */
  lookup?: { resourceType: string; key: 'id'; label: string }
  /** Numeric banding: `< b0`, `b0–b1`, …, `≥ bn`. */
  bands?: number[]
  /** For string arrays: count each element (tags, assigneeIds). Count measures only. */
  unnest?: boolean
}

/**
 * One side of a ratio (or a DSO/DPO input). The metric's `filters` and
 * `compare` apply to a part only when it reads the metric's own resource
 * type; its own `filters` / `compare` always apply.
 */
export interface Part {
  filters?: MetricFilter[]
  compare?: FieldCompare[]
  measure: Measure
  dateField?: string
  resourceType?: string
  /**
   * Currency code of a count part's records, so the `currency` parameter
   * applies to it. Required for a count part on another resource type in a
   * currency-aware metric; on the metric's own type it defaults to the
   * metric's `currencyField`. (A money measure carries its own.)
   */
  currencyField?: string
}

export interface CompositionComponent {
  label: string
  measure: Measure
  filters?: MetricFilter[]
  resourceType?: string
  dateField?: string
  /** As `Part.currencyField`. */
  currencyField?: string
  sign: 1 | -1
}

export interface MetricThresholds {
  warn: number
  crit: number
  /** `above`: higher is worse (warn ≤ crit); `below`: lower is worse (warn ≥ crit). */
  direction: 'above' | 'below'
}

export interface MetricBase {
  id: string
  title: string
  description: string
  vertical: string
  resourceType: string
  section: MetricSection
  /** Range anchor. Omit only with `snapshot: true`. */
  dateField?: string
  /** Ignore the dashboard range and evaluate as of now (open AR, stock levels, open tickets). */
  snapshot?: boolean
  filters?: MetricFilter[]
  compare?: FieldCompare[]
  /** For count-based metrics whose records carry a currency: enables the currency filter. */
  currencyField?: string
  /** Optional colouring for number/gauge charts. */
  thresholds?: MetricThresholds
  /** Fields whose presence is reported as coverage ("based on 62% of records"). */
  coverage?: string[]
  /** Override the default chart list for the kind. The first entry is the default. */
  charts?: ChartType[]
  /** Human-facing caveat shown under the widget, e.g. "Proxy: updatedAt as completion date". */
  note?: string
  /**
   * Unit of a non-money `avg` / `sum_quantity` measure when the default
   * (`index` / `quantity`) does not fit, e.g. `hours` for an average of a
   * stored duration. Ignored for kinds whose unit is fixed.
   */
  unit?: MetricUnit
  /**
   * Default bucket of a series over time (timeseries, ratio over time). Used
   * when the request says `auto` or names none; an explicit `day` / `week` /
   * `month` in the request still wins. Omitted: `auto` follows the range.
   */
  granularity?: Granularity
}

export type ValueMetric = MetricBase & { kind: 'value'; measure: Measure }
export type TimeseriesMetric = MetricBase & {
  kind: 'timeseries'
  measure: Measure
  splitBy?: GroupSpec
}
export type BreakdownMetric = MetricBase & {
  kind: 'breakdown'
  measure: Measure
  group: GroupSpec
  /** Groups kept before the rest folds into "Other" (default 12). */
  top?: number
}
export type RatioMetric = MetricBase & {
  kind: 'ratio'
  numerator: Part
  denominator: Part
  overTime?: boolean
}
export type DurationMetric = MetricBase & {
  kind: 'duration'
  from: string
  to: string | 'now'
  unit: 'days' | 'hours'
  /** Histogram edges in `unit`. */
  buckets: number[]
  group?: GroupSpec
  /** Which statistic is the headline `value` (default `mean`). */
  headline?: 'mean' | 'p50' | 'p90'
}
export type AgingMetric = MetricBase & {
  kind: 'aging'
  field: string
  direction: 'past' | 'future'
  /** Whole-day edges, ascending: `≤ b0`, `b0+1–b1`, …, `> bn`. */
  buckets: number[]
  measure: Measure
}
export type ConcentrationMetric = MetricBase & {
  kind: 'concentration'
  measure: Measure
  group: GroupSpec
  /** Top-k shares reported (default 1, 5, 10). */
  topN?: number[]
}
export type MatrixAxis = 'weekday' | 'hour' | 'month' | GroupSpec
export type MatrixMetric = MetricBase & {
  kind: 'matrix'
  x: MatrixAxis
  y: 'weekday' | 'hour' | GroupSpec
  measure: Measure
}
export type HistogramMetric = MetricBase & {
  kind: 'histogram'
  field: string
  /** Band edges, ascending; money edges are MAJOR units. */
  edges: number[]
  currencyField?: string
  amountUnit?: 'minor' | 'major'
}
export type CompositionMetric = MetricBase & {
  kind: 'composition'
  components: CompositionComponent[]
}
/** Balance ÷ sales in the trailing window × windowDays, per currency. */
export type DaysOutstandingMetric = MetricBase & {
  kind: 'dso' | 'dpo'
  balance: Part
  sales: Part
  windowDays: number
}
/**
 * Cash conversion cycle without inventory: DSO − DPO per currency, each
 * computed exactly as the `dso` / `dpo` kinds do over the same window. A
 * currency with only one side has no cycle (null), never a one-sided one.
 */
export type CashConversionMetric = MetricBase & {
  kind: 'ccc'
  dso: { balance: Part; sales: Part }
  dpo: { balance: Part; sales: Part }
  windowDays: number
}

export type ResourceMetricDefinition =
  | ValueMetric
  | TimeseriesMetric
  | BreakdownMetric
  | RatioMetric
  | DurationMetric
  | AgingMetric
  | ConcentrationMetric
  | MatrixMetric
  | HistogramMetric
  | CompositionMetric
  | DaysOutstandingMetric
  | CashConversionMetric

export type SystemMetricId =
  | 'system.records_per_vertical'
  | 'system.sync_outcomes_per_day'
  | 'system.data_freshness'
  | 'system.records_per_resource'
  | 'system.sync_success_rate'
  | 'system.sync_failures_by_platform'
  | 'system.sync_duration'
  | 'system.connections_by_status'
  | 'system.token_expiring_soon'
  | 'system.stale_connections'
  | 'system.sync_error_types'

/** A built-in metric over deployment state rather than one resource type. */
export interface SystemMetricDefinition {
  id: SystemMetricId
  title: string
  description: string
  kind: Extract<MetricKind, 'breakdown' | 'timeseries' | 'table' | 'ratio' | 'duration'>
  charts?: ChartType[]
  /** Unit of the headline (default `count`). */
  unit?: MetricUnit
  /** Evaluated as of now (default: every kind but `timeseries`). */
  snapshot?: boolean
  /** The `granularity` parameter applies (default: `timeseries` only). */
  granular?: boolean
  thresholds?: MetricThresholds
  note?: string
}

/** What the catalog route lists for each metric. */
export interface MetricInfo {
  id: string
  title: string
  description: string
  kind: MetricKind
  unit: MetricUnit
  section: MetricSection
  /** Null for system metrics, which span every vertical in scope. */
  vertical: string | null
  resourceType: string | null
  /** Chart types that fit this metric's shape; the first is the default. */
  charts: ChartType[]
  /** Values are money, one set per currency. */
  money: boolean
  /** The `currency` parameter changes the result (money, or a count with `currencyField`). */
  currencyAware: boolean
  /** Evaluated as of now: the range is ignored. */
  snapshot: boolean
  /** The `granularity` parameter applies (a series over time). */
  granular: boolean
  /** `compare=1` adds `previous` (the prior equal-length range). */
  comparable: boolean
  /** The definition's default bucket, used for `auto` or no `granularity` parameter. */
  defaultGranularity?: Granularity
  thresholds?: MetricThresholds
  note?: string
}

export interface MetricPoint {
  x: string
  /** Null for a bucket with no defined value (a ratio with no denominator, an avg with no values). */
  y: number | null
}

export interface MetricSeries {
  name: string
  /** ISO 4217 code of a money series; null when the records carried none. Absent on counts. */
  currency?: string | null
  /** For `combo` charts. */
  kind?: 'bar' | 'line'
  points: MetricPoint[]
}

export interface MetricTotal {
  currency: string | null
  /** Major units (`12.5` for 1250 cents), converted with the currency's exponent. */
  amount: number
  /** Minor units (rounded for an average). */
  amountMinor: number
}

export interface MetricKpi {
  key: string
  label: string
  value: number | null
  unit: MetricUnit
  currency?: string | null
}

export interface MetricTable {
  columns: Array<{ key: string; label: string }>
  rows: Array<Record<string, string | number | null>>
}

export interface MetricStats {
  group: string
  n: number
  min: number
  p25: number
  p50: number
  p75: number
  p90: number
  max: number
  mean: number
}

export interface MetricResult {
  /**
   * The dashboard's connection / adapter filter, when one was applied (absent
   * otherwise), with the vertical that kept it inside one. It only narrows the
   * scope: an out-of-scope connection yields no data.
   */
  filter?: { connection: string | null; platform: string | null; vertical: string | null }
  metric: MetricInfo
  /** Days covered, inclusive. Snapshot metrics: from = to = today (DSO/DPO: the trailing window). */
  range: { from: string; to: string }
  granularity: Granularity | null
  /** The currency filter applied; null = every currency, separately. */
  currency: string | null
  /** Currencies present in scope and range before the filter ([] for currency-free metrics). */
  currencies: string[]
  /** Headline for currency-free metrics (count, percent, days, index); null for money. */
  value: number | null
  /** `compare=1`: the same metric over the prior equal-length range. */
  previous?: {
    value: number | null
    totals?: MetricTotal[]
    range: { from: string; to: string }
  }
  /** Money headline, one per currency. */
  totals?: MetricTotal[]
  /** Money series ALWAYS carry `currency`; a series never mixes currencies. */
  series: MetricSeries[]
  /** Named numbers: p50, p90, hhi, top1_share, effective_n, numerator, denominator, … */
  kpis?: MetricKpi[]
  table?: MetricTable
  /**
   * Heatmap cells `[xIndex, yIndex, value]`. For a count or a sum every cell
   * is present (zero-filled); for an average a cell with no values is
   * omitted — no value, not zero.
   */
  matrix?: { x: string[]; y: string[]; cells: Array<[number, number, number]> }
  stats?: MetricStats[]
  /** Records carrying every `coverage` field, of those in scope and range. */
  coverage?: { eligible: number; total: number }
  thresholds?: MetricThresholds
  note?: string
  /**
   * True when the metric reads a financial field and this deployment masks
   * financial values (`data_access.mask_financial`): no values are returned.
   */
  masked: boolean
  generatedAt: string
}
