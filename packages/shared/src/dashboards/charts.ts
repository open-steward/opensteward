/**
 * The dashboard vocabulary shared by integration-server (which says what each
 * metric can be drawn as) and admin-api (which stores a widget's chart choice
 * and checks it against the metric). One list, so the two cannot drift: a
 * chart type admin-api accepts is always one the engine may offer.
 */

/**
 * Every chart a widget can use. A metric's `charts` (in its catalog info) is a
 * subset of these, first entry the default.
 *
 * - `number`, `gauge` — one headline value (`gauge` colours by thresholds)
 * - `table` — rows of the result
 * - `line`, `area`, `bar`, `hbar` — series over buckets or categories
 * - `stacked_area`, `stacked_bar` — `splitBy` series inside ONE currency
 * - `combo` — bars and lines in one chart, per each series' `kind`
 * - `pareto` — bars sorted descending plus a cumulative-share line
 * - `pie`, `donut`, `rose`, `treemap`, `funnel`, `radar` — parts of a whole
 * - `histogram`, `boxplot` — distributions (`boxplot` reads `stats`)
 * - `waterfall` — a composition's signed components and net
 * - `heatmap` — a `matrix` result; `calendar` — a day series as a calendar
 */
export const CHART_TYPES = [
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
] as const
export type ChartType = (typeof CHART_TYPES)[number]

/** What a metric's numbers are. `percent` is 0–100, not 0–1. */
export const METRIC_UNITS = [
  'count',
  'money',
  'percent',
  'days',
  'hours',
  'index',
  'quantity',
] as const
export type MetricUnit = (typeof METRIC_UNITS)[number]

/** Time buckets of a series. ISO week `YYYY-Www`, month `YYYY-MM`, day `YYYY-MM-DD`. */
export const GRANULARITIES = ['day', 'week', 'month'] as const
export type Granularity = (typeof GRANULARITIES)[number]

/** What a widget may ask for: a granularity, or `auto` (≤ 62 days day, ≤ 182 week, else month). */
export const GRANULARITY_PARAMS = ['auto', ...GRANULARITIES] as const
export type GranularityParam = (typeof GRANULARITY_PARAMS)[number]

/** Where a metric sits inside its vertical, for grouping in the editor. */
export const METRIC_SECTIONS = [
  'overview',
  'sales',
  'receivables',
  'payables',
  'cash',
  'tax',
  'profitability',
  'customers',
  'products',
  'fulfillment',
  'subscriptions',
  'pipeline',
  'performance',
  'activity',
  'workload',
  'quality',
  'speed',
  'satisfaction',
  'delivery',
  'cost',
  'stock',
  'purchasing',
  'risk',
  'system',
] as const
export type MetricSection = (typeof METRIC_SECTIONS)[number]

/** The shape of a metric's result — see integration-server `data-access/metrics/types.ts`. */
export const METRIC_KINDS = [
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
  'ccc',
  'table',
] as const
export type MetricKind = (typeof METRIC_KINDS)[number]
