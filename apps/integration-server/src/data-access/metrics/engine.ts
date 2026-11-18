/**
 * Runs catalog metrics for a caller scope.
 *
 * Scope-filtered the same way as the record viewer: the connections a metric
 * aggregates over are the ones `connectionsInScope` returns (owner tenant
 * re-checked against the credential store), narrowed to the metric's
 * vertical. Every resource type a metric aggregates (its own, and those of
 * ratio parts, composition components and DSO/DPO inputs) must be in scope,
 * or the metric does not exist for the caller. A `lookup` label is read from
 * the same in-scope connections only, and falls back to the id. A connection
 * outside the scope never contributes a row or a label, so a restricted
 * operator's dashboard reads as if the other tenants did not exist.
 *
 * A dashboard's connection / adapter filter (`connection`, `platform`) only
 * ever NARROWS that list: it is applied after `connectionsInScope`, to every
 * read a metric makes (parts, components, lookup labels, system metrics) and
 * to the currency list. A connection outside the scope is simply absent, so
 * it yields no data — never a 404, which would confirm that it exists.
 *
 * Results are cached for 60 s per (metric, scope, filter, range, currency,
 * granularity, compare, today): a dashboard of a dozen widgets refreshed by
 * several operators must not become a dozen aggregate scans each time. The
 * scope is part of the key, so two operators with different scopes never
 * share an entry; "today" is, because now-relative filters move with it.
 */
import {
  effectiveFieldClass,
  type ConnectionRow,
  type CredentialStore,
  type ResourceStore,
  type SyncJob,
  type SyncStore,
} from '@opensteward/shared'
import { UNCLASSIFIED, getClassification } from '../classification-registry'
import {
  HttpError,
  connectionsInScope,
  typeInScope,
  verticalInScope,
  type DataScope,
} from '../scope'
import { RESOURCE_METRICS, SYSTEM_METRICS } from './catalog'
import {
  STALE_AFTER_HOURS,
  SYNC_ERROR_CLASSES,
  SYNC_ERROR_OTHER,
  TOKEN_EXPIRY_DAYS,
  classifySyncError,
} from './catalog/system'
import {
  currencyPathsOf,
  fieldRefs,
  metricIsComparable,
  metricIsCurrencyAware,
  metricIsGranular,
  resourceMetricInfo,
  resourceTypesOf,
  systemMetricInfo,
} from './definition'
import { isCurrencyCodeField } from './fields'
import { normaliseCurrency, runCoverage, runKind, type KindContext } from './kinds'
import { bandIndex, bandLabels, percentile, round, summarize } from './stats'
import {
  DAY_MS,
  bucketOf,
  bucketsFor,
  dayString,
  isGranularityParam,
  parseRange,
  previousRange,
  resolveGranularity,
  type MetricRange,
} from './time'
import type {
  GranularityParam,
  MetricInfo,
  MetricResult,
  ResourceMetricDefinition,
  SystemMetricDefinition,
} from './types'
import { assertCatalogValid } from './validate'

export {
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_DAYS,
  parseRange,
  resolveGranularity,
  type MetricRange,
} from './time'
export { GROUP_TOP_N } from './kinds'

// Fail at boot, not on the first dashboard render, if the catalog reads a
// field it may not.
assertCatalogValid(RESOURCE_METRICS)

export const METRIC_CACHE_TTL_MS = 60_000
const CACHE_MAX_ENTRIES = 1_000
const CURRENCY_RE = /^[A-Z]{3}$/
/** A connection id as the credential store mints them (UUIDs), and no wider. */
export const CONNECTION_ID_RE = /^[A-Za-z0-9_-]{1,100}$/
/** An adapter slug. */
export const PLATFORM_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
/** A vertical name, which keeps a filter inside the dashboard's vertical. */
export const VERTICAL_RE = /^[a-z][a-z-]{1,40}$/

/**
 * A dashboard's connection / adapter filter. Both only narrow the connections
 * the scope allows; together they mean AND.
 */
export interface ConnectionFilter {
  /** One connection id. */
  connection?: string | null
  /** One adapter slug. */
  platform?: string | null
  /**
   * The dashboard's vertical. With `connection` or `platform` it keeps the
   * filter inside that vertical: one slug can be an adapter in several
   * verticals, and system metrics read every vertical. Alone it filters
   * nothing.
   */
  vertical?: string | null
}

/** The filter as validated: null for "not set" (`vertical` too when nothing else is set). */
interface CheckedFilter {
  connection: string | null
  platform: string | null
  vertical: string | null
}

/**
 * 400 `INVALID_QUERY` for a malformed value (a repeated query parameter
 * arrives as an array, and is malformed too); an empty string means "not set".
 */
export function checkFilter(f: ConnectionFilter = {}): CheckedFilter {
  const read = (v: unknown): string | null =>
    v === undefined || v === null || v === '' ? null : typeof v === 'string' ? v : '\0'
  const connection = read(f.connection)
  const platform = read(f.platform)
  if (connection !== null && !CONNECTION_ID_RE.test(connection)) {
    throw new HttpError(
      400,
      'INVALID_QUERY',
      '`connection` must be a connection id: 1–100 letters, digits, `_` or `-`.',
    )
  }
  if (platform !== null && !PLATFORM_SLUG_RE.test(platform)) {
    throw new HttpError(
      400,
      'INVALID_QUERY',
      '`platform` must be an adapter slug: lower-case letters, digits and `-`.',
    )
  }
  const vertical = read(f.vertical)
  if (vertical !== null && !VERTICAL_RE.test(vertical)) {
    throw new HttpError(
      400,
      'INVALID_QUERY',
      '`vertical` must be a vertical name: lower-case letters and `-`.',
    )
  }
  // A vertical narrows only a connection / adapter filter; alone it is not one.
  const any = connection !== null || platform !== null
  return { connection, platform, vertical: any ? vertical : null }
}

const isFiltered = (f: CheckedFilter) => f.connection !== null || f.platform !== null

/** What a caller may ask of one metric (the route's query parameters). */
export interface RunParams {
  from?: string
  to?: string
  /** ISO 4217 code; money kinds keep only it, counts with a `currencyField` count only it. */
  currency?: string | null
  granularity?: string
  /** Add `previous`: the same metric over the prior equal-length range. */
  compare?: boolean
  /** Only this connection (and only when the scope already allows it). */
  connection?: string | null
  /** Only connections of this adapter. */
  platform?: string | null
  /** With `connection` or `platform`: only connections of this vertical. */
  vertical?: string | null
}

function scopeKey(scope: DataScope): string {
  return JSON.stringify({
    t: scope.tenants === '*' ? '*' : [...scope.tenants].sort(),
    tv: scope.tenantVerticals ?? null,
    v: scope.verticals ?? null,
    m: scope.maskFinancial === true,
  })
}

function zeroFilled(buckets: readonly string[], values: Map<string, number>) {
  return buckets.map((x) => ({ x, y: values.get(x) ?? 0 }))
}

/**
 * Whether any field the metric reads, on any resource type, is `financial`:
 * measures, filters, comparisons, groups, histogram and duration fields,
 * parts and components alike. A VERIFIED currency-code field in a
 * `currencyField` slot is the one exception — a code is not an amount, and
 * `totalPrice.currency` is only `financial` by inheritance from `totalPrice`
 * — so a plain count with a `currencyField` stays visible. "Verified" is the
 * schema type (`isCurrencyCodeField`), never the slot name: an amount named
 * as a currency field is masked like any other amount.
 */
export function isFinancial(def: ResourceMetricDefinition): boolean {
  return fieldRefs(def).some(
    (ref) =>
      !(
        ref.role.endsWith('currencyField') &&
        isCurrencyCodeField(def.vertical, ref.resourceType, ref.path)
      ) &&
      effectiveFieldClass(
        ref.path,
        getClassification(def.vertical, ref.resourceType) ?? UNCLASSIFIED,
      ) === 'financial',
  )
}

export interface MetricsEngineOptions {
  credentialStore: CredentialStore
  resourceStore?: ResourceStore
  syncStore?: SyncStore
  ttlMs?: number
  now?: () => Date
  /**
   * The resource metrics to serve (default: the catalog). Validated exactly
   * like the catalog — for tests of definitions that are not (yet) in it.
   */
  resourceMetrics?: readonly ResourceMetricDefinition[]
  /** Row cap of the raw-value reads behind durations (tests; default `FETCH_VALUES_CAP`). */
  valuesCap?: number
}

export interface MetricsEngine {
  catalog(scope: DataScope): MetricInfo[]
  run(id: string, scope: DataScope, params?: RunParams): Promise<MetricResult>
  /**
   * Distinct currencies across the in-scope money / currency fields, sorted;
   * narrowed to a connection and / or adapter when `filter` names one.
   */
  currencies(scope: DataScope, filter?: ConnectionFilter): Promise<string[]>
  /** Drop every cached result (tests). */
  clear(): void
}

export function createMetricsEngine(opts: MetricsEngineOptions): MetricsEngine {
  const ttl = opts.ttlMs ?? METRIC_CACHE_TTL_MS
  const now = opts.now ?? (() => new Date())
  const cache = new Map<string, { expiresAt: number; result: unknown }>()
  const metrics = opts.resourceMetrics ?? RESOURCE_METRICS
  if (opts.resourceMetrics) assertCatalogValid(opts.resourceMetrics)
  const resourceById = new Map(metrics.map((d) => [d.id, d]))
  const systemById = new Map(SYSTEM_METRICS.map((d) => [d.id as string, d]))
  const financial = new Set(metrics.filter(isFinancial).map((d) => d.id))

  async function cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const t = Date.now()
    const hit = cache.get(key)
    if (hit && hit.expiresAt > t) return hit.result as T
    const result = await compute()
    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    cache.set(key, { expiresAt: t + ttl, result })
    return result
  }

  function requireStore(): ResourceStore {
    if (!opts.resourceStore) {
      throw new HttpError(
        409,
        'DATA_STORE_DISABLED',
        'The data store is off (DATA_STORE_MODE=passthrough); there is nothing stored to chart.',
      )
    }
    return opts.resourceStore
  }

  function visible(def: ResourceMetricDefinition, scope: DataScope): boolean {
    return (
      verticalInScope(scope, def.vertical) &&
      resourceTypesOf(def).every((rt) => typeInScope(scope, def.vertical, rt))
    )
  }

  function catalog(scope: DataScope): MetricInfo[] {
    return [
      ...SYSTEM_METRICS.map(systemMetricInfo),
      ...metrics.filter((d) => visible(d, scope)).map(resourceMetricInfo),
    ]
  }

  /** The connections the scope allows, narrowed by the dashboard's filter. */
  async function scopedConnections(
    scope: DataScope,
    filter: CheckedFilter,
  ): Promise<ConnectionRow[]> {
    const rows = await connectionsInScope(opts.credentialStore, scope)
    if (!isFiltered(filter)) return rows
    return rows.filter(
      (c) =>
        (filter.connection === null || c.id === filter.connection) &&
        (filter.platform === null || c.platform === filter.platform) &&
        (filter.vertical === null || c.vertical === filter.vertical),
    )
  }

  /** A result's common fields; `filter` is echoed only when one is applied. */
  function base(
    info: MetricInfo,
    range: { from: string; to: string },
    filter: CheckedFilter,
    extra: Partial<MetricResult> = {},
  ): MetricResult {
    return {
      ...(isFiltered(filter)
        ? {
            filter: {
              connection: filter.connection,
              platform: filter.platform,
              vertical: filter.vertical,
            },
          }
        : {}),
      metric: info,
      range: { from: range.from, to: range.to },
      granularity: null,
      currency: null,
      currencies: [],
      value: null,
      series: [],
      masked: false,
      generatedAt: now().toISOString(),
      ...extra,
    }
  }

  async function runResource(
    def: ResourceMetricDefinition,
    scope: DataScope,
    range: MetricRange,
    params: {
      currency: string | null
      granularity?: GranularityParam
      compare: boolean
      filter: CheckedFilter
    },
    nowDate: Date,
  ): Promise<MetricResult> {
    const store = requireStore()
    const info = resourceMetricInfo(def)
    const today = dayString(nowDate.getTime())
    const evaluated: MetricRange = def.snapshot ? { from: today, to: today, days: [today] } : range
    // An explicit day / week / month wins; `auto` or none takes the
    // definition's default, else follows the range.
    const asked =
      params.granularity && params.granularity !== 'auto'
        ? params.granularity
        : (def.granularity ?? params.granularity)
    const granularity = metricIsGranular(def) ? resolveGranularity(asked, range) : null
    const currency = metricIsCurrencyAware(def) ? params.currency : null
    const result = base(info, evaluated, params.filter, { granularity, currency })
    if (def.thresholds) result.thresholds = def.thresholds
    if (def.note) result.note = def.note
    if (financial.has(def.id) && scope.maskFinancial === true) {
      result.masked = true
      if (info.money) result.totals = []
      return result
    }

    const connIds = (await scopedConnections(scope, params.filter))
      .filter((c) => c.vertical === def.vertical)
      .map((c) => c.id)
    const ctx: KindContext = {
      store,
      def,
      connIds,
      lookupConnIds: (rt) => (typeInScope(scope, def.vertical, rt) ? connIds : []),
      range: evaluated,
      granularity,
      currency,
      now: nowDate,
      today,
      valuesCap: opts.valuesCap,
    }
    const out = await runKind(ctx)
    result.value = out.value
    result.series = out.series
    result.currencies = out.currencies
    if (out.totals) result.totals = out.totals
    if (out.kpis) result.kpis = out.kpis
    if (out.table) result.table = out.table
    if (out.matrix) result.matrix = out.matrix
    if (out.stats) result.stats = out.stats
    if (out.range) result.range = out.range
    if (out.note) result.note = [def.note, out.note].filter(Boolean).join(' ')

    if (params.compare && metricIsComparable(def)) {
      const prev = previousRange(range)
      const p = await runKind({ ...ctx, range: prev })
      result.previous = {
        value: p.value,
        ...(p.totals ? { totals: p.totals } : {}),
        range: { from: prev.from, to: prev.to },
      }
    }
    if (def.coverage?.length) result.coverage = await runCoverage(ctx, def.coverage)
    return result
  }

  /** Jobs read per pass over the sync table before the result is marked truncated. */
  const SYNC_JOB_CAP = 5_000
  /** Connections walked one by one when the scope is restricted. */
  const SYNC_CONN_CAP = 500
  const SYNC_PAGE = 200

  /**
   * Sync jobs created in the range, for the connections the scope may see.
   * An unrestricted scope reads the table once; a restricted one reads each
   * in-scope connection's jobs, so another tenant's rows are never fetched,
   * let alone counted. Newest first, stopping at the range start.
   */
  async function syncJobsIn(
    scope: DataScope,
    conns: ConnectionRow[],
    range: MetricRange,
    filter: CheckedFilter,
  ): Promise<{ jobs: SyncJob[]; truncated: boolean }> {
    const syncStore = opts.syncStore
    if (!syncStore) {
      throw new HttpError(
        409,
        'DATA_STORE_DISABLED',
        'The data store is off (DATA_STORE_MODE=passthrough); there is no sync history.',
      )
    }
    const fromMs = Date.parse(`${range.from}T00:00:00Z`)
    const toMs = Date.parse(`${range.to}T00:00:00Z`) + DAY_MS
    // A connection / adapter filter reads like a restricted scope: one pass
    // per narrowed connection, so no other connection's jobs are fetched.
    const unrestricted =
      scope.tenants === '*' && !scope.verticals && !scope.tenantVerticals && !isFiltered(filter)
    const passes: Array<{ connectionId?: string }> = unrestricted
      ? [{}]
      : conns.slice(0, SYNC_CONN_CAP).map((c) => ({ connectionId: c.id }))
    const allowed = new Set(conns.map((c) => c.id))
    const jobs: SyncJob[] = []
    let truncated = !unrestricted && conns.length > SYNC_CONN_CAP
    for (const pass of passes) {
      let kept = 0
      let done = false
      for (let offset = 0; !done; offset += SYNC_PAGE) {
        const page = await syncStore.list({ ...pass, limit: SYNC_PAGE, offset })
        for (const j of page) {
          const t = Date.parse(j.createdAt)
          if (t >= toMs) continue
          if (t < fromMs) {
            done = true
            break
          }
          if (!unrestricted && !allowed.has(j.connectionId)) continue
          jobs.push(j)
          kept++
        }
        if (page.length < SYNC_PAGE) done = true
        if (kept >= SYNC_JOB_CAP) {
          truncated = truncated || !done
          done = true
        }
      }
    }
    return { jobs, truncated }
  }

  const TRUNCATED_NOTE = `Based on the newest ${SYNC_JOB_CAP} jobs per pass; older jobs in the range are not counted.`

  async function runSystem(
    def: SystemMetricDefinition,
    scope: DataScope,
    range: MetricRange,
    granularityParam: GranularityParam | undefined,
    filter: CheckedFilter,
    nowDate: Date,
  ): Promise<MetricResult> {
    const info = systemMetricInfo(def)
    const conns = await scopedConnections(scope, filter)
    const inScope = new Map(conns.map((c) => [c.id, c]))

    if (def.id === 'system.sync_outcomes_per_day') {
      if (!opts.syncStore) {
        throw new HttpError(
          409,
          'DATA_STORE_DISABLED',
          'The data store is off (DATA_STORE_MODE=passthrough); there is no sync history.',
        )
      }
      const granularity = resolveGranularity(granularityParam, range)
      const result = base(info, range, filter, { granularity })
      const unrestricted = scope.tenants === '*' && !scope.verticals && !isFiltered(filter)
      const rows = await opts.syncStore.outcomesByDay({
        connectionIds: unrestricted ? null : conns.map((c) => c.id),
        fromMs: Date.parse(`${range.from}T00:00:00Z`),
        toMs: Date.parse(`${range.to}T00:00:00Z`) + DAY_MS,
      })
      const byStatus = new Map<string, Map<string, number>>()
      for (const r of rows) {
        const m = byStatus.get(r.status) ?? new Map<string, number>()
        const b = bucketOf(r.day, granularity)
        m.set(b, (m.get(b) ?? 0) + r.count)
        byStatus.set(r.status, m)
      }
      const buckets = bucketsFor(range, granularity)
      result.series = [...byStatus.keys()]
        .sort()
        .map((status) => ({ name: status, points: zeroFilled(buckets, byStatus.get(status)!) }))
      result.value = rows.reduce((n, r) => n + r.count, 0)
      return result
    }

    const nowMs = nowDate.getTime()

    // ── Sync history (jobs created in the range, in-scope connections only) ──
    if (
      def.id === 'system.sync_success_rate' ||
      def.id === 'system.sync_failures_by_platform' ||
      def.id === 'system.sync_duration' ||
      def.id === 'system.sync_error_types'
    ) {
      const { jobs, truncated } = await syncJobsIn(scope, conns, range, filter)
      const granularity =
        def.id === 'system.sync_success_rate' ? resolveGranularity(granularityParam, range) : null
      const result = base(info, range, filter, { granularity })
      if (def.thresholds) result.thresholds = def.thresholds
      if (truncated) result.note = TRUNCATED_NOTE

      if (def.id === 'system.sync_success_rate') {
        const g = granularity!
        const buckets = bucketsFor(range, g)
        const cells = new Map<string, { ok: number; failed: number }>()
        for (const j of jobs) {
          if (j.status !== 'completed' && j.status !== 'failed') continue
          const b = bucketOf(j.createdAt.slice(0, 10), g)
          const c = cells.get(b) ?? { ok: 0, failed: 0 }
          if (j.status === 'completed') c.ok++
          else c.failed++
          cells.set(b, c)
        }
        const pct = (c: { ok: number; failed: number } | undefined) =>
          c && c.ok + c.failed > 0 ? round((c.ok / (c.ok + c.failed)) * 100, 2) : null
        let ok = 0
        let failed = 0
        for (const c of cells.values()) {
          ok += c.ok
          failed += c.failed
        }
        result.value = pct({ ok, failed })
        result.series = [
          { name: 'Success rate', points: buckets.map((x) => ({ x, y: pct(cells.get(x)) })) },
        ]
        result.kpis = [
          { key: 'ratio', label: def.title, value: result.value, unit: 'percent' },
          { key: 'numerator', label: 'Completed', value: ok, unit: 'count' },
          { key: 'denominator', label: 'Completed or failed', value: ok + failed, unit: 'count' },
        ]
        result.table = {
          columns: [
            { key: 'bucket', label: 'Period' },
            { key: 'completed', label: 'Completed' },
            { key: 'failed', label: 'Failed' },
            { key: 'rate', label: 'Success rate %' },
          ],
          rows: buckets.map((x) => ({
            bucket: x,
            completed: cells.get(x)?.ok ?? 0,
            failed: cells.get(x)?.failed ?? 0,
            rate: pct(cells.get(x)),
          })),
        }
        return result
      }

      if (def.id === 'system.sync_failures_by_platform') {
        const per = new Map<string, { failed: number; total: number }>()
        for (const j of jobs) {
          const c = per.get(j.platform) ?? { failed: 0, total: 0 }
          c.total++
          if (j.status === 'failed') c.failed++
          per.set(j.platform, c)
        }
        const rows = [...per.entries()]
          .filter(([, c]) => c.failed > 0)
          .sort((a, b) => b[1].failed - a[1].failed || a[0].localeCompare(b[0]))
        const shown = rows.slice(0, 12)
        result.series = [
          { name: 'Failed jobs', points: shown.map(([x, c]) => ({ x, y: c.failed })) },
        ]
        result.value = rows.reduce((n, [, c]) => n + c.failed, 0)
        result.table = {
          columns: [
            { key: 'platform', label: 'Platform' },
            { key: 'failed', label: 'Failed' },
            { key: 'total', label: 'Jobs' },
            { key: 'failureRate', label: 'Failure rate %' },
          ],
          rows: shown.map(([platform, c]) => ({
            platform,
            failed: c.failed,
            total: c.total,
            failureRate: round((c.failed / c.total) * 100, 2),
          })),
        }
        return result
      }

      if (def.id === 'system.sync_duration') {
        const all: number[] = []
        const byPlatform = new Map<string, number[]>()
        for (const j of jobs) {
          if (j.status !== 'completed' || !j.startedAt || !j.completedAt) continue
          const secs = (Date.parse(j.completedAt) - Date.parse(j.startedAt)) / 1000
          if (!Number.isFinite(secs) || secs < 0) continue
          all.push(secs)
          byPlatform.set(j.platform, [...(byPlatform.get(j.platform) ?? []), secs])
        }
        const edges = [10, 30, 60, 300, 900]
        const labels = bandLabels(edges, 's')
        const hist = labels.map(() => 0)
        for (const v of all) hist[bandIndex(v, edges)]!++
        const overall = all.length ? summarize('All', all) : null
        const groups = [...byPlatform.entries()]
          .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
          .slice(0, 12)
          .map(([platform, vs]) => summarize(platform, vs))
        const stats = overall ? [overall, ...groups] : []
        result.value = overall
          ? round(
              percentile(
                [...all].sort((a, b) => a - b),
                0.5,
              ),
            )
          : null
        result.series = [{ name: 'Jobs', points: labels.map((x, i) => ({ x, y: hist[i]! })) }]
        result.kpis = [
          { key: 'n', label: 'Jobs', value: all.length, unit: 'count' },
          { key: 'mean', label: 'Mean', value: overall?.mean ?? null, unit: 'index' },
          { key: 'p50', label: 'Median', value: overall?.p50 ?? null, unit: 'index' },
          { key: 'p90', label: '90th percentile', value: overall?.p90 ?? null, unit: 'index' },
        ]
        result.stats = stats
        result.table = {
          columns: ['group', 'n', 'min', 'p25', 'p50', 'p75', 'p90', 'max', 'mean'].map((k) => ({
            key: k,
            label: k === 'group' ? 'Platform' : k === 'n' ? 'Jobs' : k,
          })),
          rows: stats.map((x) => ({ ...x })),
        }
        return result
      }

      // system.sync_error_types — only the reviewed class ever leaves the server.
      const counts = new Map<string, number>()
      const bump = (msg: string) => {
        const c = classifySyncError(msg)
        counts.set(c, (counts.get(c) ?? 0) + 1)
      }
      for (const j of jobs) {
        const perResource = Object.values(j.progress ?? {}).filter(
          (r) => typeof r.error === 'string' && r.error.length > 0,
        )
        if (perResource.length > 0) for (const r of perResource) bump(r.error!)
        else if (j.status === 'failed' && j.error) bump(j.error)
      }
      const order = [...SYNC_ERROR_CLASSES.map((c) => c.label), SYNC_ERROR_OTHER]
      const total = [...counts.values()].reduce((a, b) => a + b, 0)
      result.series = [{ name: 'Errors', points: order.map((x) => ({ x, y: counts.get(x) ?? 0 })) }]
      result.value = total
      result.table = {
        columns: [
          { key: 'class', label: 'Error class' },
          { key: 'errors', label: 'Errors' },
          { key: 'share', label: 'Share %' },
        ],
        rows: order.map((x) => ({
          class: x,
          errors: counts.get(x) ?? 0,
          share: total > 0 ? round(((counts.get(x) ?? 0) / total) * 100, 2) : null,
        })),
      }
      return result
    }

    // ── Credential state (no store needed) ───────────────────────────────────
    if (def.id === 'system.connections_by_status' || def.id === 'system.token_expiring_soon') {
      const today = dayString(nowMs)
      const result = base(info, { from: today, to: today }, filter)
      if (def.id === 'system.connections_by_status') {
        const status = (c: ConnectionRow): string => {
          if (c.lastRefreshStatus === 'expired') return 'Re-authorisation needed'
          if (c.lastRefreshStatus === 'platform_error') return 'Platform credentials rejected'
          if (c.lastRefreshStatus === 'failed') return 'Refresh failing'
          if (c.expiresAt !== null && c.expiresAt < nowMs && c.lastRefreshStatus !== 'ok') {
            return 'Token expired'
          }
          return 'OK'
        }
        const per = new Map<string, number>()
        for (const c of conns) per.set(status(c), (per.get(status(c)) ?? 0) + 1)
        const rows = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        result.series = [{ name: 'Connections', points: rows.map(([x, y]) => ({ x, y })) }]
        result.value = conns.length
        result.table = {
          columns: [
            { key: 'status', label: 'Status' },
            { key: 'connections', label: 'Connections' },
            { key: 'share', label: 'Share %' },
          ],
          rows: rows.map(([x, y]) => ({
            status: x,
            connections: y,
            share: round((y / conns.length) * 100, 2),
          })),
        }
        return result
      }
      const horizon = nowMs + TOKEN_EXPIRY_DAYS * 24 * 3_600_000
      const rows = conns
        .filter(
          (c) => c.expiresAt !== null && c.expiresAt <= horizon && c.lastRefreshStatus !== 'ok',
        )
        .sort((a, b) => a.expiresAt! - b.expiresAt! || a.id.localeCompare(b.id))
        .slice(0, 500)
        .map((c) => ({
          connectionId: c.id,
          connection: c.label ?? c.id,
          vertical: c.vertical,
          platform: c.platform,
          expiresAt: new Date(c.expiresAt!).toISOString(),
          hoursUntilExpiry: Math.floor((c.expiresAt! - nowMs) / 3_600_000),
          lastRefresh: c.lastRefreshStatus,
        }))
      result.value = rows.length
      result.table = {
        columns: [
          { key: 'connection', label: 'Connection' },
          { key: 'vertical', label: 'Vertical' },
          { key: 'platform', label: 'Platform' },
          { key: 'expiresAt', label: 'Token expires' },
          { key: 'hoursUntilExpiry', label: 'Hours until expiry' },
          { key: 'lastRefresh', label: 'Last refresh' },
        ],
        rows,
      }
      return result
    }

    const today = dayString(nowDate.getTime())
    const result = base(info, { from: today, to: today }, filter)
    const store = requireStore()
    const counts = (await store.countsByConnection()).filter((c) => {
      if (c.connectionId === null) return false
      const conn = inScope.get(c.connectionId)
      return (
        !!conn && conn.vertical === c.vertical && typeInScope(scope, c.vertical, c.resourceType)
      )
    })

    if (def.id === 'system.records_per_vertical') {
      const byVertical = new Map<string, number>()
      for (const c of counts)
        byVertical.set(c.vertical, (byVertical.get(c.vertical) ?? 0) + c.count)
      const points = [...byVertical.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([x, y]) => ({ x, y }))
      result.series = [{ name: 'Records', points }]
      result.value = points.reduce((n, p) => n + p.y, 0)
      result.table = {
        columns: [
          { key: 'vertical', label: 'Vertical' },
          { key: 'records', label: 'Records' },
        ],
        rows: points.map((p) => ({ vertical: p.x, records: p.y })),
      }
      return result
    }

    if (def.id === 'system.records_per_resource') {
      const per = new Map<string, number>()
      for (const c of counts) {
        const k = `${c.vertical}/${c.resourceType}`
        per.set(k, (per.get(k) ?? 0) + c.count)
      }
      const rows = [...per.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      const shown = rows.slice(0, 30)
      const rest = rows.slice(30).reduce((n, [, y]) => n + y, 0)
      const points = shown.map(([x, y]) => ({ x, y }))
      if (rest > 0) points.push({ x: 'Other', y: rest })
      result.series = [{ name: 'Records', points }]
      result.value = rows.reduce((n, [, y]) => n + y, 0)
      result.table = {
        columns: [
          { key: 'resource', label: 'Resource' },
          { key: 'records', label: 'Records' },
        ],
        rows: points.map((p) => ({ resource: p.x, records: p.y })),
      }
      return result
    }

    if (def.id === 'system.stale_connections') {
      const types = new Map<string, string[]>()
      for (const c of counts)
        types.set(c.connectionId!, [...(types.get(c.connectionId!) ?? []), c.resourceType])
      const labels = ['Under a day', '1–3 days', '3–7 days', 'Over 7 days', 'Never collected']
      const per = labels.map(() => 0)
      const stale: Array<Record<string, string | number | null>> = []
      for (const conn of conns.slice(0, 500)) {
        let last: number | null = null
        for (const t of types.get(conn.id) ?? []) {
          const at = await store.collectionCompletedAt(conn.vertical!, conn.platform, conn.id, t)
          if (at !== null) last = Math.max(last ?? 0, at)
        }
        const hours = last === null ? null : Math.floor((nowMs - last) / 3_600_000)
        const i =
          hours === null ? 4 : hours < 24 ? 0 : hours < STALE_AFTER_HOURS ? 1 : hours < 168 ? 2 : 3
        per[i]!++
        if (hours === null || hours >= STALE_AFTER_HOURS) {
          stale.push({
            connectionId: conn.id,
            connection: conn.label ?? conn.id,
            vertical: conn.vertical,
            platform: conn.platform,
            lastCollectionAt: last === null ? null : new Date(last).toISOString(),
            hoursSinceCollection: hours,
          })
        }
      }
      stale.sort(
        (a, b) =>
          Number(b['hoursSinceCollection'] ?? Infinity) -
            Number(a['hoursSinceCollection'] ?? Infinity) ||
          String(a['connection']).localeCompare(String(b['connection'])),
      )
      result.series = [{ name: 'Connections', points: labels.map((x, i) => ({ x, y: per[i]! })) }]
      result.value = stale.length
      result.table = {
        columns: [
          { key: 'connection', label: 'Connection' },
          { key: 'vertical', label: 'Vertical' },
          { key: 'platform', label: 'Platform' },
          { key: 'lastCollectionAt', label: 'Last full collection' },
          { key: 'hoursSinceCollection', label: 'Hours since collection' },
        ],
        rows: stale,
      }
      return result
    }

    // system.data_freshness
    const perConnection = new Map<
      string,
      { records: number; latest: number | null; types: string[] }
    >()
    for (const c of counts) {
      const e = perConnection.get(c.connectionId!) ?? { records: 0, latest: null, types: [] }
      e.records += c.count
      if (c.maxChangedAt !== null) e.latest = Math.max(e.latest ?? 0, c.maxChangedAt)
      e.types.push(c.resourceType)
      perConnection.set(c.connectionId!, e)
    }
    const rows: Array<Record<string, string | number | null>> = []
    for (const conn of conns.slice(0, 500)) {
      const e = perConnection.get(conn.id)
      let lastCollection: number | null = null
      for (const t of e?.types ?? []) {
        const at = await store.collectionCompletedAt(conn.vertical!, conn.platform, conn.id, t)
        if (at !== null) lastCollection = Math.max(lastCollection ?? 0, at)
      }
      rows.push({
        connectionId: conn.id,
        connection: conn.label ?? conn.id,
        vertical: conn.vertical,
        platform: conn.platform,
        records: e?.records ?? 0,
        latestChangeAt: e?.latest ? new Date(e.latest).toISOString() : null,
        lastCollectionAt: lastCollection ? new Date(lastCollection).toISOString() : null,
        hoursSinceCollection:
          lastCollection !== null ? Math.floor((nowMs - lastCollection) / 3_600_000) : null,
      })
    }
    rows.sort(
      (a, b) =>
        Number(b['records']) - Number(a['records']) ||
        String(a['connection']).localeCompare(String(b['connection'])),
    )
    result.table = {
      columns: [
        { key: 'connection', label: 'Connection' },
        { key: 'vertical', label: 'Vertical' },
        { key: 'platform', label: 'Platform' },
        { key: 'records', label: 'Records' },
        { key: 'latestChangeAt', label: 'Newest change' },
        { key: 'lastCollectionAt', label: 'Last full collection' },
        { key: 'hoursSinceCollection', label: 'Hours since collection' },
      ],
      rows,
    }
    result.value = rows.length
    return result
  }

  function checkParams(params: RunParams): {
    currency: string | null
    granularity?: GranularityParam
    compare: boolean
    filter: CheckedFilter
  } {
    const currency = params.currency ?? null
    if (currency !== null && !CURRENCY_RE.test(currency)) {
      throw new HttpError(
        400,
        'INVALID_QUERY',
        '`currency` must be an ISO 4217 code: three upper-case letters.',
      )
    }
    const g = params.granularity
    if (g !== undefined && !isGranularityParam(g)) {
      throw new HttpError(400, 'INVALID_QUERY', '`granularity` must be auto, day, week or month.')
    }
    const filter = checkFilter({
      connection: params.connection,
      platform: params.platform,
      vertical: params.vertical,
    })
    return { currency, granularity: g, compare: params.compare === true, filter }
  }

  async function run(id: string, scope: DataScope, params: RunParams = {}): Promise<MetricResult> {
    const resourceDef = resourceById.get(id)
    const systemDef = systemById.get(id)
    if (!resourceDef && !systemDef) throw new HttpError(404, 'METRIC_NOT_FOUND', 'No such metric.')
    if (resourceDef && !visible(resourceDef, scope)) {
      throw new HttpError(404, 'METRIC_NOT_FOUND', 'No such metric.')
    }
    const p = checkParams(params)
    const nowDate = now()
    const range = parseRange(params.from, params.to, nowDate)
    // Every parameter, raw and resolved, plus today (now-relative filters move with it).
    const key = JSON.stringify([
      'metric',
      id,
      scopeKey(scope),
      p.filter.connection,
      p.filter.platform,
      p.filter.vertical,
      range.from,
      range.to,
      p.currency,
      p.granularity ?? 'auto',
      resolveGranularity(p.granularity, range),
      p.compare,
      dayString(nowDate.getTime()),
    ])
    return cached(key, () =>
      resourceDef
        ? runResource(resourceDef, scope, range, p, nowDate)
        : runSystem(systemDef!, scope, range, p.granularity, p.filter, nowDate),
    )
  }

  async function currencies(scope: DataScope, filterParam?: ConnectionFilter): Promise<string[]> {
    const filter = checkFilter(filterParam)
    const key = JSON.stringify([
      'currencies',
      scopeKey(scope),
      filter.connection,
      filter.platform,
      filter.vertical,
    ])
    return cached(key, async () => {
      const store = requireStore()
      const byVertical = new Map<string, string[]>()
      for (const c of await scopedConnections(scope, filter)) {
        if (!c.vertical) continue
        const ids = byVertical.get(c.vertical)
        if (ids) ids.push(c.id)
        else byVertical.set(c.vertical, [c.id])
      }
      // Every distinct (vertical, type, path) the visible catalog reads a
      // currency from, unioned into ONE query.
      const reads = new Map<string, { vertical: string; resourceType: string; path: string }>()
      for (const def of metrics) {
        if (!visible(def, scope)) continue
        for (const p of currencyPathsOf(def)) {
          if (!typeInScope(scope, def.vertical, p.resourceType)) continue
          reads.set(JSON.stringify([def.vertical, p.resourceType, p.path]), {
            vertical: def.vertical,
            ...p,
          })
        }
      }
      const raw = await store.distinctValues(
        [...reads.values()].map((r) => ({
          connectionIds: byVertical.get(r.vertical) ?? [],
          vertical: r.vertical,
          resourceType: r.resourceType,
          path: r.path,
        })),
      )
      // As in every result: `usd` is USD, and what is not a code is not listed.
      const codes = new Set<string>()
      for (const v of raw) {
        const code = normaliseCurrency(v)
        if (code !== null) codes.add(code)
      }
      return [...codes].sort()
    })
  }

  return { catalog, run, currencies, clear: () => cache.clear() }
}
