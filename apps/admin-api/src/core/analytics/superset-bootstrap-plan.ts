/**
 * Pure parts of the superset-bootstrap job (`src/scripts/superset-bootstrap.ts`):
 * request payloads, the default "Connection data overview" dashboard, and the
 * idempotency decisions (create vs update vs leave alone). No I/O here, so
 * each decision is unit-tested on its own.
 */
import { createHash } from 'node:crypto'

/** Name of the Superset database connection the job owns. */
export const SUPERSET_DATABASE_NAME = 'OpenSteward analytics'
/** Label of the SQL principal Superset connects as. */
export const SUPERSET_PRINCIPAL_LABEL = 'superset'
/** The masked analytics schema — the only one Superset ever sees. */
export const ANALYTICS_SCHEMA = 'os_analytics'
/** Virtual dataset unioning every resource view (for record counts). */
export const RECORDS_DATASET = 'opensteward_records'
/** Dashboards whose slug starts with this are embedded and registered. */
export const REGISTERED_SLUG_PREFIX = 'opensteward-'
export const OVERVIEW_SLUG = 'opensteward-overview'
export const OVERVIEW_TITLE = 'Connection data overview'

// ── Catalog ───────────────────────────────────────────────────────────────

export interface CatalogViewLite {
  name: string
  kind: 'resource' | 'system'
  vertical?: string
  columns: Array<{ name: string }>
}

const VIEW_NAME_RE = /^[a-z][a-z0-9_]*$/

/**
 * Views a dataset may be built on. Guest tokens carry one RLS clause over
 * `owner_tenant_id` and `vertical` for every dataset on a dashboard, so a
 * view without both columns (the `tenants` view) would make every chart on
 * that dashboard fail — and could not be tenant-filtered anyway. Names are
 * re-validated because they are spliced into the virtual dataset's SQL.
 */
export function rlsSafeViews(views: readonly CatalogViewLite[]): CatalogViewLite[] {
  return views.filter((v) => {
    if (!VIEW_NAME_RE.test(v.name)) return false
    const cols = new Set(v.columns.map((c) => c.name))
    return cols.has('owner_tenant_id') && cols.has('vertical')
  })
}

/** Verticals the catalog knows, for reading a dashboard's slug. */
export function knownVerticals(views: readonly CatalogViewLite[]): Set<string> {
  return new Set(views.filter((v) => v.vertical).map((v) => v.vertical!))
}

/** SQL of the records dataset: one row per stored record, store columns only. */
export function recordsDatasetSql(views: readonly CatalogViewLite[]): string | null {
  const resources = rlsSafeViews(views).filter((v) => {
    const cols = new Set(v.columns.map((c) => c.name))
    return v.kind === 'resource' && cols.has('platform') && cols.has('connection_id')
  })
  if (resources.length === 0) return null
  return resources
    .map(
      (v) =>
        `SELECT owner_tenant_id, vertical, platform, connection_id, '${v.name}' AS view_name FROM ${ANALYTICS_SCHEMA}.${v.name}`,
    )
    .join('\nUNION ALL\n')
}

// ── SQL principal and database connection ─────────────────────────────────

export interface PrincipalLite {
  id: string
  username: string
  label: string
  pii: boolean
  status: string
  scope: { tenants: '*' | string[]; verticals?: '*' | string[] }
  createdAt: string
}

export type PrincipalPlan =
  { action: 'create' } | { action: 'rotate'; id: string; username: string }

/**
 * Reuse the newest active, masked, all-tenant principal labelled `superset`
 * (rotating it, because a password is only ever returned on create or
 * rotate), or create one.
 */
export function planPrincipal(principals: readonly PrincipalLite[]): PrincipalPlan {
  const candidates = principals
    .filter(
      (p) =>
        p.label === SUPERSET_PRINCIPAL_LABEL &&
        p.status === 'active' &&
        !p.pii &&
        p.scope.tenants === '*' &&
        (p.scope.verticals === undefined || p.scope.verticals === '*'),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  const p = candidates[0]
  return p ? { action: 'rotate', id: p.id, username: p.username } : { action: 'create' }
}

export interface DbTarget {
  host: string
  port: number
  database: string
}

/** Host/port/database from a postgres:// URL, or null. */
export function dbTargetFromUrl(url: string | undefined | null): DbTarget | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null
    const database = decodeURIComponent(u.pathname.replace(/^\//, ''))
    if (!u.hostname || !database) return null
    return { host: u.hostname, port: u.port ? Number(u.port) : 5432, database }
  } catch {
    return null
  }
}

export function sqlalchemyUri(
  target: DbTarget,
  username: string,
  password: string,
  opts: { sslmode?: string } = {},
): string {
  const user = encodeURIComponent(username)
  const pass = encodeURIComponent(password)
  const db = encodeURIComponent(target.database)
  const q = opts.sslmode ? `?sslmode=${encodeURIComponent(opts.sslmode)}` : ''
  return `postgresql+psycopg2://${user}:${pass}@${target.host}:${target.port}/${db}${q}`
}

/**
 * The Superset database connection: read-only in every way Superset offers
 * (no DML, no CTAS/CVAS, no uploads), hidden from SQL Lab, and limited to the
 * masked schema. The login itself is read-only in Postgres too — these are
 * belt and braces.
 */
export function databasePayload(uri: string) {
  return {
    database_name: SUPERSET_DATABASE_NAME,
    sqlalchemy_uri: uri,
    expose_in_sqllab: false,
    allow_dml: false,
    allow_ctas: false,
    allow_cvas: false,
    allow_file_upload: false,
    allow_run_async: false,
    impersonate_user: false,
    extra: JSON.stringify({
      allows_virtual_table_explore: false,
      schemas_allowed_for_file_upload: [],
      disable_data_preview: true,
      metadata_params: {},
      engine_params: {},
    }),
  }
}

// ── Datasets ──────────────────────────────────────────────────────────────

export interface DatasetLite {
  id: number
  table_name: string
  schema: string | null
  database: { id: number } | null
}

export interface DatasetPlan {
  create: string[]
  existing: Map<string, number>
}

/** Which physical datasets to create; existing ones are matched by table name. */
export function planDatasets(
  databaseId: number,
  views: readonly CatalogViewLite[],
  existing: readonly DatasetLite[],
): DatasetPlan {
  const mine = new Map<string, number>()
  for (const d of existing) {
    if (d.database?.id === databaseId && d.schema === ANALYTICS_SCHEMA) mine.set(d.table_name, d.id)
  }
  const create: string[] = []
  const found = new Map<string, number>()
  for (const v of rlsSafeViews(views)) {
    const id = mine.get(v.name)
    if (id === undefined) create.push(v.name)
    else found.set(v.name, id)
  }
  const recordsId = mine.get(RECORDS_DATASET)
  if (recordsId !== undefined) found.set(RECORDS_DATASET, recordsId)
  return { create, existing: found }
}

// ── The default dashboard ─────────────────────────────────────────────────

export interface ChartSpec {
  key: string
  slice_name: string
  viz_type: string
  dataset: 'connections' | typeof RECORDS_DATASET
  width: number
  params: Record<string, unknown>
}

/** Charts of the default dashboard, before dataset ids are known. */
export function overviewChartSpecs(): ChartSpec[] {
  return [
    {
      key: 'connections_total',
      slice_name: 'Connections',
      viz_type: 'big_number_total',
      dataset: 'connections',
      width: 3,
      params: {
        metric: 'count',
        adhoc_filters: [],
        header_font_size: 0.4,
        subheader_font_size: 0.15,
        y_axis_format: 'SMART_NUMBER',
        subheader: 'connections in your scope',
      },
    },
    {
      key: 'records_total',
      slice_name: 'Stored records',
      viz_type: 'big_number_total',
      dataset: RECORDS_DATASET,
      width: 3,
      params: {
        metric: 'count',
        adhoc_filters: [],
        header_font_size: 0.4,
        subheader_font_size: 0.15,
        y_axis_format: 'SMART_NUMBER',
        subheader: 'records synced',
      },
    },
    {
      key: 'connections_by_vertical',
      slice_name: 'Connections by vertical',
      viz_type: 'pie',
      dataset: 'connections',
      width: 6,
      params: {
        groupby: ['vertical'],
        metric: 'count',
        adhoc_filters: [],
        row_limit: 100,
        sort_by_metric: true,
        color_scheme: 'supersetColors',
        show_labels: true,
        label_type: 'key_value',
        number_format: 'SMART_NUMBER',
        show_legend: true,
        legendType: 'scroll',
        legendOrientation: 'top',
        donut: true,
        innerRadius: 40,
        outerRadius: 70,
      },
    },
    {
      key: 'records_by_resource',
      slice_name: 'Records per vertical and resource',
      viz_type: 'table',
      dataset: RECORDS_DATASET,
      width: 6,
      params: {
        query_mode: 'aggregate',
        groupby: ['vertical', 'view_name'],
        metrics: ['count'],
        all_columns: [],
        percent_metrics: [],
        adhoc_filters: [],
        order_by_cols: [],
        row_limit: 1000,
        server_page_length: 10,
        order_desc: true,
        include_search: true,
        table_timestamp_format: 'smart_date',
      },
    },
    {
      key: 'records_by_platform',
      slice_name: 'Records per platform',
      viz_type: 'table',
      dataset: RECORDS_DATASET,
      width: 6,
      params: {
        query_mode: 'aggregate',
        groupby: ['platform', 'vertical'],
        metrics: ['count'],
        all_columns: [],
        percent_metrics: [],
        adhoc_filters: [],
        order_by_cols: [],
        row_limit: 1000,
        server_page_length: 10,
        order_desc: true,
        include_search: true,
        table_timestamp_format: 'smart_date',
      },
    },
    {
      key: 'connections_table',
      slice_name: 'Connections',
      viz_type: 'table',
      dataset: 'connections',
      width: 12,
      params: {
        query_mode: 'raw',
        groupby: [],
        metrics: [],
        all_columns: [
          'connection_id',
          'owner_tenant_id',
          'platform',
          'vertical',
          'label',
          'last_refresh_status',
          'last_refresh_at',
          'created_at',
        ],
        percent_metrics: [],
        adhoc_filters: [],
        order_by_cols: [],
        row_limit: 1000,
        server_page_length: 25,
        include_search: true,
        table_timestamp_format: 'smart_date',
      },
    },
  ]
}

/** The `POST /api/v1/chart/` body for a spec. */
export function chartPayload(spec: ChartSpec, datasetId: number, dashboardId: number) {
  return {
    slice_name: spec.slice_name,
    viz_type: spec.viz_type,
    datasource_id: datasetId,
    datasource_type: 'table',
    dashboards: [dashboardId],
    params: JSON.stringify({
      viz_type: spec.viz_type,
      datasource: `${datasetId}__table`,
      ...spec.params,
    }),
  }
}

/**
 * `position_json` for a grid of charts: rows filled left to right up to 12
 * columns, 50 units high. `charts` are `[chartId, width, name]` in order.
 */
export function positionJson(
  title: string,
  charts: ReadonlyArray<{ id: number; width: number; name: string }>,
): string {
  const layout: Record<string, unknown> = {
    DASHBOARD_VERSION_KEY: 'v2',
    ROOT_ID: { type: 'ROOT', id: 'ROOT_ID', children: ['GRID_ID'] },
    HEADER_ID: { id: 'HEADER_ID', type: 'HEADER', meta: { text: title } },
  }
  const rows: string[][] = []
  let current: string[] = []
  let used = 0
  charts.forEach((c, i) => {
    const w = Math.max(1, Math.min(12, c.width))
    if (used + w > 12 && current.length > 0) {
      rows.push(current)
      current = []
      used = 0
    }
    const key = `CHART-os-${i + 1}`
    current.push(key)
    used += w
    layout[key] = {
      type: 'CHART',
      id: key,
      children: [],
      meta: { chartId: c.id, width: w, height: 50, sliceName: c.name },
    }
  })
  if (current.length > 0) rows.push(current)
  const rowIds = rows.map((_, i) => `ROW-os-${i + 1}`)
  rows.forEach((keys, i) => {
    layout[rowIds[i]!] = {
      type: 'ROW',
      id: rowIds[i],
      children: keys,
      parents: ['ROOT_ID', 'GRID_ID'],
      meta: { background: 'BACKGROUND_TRANSPARENT' },
    }
    for (const k of keys) {
      ;(layout[k] as { parents?: string[] }).parents = ['ROOT_ID', 'GRID_ID', rowIds[i]!]
    }
  })
  layout['GRID_ID'] = { type: 'GRID', id: 'GRID_ID', children: rowIds, parents: ['ROOT_ID'] }
  return JSON.stringify(layout)
}

export function dashboardMetadataJson(): string {
  return JSON.stringify({
    color_scheme: 'supersetColors',
    cross_filters_enabled: false,
    native_filter_configuration: [],
    refresh_frequency: 0,
    timed_refresh_immune_slices: [],
    expanded_slices: {},
    label_colors: {},
    default_filters: '{}',
  })
}

// ── Registration ──────────────────────────────────────────────────────────

export interface DashboardLite {
  id: number
  dashboard_title: string
  slug: string | null
  uuid?: string | null
}

/** A deterministic uuid when Superset's list does not carry the dashboard's own. */
export function fallbackUuid(seed: string): string {
  const h = createHash('sha1').update(seed).digest('hex')
  const variant = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** Dashboards the job embeds and registers: those with the reserved slug prefix. */
export function dashboardsToRegister(dashboards: readonly DashboardLite[]): DashboardLite[] {
  return dashboards
    .filter((d) => typeof d.slug === 'string' && d.slug.startsWith(REGISTERED_SLUG_PREFIX))
    .sort((a, b) => a.id - b.id)
}

/**
 * The verticals a registered dashboard is about, read from its slug:
 * `opensteward-<vertical>[-anything]` for a known vertical, else none.
 */
export function verticalsFromSlug(slug: string, known: ReadonlySet<string>): string[] | null {
  const rest = slug.slice(REGISTERED_SLUG_PREFIX.length)
  // Longest match first, so `customer-support-…` wins over a shorter prefix.
  const match = [...known]
    .sort((a, b) => b.length - a.length)
    .find((v) => rest === v || rest.startsWith(`${v}-`))
  return match ? [match] : null
}

export interface RegistryEntry {
  supersetUuid: string
  embeddedUuid: string
  title: string
  description: string | null
  verticals: string[] | null
  requiredPermission: null
}

export function registryEntry(
  d: DashboardLite,
  embeddedUuid: string,
  known: ReadonlySet<string>,
  supersetBaseUrl: string,
): RegistryEntry {
  const uuid =
    d.uuid && /^[0-9a-f-]{36}$/i.test(d.uuid)
      ? d.uuid.toLowerCase()
      : fallbackUuid(`${supersetBaseUrl}#dashboard:${d.id}`)
  return {
    supersetUuid: uuid,
    embeddedUuid: embeddedUuid.toLowerCase(),
    title: d.dashboard_title,
    description:
      d.slug === OVERVIEW_SLUG
        ? 'Connections and synced records across the tenants you can see.'
        : null,
    verticals: d.slug ? verticalsFromSlug(d.slug, known) : null,
    requiredPermission: null,
  }
}

/** The admin UI's origin(s) for `allowed_domains` (embedding) — origins only. */
export function allowedDomains(raw: string | undefined | null): string[] {
  const out = new Set<string>()
  for (const part of (raw ?? '').split(',')) {
    const v = part.trim()
    if (!v) continue
    try {
      const u = new URL(v)
      if (u.protocol === 'http:' || u.protocol === 'https:') out.add(u.origin)
    } catch {
      /* ignore */
    }
  }
  return [...out]
}
