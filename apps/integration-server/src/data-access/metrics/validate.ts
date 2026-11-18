/**
 * Load-time check of the metric catalog against the field classification.
 *
 * A metric may only read fields that (a) exist on the resource's canonical
 * schema and (b) are neither `pii` nor `secret` — counting or grouping by a
 * personal field would publish it to every dashboard viewer. The class used
 * is `effectiveFieldClass`: the most restrictive of the path, its classified
 * ancestors and its classified descendants, the same rule that decides
 * whether a field may be searched.
 *
 * EVERY field a definition references is checked, wherever it sits: the date
 * field, filters, field comparisons, currency fields, measures, group /
 * split / matrix axes, lookup labels (on the lookup's own resource type),
 * duration endpoints, aging and histogram fields, coverage fields, and the
 * fields of every ratio part, composition component and DSO/DPO input
 * (on the resource type each one reads). `fieldRefs` in `definition.ts` is the
 * single walk both this check and financial masking use.
 *
 * It also rejects definitions the engine could not run honestly: a money sum
 * with no currency field, unnest on a non-count measure, a stacked chart with
 * nothing to stack, unsorted buckets, a ratio of money over counts.
 */
import {
  CHART_TYPES,
  GRANULARITIES,
  FIELD_COMPARE_OPS,
  METRIC_FILTER_OPS,
  METRIC_SECTIONS,
  effectiveFieldClass,
  isValidDataPath,
} from '@opensteward/shared'
import { getClassification, getResourceSchema, listableResources } from '../classification-registry'
import {
  fieldRefs,
  isMoneyMeasure,
  metricIsCurrencyAware,
  metricIsGranular,
  partsOf,
  type FieldRef,
} from './definition'
import { isCurrencyCodeField, isFinancialField } from './fields'
import type { GroupSpec, Measure, MetricFilter, Part, ResourceMetricDefinition } from './types'

export interface CatalogProblem {
  metricId: string
  message: string
}

const FORBIDDEN = new Set(['pii', 'secret'])
const CHARTS = new Set<string>(CHART_TYPES)
const FILTER_OPS = new Set<string>(METRIC_FILTER_OPS)
const COMPARE_OPS = new Set<string>(FIELD_COMPARE_OPS)
const SECTIONS = new Set<string>(METRIC_SECTIONS)
const LIST_OPS = new Set(['in', 'not_in', 'in_ci'])
const DAY_OPS = new Set(['older_than_days', 'within_last_days', 'within_next_days'])
const NO_VALUE_OPS = new Set(['is_null', 'not_null', 'before_now', 'after_now'])
const MAX_WINDOW_DAYS = 366

function ascending(xs: readonly number[] | undefined): boolean {
  return (
    Array.isArray(xs) &&
    xs.length > 0 &&
    xs.every((x) => typeof x === 'number' && Number.isFinite(x)) &&
    xs.every((x, i) => i === 0 || x > xs[i - 1]!)
  )
}

function filterProblem(f: MetricFilter): string | null {
  if (!FILTER_OPS.has(f.op)) return `unknown filter op '${String(f.op)}'`
  const v = f.value
  if (LIST_OPS.has(f.op)) {
    if (!Array.isArray(v) || v.length === 0) return `filter ${f.field} ${f.op} needs a list`
    return null
  }
  if (DAY_OPS.has(f.op)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
      return `filter ${f.field} ${f.op} needs a whole number of days`
    }
    return null
  }
  if (NO_VALUE_OPS.has(f.op))
    return v === undefined ? null : `filter ${f.field} ${f.op} takes no value`
  if (Array.isArray(v)) return `filter ${f.field} ${f.op} takes one value`
  if (f.op !== 'eq' && f.op !== 'ne' && typeof v !== 'number' && typeof v !== 'string') {
    return `filter ${f.field} ${f.op} needs a number or a string`
  }
  return null
}

export function catalogProblems(defs: readonly ResourceMetricDefinition[]): CatalogProblem[] {
  const problems: CatalogProblem[] = []
  const seen = new Set<string>()
  const listable = new Set(listableResources().map((r) => `${r.vertical}/${r.resourceType}`))
  for (const def of defs) {
    const fail = (message: string) => problems.push({ metricId: def.id, message })
    if (seen.has(def.id)) fail('duplicate metric id')
    seen.add(def.id)
    if (!def.id.startsWith(`${def.vertical}.`)) fail(`id must start with '${def.vertical}.'`)
    if (!SECTIONS.has(def.section)) fail(`unknown section '${String(def.section)}'`)
    if (!def.snapshot && !def.dateField) fail('a metric needs `dateField` unless it is a snapshot')

    structural(def, fail)

    // Every field, on the resource type it is read from.
    const refs = fieldRefs(def)
    const badTypes = new Set<string>()
    for (const ref of refs) {
      if (badTypes.has(ref.resourceType)) continue
      if (!listable.has(`${def.vertical}/${ref.resourceType}`)) {
        fail(`${def.vertical}/${ref.resourceType} is not a listable (synced) resource type`)
        badTypes.add(ref.resourceType)
        continue
      }
      const cls = getClassification(def.vertical, ref.resourceType)
      const schema = getResourceSchema(def.vertical, ref.resourceType)
      if (!cls || !schema) {
        fail(`${def.vertical}/${ref.resourceType} has no classification or schema`)
        badTypes.add(ref.resourceType)
        continue
      }
      if (typeof ref.path !== 'string' || !isValidDataPath(ref.path)) {
        fail(`${ref.role} '${String(ref.path)}' is not a plain dotted path`)
        continue
      }
      const top = ref.path.split('.')[0]!
      if (!Object.hasOwn(schema.shape, top)) {
        fail(`${ref.role} '${ref.path}' is not a field of the ${ref.resourceType} schema`)
      }
      const c = effectiveFieldClass(ref.path, cls)
      if (FORBIDDEN.has(c)) fail(`${ref.role} '${ref.path}' is classified ${c}`)
    }
    // The metric's own type is always read, even when no field ref names it.
    if (!badTypes.has(def.resourceType) && !listable.has(`${def.vertical}/${def.resourceType}`)) {
      fail(`${def.vertical}/${def.resourceType} is not a listable (synced) resource type`)
    }
    if (badTypes.size === 0) currencyRules(def, refs, fail)
  }
  return problems
}

/**
 * Design §2: money is never combined across currencies, so a financial
 * field may only be aggregated where its currency comes with it.
 *
 * - every `currencyField` (metric, measure, histogram, part, component) is a
 *   currency-code field (`isCurrencyCodeField`) — an amount named there would
 *   group money by amount and slip past masking;
 * - `avg` of a financial field needs a `currencyField`;
 * - `sum_quantity` of a financial field is refused (a sum of money is `sum`
 *   with its `currencyField`);
 * - a histogram of a financial field needs a `currencyField`;
 * - a group, split or matrix axis over a financial field is refused — bands
 *   would mix currencies, raw values would label amounts with no currency —
 *   unless the field is itself a currency code;
 * - in a currency-aware metric, a non-money part or component on another
 *   resource type needs its own `currencyField`, so the currency filter
 *   reaches it.
 */
function currencyRules(
  def: ResourceMetricDefinition,
  refs: readonly FieldRef[],
  fail: (m: string) => void,
): void {
  const v = def.vertical
  const valid = (p: unknown): p is string => typeof p === 'string' && isValidDataPath(p)
  const financial = (rt: string, p: string) => valid(p) && isFinancialField(v, rt, p)

  for (const ref of refs) {
    if (ref.role.endsWith('currencyField') && valid(ref.path)) {
      if (!isCurrencyCodeField(v, ref.resourceType, ref.path)) {
        fail(
          `${ref.role} '${ref.path}' is not a currency-code field (an ISO 4217 code, or a string named …currency / …currencyCode)`,
        )
      }
    }
  }
  const measure = (m: Measure, role: string, rt: string) => {
    if (m.op === 'avg' && !m.currencyField && financial(rt, m.field)) {
      fail(
        `${role}: an average of the financial field '${m.field}' needs \`currencyField\` (never average across currencies)`,
      )
    }
    if (m.op === 'sum_quantity' && financial(rt, m.field)) {
      fail(
        `${role}: sum_quantity of the financial field '${m.field}' would add currencies; use a sum with \`currencyField\``,
      )
    }
  }
  const group = (g: GroupSpec, role: string) => {
    if (!financial(def.resourceType, g.field)) return
    if (isCurrencyCodeField(v, def.resourceType, g.field)) return
    fail(
      g.bands
        ? `${role}: bands over a financial field mix currencies; use a histogram with \`currencyField\``
        : `${role}: grouping by a financial field shows amounts without their currency`,
    )
  }
  const aware = metricIsCurrencyAware(def)
  for (const { role, part } of partsOf(def)) {
    const rt = part.resourceType ?? def.resourceType
    measure(part.measure, `${role}.measure`, rt)
    if (aware && rt !== def.resourceType && !isMoneyMeasure(part.measure) && !part.currencyField) {
      fail(
        `${role}: reads ${rt}; a currency-aware metric needs \`currencyField\` on it so the currency filter applies`,
      )
    }
  }
  switch (def.kind) {
    case 'value':
    case 'aging':
      measure(def.measure, 'measure', def.resourceType)
      break
    case 'timeseries':
      measure(def.measure, 'measure', def.resourceType)
      if (def.splitBy) group(def.splitBy, 'splitBy')
      break
    case 'breakdown':
    case 'concentration':
      measure(def.measure, 'measure', def.resourceType)
      group(def.group, 'group')
      break
    case 'matrix':
      measure(def.measure, 'measure', def.resourceType)
      if (typeof def.x !== 'string') group(def.x, 'x')
      if (typeof def.y !== 'string') group(def.y, 'y')
      break
    case 'duration':
      if (def.group) group(def.group, 'group')
      break
    case 'histogram':
      if (!def.currencyField && financial(def.resourceType, def.field)) {
        fail(`histogram of the financial field '${def.field}' needs \`currencyField\``)
      }
      break
    default:
      break
  }
}

function structural(def: ResourceMetricDefinition, fail: (m: string) => void): void {
  for (const f of def.filters ?? []) {
    const p = filterProblem(f)
    if (p) fail(p)
  }
  for (const c of def.compare ?? []) {
    if (!COMPARE_OPS.has(c.op)) fail(`unknown comparison '${String(c.op)}'`)
  }
  if (def.charts !== undefined) {
    if (def.charts.length === 0) fail('`charts` may not be empty')
    for (const c of def.charts) if (!CHARTS.has(c)) fail(`unknown chart '${String(c)}'`)
    const stacked = def.charts.some((c) => c === 'stacked_bar' || c === 'stacked_area')
    if (stacked && !(def.kind === 'timeseries' && def.splitBy)) {
      fail('stacked charts need a timeseries `splitBy` (never stack currencies)')
    }
  }
  if (def.granularity !== undefined) {
    if (!(GRANULARITIES as readonly string[]).includes(def.granularity)) {
      fail(`\`granularity\` must be day, week or month`)
    } else if (!metricIsGranular(def)) {
      fail('`granularity` applies only to a series over time (timeseries, ratio overTime)')
    }
  }
  if (def.thresholds) {
    const t = def.thresholds
    if (!Number.isFinite(t.warn) || !Number.isFinite(t.crit)) fail('thresholds must be numbers')
    else if (
      t.direction === 'above' ? t.warn > t.crit : t.direction === 'below' ? t.warn < t.crit : true
    ) {
      fail('thresholds: warn must come before crit in the given direction')
    }
  }

  const measure = (m: Measure, role: string) => {
    if (!['count', 'sum', 'avg', 'sum_quantity'].includes(m.op)) {
      fail(`${role}: unknown measure '${String((m as { op: unknown }).op)}'`)
      return
    }
    if (m.op !== 'count' && !m.field) fail(`${role}: a ${m.op} measure needs \`field\``)
    if (m.op === 'sum' && !m.currencyField) fail(`${role}: a money sum needs \`currencyField\``)
  }
  const group = (g: GroupSpec, role: string, m: Measure | null) => {
    if (!g.field) fail(`${role} needs \`field\``)
    if (g.unnest && m && m.op !== 'count') fail(`${role}: unnest only counts (a sum would repeat)`)
    if (g.bands !== undefined && !ascending(g.bands)) fail(`${role}: bands must ascend`)
    if (g.bands && g.unnest) fail(`${role}: bands and unnest do not combine`)
    if (g.lookup && g.lookup.key !== 'id') fail(`${role}: lookup key must be 'id'`)
  }
  const part = (p: Part, role: string) => {
    measure(p.measure, `${role}.measure`)
    for (const f of p.filters ?? []) {
      const e = filterProblem(f)
      if (e) fail(`${role}: ${e}`)
    }
    for (const c of p.compare ?? []) {
      if (!COMPARE_OPS.has(c.op)) fail(`${role}: unknown comparison '${String(c.op)}'`)
    }
    if (!def.snapshot && !(p.dateField ?? def.dateField)) fail(`${role} needs a date field`)
  }

  switch (def.kind) {
    case 'value':
      measure(def.measure, 'measure')
      break
    case 'timeseries':
      measure(def.measure, 'measure')
      if (def.snapshot) fail('a timeseries cannot be a snapshot')
      if (def.splitBy) group(def.splitBy, 'splitBy', def.measure)
      break
    case 'breakdown':
      measure(def.measure, 'measure')
      group(def.group, 'group', def.measure)
      if (def.top !== undefined && !(Number.isInteger(def.top) && def.top > 0)) {
        fail('`top` must be a positive whole number')
      }
      break
    case 'concentration':
      measure(def.measure, 'measure')
      group(def.group, 'group', def.measure)
      if (def.group.bands) fail('concentration groups by an identity, not bands')
      if (def.topN && !def.topN.every((n) => Number.isInteger(n) && n > 0)) {
        fail('`topN` must be positive whole numbers')
      }
      break
    case 'ratio': {
      part(def.numerator, 'numerator')
      part(def.denominator, 'denominator')
      if (isMoneyMeasure(def.numerator.measure) !== isMoneyMeasure(def.denominator.measure)) {
        fail('a ratio divides money by money or counts by counts, never a mix')
      }
      if (def.overTime && def.snapshot) fail('a snapshot ratio has no time axis')
      break
    }
    case 'duration':
      if (!['days', 'hours'].includes(def.unit)) fail(`unknown duration unit '${String(def.unit)}'`)
      if (!ascending(def.buckets)) fail('duration buckets must ascend')
      if (def.group) {
        group(def.group, 'group', null)
        if (def.group.unnest || def.group.bands) fail('a duration group is a plain field')
      }
      if (def.headline && !['mean', 'p50', 'p90'].includes(def.headline)) {
        fail(`unknown headline '${String(def.headline)}'`)
      }
      break
    case 'aging':
      measure(def.measure, 'measure')
      if (!['past', 'future'].includes(def.direction)) fail('aging direction is past or future')
      if (!ascending(def.buckets) || !def.buckets.every((b) => Number.isInteger(b) && b >= 0)) {
        fail('aging buckets must be ascending whole days ≥ 0')
      }
      break
    case 'matrix': {
      measure(def.measure, 'measure')
      if (typeof def.x !== 'string') group(def.x, 'x', def.measure)
      else if (!['weekday', 'hour', 'month'].includes(def.x)) fail(`unknown matrix axis '${def.x}'`)
      if (typeof def.y !== 'string') group(def.y, 'y', def.measure)
      else if (!['weekday', 'hour'].includes(def.y)) fail(`unknown matrix axis '${def.y}'`)
      const unnests = [def.x, def.y].filter((a) => typeof a !== 'string' && a.unnest).length
      if (unnests > 1) fail('a matrix unnests at most one axis')
      const temporal = [def.x, def.y].some((a) => typeof a === 'string')
      if (temporal && !def.dateField) fail('a weekday / hour / month axis needs `dateField`')
      break
    }
    case 'histogram':
      if (!ascending(def.edges)) fail('histogram edges must ascend')
      break
    case 'composition': {
      if (def.components.length === 0) fail('a composition needs components')
      def.components.forEach((c, i) => {
        measure(c.measure, `components[${i}].measure`)
        if (c.sign !== 1 && c.sign !== -1) fail(`components[${i}].sign is 1 or -1`)
        if (!c.label) fail(`components[${i}] needs a label`)
        for (const f of c.filters ?? []) {
          const e = filterProblem(f)
          if (e) fail(`components[${i}]: ${e}`)
        }
        if (!def.snapshot && !(c.dateField ?? def.dateField)) {
          fail(`components[${i}] needs a date field`)
        }
      })
      const money = new Set(def.components.map((c) => isMoneyMeasure(c.measure)))
      if (money.size > 1) fail('a composition is all money or all counts')
      break
    }
    case 'dso':
    case 'dpo':
    case 'ccc':
      for (const { role, part: p } of partsOf(def)) {
        part(p as Part, role)
        if (p.measure.op !== 'sum') fail(`${role} is a money sum`)
        // The trailing window is anchored on the sales date even in a snapshot.
        if (role.endsWith('sales') && !(p.dateField ?? def.dateField)) {
          fail(`${role} needs a date field`)
        }
      }
      if (
        !Number.isInteger(def.windowDays) ||
        def.windowDays < 1 ||
        def.windowDays > MAX_WINDOW_DAYS
      ) {
        fail(`windowDays must be 1–${MAX_WINDOW_DAYS}`)
      }
      break
    default:
      fail(`unknown kind '${String((def as { kind: unknown }).kind)}'`)
  }
}

/** Throws when the catalog reads a field it must not. Called at module load. */
export function assertCatalogValid(defs: readonly ResourceMetricDefinition[]): void {
  const problems = catalogProblems(defs)
  if (problems.length > 0) {
    throw new Error(
      `Metric catalog is invalid:\n${problems.map((p) => `  ${p.metricId}: ${p.message}`).join('\n')}`,
    )
  }
}
