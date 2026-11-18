/**
 * superset-bootstrap — wire an Apache Superset instance to OpenSteward's
 * read-only analytics views. One-shot and idempotent: run it after every
 * install or upgrade (compose `superset-bootstrap` service, Helm post-install
 * / post-upgrade hook). `pnpm --filter admin-api superset:bootstrap` runs it
 * from a checkout.
 *
 *   1. Wait for Superset's /health and for integration-server's analytics
 *      views to be provisioned (Postgres only).
 *   2. Make sure Superset can log in to Postgres as the read-only SQL
 *      principal labelled `superset` (masked, all tenants): create it, or
 *      rotate it on a re-run — its password is only ever returned on create
 *      or rotate — unless SUPERSET_DB_URI supplies a connection outright.
 *   3. Create or update the "OpenSteward analytics" database connection
 *      (hidden from SQL Lab, no DML/CTAS/uploads).
 *   4. One dataset per `os_analytics` view that carries `owner_tenant_id`
 *      and `vertical` (the columns guest-token RLS filters on), matched by
 *      table name; plus the `opensteward_records` virtual dataset.
 *   5. Import dashboard bundles from SUPERSET_ASSETS_DIR (*.zip, exported
 *      from Superset), and create the default "Connection data overview"
 *      dashboard through the REST API when it does not exist yet.
 *   6. Enable embedding on every dashboard whose slug starts with
 *      `opensteward-` (allowed domain: the admin UI origin), and register
 *      them with admin-api (`PUT /api/internal/superset/dashboards`).
 *
 * Environment: SUPERSET_URL, SUPERSET_SERVICE_USERNAME,
 * SUPERSET_SERVICE_PASSWORD, INTEGRATION_SERVER_URL, ADMIN_SECRET,
 * ADMIN_API_URL, SERVICE_SECRET, OPENSTEWARD_ADMIN_ORIGIN (or ADMIN_UI_URL),
 * and optionally SUPERSET_DB_URI, SUPERSET_ANALYTICS_DB_HOST / _PORT / _NAME /
 * _SSLMODE, DATABASE_URL (host fallback), SUPERSET_ASSETS_DIR,
 * SUPERSET_BOOTSTRAP_TIMEOUT_MS. See docs/deployment/superset.md.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { SupersetClient } from '../core/analytics/superset-client'
import {
  ANALYTICS_SCHEMA,
  OVERVIEW_SLUG,
  OVERVIEW_TITLE,
  RECORDS_DATASET,
  SUPERSET_DATABASE_NAME,
  SUPERSET_PRINCIPAL_LABEL,
  allowedDomains,
  chartPayload,
  dashboardMetadataJson,
  dashboardsToRegister,
  databasePayload,
  dbTargetFromUrl,
  knownVerticals,
  overviewChartSpecs,
  planDatasets,
  planPrincipal,
  positionJson,
  recordsDatasetSql,
  registryEntry,
  sqlalchemyUri,
  type CatalogViewLite,
  type DashboardLite,
  type DatasetLite,
  type DbTarget,
  type PrincipalLite,
  type RegistryEntry,
} from '../core/analytics/superset-bootstrap-plan'

// ── Ports ─────────────────────────────────────────────────────────────────

export interface SupersetApi {
  health(): Promise<boolean>
  request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T>
  upload<T = unknown>(path: string, form: FormData): Promise<T>
}

export interface AnalyticsStatusLite {
  backend: 'postgres' | 'sqlite'
  mode: 'managed' | 'manual'
  provisioned: boolean
  upToDate: boolean
  readHost: string | null
  database: string | null
}

export interface IssuedPrincipal {
  principal: PrincipalLite
  password: string
  connection: { host: string | null; username: string }
  mode: 'managed' | 'manual'
}

export interface OpenStewardApi {
  analyticsStatus(): Promise<AnalyticsStatusLite>
  catalog(): Promise<CatalogViewLite[]>
  listPrincipals(): Promise<PrincipalLite[]>
  createPrincipal(): Promise<IssuedPrincipal>
  rotatePrincipal(id: string): Promise<IssuedPrincipal>
  registerDashboards(body: {
    dashboards: RegistryEntry[]
    prune: boolean
  }): Promise<{ created: number; updated: number; removed: number }>
}

export interface BootstrapOptions {
  superset: SupersetApi
  os: OpenStewardApi
  supersetBaseUrl: string
  allowedDomains: string[]
  /** A full SQLAlchemy URI; skips the SQL principal entirely. */
  dbUri?: string | null
  /** Where Superset reaches Postgres (else DATABASE_URL, else the principal's advertised host). */
  dbTarget?: Partial<DbTarget>
  fallbackDbTarget?: DbTarget | null
  sslmode?: string
  assets?: Array<{ name: string; data: Uint8Array<ArrayBuffer> }>
  waitTimeoutMs?: number
  pollIntervalMs?: number
  log?: (msg: string) => void
  sleep?: (ms: number) => Promise<void>
}

export interface BootstrapSummary {
  databaseId: number
  databaseAction: 'created' | 'updated'
  principal: 'created' | 'rotated' | 'external'
  datasetsCreated: string[]
  dashboardsImported: string[]
  overviewCreated: boolean
  registered: RegistryEntry[]
}

export class BootstrapError extends Error {}

// ── Helpers ───────────────────────────────────────────────────────────────

interface ListResponse<T> {
  count?: number
  result?: T[]
}

const PAGE_SIZE = 100

/** Every row of a Superset list endpoint (rison `(page:N,page_size:100)`). */
async function listAll<T>(api: SupersetApi, resource: string): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < 100; page++) {
    const res = await api.request<ListResponse<T>>(
      'GET',
      `/api/v1/${resource}/?q=(page:${page},page_size:${PAGE_SIZE})`,
    )
    const rows = res?.result ?? []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) break
  }
  return out
}

function idOf(res: unknown, what: string): number {
  const id = (res as { id?: unknown } | null)?.id
  if (typeof id !== 'number') throw new BootstrapError(`Superset returned no id for ${what}`)
  return id
}

// ── The job ───────────────────────────────────────────────────────────────

export async function runBootstrap(opts: BootstrapOptions): Promise<BootstrapSummary> {
  const log = opts.log ?? (() => {})
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const deadline = Date.now() + (opts.waitTimeoutMs ?? 300_000)
  const poll = opts.pollIntervalMs ?? 5_000
  const { superset, os } = opts

  if (opts.allowedDomains.length === 0) {
    throw new BootstrapError(
      'No admin UI origin to allow embedding from: set OPENSTEWARD_ADMIN_ORIGIN (or ADMIN_UI_URL).',
    )
  }

  // 1. Superset up, analytics views provisioned.
  log('waiting for Superset /health …')
  while (!(await superset.health())) {
    if (Date.now() > deadline) throw new BootstrapError('Superset did not become healthy in time')
    await sleep(poll)
  }
  log('waiting for the analytics views …')
  let status: AnalyticsStatusLite
  for (;;) {
    status = await os.analyticsStatus()
    if (status.backend !== 'postgres') {
      throw new BootstrapError(
        'integration-server runs on SQLite. Embedded Superset needs the Postgres backend (DATABASE_URL) and read-only SQL access.',
      )
    }
    if (status.provisioned) break
    if (Date.now() > deadline) {
      throw new BootstrapError(
        status.mode === 'manual'
          ? 'The analytics views are not provisioned (manual mode): run the provisioning script (GET /admin/analytics/provision-script) first.'
          : 'The analytics views were not provisioned in time. Check integration-server logs (ANALYTICS_ADMIN_DATABASE_URL).',
      )
    }
    await sleep(poll)
  }
  if (!status.upToDate) log('warning: analytics views are provisioned but not up to date')
  const views = await os.catalog()

  // 2. Connection credentials.
  let uri: string
  let principalAction: BootstrapSummary['principal']
  if (opts.dbUri) {
    uri = opts.dbUri
    principalAction = 'external'
    log('using SUPERSET_DB_URI')
  } else {
    const plan = planPrincipal(await os.listPrincipals())
    const issued =
      plan.action === 'create' ? await os.createPrincipal() : await os.rotatePrincipal(plan.id)
    principalAction = plan.action === 'create' ? 'created' : 'rotated'
    log(`SQL principal ${issued.principal.username}: ${principalAction}`)
    if (issued.mode === 'manual') {
      log(
        'warning: SQL access is in manual mode — run the returned script as a DBA before Superset can connect.',
      )
    }
    const base = opts.fallbackDbTarget ?? null
    const host = opts.dbTarget?.host ?? base?.host ?? issued.connection.host ?? null
    const database = opts.dbTarget?.database ?? base?.database ?? status.database ?? null
    const port = opts.dbTarget?.port ?? base?.port ?? 5432
    if (!host || !database) {
      throw new BootstrapError(
        'Cannot tell where Superset should reach Postgres: set SUPERSET_ANALYTICS_DB_HOST (and _NAME), or SUPERSET_DB_URI.',
      )
    }
    uri = sqlalchemyUri(
      { host, port, database },
      issued.principal.username,
      issued.password,
      opts.sslmode ? { sslmode: opts.sslmode } : {},
    )
  }

  // 3. Database connection.
  const databases = await listAll<{ id: number; database_name: string }>(superset, 'database')
  const existingDb = databases.find((d) => d.database_name === SUPERSET_DATABASE_NAME)
  let databaseId: number
  let databaseAction: BootstrapSummary['databaseAction']
  if (existingDb) {
    await superset.request('PUT', `/api/v1/database/${existingDb.id}`, databasePayload(uri))
    databaseId = existingDb.id
    databaseAction = 'updated'
  } else {
    databaseId = idOf(
      await superset.request('POST', '/api/v1/database/', databasePayload(uri)),
      'the database',
    )
    databaseAction = 'created'
  }
  log(`database "${SUPERSET_DATABASE_NAME}" #${databaseId}: ${databaseAction}`)

  // 4. Datasets.
  const datasetPlan = planDatasets(
    databaseId,
    views,
    await listAll<DatasetLite>(superset, 'dataset'),
  )
  const datasetIds = new Map(datasetPlan.existing)
  for (const name of datasetPlan.create) {
    const id = idOf(
      await superset.request('POST', '/api/v1/dataset/', {
        database: databaseId,
        schema: ANALYTICS_SCHEMA,
        table_name: name,
      }),
      `dataset ${name}`,
    )
    datasetIds.set(name, id)
  }
  // Refresh columns of the ones that existed: a release may add columns.
  for (const [name, id] of datasetPlan.existing) {
    if (name === RECORDS_DATASET) continue
    try {
      await superset.request('PUT', `/api/v1/dataset/${id}/refresh`)
    } catch (err) {
      log(`warning: could not refresh dataset ${name}: ${(err as Error).message}`)
    }
  }
  const recordsSql = recordsDatasetSql(views)
  if (recordsSql) {
    const existing = datasetIds.get(RECORDS_DATASET)
    if (existing === undefined) {
      datasetIds.set(
        RECORDS_DATASET,
        idOf(
          await superset.request('POST', '/api/v1/dataset/', {
            database: databaseId,
            schema: ANALYTICS_SCHEMA,
            table_name: RECORDS_DATASET,
            sql: recordsSql,
          }),
          `dataset ${RECORDS_DATASET}`,
        ),
      )
      datasetPlan.create.push(RECORDS_DATASET)
    } else {
      await superset.request('PUT', `/api/v1/dataset/${existing}`, { sql: recordsSql })
    }
  }
  log(`datasets: ${datasetIds.size} (${datasetPlan.create.length} created)`)

  // 5a. Bundles.
  const imported: string[] = []
  for (const asset of opts.assets ?? []) {
    const form = new FormData()
    form.append('formData', new Blob([asset.data], { type: 'application/zip' }), asset.name)
    form.append('overwrite', 'true')
    // A bundle that carries its own copy of the database definition needs
    // the password; everything else is ignored by Superset.
    const password = (() => {
      try {
        return decodeURIComponent(new URL(uri.replace(/^[^:]+:/, 'http:')).password)
      } catch {
        return ''
      }
    })()
    form.append(
      'passwords',
      JSON.stringify({ [`databases/${SUPERSET_DATABASE_NAME.replace(/ /g, '_')}.yaml`]: password }),
    )
    await superset.upload('/api/v1/dashboard/import/', form)
    imported.push(asset.name)
    log(`imported ${asset.name}`)
  }

  // 5b. Default dashboard.
  let dashboards = await listAll<DashboardLite>(superset, 'dashboard')
  let overviewCreated = false
  const connectionsId = datasetIds.get('connections')
  const recordsId = datasetIds.get(RECORDS_DATASET)
  if (!dashboards.some((d) => d.slug === OVERVIEW_SLUG)) {
    if (connectionsId === undefined) {
      log('warning: no `connections` view in the catalog; skipping the default dashboard')
    } else {
      const dashId = idOf(
        await superset.request('POST', '/api/v1/dashboard/', {
          dashboard_title: OVERVIEW_TITLE,
          slug: OVERVIEW_SLUG,
          published: true,
        }),
        'the overview dashboard',
      )
      const charts: Array<{ id: number; width: number; name: string }> = []
      for (const spec of overviewChartSpecs()) {
        const ds = spec.dataset === 'connections' ? connectionsId : recordsId
        if (ds === undefined) continue
        const chartId = idOf(
          await superset.request('POST', '/api/v1/chart/', chartPayload(spec, ds, dashId)),
          `chart ${spec.slice_name}`,
        )
        charts.push({ id: chartId, width: spec.width, name: spec.slice_name })
      }
      await superset.request('PUT', `/api/v1/dashboard/${dashId}`, {
        position_json: positionJson(OVERVIEW_TITLE, charts),
        json_metadata: dashboardMetadataJson(),
      })
      overviewCreated = true
      log(`created "${OVERVIEW_TITLE}" with ${charts.length} charts`)
      dashboards = await listAll<DashboardLite>(superset, 'dashboard')
    }
  }

  // 6. Embedding + registry.
  const known = knownVerticals(views)
  const entries: RegistryEntry[] = []
  for (const d of dashboardsToRegister(dashboards)) {
    const res = await superset.request<{ result?: { uuid?: unknown } }>(
      'POST',
      `/api/v1/dashboard/${d.id}/embedded`,
      { allowed_domains: opts.allowedDomains },
    )
    const embedded = res?.result?.uuid
    if (typeof embedded !== 'string') {
      throw new BootstrapError(`Superset returned no embedded uuid for dashboard #${d.id}`)
    }
    entries.push(registryEntry(d, embedded, known, opts.supersetBaseUrl))
  }
  const reg = await os.registerDashboards({ dashboards: entries, prune: true })
  log(
    `registered ${entries.length} dashboard(s) with admin-api (created ${reg.created}, updated ${reg.updated}, removed ${reg.removed})`,
  )

  return {
    databaseId,
    databaseAction,
    principal: principalAction,
    datasetsCreated: datasetPlan.create,
    dashboardsImported: imported,
    overviewCreated,
    registered: entries,
  }
}

// ── HTTP adapter for integration-server + admin-api ───────────────────────

async function jsonCall<T>(
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: unknown },
): Promise<T> {
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/json',
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  if (!res.ok) {
    const err = (json as { error?: unknown } | null)?.error
    throw new BootstrapError(
      `${init.method ?? 'GET'} ${url} answered ${res.status}: ${typeof err === 'string' ? err : JSON.stringify(err ?? json)}`,
    )
  }
  return json as T
}

export function openStewardHttpApi(opts: {
  integrationServerUrl: string
  adminSecret: string
  adminApiUrl: string
  serviceSecret: string
}): OpenStewardApi {
  const is = opts.integrationServerUrl.replace(/\/+$/, '')
  const api = opts.adminApiUrl.replace(/\/+$/, '')
  const admin = {
    'x-admin-secret': opts.adminSecret,
    // The job acts deployment-wide: every tenant, masked data only.
    'x-opensteward-data-scope': JSON.stringify({ tenants: '*' }),
  }
  type Issued = { data: IssuedPrincipal }
  return {
    analyticsStatus: async () =>
      (
        await jsonCall<{ data: AnalyticsStatusLite }>(`${is}/admin/analytics/status`, {
          headers: admin,
        })
      ).data,
    catalog: async () =>
      (
        await jsonCall<{ data: { views: CatalogViewLite[] } }>(`${is}/admin/analytics/catalog`, {
          headers: admin,
        })
      ).data.views,
    listPrincipals: async () =>
      (
        await jsonCall<{ data: PrincipalLite[] }>(`${is}/admin/analytics/principals`, {
          headers: admin,
        })
      ).data,
    createPrincipal: async () =>
      (
        await jsonCall<Issued>(`${is}/admin/analytics/principals`, {
          method: 'POST',
          headers: admin,
          body: {
            label: SUPERSET_PRINCIPAL_LABEL,
            pii: false,
            scope: { tenants: '*' },
            connectionLimit: 10,
            createdBy: 'superset-bootstrap',
          },
        })
      ).data,
    rotatePrincipal: async (id) =>
      (
        await jsonCall<Issued>(
          `${is}/admin/analytics/principals/${encodeURIComponent(id)}/rotate`,
          {
            method: 'POST',
            headers: admin,
          },
        )
      ).data,
    registerDashboards: async (body) =>
      (
        await jsonCall<{ data: { created: number; updated: number; removed: number } }>(
          `${api}/api/internal/superset/dashboards`,
          { method: 'PUT', headers: { 'x-service-secret': opts.serviceSecret }, body },
        )
      ).data,
  }
}

function readAssets(
  dir: string | undefined,
): Array<{ name: string; data: Uint8Array<ArrayBuffer> }> {
  if (!dir || !existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .sort()
    .map((name) => ({ name, data: new Uint8Array(readFileSync(join(dir, name))) }))
}

function required(name: string, value: string | undefined): string {
  const v = (value ?? '').trim()
  if (!v) throw new BootstrapError(`${name} is required`)
  return v
}

async function main(): Promise<void> {
  const supersetUrl = required('SUPERSET_URL', process.env.SUPERSET_URL)
  const client = new SupersetClient({
    url: supersetUrl,
    username: required('SUPERSET_SERVICE_USERNAME', process.env.SUPERSET_SERVICE_USERNAME),
    password: required('SUPERSET_SERVICE_PASSWORD', process.env.SUPERSET_SERVICE_PASSWORD),
    timeoutMs: 60_000,
  })
  const port = Number(process.env.SUPERSET_ANALYTICS_DB_PORT)
  const summary = await runBootstrap({
    superset: client,
    os: openStewardHttpApi({
      integrationServerUrl: process.env.INTEGRATION_SERVER_URL ?? 'http://integration-server:3010',
      adminSecret: required('ADMIN_SECRET', process.env.ADMIN_SECRET),
      adminApiUrl: process.env.ADMIN_API_URL ?? 'http://admin-api:3001',
      serviceSecret: required('SERVICE_SECRET', process.env.SERVICE_SECRET),
    }),
    supersetBaseUrl: client.baseUrl,
    allowedDomains: allowedDomains(
      process.env.OPENSTEWARD_ADMIN_ORIGIN || process.env.ADMIN_UI_URL,
    ),
    dbUri: process.env.SUPERSET_DB_URI || null,
    dbTarget: {
      ...(process.env.SUPERSET_ANALYTICS_DB_HOST
        ? { host: process.env.SUPERSET_ANALYTICS_DB_HOST }
        : {}),
      ...(process.env.SUPERSET_ANALYTICS_DB_NAME
        ? { database: process.env.SUPERSET_ANALYTICS_DB_NAME }
        : {}),
      ...(Number.isInteger(port) && port > 0 ? { port } : {}),
    },
    fallbackDbTarget: dbTargetFromUrl(process.env.DATABASE_URL),
    ...(process.env.SUPERSET_ANALYTICS_DB_SSLMODE
      ? { sslmode: process.env.SUPERSET_ANALYTICS_DB_SSLMODE }
      : {}),
    assets: readAssets(
      process.env.SUPERSET_ASSETS_DIR ??
        resolve(process.cwd(), '../../deploy/superset/assets/dashboards'),
    ),
    waitTimeoutMs: Number(process.env.SUPERSET_BOOTSTRAP_TIMEOUT_MS) || 600_000,
    log: (msg) => console.log(`[superset-bootstrap] ${msg}`),
  })
  console.log(
    `[superset-bootstrap] done: database #${summary.databaseId} ${summary.databaseAction}, principal ${summary.principal}, ${summary.datasetsCreated.length} dataset(s) created, ${summary.registered.length} dashboard(s) registered`,
  )
}

// Only run when this file is the entry point, not when a test imports it.
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('superset-bootstrap.ts') ||
    process.argv[1].endsWith('superset-bootstrap.js'))
if (isMain) {
  main().catch((err: unknown) => {
    console.error(
      `[superset-bootstrap] failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    process.exit(1)
  })
}
