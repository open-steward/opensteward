/**
 * Native dashboards.
 *
 *   GET  /dashboards                   built-in, own and shared dashboards
 *   GET  /dashboards/new               create form            (dashboards:edit)
 *   POST /dashboards                   create / edit the draft (dashboards:edit)
 *   GET  /dashboards/:id               the dashboard, drawn by public/js/dashboard.js
 *                                      (?days | ?from&to, ?currency, and on a
 *                                      vertical dashboard ?platform&connection)
 *   GET  /dashboards/:id/connections   JSON: connections for the filter's datalist
 *                                      (?search&platform), for dashboard.js
 *   GET  /dashboards/:id/edit          edit form              (dashboards:edit, owner or admin)
 *   POST /dashboards/:id               save / edit the draft  (dashboards:edit)
 *   POST /dashboards/:id/delete        delete                 (dashboards:edit)
 *   GET  /dashboards/metric/:metricId  JSON: one metric's values, for dashboard.js
 *                                      (?from&to&dashboard&currency&granularity&compare
 *                                      &connection&platform)
 *
 * The browser never calls admin-api: dashboard.js fetches the same-origin
 * JSON route above, which proxies `GET /api/dashboards/metrics/:id` with the
 * session's token — so values are computed for the viewer's own scope.
 *
 * Currencies are never combined (there is no FX data). The view's currency
 * filter is a GET parameter validated against `/api/dashboards/currencies`;
 * a widget pinned to a currency ignores it, and with no filter each currency
 * is drawn separately (dashboard.js's small multiples).
 *
 * A vertical dashboard (a built-in's `vertical`, or a user dashboard whose
 * non-system widgets share one) has a connection / adapter filter for users
 * who hold `connections:read`: an adapter select and a text box with a
 * `<datalist>` of the connections admin-api lists for the caller (value = id,
 * text = label · adapter · id), so the browser's own suggestions match a
 * label or an id fragment with no script. On submit the server resolves the
 * text: an exact in-scope id applies; anything else is a search — one match
 * applies, several offer "Did you mean" links, none says so. Only resolved
 * ids are carried onward (presets, both forms, every widget, dashboard.js),
 * and the filter applies to every widget, system ones included: system
 * metrics are per connection too. Elsewhere the parameters are ignored.
 *
 * The edit form needs no script: widgets are posted as parallel lists, and the
 * Add / Remove / Up / Down buttons are submit buttons that re-render the draft
 * without saving. Only "Save" writes. Every row posts every list (a hidden
 * empty value where an option does not apply) so the lists stay aligned;
 * `w_compare` is a checkbox, so it posts the row's index instead.
 *
 * Every page is served with the strict CSP from `../csp.ts`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  CHART_TYPES,
  GRANULARITIES,
  METRIC_SECTIONS,
  type GranularityParam,
  type MetricSection,
} from '@opensteward/shared'
import { hasPermission, requirePermission } from '../auth/middleware'
import { useStrictCsp } from '../csp'
import { flashError, flashSuccess } from '../flash'
import type {
  AccessScopeRecord,
  AdminApiClient,
  DashboardAudienceRecord,
  DashboardChart,
  DashboardConnectionFilter,
  DashboardConnectionRecord,
  DashboardConnectionsQuery,
  DashboardConnectionsRecord,
  DashboardInput,
  DashboardRecord,
  DashboardWidgetRecord,
  MetricInfoRecord,
  MetricRangeQuery,
  TenantRecord,
} from '../proxy/admin-api-client'
import { VERTICAL_LABELS, isKnownVertical } from '../verticals'

const CHARTS: readonly DashboardChart[] = CHART_TYPES
export const MAX_WIDGETS = 24
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_RE = /^[A-Z]{3}$/
export const RANGE_PRESETS = [7, 30, 90, 365] as const
/** A connection id, as admin-api and integration-server accept one. */
export const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/
/** An adapter slug, likewise. */
export const PLATFORM_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
/** A vertical name, likewise: it keeps the filter inside the dashboard's vertical. */
export const VERTICAL_RE = /^[a-z][a-z-]{1,40}$/
/** Connections in the filter's datalist: admin-api's most per request. */
export const DATALIST_LIMIT = 200
/** "Did you mean" links shown for an ambiguous search. */
export const SUGGESTION_LIMIT = 10
/** Longest search text passed on (admin-api refuses longer). */
const SEARCH_MAX = 200

/** How each chart type reads in the editor's select. */
export const CHART_LABELS: Record<DashboardChart, string> = {
  number: 'Number',
  gauge: 'Gauge',
  table: 'Table',
  line: 'Line',
  area: 'Area',
  stacked_area: 'Stacked area',
  bar: 'Bar',
  hbar: 'Horizontal bar',
  stacked_bar: 'Stacked bar',
  combo: 'Bar and line',
  pareto: 'Pareto',
  pie: 'Pie',
  donut: 'Donut',
  rose: 'Rose',
  treemap: 'Treemap',
  funnel: 'Funnel',
  radar: 'Radar',
  histogram: 'Histogram',
  boxplot: 'Box plot',
  waterfall: 'Waterfall',
  heatmap: 'Heatmap',
  calendar: 'Calendar',
}

type Form = Record<string, string | string[] | undefined>

function list(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v
  return v === undefined ? [] : [v]
}

function one(v: string | string[] | undefined): string {
  const l = list(v)
  return (l[l.length - 1] ?? '').trim()
}

function apiError(err: unknown, fallback: string): string {
  const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return String((raw as { message: unknown }).message)
  }
  return fallback
}

/** Audience and pinned tenants from the sharing fieldsets (`_sharing.ejs`). */
export function sharingFromForm(body: Form): {
  audience: DashboardAudienceRecord
  pinnedTenants: string[] | null
} {
  const ids = (key: string) =>
    [
      ...new Set(
        list(body[key])
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ].sort()
  const kind = one(body['audience'])
  const audience: DashboardAudienceRecord =
    kind === 'everyone'
      ? { kind: 'everyone' }
      : kind === 'tenants'
        ? { kind: 'tenants', tenants: ids('audience_tenant') }
        : { kind: 'private' }
  const pins = ids('pin_tenant')
  return { audience, pinnedTenants: pins.length > 0 ? pins : null }
}

/**
 * Tenants to offer in the sharing form: the ones this user can list, plus any
 * already stored on the dashboard (a deleted tenant, or one an admin added),
 * so that saving never silently drops them.
 */
export function tenantChoices(
  tenants: TenantRecord[],
  ...keep: Array<readonly string[] | null | undefined>
): Array<{ id: string; name: string }> {
  const byId = new Map(tenants.map((t) => [t.id, t.name]))
  for (const ids of keep) for (const id of ids ?? []) if (!byId.has(id)) byId.set(id, id)
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export function audienceLabel(
  a: DashboardAudienceRecord,
  names: ReadonlyMap<string, string>,
): string {
  if (a.kind === 'private') return 'Only the owner'
  if (a.kind === 'everyone') return 'Everyone'
  return (a.tenants ?? []).map((t) => names.get(t) ?? t).join(', ')
}

/** "Data from: …" — viewer scope ∩ pins, in words. */
export function dataFromLabel(
  pinned: string[] | null,
  scope: AccessScopeRecord | undefined,
  names: ReadonlyMap<string, string>,
): string {
  const label = (ids: string[]) => ids.map((t) => names.get(t) ?? t).join(', ')
  const mine = scope?.mode === 'restricted' ? scope.grants.map((g) => g.tenantId) : null
  if (!pinned || pinned.length === 0) {
    if (!mine) return 'every tenant you can see'
    return mine.length > 0
      ? `your tenants (${label(mine)})`
      : 'no tenants (your access includes none)'
  }
  const shown = mine ? pinned.filter((t) => mine.includes(t)) : pinned
  return shown.length > 0 ? label(shown) : 'none of its tenants are in your access'
}

/**
 * Built-in dashboards in consecutive groups by vertical, as they arrive
 * (system first, then each vertical's together), labelled with the console's
 * own vertical names (`VERTICAL_LABELS`: CRM, Customer Support).
 */
export function groupBuiltins(
  builtin: DashboardRecord[],
): Array<{ key: string; label: string; rows: DashboardRecord[] }> {
  const groups: Array<{ key: string; label: string; rows: DashboardRecord[] }> = []
  for (const d of builtin) {
    const key = d.vertical ?? ''
    let g = groups[groups.length - 1]
    if (!g || g.key !== key) {
      const label = !key ? 'System' : isKnownVertical(key) ? VERTICAL_LABELS[key] : titleCase(key)
      g = { key, label, rows: [] }
      groups.push(g)
    }
    g.rows.push(d)
  }
  return groups
}

export function groupDashboards(custom: DashboardRecord[], userId: string) {
  const g = {
    mine: [] as DashboardRecord[],
    tenants: [] as DashboardRecord[],
    everyone: [] as DashboardRecord[],
    others: [] as DashboardRecord[],
  }
  for (const d of custom) {
    if (d.ownerUserId === userId) g.mine.push(d)
    else if (d.audience.kind === 'tenants') g.tenants.push(d)
    else if (d.audience.kind === 'everyone') g.everyone.push(d)
    else g.others.push(d) // someone else's private dashboard: only an admin is sent these
  }
  return g
}

/** The custom-dashboard groups, in the order the index and the switcher show them. */
export function customSections(
  g: ReturnType<typeof groupDashboards>,
): Array<{ label: string; rows: DashboardRecord[] }> {
  return [
    { label: 'Mine', rows: g.mine },
    { label: 'Shared with your tenants', rows: g.tenants },
    { label: 'Shared with everyone', rows: g.everyone },
    { label: 'Other users’ private dashboards', rows: g.others },
  ].filter((s) => s.rows.length > 0)
}

/**
 * The dashboard page's "Switch dashboard" menu: the custom groups first, as
 * the index lists them, then each built-in vertical.
 */
export function switcherGroups(
  list: DashboardRecord[],
  userId: string,
): Array<{ label: string; rows: DashboardRecord[] }> {
  return [
    ...customSections(
      groupDashboards(
        list.filter((d) => !d.builtin),
        userId,
      ),
    ),
    ...groupBuiltins(list.filter((d) => d.builtin)).map((g) => ({ label: g.label, rows: g.rows })),
  ]
}

/** The longest search the index takes; anything past it is dropped. */
const INDEX_SEARCH_MAX = 100

/**
 * The verticals a dashboard draws from, keyed as the index's chips are:
 * a built-in's own vertical (`system` for none), else every vertical its
 * charts read. A metric id leads with its vertical (`ecommerce.orders_per_day`,
 * `system.records_per_vertical`) — the metric catalog's validator refuses one
 * that does not — so a user's dashboard needs no catalog lookup.
 */
export function dashboardChipKeys(d: DashboardRecord): Set<string> {
  if (d.builtin) return new Set([d.vertical ?? 'system'])
  return new Set(d.widgets.map((w) => w.metricId.split('.')[0] ?? '').filter(Boolean))
}

/**
 * The index's filter, from `?q=&vertical=`: a case-insensitive match on name
 * or description, and one vertical chip. A vertical the page does not offer is
 * dropped rather than answered with an empty page.
 */
export function indexFilter(
  query: { q?: unknown; vertical?: unknown },
  offered: readonly string[],
): { q: string; vertical: string; active: boolean } {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, INDEX_SEARCH_MAX) : ''
  const v = typeof query.vertical === 'string' ? query.vertical : ''
  const vertical = offered.includes(v) ? v : ''
  return { q, vertical, active: q !== '' || vertical !== '' }
}

/** Whether the text a dashboard shows (name, description) contains `q`. */
export function matchesSearch(q: string, ...texts: Array<string | null | undefined>): boolean {
  if (!q) return true
  const needle = q.toLowerCase()
  return texts.some((t) => (t ?? '').toLowerCase().includes(needle))
}

/** A granularity a widget pins: `day`, `week` or `month`. `auto` (or none) is left unset. */
function pinnedGranularity(v: string | undefined): GranularityParam | undefined {
  return (GRANULARITIES as readonly string[]).includes(v ?? '')
    ? (v as GranularityParam)
    : undefined
}

/**
 * The draft a form post describes: fields plus widgets from parallel lists.
 *
 * `w_currency` and `w_granularity` are posted by every row (empty where the
 * option does not apply, or for "follow the dashboard" / "auto"), so they
 * line up with `w_metric`; `w_compare` is a checkbox and posts the indexes
 * of the rows that are ticked. An empty currency or `auto` granularity is
 * left out of the widget: absent means "follow the view" and "let the metric
 * decide", so a metric's own default granularity still applies.
 */
export function draftFromForm(body: Form): DashboardInput {
  const metrics = list(body['w_metric'])
  const charts = list(body['w_chart'])
  const widths = list(body['w_width'])
  const titles = list(body['w_title'])
  const currencies = list(body['w_currency'])
  const granularities = list(body['w_granularity'])
  const compared = new Set(list(body['w_compare']).map((v) => v.trim()))
  const widgets: DashboardWidgetRecord[] = metrics
    .map((metricId, i) => {
      const chart = (CHARTS as readonly string[]).includes(charts[i] ?? '')
        ? (charts[i] as DashboardChart)
        : 'bar'
      const n = Number(widths[i])
      const width =
        Number.isFinite(n) && widths[i] !== '' ? Math.min(12, Math.max(1, Math.round(n))) : 6
      const title = (titles[i] ?? '').trim()
      const currency = (currencies[i] ?? '').trim()
      const granularity = pinnedGranularity((granularities[i] ?? '').trim())
      const widget: DashboardWidgetRecord = {
        metricId: metricId.trim(),
        chart,
        width,
        ...(title ? { title } : {}),
      }
      if (CURRENCY_RE.test(currency)) widget.currency = currency
      if (granularity) widget.granularity = granularity
      if (compared.has(String(i))) widget.compare = true
      return widget
    })
    .filter((w) => w.metricId !== '')
  return {
    name: one(body['name']),
    description: one(body['description']) || null,
    ...sharingFromForm(body),
    widgets: widgets.slice(0, MAX_WIDGETS),
  }
}

/**
 * Apply an edit-form button (`add`, `remove:3`, `up:3`, `down:3`) to a draft.
 * Returns null for `save` (or anything unknown), which means "write it".
 *
 * A new widget draws its metric's default chart (the first of its `charts`),
 * follows the dashboard's currency filter, lets the metric pick its buckets
 * (`auto`), and compares with the previous period when the metric can.
 */
export function applyAction(
  draft: DashboardInput,
  action: string,
  addMetric: string,
  catalog: MetricInfoRecord[],
): DashboardInput | null {
  const widgets = [...draft.widgets]
  const [verb, idxRaw] = action.split(':')
  const i = Number(idxRaw)
  switch (verb) {
    case 'add': {
      const metric = catalog.find((m) => m.id === addMetric)
      if (metric && widgets.length < MAX_WIDGETS) {
        widgets.push({
          metricId: metric.id,
          chart: metric.charts[0] ?? 'table',
          width: 6,
          ...(metric.comparable ? { compare: true } : {}),
        })
      }
      break
    }
    case 'remove':
      if (Number.isInteger(i)) widgets.splice(i, 1)
      break
    case 'up':
      if (Number.isInteger(i) && i > 0 && i < widgets.length) {
        ;[widgets[i - 1], widgets[i]] = [widgets[i]!, widgets[i - 1]!]
      }
      break
    case 'down':
      if (Number.isInteger(i) && i >= 0 && i < widgets.length - 1) {
        ;[widgets[i + 1], widgets[i]] = [widgets[i]!, widgets[i + 1]!]
      }
      break
    default:
      return null
  }
  return { ...draft, widgets }
}

/**
 * A draft whose widgets each draw a chart their metric offers. A stored
 * widget may name a chart its metric no longer lists (the catalog changed
 * since it was saved); the editor resets it to the metric's default rather
 * than letting the save fail. Widgets whose metric is not in the catalog are
 * left alone — admin-api reports those by name.
 */
export function fitCharts(
  draft: DashboardInput,
  catalog: readonly MetricInfoRecord[],
): { draft: DashboardInput; reset: number[] } {
  const byId = new Map(catalog.map((m) => [m.id, m]))
  const reset: number[] = []
  const widgets = draft.widgets.map((w, i) => {
    const charts = byId.get(w.metricId)?.charts
    if (!charts || charts.length === 0 || charts.includes(w.chart)) return w
    reset.push(i)
    return { ...w, chart: charts[0]! }
  })
  return { draft: { ...draft, widgets }, reset }
}

/** A metric catalog grouped for the editor: by vertical, then section ("Accounting · Risk"). */
export function groupCatalog(
  catalog: readonly MetricInfoRecord[],
): Array<{ label: string; metrics: MetricInfoRecord[] }> {
  const sectionRank = (s: MetricSection) => {
    const i = (METRIC_SECTIONS as readonly string[]).indexOf(s)
    return i < 0 ? METRIC_SECTIONS.length : i
  }
  const verticalRank = (v: string | null) => {
    if (v === null) return Number.MAX_SAFE_INTEGER
    const i = Object.keys(VERTICAL_LABELS).indexOf(v)
    return i < 0 ? Object.keys(VERTICAL_LABELS).length : i
  }
  const verticalLabel = (v: string | null) =>
    v === null ? 'System' : isKnownVertical(v) ? VERTICAL_LABELS[v] : titleCase(v)
  const groups = new Map<
    string,
    { rank: [number, number]; label: string; metrics: MetricInfoRecord[] }
  >()
  for (const m of catalog) {
    const vertical = verticalLabel(m.vertical)
    const label =
      m.vertical === null && m.section === 'system'
        ? vertical
        : `${vertical} · ${titleCase(m.section ?? 'overview')}`
    const g = groups.get(label) ?? {
      rank: [verticalRank(m.vertical), sectionRank(m.section)] as [number, number],
      label,
      metrics: [],
    }
    g.metrics.push(m)
    groups.set(label, g)
  }
  return [...groups.values()]
    .sort(
      (a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.label.localeCompare(b.label),
    )
    .map(({ label, metrics }) => ({ label, metrics }))
}

function titleCase(s: string): string {
  const words = s.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Currencies to offer in the editor: the ones in the caller's scope, plus any
 * a widget is already pinned to (data may have gone, or come from a tenant
 * outside this editor's scope), so saving never silently drops a pin.
 */
export function currencyChoices(
  currencies: readonly string[],
  widgets: readonly DashboardWidgetRecord[],
): string[] {
  return isoCodes([...currencies, ...widgets.map((w) => w.currency)])
}

/**
 * Currency codes fit to offer: trimmed and upper-cased, ISO 4217 shape only,
 * de-duplicated and sorted — whatever admin-api (or a stored widget) held.
 */
export function isoCodes(values: readonly unknown[]): string[] {
  const out = new Set<string>()
  for (const v of values) {
    if (typeof v !== 'string') continue
    const code = v.trim().toUpperCase()
    if (CURRENCY_RE.test(code)) out.add(code)
  }
  return [...out].sort()
}

/**
 * `from`/`to` for the view: explicit days, or a preset length ending today,
 * plus the currency filter. An explicit range that is exactly a preset ending
 * today keeps that preset pressed (the filter form posts dates). A currency
 * not in `currencies` falls back to null: every currency, each separately.
 * `currencies: null` (the list could not be loaded) keeps any well-formed
 * code, so an outage does not silently widen the view to every currency.
 */
export function rangeFromQuery(
  q: Form,
  now = new Date(),
  currencies: readonly string[] | null = [],
): { from: string; to: string; days: number | null; currency: string | null } {
  const wanted = one(q['currency'])
  const currency = (currencies === null ? CURRENCY_RE.test(wanted) : currencies.includes(wanted))
    ? wanted
    : null
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const window = (days: number) => ({
    from: new Date(end.getTime() - (days - 1) * 86_400_000).toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  })
  const from = one(q['from'])
  const to = one(q['to'])
  if (DAY_RE.test(from) && DAY_RE.test(to) && from <= to) {
    const preset = RANGE_PRESETS.find((d) => {
      const w = window(d)
      return w.from === from && w.to === to
    })
    return { from, to, days: preset ?? null, currency }
  }
  const preset = Number(one(q['days']))
  const days = (RANGE_PRESETS as readonly number[]).includes(preset) ? preset : 30
  return { ...window(days), days, currency }
}

/**
 * The parameters a widget's metric request may carry, from the JSON route's
 * query: well-formed values only (admin-api would refuse anything else).
 * `auto` is not forwarded, so a metric's own default granularity applies.
 */
export function metricQuery(q: Form, canFilter = false): MetricRangeQuery {
  const currency = one(q['currency'])
  const granularity = pinnedGranularity(one(q['granularity']))
  const compare = one(q['compare'])
  // The connection / adapter filter is connection data: only for a caller
  // who holds connections:read (admin-api refuses it otherwise).
  const connection = canFilter ? one(q['connection']) : ''
  const platform = canFilter ? one(q['platform']) : ''
  const vertical = canFilter ? one(q['vertical']) : ''
  return {
    from: one(q['from']) || undefined,
    to: one(q['to']) || undefined,
    dashboard: one(q['dashboard']) || undefined,
    ...(CURRENCY_RE.test(currency) ? { currency } : {}),
    ...(granularity ? { granularity } : {}),
    ...(compare === '1' || compare === 'true' ? { compare: true } : {}),
    ...(CONNECTION_ID_RE.test(connection) ? { connection } : {}),
    ...(PLATFORM_SLUG_RE.test(platform) ? { platform } : {}),
    ...(VERTICAL_RE.test(vertical) ? { vertical } : {}),
  }
}

/** A metric id's vertical by its prefix: null for `system.*`, undefined when unknown. */
function verticalOfMetricId(id: string): string | null | undefined {
  const prefix = id.split('.')[0] ?? ''
  if (prefix === 'system') return null
  return isKnownVertical(prefix) ? prefix : undefined
}

/**
 * The vertical a dashboard is about, which decides whether it gets a
 * connection / adapter filter: a built-in's own `vertical`; otherwise the one
 * vertical every non-system widget's metric shares (from the catalog, or the
 * metric id when the viewer's catalog lacks it). Null for the system
 * overview, an empty dashboard, a mixed one, or one with a metric whose
 * vertical cannot be told.
 */
export function dashboardVertical(
  dashboard: Pick<DashboardRecord, 'vertical' | 'widgets'>,
  catalog: readonly Pick<MetricInfoRecord, 'id' | 'vertical'>[],
): string | null {
  if (dashboard.vertical) return dashboard.vertical
  const byId = new Map(catalog.map((m) => [m.id, m.vertical]))
  const seen = new Set<string>()
  for (const w of dashboard.widgets) {
    const v = byId.has(w.metricId) ? byId.get(w.metricId)! : verticalOfMetricId(w.metricId)
    if (v === undefined) return null
    if (v !== null) seen.add(v)
  }
  return seen.size === 1 ? [...seen][0]! : null
}

/** The view's state, as its links and forms carry it. */
export interface ViewParams {
  days: number | null
  from: string
  to: string
  currency: string | null
  platform: string | null
  connection: string | null
}

/** A link to the dashboard view with `p`: the range (a preset or dates), currency and filter. */
export function viewHref(base: string, p: ViewParams): string {
  const q: string[] = []
  const add = (k: string, v: string | null | undefined) => {
    if (v) q.push(`${k}=${encodeURIComponent(v)}`)
  }
  if (p.days !== null) add('days', String(p.days))
  else {
    add('from', p.from)
    add('to', p.to)
  }
  add('currency', p.currency)
  add('platform', p.platform)
  add('connection', p.connection)
  return q.length > 0 ? `${base}?${q.join('&')}` : base
}

/** One connection as the filter shows it. */
export interface FilterConnection {
  id: string
  /** `label · adapter · id`, what the datalist and "Did you mean" show. */
  text: string
  /** `label · adapter` (the id when unlabelled), what the chip shows. */
  chip: string
}

/** Everything the connection / adapter filter bar renders. */
export interface ConnectionFilterView {
  vertical: string
  /** The adapters to offer, with counts (null when the list is unavailable). */
  platforms: Array<{ slug: string; name: string; count: number | null }>
  /** The applied adapter, or null for all. */
  platform: string | null
  /** The datalist: the vertical's connections (of `platform`, when one is applied). */
  options: FilterConnection[]
  /** Connections that matched before the datalist's cap. */
  optionsTotal: number
  /** What the text box shows: the applied id, or the text that did not resolve. */
  input: string
  /** The applied connection. */
  connection: FilterConnection | null
  /** An ambiguous search's matches ("Did you mean"), at most SUGGESTION_LIMIT. */
  suggestions: FilterConnection[]
  /** How many more matched than are suggested. */
  suggestionsMore: number
  /** A search that matched nothing. */
  notFound: string | null
  /** admin-api could not list connections: well-formed values were kept as given. */
  unavailable: boolean
}

function filterConnection(
  c: DashboardConnectionRecord,
  names: ReadonlyMap<string, string>,
): FilterConnection {
  const adapter = names.get(c.platform) ?? c.platform
  const label = c.label?.trim() || null
  return {
    id: c.id,
    text: [label, adapter, c.id].filter(Boolean).join(' · '),
    chip: `${label ?? c.id} · ${adapter}`,
  }
}

function isConnectionsRecord(v: unknown): v is DashboardConnectionsRecord {
  const r = v as DashboardConnectionsRecord | null
  return !!r && Array.isArray(r.connections) && Array.isArray(r.platforms)
}

/**
 * Resolve the filter a view was asked for. `list` is admin-api's connection
 * list (null when it cannot be had). The adapter must be one the list offers,
 * else every adapter; the connection text resolves as: an exact in-scope id
 * applies; otherwise a search over ids and labels — one match applies,
 * several are suggestions, none is `notFound`. When the list is unavailable a
 * well-formed adapter and id are kept as given, so an outage narrows rather
 * than silently widening the view.
 */
export async function resolveConnectionFilter(
  vertical: string,
  q: Form,
  list: (query: Omit<DashboardConnectionsQuery, 'dashboard' | 'vertical'>) => Promise<unknown>,
): Promise<ConnectionFilterView> {
  const wantedPlatform = one(q['platform'])
  const platformOk = PLATFORM_SLUG_RE.test(wantedPlatform)
  const wanted = one(q['connection']).slice(0, SEARCH_MAX)
  const view: ConnectionFilterView = {
    vertical,
    platforms: [],
    platform: null,
    options: [],
    optionsTotal: 0,
    input: wanted,
    connection: null,
    suggestions: [],
    suggestionsMore: 0,
    notFound: null,
    unavailable: false,
  }
  const tryList = async (query: Omit<DashboardConnectionsQuery, 'dashboard' | 'vertical'>) => {
    try {
      const r = await list(query)
      return isConnectionsRecord(r) ? r : null
    } catch {
      return null
    }
  }
  const unavailable = (): ConnectionFilterView => ({
    ...view,
    unavailable: true,
    // Still offer the adapter being viewed, so the select reads true and can be cleared.
    platforms: platformOk ? [{ slug: wantedPlatform, name: wantedPlatform, count: null }] : [],
    platform: platformOk ? wantedPlatform : null,
    connection: CONNECTION_ID_RE.test(wanted) ? { id: wanted, text: wanted, chip: wanted } : null,
  })

  let listed = await tryList({
    ...(platformOk ? { platform: wantedPlatform } : {}),
    limit: DATALIST_LIMIT,
  })
  if (!listed) return unavailable()
  view.platforms = listed.platforms
  if (platformOk && listed.platforms.some((p) => p.slug === wantedPlatform)) {
    view.platform = wantedPlatform
  } else if (platformOk) {
    // An adapter the list does not offer: every adapter, so list them all.
    listed = await tryList({ limit: DATALIST_LIMIT })
    if (!listed) return { ...unavailable(), platforms: [], platform: null }
  }
  const names = new Map(view.platforms.map((p) => [p.slug, p.name]))
  view.options = listed.connections.map((c) => filterConnection(c, names))
  view.optionsTotal = listed.total
  if (!wanted) return view

  const inList = listed.connections.find((c) => c.id === wanted)
  if (inList) {
    view.connection = filterConnection(inList, names)
    view.input = inList.id
    return view
  }
  const found = await tryList({
    ...(view.platform ? { platform: view.platform } : {}),
    search: wanted,
    limit: SUGGESTION_LIMIT,
  })
  if (!found) return unavailable()
  const exact = found.connections.find((c) => c.id.toLowerCase() === wanted.toLowerCase())
  const single = found.total === 1 && found.connections.length === 1 ? found.connections[0] : null
  const hit = exact ?? single
  if (hit) {
    view.connection = filterConnection(hit, names)
    view.input = hit.id
  } else if (found.connections.length > 0) {
    view.suggestions = found.connections.map((c) => filterConnection(c, names))
    view.suggestionsMore = Math.max(0, found.total - found.connections.length)
  } else {
    view.notFound = wanted
  }
  return view
}

export function createDashboardsRoutes(apiClient: AdminApiClient) {
  return async function dashboardsRoutes(fastify: FastifyInstance): Promise<void> {
    useStrictCsp(fastify)
    fastify.addHook('preHandler', requirePermission('dashboards:view'))

    function notFound(request: FastifyRequest, reply: FastifyReply) {
      return reply.status(404).view('error.ejs', {
        user: request.sessionUser,
        status: 404,
        message: 'No such dashboard, or it is not shared with you.',
        requestId: null,
      })
    }

    /**
     * The currencies in the caller's scope (narrowed to a dashboard's pins),
     * or null when admin-api could not say — the page still renders, and
     * says the list is unavailable rather than offering none.
     */
    async function currenciesFor(
      request: FastifyRequest,
      dashboardId?: string,
      filter: DashboardConnectionFilter = {},
    ): Promise<string[] | null> {
      try {
        return isoCodes(
          await apiClient.listDashboardCurrencies(request.sessionUser!.token, dashboardId, filter),
        )
      } catch (err) {
        request.log.warn({ err }, 'dashboard currencies unavailable')
        return null
      }
    }

    async function renderEdit(
      request: FastifyRequest,
      reply: FastifyReply,
      dashboard: DashboardRecord | null,
      input: DashboardInput,
      error: string | null = null,
    ) {
      const catalog = await apiClient.listDashboardMetrics(request.sessionUser!.token)
      const tenants = await apiClient.listTenants(request.sessionUser!.token)
      const currencies = await currenciesFor(request)
      const { draft, reset } = fitCharts(input, catalog)
      return reply.status(error ? 400 : 200).view('dashboards/edit.ejs', {
        user: request.sessionUser,
        dashboard,
        draft,
        catalog,
        catalogGroups: groupCatalog(catalog),
        currencies: currencyChoices(currencies ?? [], draft.widgets),
        currenciesUnavailable: currencies === null,
        chartLabels: CHART_LABELS,
        resetCharts: reset,
        tenantChoices: tenantChoices(
          tenants,
          draft.audience.kind === 'tenants' ? draft.audience.tenants : null,
          draft.pinnedTenants,
        ),
        canShareAll:
          hasPermission(request.sessionUser, 'dashboards:share_all') &&
          request.sessionUser?.scope?.mode !== 'restricted',
        charts: CHARTS,
        maxWidgets: MAX_WIDGETS,
        error,
        title: dashboard ? `Edit ${dashboard.name}` : 'New dashboard',
      })
    }

    /** Handle a post from the edit form: a draft action, or a save. */
    async function handlePost(
      request: FastifyRequest<{ Body: Form }>,
      reply: FastifyReply,
      existing: DashboardRecord | null,
    ) {
      const body = request.body ?? {}
      const draft = draftFromForm(body)
      const action = one(body['action']) || 'save'
      if (action !== 'save') {
        const catalog = await apiClient.listDashboardMetrics(request.sessionUser!.token)
        const next = applyAction(draft, action, one(body['add_metric']), catalog)
        if (next) return renderEdit(request, reply, existing, next)
      }
      if (!draft.name)
        return renderEdit(request, reply, existing, draft, 'Give the dashboard a name.')
      try {
        const token = request.sessionUser!.token
        const saved = existing
          ? await apiClient.updateDashboard(token, existing.id, draft)
          : await apiClient.createDashboard(token, draft)
        flashSuccess(reply, existing ? 'Dashboard saved.' : `Dashboard "${saved.name}" created.`)
        return reply.redirect(`/dashboards/${encodeURIComponent(saved.id)}`)
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status === 400) {
          return renderEdit(
            request,
            reply,
            existing,
            draft,
            apiError(err, 'The dashboard is not valid.'),
          )
        }
        throw err
      }
    }

    fastify.get<{ Querystring: { q?: string; vertical?: string } }>(
      '/dashboards',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const dashboards = await apiClient.listDashboards(token)
        const tenants = await apiClient.listTenants(token)
        const builtin = dashboards.filter((d) => d.builtin)
        const custom = dashboards.filter((d) => !d.builtin)
        // One chip per built-in group, from the unfiltered list, so the chips
        // never move as the filter narrows what is shown.
        const chips = groupBuiltins(builtin).map((g) => ({
          key: g.key || 'system',
          label: g.label,
        }))
        const filter = indexFilter(
          request.query ?? {},
          chips.map((c) => c.key),
        )
        const shown = (d: DashboardRecord) =>
          matchesSearch(filter.q, d.name, d.description) &&
          (!filter.vertical || dashboardChipKeys(d).has(filter.vertical))
        // Embedded Superset (optional): listed only when admin-api has it on.
        // Best-effort — a Superset outage must not take the native list down.
        const superset = await apiClient.getSupersetStatus(token)
        const supersetAll = superset?.enabled
          ? await apiClient.listSupersetDashboards(token).catch(() => [])
          : null
        const supersetDashboards =
          supersetAll?.filter(
            (d) =>
              matchesSearch(filter.q, d.title, d.description) &&
              (!filter.vertical || (d.verticals ?? []).includes(filter.vertical)),
          ) ?? null
        const sections = customSections(
          groupDashboards(custom.filter(shown), request.sessionUser!.id),
        )
        const builtinGroups = groupBuiltins(builtin.filter(shown))
        return reply.view('dashboards/index.ejs', {
          user: request.sessionUser,
          builtinGroups,
          custom,
          sections,
          chips,
          filter,
          /** `/dashboards` with the filter, `over` replacing parts of it. */
          indexHref: (over: { q?: string; vertical?: string }) => {
            const p = new URLSearchParams()
            const vertical = over.vertical ?? filter.vertical
            const q = over.q ?? filter.q
            if (vertical) p.set('vertical', vertical)
            if (q) p.set('q', q)
            const s = p.toString()
            return s ? `/dashboards?${s}` : '/dashboards'
          },
          // Superset is set aside: with no match there, its own empty state
          // ("none available to you") would read as untrue.
          nothingMatches:
            filter.active &&
            sections.length === 0 &&
            builtinGroups.length === 0 &&
            (supersetDashboards?.length ?? 0) === 0,
          tenantNames: new Map(tenants.map((t) => [t.id, t.name])),
          audienceLabel,
          canEdit: hasPermission(request.sessionUser, 'dashboards:edit'),
          supersetDashboards,
        })
      },
    )

    /**
     * The dashboard page's "Switch dashboard" menu submits here: a GET form
     * cannot put the chosen id in the path. The id is always encoded into one
     * path segment, so the redirect cannot leave `/dashboards/`.
     */
    fastify.get<{ Querystring: { id?: string } }>('/dashboards/open', async (request, reply) => {
      const id = typeof request.query?.id === 'string' ? request.query.id.trim() : ''
      return reply.redirect(id ? '/dashboards/' + encodeURIComponent(id) : '/dashboards')
    })

    fastify.get(
      '/dashboards/new',
      { preHandler: requirePermission('dashboards:edit') },
      async (request, reply) =>
        renderEdit(request, reply, null, {
          name: '',
          description: null,
          audience: { kind: 'private' },
          pinnedTenants: null,
          widgets: [],
        }),
    )

    fastify.post<{ Body: Form }>(
      '/dashboards',
      { preHandler: requirePermission('dashboards:edit') },
      async (request, reply) => handlePost(request, reply, null),
    )

    fastify.get<{ Params: { metricId: string }; Querystring: Form }>(
      '/dashboards/metric/:metricId',
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store')
        try {
          const data = await apiClient.getDashboardMetric(
            request.sessionUser!.token,
            request.params.metricId,
            metricQuery(
              request.query ?? {},
              hasPermission(request.sessionUser, 'connections:read'),
            ),
          )
          return reply.send({ data })
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status
          const raw = (err as { response?: { data?: { error?: unknown } } })?.response?.data?.error
          const code =
            raw && typeof raw === 'object' && 'code' in raw
              ? String((raw as { code: unknown }).code)
              : null
          return reply
            .status(status && status >= 400 && status < 600 ? status : 502)
            .send({ error: { code, message: apiError(err, 'The metric could not be loaded.') } })
        }
      },
    )

    /**
     * The datalist's options for a search, for dashboard.js when the page
     * could not list every connection. The vertical is the dashboard's own,
     * worked out as the view does (a `vertical` in the query is ignored);
     * a dashboard the caller cannot see, or one with no single vertical,
     * offers nothing (404). admin-api scopes the list and applies the pins;
     * this only shapes it into `{ value: id, text: label · adapter · id }`.
     */
    fastify.get<{ Params: { id: string }; Querystring: Form }>(
      '/dashboards/:id/connections',
      { preHandler: requirePermission('connections:read') },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store')
        const token = request.sessionUser!.token
        const q = request.query ?? {}
        const platform = one(q['platform'])
        const search = one(q['search']).slice(0, SEARCH_MAX)
        const nothing = () =>
          reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'This dashboard has no connection filter.' },
          })
        try {
          const dashboard = await apiClient.getDashboard(token, request.params.id)
          if (!dashboard) return nothing()
          const vertical = dashboardVertical(dashboard, await apiClient.listDashboardMetrics(token))
          if (!vertical) return nothing()
          const r = await apiClient.getDashboardConnections(token, {
            dashboard: dashboard.id,
            vertical,
            ...(PLATFORM_SLUG_RE.test(platform) ? { platform } : {}),
            ...(search ? { search } : {}),
            limit: DATALIST_LIMIT,
          })
          if (!isConnectionsRecord(r)) throw new Error('unexpected connection list')
          const names = new Map(r.platforms.map((p) => [p.slug, p.name]))
          return reply.send({
            data: {
              options: r.connections.map((c) => {
                const f = filterConnection(c, names)
                return { value: f.id, text: f.text }
              }),
              total: r.total,
            },
          })
        } catch (err) {
          const status = (err as { response?: { status?: number } })?.response?.status
          return reply.status(status && status >= 400 && status < 600 ? status : 502).send({
            error: { code: null, message: apiError(err, 'The connections could not be loaded.') },
          })
        }
      },
    )

    fastify.get<{ Params: { id: string }; Querystring: Form }>(
      '/dashboards/:id',
      async (request, reply) => {
        const dashboard = await apiClient.getDashboard(
          request.sessionUser!.token,
          request.params.id,
        )
        if (!dashboard) return notFound(request, reply)
        const token = request.sessionUser!.token
        const query = request.query ?? {}
        const catalog = await apiClient.listDashboardMetrics(token)
        const tenants = await apiClient.listTenants(token)
        // For the "Switch dashboard" menu. Best-effort: without the list the
        // page renders without the menu, never not at all.
        const everyDashboard = await apiClient.listDashboards(token).catch(() => null)
        // The connection / adapter filter: vertical dashboards, connections:read only.
        const vertical = dashboardVertical(dashboard, catalog)
        const filter =
          vertical && hasPermission(request.sessionUser, 'connections:read')
            ? await resolveConnectionFilter(vertical, query, (q) =>
                apiClient.getDashboardConnections(token, {
                  dashboard: dashboard.id,
                  vertical,
                  ...q,
                }),
              )
            : null
        if (filter?.unavailable) request.log.warn('dashboard connection list unavailable')
        // The dashboard's vertical travels with an applied filter: one adapter
        // slug can exist in several verticals, and system widgets read them all.
        const applied: DashboardConnectionFilter = {
          ...(filter?.connection ? { connection: filter.connection.id } : {}),
          ...(filter?.platform ? { platform: filter.platform } : {}),
          ...(filter && (filter.connection || filter.platform)
            ? { vertical: filter.vertical }
            : {}),
        }
        const currencies = await currenciesFor(request, dashboard.id, applied)
        const names = new Map(tenants.map((t) => [t.id, t.name]))
        const range = rangeFromQuery(query, new Date(), currencies)
        const base = '/dashboards/' + encodeURIComponent(dashboard.id)
        const state: ViewParams = {
          days: range.days,
          from: range.from,
          to: range.to,
          currency: range.currency,
          platform: applied.platform ?? null,
          connection: applied.connection ?? null,
        }
        return reply.view('dashboards/view.ejs', {
          user: request.sessionUser,
          dashboard,
          metrics: Object.fromEntries(catalog.map((m) => [m.id, m])),
          dataFrom: dataFromLabel(dashboard.pinnedTenants, request.sessionUser!.scope, names),
          audienceText: audienceLabel(dashboard.audience, names),
          range,
          filter,
          applied: {
            connection: state.connection ?? '',
            platform: state.platform ?? '',
            vertical: applied.vertical ?? '',
          },
          link: (over: Partial<ViewParams> = {}) => viewHref(base, { ...state, ...over }),
          // The list failed: still offer the currency being viewed, so the
          // select reads true and the filter can be cleared.
          currencies: currencies ?? (range.currency ? [range.currency] : []),
          currenciesUnavailable: currencies === null,
          presets: RANGE_PRESETS,
          switcher: everyDashboard ? switcherGroups(everyDashboard, request.sessionUser!.id) : null,
          canEdit: dashboard.editable && hasPermission(request.sessionUser, 'dashboards:edit'),
          title: dashboard.name,
        })
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/dashboards/:id/edit',
      { preHandler: requirePermission('dashboards:edit') },
      async (request, reply) => {
        const dashboard = await apiClient.getDashboard(
          request.sessionUser!.token,
          request.params.id,
        )
        if (!dashboard) return notFound(request, reply)
        if (!dashboard.editable) {
          return reply.status(403).view('error.ejs', {
            user: request.sessionUser,
            status: 403,
            message: dashboard.builtin
              ? 'Built-in dashboards cannot be edited. Create your own from the dashboards page.'
              : 'Only the owner or an admin can edit this dashboard.',
            requestId: null,
          })
        }
        return renderEdit(request, reply, dashboard, {
          name: dashboard.name,
          description: dashboard.description,
          audience: dashboard.audience,
          pinnedTenants: dashboard.pinnedTenants,
          widgets: dashboard.widgets,
        })
      },
    )

    fastify.post<{ Params: { id: string }; Body: Form }>(
      '/dashboards/:id',
      { preHandler: requirePermission('dashboards:edit') },
      async (request, reply) => {
        const dashboard = await apiClient.getDashboard(
          request.sessionUser!.token,
          request.params.id,
        )
        if (!dashboard) return notFound(request, reply)
        return handlePost(request, reply, dashboard)
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/dashboards/:id/delete',
      { preHandler: requirePermission('dashboards:edit') },
      async (request, reply) => {
        try {
          await apiClient.deleteDashboard(request.sessionUser!.token, request.params.id)
          flashSuccess(reply, 'Dashboard deleted.')
          return reply.redirect('/dashboards')
        } catch (err) {
          flashError(reply, apiError(err, 'Failed to delete the dashboard.'))
          return reply.redirect(`/dashboards/${encodeURIComponent(request.params.id)}`)
        }
      },
    )
  }
}
