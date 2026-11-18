/**
 * superset-bootstrap: the pure builders and decisions, and the whole job
 * against an in-memory Superset + OpenSteward — first run creates, second
 * run changes only what must change (rotated password, refreshed datasets)
 * and registers the same dashboards under the same uuids.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  OVERVIEW_SLUG,
  RECORDS_DATASET,
  SUPERSET_DATABASE_NAME,
  allowedDomains,
  chartPayload,
  databasePayload,
  dbTargetFromUrl,
  fallbackUuid,
  overviewChartSpecs,
  planDatasets,
  planPrincipal,
  positionJson,
  recordsDatasetSql,
  registryEntry,
  rlsSafeViews,
  sqlalchemyUri,
  verticalsFromSlug,
  type CatalogViewLite,
  type PrincipalLite,
} from '../../src/core/analytics/superset-bootstrap-plan'
import {
  BootstrapError,
  runBootstrap,
  type IssuedPrincipal,
  type OpenStewardApi,
  type SupersetApi,
} from '../../src/scripts/superset-bootstrap'

const col = (name: string) => ({ name })
const STORE = ['connection_id', 'owner_tenant_id', 'platform', 'vertical', 'resource_id'].map(col)
const VIEWS: CatalogViewLite[] = [
  { name: 'crm_contacts', kind: 'resource', vertical: 'crm', columns: [...STORE, col('email')] },
  { name: 'payments_charges', kind: 'resource', vertical: 'payments', columns: STORE },
  {
    name: 'connections',
    kind: 'system',
    columns: ['connection_id', 'owner_tenant_id', 'platform', 'vertical', 'label'].map(col),
  },
  { name: 'tenants', kind: 'system', columns: ['tenant_id', 'name'].map(col) },
  { name: 'Bad; DROP', kind: 'resource', vertical: 'crm', columns: STORE },
]

function principal(over: Partial<PrincipalLite> = {}): PrincipalLite {
  return {
    id: 'p1',
    username: 'os_sql_superset_abc123',
    label: 'superset',
    pii: false,
    status: 'active',
    scope: { tenants: '*' },
    createdAt: '2026-09-01T00:00:00.000Z',
    ...over,
  }
}

describe('plan helpers', () => {
  it('keeps only views RLS can filter, with safe names', () => {
    expect(rlsSafeViews(VIEWS).map((v) => v.name)).toEqual([
      'crm_contacts',
      'payments_charges',
      'connections',
    ])
  })

  it('builds the records dataset SQL from resource views only', () => {
    const sql = recordsDatasetSql(VIEWS)!
    expect(sql).toContain('FROM os_analytics.crm_contacts')
    expect(sql).toContain('FROM os_analytics.payments_charges')
    expect(sql).not.toContain('connections')
    expect(sql).not.toContain('DROP')
    expect(sql.split('UNION ALL')).toHaveLength(2)
    expect(recordsDatasetSql([])).toBeNull()
  })

  it('reuses the newest matching principal, else creates one', () => {
    expect(planPrincipal([])).toEqual({ action: 'create' })
    expect(
      planPrincipal([
        principal({ id: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
        principal({ id: 'new', createdAt: '2026-06-01T00:00:00.000Z' }),
      ]),
    ).toMatchObject({ action: 'rotate', id: 'new' })
    for (const p of [
      principal({ status: 'revoked' }),
      principal({ pii: true }),
      principal({ label: 'metabase' }),
      principal({ scope: { tenants: ['acme'] } }),
      principal({ scope: { tenants: '*', verticals: ['crm'] } }),
    ]) {
      expect(planPrincipal([p])).toEqual({ action: 'create' })
    }
  })

  it('builds an encoded SQLAlchemy URI and a read-only, hidden database', () => {
    const uri = sqlalchemyUri(
      { host: 'pg', port: 5432, database: 'opensteward' },
      'os_sql_x',
      'p@ss/w:rd',
      {
        sslmode: 'require',
      },
    )
    expect(uri).toBe(
      'postgresql+psycopg2://os_sql_x:p%40ss%2Fw%3Ard@pg:5432/opensteward?sslmode=require',
    )
    expect(databasePayload(uri)).toMatchObject({
      database_name: SUPERSET_DATABASE_NAME,
      expose_in_sqllab: false,
      allow_dml: false,
      allow_ctas: false,
      allow_cvas: false,
      allow_file_upload: false,
    })
    expect(dbTargetFromUrl('postgres://u:p@db.internal:6543/os')).toEqual({
      host: 'db.internal',
      port: 6543,
      database: 'os',
    })
    expect(dbTargetFromUrl('sqlite:///x')).toBeNull()
  })

  it('plans datasets by table name within our database and schema', () => {
    const plan = planDatasets(7, VIEWS, [
      { id: 1, table_name: 'crm_contacts', schema: 'os_analytics', database: { id: 7 } },
      { id: 2, table_name: 'payments_charges', schema: 'public', database: { id: 7 } },
      { id: 3, table_name: 'connections', schema: 'os_analytics', database: { id: 99 } },
      { id: 4, table_name: RECORDS_DATASET, schema: 'os_analytics', database: { id: 7 } },
    ])
    expect(plan.create).toEqual(['payments_charges', 'connections'])
    expect([...plan.existing]).toEqual([
      ['crm_contacts', 1],
      [RECORDS_DATASET, 4],
    ])
  })

  it('lays charts out in rows of 12 columns', () => {
    const layout = JSON.parse(
      positionJson('T', [
        { id: 1, width: 6, name: 'a' },
        { id: 2, width: 6, name: 'b' },
        { id: 3, width: 12, name: 'c' },
      ]),
    )
    expect(layout.GRID_ID.children).toEqual(['ROW-os-1', 'ROW-os-2'])
    expect(layout['ROW-os-1'].children).toEqual(['CHART-os-1', 'CHART-os-2'])
    expect(layout['CHART-os-3'].meta).toMatchObject({ chartId: 3, width: 12 })
    expect(layout['CHART-os-3'].parents).toEqual(['ROOT_ID', 'GRID_ID', 'ROW-os-2'])
  })

  it('builds chart payloads bound to a dataset and dashboard', () => {
    const spec = overviewChartSpecs()[0]!
    const p = chartPayload(spec, 12, 3)
    expect(p).toMatchObject({ datasource_id: 12, datasource_type: 'table', dashboards: [3] })
    expect(JSON.parse(p.params)).toMatchObject({ datasource: '12__table', viz_type: spec.viz_type })
  })

  it('reads verticals from the slug and builds registry entries', () => {
    const known = new Set(['crm', 'customer-support', 'payments'])
    expect(verticalsFromSlug('opensteward-crm-pipeline', known)).toEqual(['crm'])
    expect(verticalsFromSlug('opensteward-customer-support', known)).toEqual(['customer-support'])
    expect(verticalsFromSlug('opensteward-overview', known)).toBeNull()
    const e = registryEntry(
      { id: 5, dashboard_title: 'X', slug: OVERVIEW_SLUG },
      'AAAAAAAA-0000-4000-8000-000000000000',
      known,
      'http://superset:8088',
    )
    expect(e.supersetUuid).toBe(fallbackUuid('http://superset:8088#dashboard:5'))
    expect(e.supersetUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(e.embeddedUuid).toBe('aaaaaaaa-0000-4000-8000-000000000000')
  })

  it('reduces allowed domains to origins', () => {
    expect(allowedDomains('https://admin.example.com/path, http://localhost:3000 ,junk')).toEqual([
      'https://admin.example.com',
      'http://localhost:3000',
    ])
  })
})

// ── The job, against fakes ────────────────────────────────────────────────

class FakeSuperset implements SupersetApi {
  healthy = true
  seq = 100
  databases: Array<{ id: number; database_name: string; sqlalchemy_uri: string }> = []
  datasets: Array<{
    id: number
    table_name: string
    schema: string
    database: { id: number }
    sql?: string
  }> = []
  dashboards: Array<{
    id: number
    dashboard_title: string
    slug: string | null
    position_json?: string
  }> = []
  charts: Array<{ id: number; slice_name: string; datasource_id: number; dashboards: number[] }> =
    []
  embedded = new Map<number, { uuid: string; allowed_domains: string[] }>()
  refreshed: number[] = []
  uploads: string[] = []
  calls: string[] = []

  async health() {
    return this.healthy
  }
  async upload<T>(path: string, form: FormData): Promise<T> {
    this.uploads.push(`${path}:${(form.get('formData') as File).name}`)
    return { message: 'OK' } as T
  }
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.calls.push(`${method} ${path.split('?')[0]}`)
    const b = body as Record<string, unknown>
    let m: RegExpMatchArray | null
    const list = <R>(rows: R[]) => ({ count: rows.length, result: rows }) as T
    if (method === 'GET' && path.startsWith('/api/v1/database/?')) return list(this.databases)
    if (method === 'GET' && path.startsWith('/api/v1/dataset/?')) return list(this.datasets)
    if (method === 'GET' && path.startsWith('/api/v1/dashboard/?')) return list(this.dashboards)
    if (method === 'POST' && path === '/api/v1/database/') {
      const id = ++this.seq
      this.databases.push({
        id,
        database_name: String(b['database_name']),
        sqlalchemy_uri: String(b['sqlalchemy_uri']),
      })
      return { id } as T
    }
    if (method === 'PUT' && (m = path.match(/^\/api\/v1\/database\/(\d+)$/))) {
      const db = this.databases.find((d) => d.id === Number(m![1]))!
      db.sqlalchemy_uri = String(b['sqlalchemy_uri'])
      return { id: db.id } as T
    }
    if (method === 'POST' && path === '/api/v1/dataset/') {
      const id = ++this.seq
      this.datasets.push({
        id,
        table_name: String(b['table_name']),
        schema: String(b['schema']),
        database: { id: Number(b['database']) },
        ...(b['sql'] ? { sql: String(b['sql']) } : {}),
      })
      return { id } as T
    }
    if (method === 'PUT' && (m = path.match(/^\/api\/v1\/dataset\/(\d+)\/refresh$/))) {
      this.refreshed.push(Number(m[1]))
      return {} as T
    }
    if (method === 'PUT' && (m = path.match(/^\/api\/v1\/dataset\/(\d+)$/))) {
      this.datasets.find((d) => d.id === Number(m![1]))!.sql = String(b['sql'])
      return {} as T
    }
    if (method === 'POST' && path === '/api/v1/dashboard/') {
      const id = ++this.seq
      this.dashboards.push({
        id,
        dashboard_title: String(b['dashboard_title']),
        slug: String(b['slug']),
      })
      return { id } as T
    }
    if (method === 'PUT' && (m = path.match(/^\/api\/v1\/dashboard\/(\d+)$/))) {
      this.dashboards.find((d) => d.id === Number(m![1]))!.position_json = String(
        b['position_json'],
      )
      return {} as T
    }
    if (method === 'POST' && path === '/api/v1/chart/') {
      const id = ++this.seq
      this.charts.push({
        id,
        slice_name: String(b['slice_name']),
        datasource_id: Number(b['datasource_id']),
        dashboards: b['dashboards'] as number[],
      })
      return { id } as T
    }
    if (method === 'POST' && (m = path.match(/^\/api\/v1\/dashboard\/(\d+)\/embedded$/))) {
      const id = Number(m[1])
      const prev = this.embedded.get(id)
      const uuid = prev?.uuid ?? `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`
      this.embedded.set(id, { uuid, allowed_domains: b['allowed_domains'] as string[] })
      return { result: { uuid, allowed_domains: b['allowed_domains'], dashboard_id: id } } as T
    }
    throw new Error(`unexpected ${method} ${path}`)
  }
}

class FakeOpenSteward implements OpenStewardApi {
  status = {
    backend: 'postgres' as 'postgres' | 'sqlite',
    mode: 'managed' as const,
    provisioned: true,
    upToDate: true,
    readHost: null,
    database: 'opensteward',
  }
  principals: PrincipalLite[] = []
  passwords: string[] = []
  registered: Array<{ dashboards: unknown[]; prune: boolean }> = []
  async analyticsStatus() {
    return this.status
  }
  async catalog() {
    return VIEWS
  }
  async listPrincipals() {
    return this.principals
  }
  private issue(p: PrincipalLite): IssuedPrincipal {
    const password = `pw-${this.passwords.length + 1}`
    this.passwords.push(password)
    return {
      principal: p,
      password,
      connection: { host: null, username: p.username },
      mode: 'managed',
    }
  }
  async createPrincipal() {
    const p = principal({ id: `p${this.principals.length + 1}` })
    this.principals.push(p)
    return this.issue(p)
  }
  async rotatePrincipal(id: string) {
    return this.issue(this.principals.find((p) => p.id === id)!)
  }
  async registerDashboards(body: { dashboards: unknown[]; prune: boolean }) {
    this.registered.push(body)
    return { created: body.dashboards.length, updated: 0, removed: 0 }
  }
}

let ss: FakeSuperset
let os: FakeOpenSteward
const run = (over: Partial<Parameters<typeof runBootstrap>[0]> = {}) =>
  runBootstrap({
    superset: ss,
    os,
    supersetBaseUrl: 'http://superset:8088',
    allowedDomains: ['https://admin.example.com'],
    fallbackDbTarget: { host: 'postgres', port: 5432, database: 'opensteward' },
    pollIntervalMs: 1,
    sleep: async () => {},
    ...over,
  })

beforeEach(() => {
  ss = new FakeSuperset()
  os = new FakeOpenSteward()
})

describe('runBootstrap', () => {
  it('first run: principal, database, datasets, overview dashboard, embedding, registry', async () => {
    const s = await run()
    expect(s.principal).toBe('created')
    expect(s.databaseAction).toBe('created')
    expect(ss.databases).toHaveLength(1)
    expect(ss.databases[0]!.sqlalchemy_uri).toBe(
      'postgresql+psycopg2://os_sql_superset_abc123:pw-1@postgres:5432/opensteward',
    )
    expect(ss.datasets.map((d) => d.table_name).sort()).toEqual(
      ['connections', 'crm_contacts', 'payments_charges', RECORDS_DATASET].sort(),
    )
    expect(ss.datasets.every((d) => d.schema === 'os_analytics')).toBe(true)
    expect(s.overviewCreated).toBe(true)
    const dash = ss.dashboards.find((d) => d.slug === OVERVIEW_SLUG)!
    expect(ss.charts.length).toBe(overviewChartSpecs().length)
    expect(ss.charts.every((c) => c.dashboards[0] === dash.id)).toBe(true)
    expect(JSON.parse(dash.position_json!).GRID_ID.children.length).toBeGreaterThan(0)
    expect(ss.embedded.get(dash.id)!.allowed_domains).toEqual(['https://admin.example.com'])
    expect(os.registered).toHaveLength(1)
    expect(os.registered[0]).toMatchObject({ prune: true })
    expect(s.registered).toHaveLength(1)
    expect(s.registered[0]!.title).toBe('Connection data overview')
  })

  it('second run is idempotent apart from the rotated password', async () => {
    const first = await run()
    const counts = [ss.databases.length, ss.datasets.length, ss.dashboards.length, ss.charts.length]
    const second = await run()
    expect([
      ss.databases.length,
      ss.datasets.length,
      ss.dashboards.length,
      ss.charts.length,
    ]).toEqual(counts)
    expect(second.principal).toBe('rotated')
    expect(second.databaseAction).toBe('updated')
    expect(second.datasetsCreated).toEqual([])
    expect(second.overviewCreated).toBe(false)
    expect(ss.databases[0]!.sqlalchemy_uri).toContain(':pw-2@')
    expect(ss.refreshed.length).toBeGreaterThan(0)
    expect(second.registered).toEqual(first.registered)
  })

  it('registers author dashboards with the reserved slug prefix, with verticals', async () => {
    ss.dashboards.push({ id: 1, dashboard_title: 'CRM pipeline', slug: 'opensteward-crm-pipeline' })
    ss.dashboards.push({ id: 2, dashboard_title: 'Scratch', slug: 'scratch' })
    const s = await run()
    const titles = s.registered.map((r) => r.title)
    expect(titles).toContain('CRM pipeline')
    expect(titles).not.toContain('Scratch')
    expect(s.registered.find((r) => r.title === 'CRM pipeline')!.verticals).toEqual(['crm'])
  })

  it('imports bundles from the assets directory', async () => {
    const s = await run({ assets: [{ name: 'kpis.zip', data: new Uint8Array([80, 75, 3, 4]) }] })
    expect(s.dashboardsImported).toEqual(['kpis.zip'])
    expect(ss.uploads).toEqual(['/api/v1/dashboard/import/:kpis.zip'])
  })

  it('uses SUPERSET_DB_URI without touching principals', async () => {
    const s = await run({ dbUri: 'postgresql+psycopg2://ro:x@replica:5432/os' })
    expect(s.principal).toBe('external')
    expect(os.principals).toHaveLength(0)
    expect(ss.databases[0]!.sqlalchemy_uri).toBe('postgresql+psycopg2://ro:x@replica:5432/os')
  })

  it('refuses SQLite, a missing admin origin, and a Superset that never comes up', async () => {
    os.status.backend = 'sqlite'
    await expect(run()).rejects.toBeInstanceOf(BootstrapError)
    os.status.backend = 'postgres'
    await expect(run({ allowedDomains: [] })).rejects.toThrow(/OPENSTEWARD_ADMIN_ORIGIN/)
    ss.healthy = false
    await expect(run({ waitTimeoutMs: 0 })).rejects.toThrow(/healthy/)
  })

  it('waits for the views to be provisioned', async () => {
    os.status.provisioned = false
    let polls = 0
    const orig = os.analyticsStatus.bind(os)
    os.analyticsStatus = async () => {
      polls += 1
      if (polls === 3) os.status.provisioned = true
      return orig()
    }
    await run()
    expect(polls).toBe(3)
  })
})
