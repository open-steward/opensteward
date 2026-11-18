/**
 * Facts derived from a metric definition, shared by the validator, the
 * engine and the catalog route: which fields it reads (for the PII check and
 * financial masking), whether it is money, its unit, and the charts that fit.
 */
import type {
  ChartType,
  CompositionComponent,
  GroupSpec,
  Measure,
  MetricInfo,
  MetricUnit,
  Part,
  ResourceMetricDefinition,
  SystemMetricDefinition,
} from './types'

export function isMoneyMeasure(m: Measure): boolean {
  return m.op === 'sum' || (m.op === 'avg' && m.currencyField !== undefined)
}

export function measureCurrencyField(m: Measure): string | undefined {
  return m.op === 'sum' || m.op === 'avg' ? m.currencyField : undefined
}

export function measureField(m: Measure): string | undefined {
  return m.op === 'count' ? undefined : m.field
}

/** The measures a definition aggregates (none for duration / histogram). */
export function measuresOf(def: ResourceMetricDefinition): Measure[] {
  switch (def.kind) {
    case 'value':
    case 'timeseries':
    case 'breakdown':
    case 'aging':
    case 'concentration':
    case 'matrix':
      return [def.measure]
    case 'ratio':
      return [def.numerator.measure, def.denominator.measure]
    case 'composition':
      return def.components.map((c) => c.measure)
    case 'dso':
    case 'dpo':
      return [def.balance.measure, def.sales.measure]
    case 'ccc':
      return partsOf(def).map((p) => p.part.measure)
    case 'duration':
    case 'histogram':
      return []
  }
}

/**
 * The ratio parts, DSO/DPO inputs and composition components of a
 * definition, with the role name the validator reports them under.
 */
export function partsOf(
  def: ResourceMetricDefinition,
): Array<{ role: string; part: Part | CompositionComponent }> {
  switch (def.kind) {
    case 'ratio':
      return [
        { role: 'numerator', part: def.numerator },
        { role: 'denominator', part: def.denominator },
      ]
    case 'dso':
    case 'dpo':
      return [
        { role: 'balance', part: def.balance },
        { role: 'sales', part: def.sales },
      ]
    case 'ccc':
      return [
        { role: 'dso.balance', part: def.dso.balance },
        { role: 'dso.sales', part: def.dso.sales },
        { role: 'dpo.balance', part: def.dpo.balance },
        { role: 'dpo.sales', part: def.dpo.sales },
      ]
    case 'composition':
      return def.components.map((c, i) => ({ role: `components[${i}]`, part: c }))
    default:
      return []
  }
}

/** Values are money, one set per currency. */
export function metricIsMoney(def: ResourceMetricDefinition): boolean {
  if (def.kind === 'histogram') return def.currencyField !== undefined
  return measuresOf(def).some(isMoneyMeasure)
}

/** The `currency` parameter changes the result. */
export function metricIsCurrencyAware(def: ResourceMetricDefinition): boolean {
  return (
    metricIsMoney(def) ||
    def.currencyField !== undefined ||
    partsOf(def).some((p) => p.part.currencyField !== undefined)
  )
}

export function metricUnit(def: ResourceMetricDefinition): MetricUnit {
  switch (def.kind) {
    case 'ratio':
    case 'concentration':
      return 'percent'
    case 'duration':
      return def.unit
    case 'dso':
    case 'dpo':
    case 'ccc':
      return 'days'
    case 'histogram':
      return 'count'
    default: {
      const m = measuresOf(def)[0]!
      if (m.op === 'count') return 'count'
      if (isMoneyMeasure(m)) return 'money'
      return def.unit ?? (m.op === 'sum_quantity' ? 'quantity' : 'index')
    }
  }
}

/** Kinds with a series over time — the `granularity` parameter applies. */
export function metricIsGranular(def: ResourceMetricDefinition): boolean {
  if (def.snapshot) return false
  return def.kind === 'timeseries' || (def.kind === 'ratio' && def.overTime === true)
}

/** Kinds whose headline has a meaningful prior period. */
export function metricIsComparable(def: ResourceMetricDefinition): boolean {
  if (def.snapshot) return false
  return (
    def.kind === 'value' ||
    def.kind === 'timeseries' ||
    def.kind === 'breakdown' ||
    def.kind === 'ratio' ||
    def.kind === 'duration'
  )
}

/** One field a definition reads, and the resource type it is read on. */
export interface FieldRef {
  role: string
  resourceType: string
  path: string
}

function partRefs(def: ResourceMetricDefinition, role: string, p: Part, out: FieldRef[]): void {
  const rt = p.resourceType ?? def.resourceType
  const dateField = p.dateField ?? def.dateField
  if (dateField) out.push({ role: `${role}.dateField`, resourceType: rt, path: dateField })
  p.filters?.forEach((f, i) =>
    out.push({ role: `${role}.filters[${i}]`, resourceType: rt, path: f.field }),
  )
  p.compare?.forEach((c, i) => {
    out.push({ role: `${role}.compare[${i}].left`, resourceType: rt, path: c.left })
    out.push({ role: `${role}.compare[${i}].right`, resourceType: rt, path: c.right })
  })
  if (p.currencyField) {
    out.push({ role: `${role}.currencyField`, resourceType: rt, path: p.currencyField })
  }
  measureRefs(`${role}.measure`, rt, p.measure, out)
}

function measureRefs(role: string, rt: string, m: Measure, out: FieldRef[]): void {
  const field = measureField(m)
  if (field) out.push({ role: `${role}.field`, resourceType: rt, path: field })
  const cur = measureCurrencyField(m)
  if (cur) out.push({ role: `${role}.currencyField`, resourceType: rt, path: cur })
}

function groupRefs(role: string, rt: string, g: GroupSpec, out: FieldRef[]): void {
  out.push({ role: `${role}.field`, resourceType: rt, path: g.field })
  if (g.lookup) {
    out.push({
      role: `${role}.lookup.label`,
      resourceType: g.lookup.resourceType,
      path: g.lookup.label,
    })
  }
}

/** Every field a definition reads, on every resource type it reads. */
export function fieldRefs(def: ResourceMetricDefinition): FieldRef[] {
  const rt = def.resourceType
  const out: FieldRef[] = []
  if (def.dateField) out.push({ role: 'dateField', resourceType: rt, path: def.dateField })
  def.filters?.forEach((f, i) =>
    out.push({ role: `filters[${i}]`, resourceType: rt, path: f.field }),
  )
  def.compare?.forEach((c, i) => {
    out.push({ role: `compare[${i}].left`, resourceType: rt, path: c.left })
    out.push({ role: `compare[${i}].right`, resourceType: rt, path: c.right })
  })
  if (def.currencyField)
    out.push({ role: 'currencyField', resourceType: rt, path: def.currencyField })
  def.coverage?.forEach((p, i) => out.push({ role: `coverage[${i}]`, resourceType: rt, path: p }))
  switch (def.kind) {
    case 'value':
      measureRefs('measure', rt, def.measure, out)
      break
    case 'timeseries':
      measureRefs('measure', rt, def.measure, out)
      if (def.splitBy) groupRefs('splitBy', rt, def.splitBy, out)
      break
    case 'breakdown':
    case 'concentration':
      measureRefs('measure', rt, def.measure, out)
      groupRefs('group', rt, def.group, out)
      break
    case 'ratio':
      partRefs(def, 'numerator', def.numerator, out)
      partRefs(def, 'denominator', def.denominator, out)
      break
    case 'duration':
      out.push({ role: 'from', resourceType: rt, path: def.from })
      if (def.to !== 'now') out.push({ role: 'to', resourceType: rt, path: def.to })
      if (def.group) groupRefs('group', rt, def.group, out)
      break
    case 'aging':
      out.push({ role: 'field', resourceType: rt, path: def.field })
      measureRefs('measure', rt, def.measure, out)
      break
    case 'matrix':
      measureRefs('measure', rt, def.measure, out)
      if (typeof def.x !== 'string') groupRefs('x', rt, def.x, out)
      if (typeof def.y !== 'string') groupRefs('y', rt, def.y, out)
      break
    case 'histogram':
      out.push({ role: 'field', resourceType: rt, path: def.field })
      if (def.currencyField) {
        out.push({ role: 'currencyField', resourceType: rt, path: def.currencyField })
      }
      break
    case 'composition':
      def.components.forEach((c, i) => {
        const crt = c.resourceType ?? rt
        const dateField = c.dateField ?? def.dateField
        const role = `components[${i}]`
        if (dateField) out.push({ role: `${role}.dateField`, resourceType: crt, path: dateField })
        c.filters?.forEach((f, j) =>
          out.push({ role: `${role}.filters[${j}]`, resourceType: crt, path: f.field }),
        )
        if (c.currencyField) {
          out.push({ role: `${role}.currencyField`, resourceType: crt, path: c.currencyField })
        }
        measureRefs(`${role}.measure`, crt, c.measure, out)
      })
      break
    case 'dso':
    case 'dpo':
    case 'ccc':
      for (const { role, part } of partsOf(def)) partRefs(def, role, part as Part, out)
      break
  }
  return out
}

/** Resource types a definition aggregates — all must be in scope to run it. Lookups excluded. */
export function resourceTypesOf(def: ResourceMetricDefinition): string[] {
  const set = new Set([def.resourceType])
  for (const { part } of partsOf(def)) if (part.resourceType) set.add(part.resourceType)
  return [...set]
}

/** (resource type, currency path) pairs a definition reads — for `/currencies`. */
export function currencyPathsOf(
  def: ResourceMetricDefinition,
): Array<{ resourceType: string; path: string }> {
  const out: Array<{ resourceType: string; path: string }> = []
  const add = (resourceType: string, path: string | undefined) => {
    if (path && !out.some((o) => o.resourceType === resourceType && o.path === path)) {
      out.push({ resourceType, path })
    }
  }
  add(def.resourceType, def.currencyField)
  for (const { part } of partsOf(def)) {
    const rt = part.resourceType ?? def.resourceType
    add(rt, measureCurrencyField(part.measure))
    add(rt, part.currencyField)
  }
  switch (def.kind) {
    case 'ratio':
    case 'dso':
    case 'dpo':
    case 'ccc':
    case 'composition':
      break
    case 'histogram':
      add(def.resourceType, def.currencyField)
      break
    case 'duration':
      break
    default:
      add(def.resourceType, measureCurrencyField(def.measure))
  }
  return out
}

/** Radar needs a small, known set of axes. */
const RADAR_MAX_GROUPS = 8

/** The charts that fit a definition when it does not name its own. */
export function defaultCharts(def: ResourceMetricDefinition): ChartType[] {
  switch (def.kind) {
    case 'value':
      // A money value is one total per currency: bars side by side, one per
      // currency (never a shared axis for amounts — the renderer draws small
      // multiples). v1's `sum` offered `bar`, so stored widgets use it.
      return metricIsMoney(def) ? ['number', 'bar', 'table'] : ['number', 'table']
    case 'timeseries': {
      const charts: ChartType[] = ['line', 'area', 'bar']
      if (def.measure.op === 'count') charts.push('calendar')
      charts.push('table', 'number')
      if (def.splitBy) charts.push('stacked_bar', 'stacked_area')
      return charts
    }
    case 'breakdown': {
      const charts: ChartType[] = ['bar', 'hbar', 'donut', 'pie', 'rose', 'treemap', 'pareto']
      if (def.group.order) charts.push('funnel')
      const groups =
        def.group.order?.length ??
        (def.group.bands ? def.group.bands.length + 1 : undefined) ??
        def.top
      if (groups !== undefined && groups <= RADAR_MAX_GROUPS) charts.push('radar')
      // `number` is the total; v1's `group_count` offered it.
      charts.push('table', 'number')
      return charts
    }
    case 'ratio':
      return def.overTime ? ['gauge', 'number', 'line', 'table'] : ['gauge', 'number', 'table']
    case 'duration':
      return def.group
        ? ['number', 'histogram', 'boxplot', 'table']
        : ['number', 'histogram', 'table']
    case 'aging':
      return ['bar', 'hbar', 'donut', 'table']
    case 'concentration':
      return ['gauge', 'pareto', 'treemap', 'hbar', 'donut', 'table', 'number']
    case 'matrix':
      return ['heatmap', 'table']
    case 'histogram':
      return ['histogram', 'table']
    case 'composition':
      return ['waterfall', 'table']
    case 'dso':
    case 'dpo':
    case 'ccc':
      return ['number', 'gauge', 'table']
  }
}

export function resourceMetricInfo(def: ResourceMetricDefinition): MetricInfo {
  const info: MetricInfo = {
    id: def.id,
    title: def.title,
    description: def.description,
    kind: def.kind,
    unit: metricUnit(def),
    section: def.section,
    vertical: def.vertical,
    resourceType: def.resourceType,
    charts: def.charts ?? defaultCharts(def),
    money: metricIsMoney(def),
    currencyAware: metricIsCurrencyAware(def),
    snapshot: def.snapshot === true,
    granular: metricIsGranular(def),
    comparable: metricIsComparable(def),
  }
  if (def.granularity) info.defaultGranularity = def.granularity
  if (def.thresholds) info.thresholds = def.thresholds
  if (def.note) info.note = def.note
  return info
}

const SYSTEM_CHARTS: Record<SystemMetricDefinition['kind'], ChartType[]> = {
  breakdown: ['bar', 'hbar', 'donut', 'pie', 'treemap', 'pareto', 'table', 'number'],
  timeseries: ['line', 'area', 'bar', 'stacked_bar', 'stacked_area', 'table', 'number'],
  table: ['table'],
  ratio: ['gauge', 'number', 'line', 'table'],
  duration: ['number', 'histogram', 'boxplot', 'table'],
}

export function systemMetricInfo(def: SystemMetricDefinition): MetricInfo {
  const info: MetricInfo = {
    id: def.id,
    title: def.title,
    description: def.description,
    kind: def.kind,
    unit: def.unit ?? 'count',
    section: 'system',
    vertical: null,
    resourceType: null,
    charts: def.charts ?? SYSTEM_CHARTS[def.kind],
    money: false,
    currencyAware: false,
    snapshot: def.snapshot ?? def.kind !== 'timeseries',
    granular: def.granular ?? def.kind === 'timeseries',
    comparable: false,
  }
  if (def.thresholds) info.thresholds = def.thresholds
  if (def.note) info.note = def.note
  return info
}
