/**
 * `/admin/destinations/*` — the internal destinations surface admin-api
 * proxies. Pins: the admin guard, the data-scope header, write-only secrets,
 * scope containment (404 when a destination is outside the caller, 403 when
 * a write would widen it), the PII approval rule, the SSRF host check, test /
 * run / backfill / runs, credential rotation and the passthrough 409 — and
 * that the warehouse loaders (Snowflake, BigQuery, Databricks) and the
 * experimental Iceberg type are accepted end to end.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  CredentialStore,
  ResourceStore,
  deriveMaskKey,
  openDb,
  type DbHandle,
} from '@opensteward/shared'
import {
  DestinationStore,
  DestinationWorker,
  type DeleteSpec,
  type ExportRow,
  type ObjectStoreSink,
  type SinkFactory,
  type TableSink,
  type TableTarget,
} from '@opensteward/destinations'
import {
  createDestinationsRouter,
  destinationScopeWithin,
} from '../../src/data-access/destinations-router'
import { DATA_SCOPE_HEADER } from '../../src/data-access/scope'

const SECRET = 'd'.repeat(40)
const ADMIN = 'test-admin-secret'
const OLD_ADMIN = process.env['ADMIN_SECRET']

const ALL = { tenants: '*' as const, revealPii: true }
const ALL_NO_PII = { tenants: '*' as const }
const TENANT_A = { tenants: ['tenant-a'] }

const S3_BODY = {
  name: 'Lake',
  type: 's3',
  config: { bucket: 'lake-bucket', endpoint: 'https://s3.example.com', forcePathStyle: true },
  secrets: { accessKeyId: 'AKIA', secretAccessKey: 'very-secret-key' },
  scope: { tenants: ['tenant-a'] },
  actor: 'user-1',
}

let app: FastifyInstance
let handle: DbHandle
let store: DestinationStore
let resources: ResourceStore
let creds: CredentialStore
let written: string[]
let loaded: Array<{ type: string; table: string; rows: number }>
let sinkTestError: Error | null
let blockedHosts: string[]

class Sink implements ObjectStoreSink {
  readonly kind = 'object_store' as const
  async test() {
    if (sinkTestError) throw sinkTestError
  }
  async writeFile(path: string) {
    written.push(path)
  }
  async close() {}
}

/** Stands in for a warehouse loader: records what the worker hands it. */
class Loader implements TableSink {
  readonly kind = 'table' as const
  constructor(private readonly type: string) {}
  async test() {
    if (sinkTestError) throw sinkTestError
  }
  async applyBatch(target: TableTarget, rows: ExportRow[], deletes: DeleteSpec[]) {
    loaded.push({
      type: this.type,
      table: `os_${target.vertical}_${target.resourceType}`,
      rows: rows.length,
    })
    return { upserted: rows.length, deleted: deletes.length }
  }
  async close() {}
}

const LOADER_BODIES: Record<string, Record<string, unknown>> = {
  snowflake: {
    name: 'Warehouse',
    type: 'snowflake',
    config: {
      account: 'myorg-acct',
      warehouse: 'LOAD_WH',
      database: 'ANALYTICS',
      schema: 'OPENSTEWARD',
      stage: { type: 's3', url: 's3://lake/stage/', storageIntegration: 'OS_INT' },
    },
    secrets: { username: 'LOADER', password: 'snowflake-secret-pw' },
    scope: { tenants: ['tenant-a'] },
  },
  bigquery: {
    name: 'BQ',
    type: 'bigquery',
    config: { projectId: 'acme-analytics', dataset: 'opensteward', gcsBucket: 'acme-stage' },
    secrets: { serviceAccountJson: '{"type":"service_account","private_key":"bq-secret-key"}' },
    scope: { tenants: ['tenant-a'] },
  },
  databricks: {
    name: 'Lakehouse',
    type: 'databricks',
    config: {
      host: 'dbc-1234.cloud.databricks.com',
      httpPath: '/sql/1.0/warehouses/abc123',
      catalog: 'main',
      schema: 'opensteward',
      stage: { type: 's3', url: 's3://lake/dbx/' },
    },
    secrets: { token: 'dapi-databricks-secret' },
    scope: { tenants: ['tenant-a'] },
  },
  iceberg: {
    name: 'Iceberg',
    type: 'iceberg',
    config: {
      catalogUri: 'https://catalog.example.com/api/catalog',
      storage: { type: 's3', url: 's3://lake/iceberg/' },
    },
    secrets: { token: 'iceberg-secret-token' },
    scope: { tenants: ['tenant-a'] },
  },
}

async function build(withStore = true) {
  const sinkFactory: SinkFactory = async (dest) =>
    dest.type in LOADER_BODIES ? new Loader(dest.type) : new Sink()
  const worker = new DestinationWorker({
    store,
    feed: resources,
    connections: creds,
    resourceTypes: () => [{ vertical: 'crm', resourceType: 'contacts' }],
    classificationFor: () => ({ '*': { class: 'internal' } }),
    sinkFactory,
    hmacKey: deriveMaskKey(SECRET),
    lagMs: 0,
  })
  app = Fastify({ logger: false })
  await app.register(
    createDestinationsRouter({
      store: withStore ? store : undefined,
      runner: withStore ? worker : undefined,
      sinkFactory,
      hostGuard: async (host) => {
        if (blockedHosts.includes(host))
          throw new Error(`Host ${host} resolves to a private address.`)
      },
    }),
  )
  app.addHook('onClose', () => worker.stop())
  await app.ready()
}

function req(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
  scope: unknown = ALL,
  headers: Record<string, string> = {},
) {
  return app.inject({
    method,
    url,
    headers: {
      'x-admin-secret': ADMIN,
      ...(scope === null ? {} : { [DATA_SCOPE_HEADER]: JSON.stringify(scope) }),
      ...headers,
    },
    ...(body !== undefined ? { payload: body as object } : {}),
  })
}

async function createDest(body: Record<string, unknown> = S3_BODY, scope: unknown = ALL) {
  const res = await req('POST', '/admin/destinations', body, scope)
  expect(res.statusCode, res.body).toBe(201)
  return res.json().data as { id: string; [k: string]: unknown }
}

beforeEach(async () => {
  process.env['ADMIN_SECRET'] = ADMIN
  written = []
  loaded = []
  sinkTestError = null
  blockedHosts = []
  handle = await openDb({ sqlitePath: ':memory:' })
  creds = await CredentialStore.create(handle, SECRET)
  resources = await ResourceStore.create(handle)
  store = await DestinationStore.create(handle, SECRET)
  const conn = await creds.create(
    'hubspot',
    null,
    { accessToken: 'x' } as never,
    'A',
    'crm',
    'tenant-a',
  )
  await resources.upsertMany('crm', 'hubspot', conn, 'contacts', [{ id: 'c1' }])
  await build()
})

afterEach(async () => {
  await app.close()
  await handle.close()
  if (OLD_ADMIN === undefined) delete process.env['ADMIN_SECRET']
  else process.env['ADMIN_SECRET'] = OLD_ADMIN
})

describe('guards', () => {
  it('requires the admin secret', async () => {
    const res = await req('GET', '/admin/destinations', undefined, ALL, {
      'x-admin-secret': 'nope',
    })
    expect(res.statusCode).toBe(403)
  })

  it('requires a data scope', async () => {
    const res = await req('GET', '/admin/destinations', undefined, null)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_SCOPE')
  })

  it('answers 409 in passthrough mode, but still serves the type catalog', async () => {
    await app.close()
    await build(false)
    expect((await req('GET', '/admin/destinations')).json().error.code).toBe('DATA_STORE_DISABLED')
    const types = await req('GET', '/admin/destinations/types')
    expect(types.statusCode).toBe(200)
    expect(types.json().data.map((t: { type: string }) => t.type)).toContain('postgres')
  })
})

describe('CRUD', () => {
  it('creates without ever returning secrets', async () => {
    const res = await req('POST', '/admin/destinations', S3_BODY)
    expect(res.statusCode).toBe(201)
    expect(res.body).not.toContain('very-secret-key')
    const d = res.json().data
    expect(d).toMatchObject({
      name: 'Lake',
      type: 's3',
      secretFieldsSet: ['accessKeyId', 'secretAccessKey'],
      includePii: false,
      createdBy: 'user-1',
      enabled: true,
      scope: { tenants: ['tenant-a'] },
    })
    expect(d.config).toMatchObject({ bucket: 'lake-bucket', prefix: '', compression: 'zstd' })
    const got = await req('GET', `/admin/destinations/${d.id}`)
    expect(got.body).not.toContain('very-secret-key')
    const list = await req('GET', '/admin/destinations')
    expect(list.json().data).toHaveLength(1)
    expect(list.body).not.toContain('very-secret-key')
  })

  it('rejects bad bodies, unknown types, invalid config and blocked hosts', async () => {
    let res = await req('POST', '/admin/destinations', { ...S3_BODY, extra: 1 })
    expect(res.json().error.code).toBe('INVALID_BODY')
    res = await req('POST', '/admin/destinations', { ...S3_BODY, type: 'oracle' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('UNSUPPORTED_TYPE')
    // A loader type is accepted, and validates its own config.
    res = await req('POST', '/admin/destinations', { ...S3_BODY, type: 'snowflake' })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_CONFIG')
    res = await req('POST', '/admin/destinations', { ...S3_BODY, config: { bucket: 'x' } })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatchObject({ code: 'INVALID_CONFIG' })
    expect(res.json().error.details[0].path).toBe('bucket')
    blockedHosts = ['s3.example.com']
    res = await req('POST', '/admin/destinations', S3_BODY)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED')
    expect(res.json().error.message).toMatch(/DESTINATIONS_ALLOW_PRIVATE_HOSTS/)
  })

  it('patches, rotates credentials and deletes', async () => {
    const d = await createDest()
    let res = await req('PATCH', `/admin/destinations/${d.id}`, {
      name: 'Renamed',
      intervalSec: 900,
      enabled: false,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ name: 'Renamed', intervalSec: 900, enabled: false })

    res = await req('PATCH', `/admin/destinations/${d.id}`, { secrets: { a: 'b' } })
    expect(res.json().error.code).toBe('INVALID_BODY')

    res = await req('PUT', `/admin/destinations/${d.id}/credentials`, {
      secrets: { accessKeyId: 'NEW', secretAccessKey: 'rotated-secret' },
      actor: 'user-2',
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('rotated-secret')
    expect(await store.getSecrets(d.id)).toEqual({
      accessKeyId: 'NEW',
      secretAccessKey: 'rotated-secret',
    })
    res = await req('PUT', `/admin/destinations/${d.id}/credentials`, {
      secrets: { accessKeyId: 'half' },
    })
    expect(res.json().error.code).toBe('INVALID_CONFIG')

    expect((await req('DELETE', `/admin/destinations/${d.id}`)).statusCode).toBe(204)
    expect((await req('GET', `/admin/destinations/${d.id}`)).statusCode).toBe(404)
  })
})

describe('scope containment', () => {
  it('hides destinations outside the caller (404), lists only visible ones', async () => {
    const all = await createDest({ ...S3_BODY, scope: { tenants: '*' } })
    const a = await createDest()
    const list = await req('GET', '/admin/destinations', undefined, TENANT_A)
    expect(list.json().data.map((d: { id: string }) => d.id)).toEqual([a.id])
    for (const [m, suffix] of [
      ['GET', ''],
      ['PATCH', ''],
      ['DELETE', ''],
      ['POST', '/run'],
      ['POST', '/test'],
      ['POST', '/backfill'],
      ['GET', '/runs'],
      ['PUT', '/credentials'],
    ] as const) {
      const res = await req(
        m,
        `/admin/destinations/${all.id}${suffix}`,
        m === 'GET' || m === 'DELETE' ? undefined : {},
        TENANT_A,
      )
      expect(res.statusCode, `${m} ${suffix}`).toBe(404)
    }
  })

  it('refuses to create or widen a destination beyond the caller (403)', async () => {
    let res = await req(
      'POST',
      '/admin/destinations',
      { ...S3_BODY, scope: { tenants: '*' } },
      TENANT_A,
    )
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('SCOPE_EXCEEDS_CALLER')
    const d = await createDest(S3_BODY, TENANT_A)
    res = await req(
      'PATCH',
      `/admin/destinations/${d.id}`,
      { scope: { tenants: ['tenant-a', 'tenant-b'] } },
      TENANT_A,
    )
    expect(res.statusCode).toBe(403)
  })

  it('checks verticals, per-tenant vertical grants and financial masking', () => {
    const caller = {
      tenants: ['t1', 't2'],
      tenantVerticals: { t2: ['crm'] },
      verticals: { crm: '*' as const, ecommerce: ['orders'] },
      maskFinancial: true,
    }
    const ok = { tenants: ['t1', 't2'], verticals: { crm: ['contacts'] }, maskFinancial: true }
    expect(destinationScopeWithin(ok, caller)).toBe(true)
    // financial unmasked
    expect(destinationScopeWithin({ ...ok, maskFinancial: false }, caller)).toBe(false)
    // "all verticals" exceeds a vertical restriction
    expect(destinationScopeWithin({ tenants: ['t1'], maskFinancial: true }, caller)).toBe(false)
    // a type the caller lacks
    expect(
      destinationScopeWithin(
        { tenants: ['t1'], verticals: { ecommerce: ['orders', 'customers'] }, maskFinancial: true },
        caller,
      ),
    ).toBe(false)
    // t2 holds only crm
    expect(
      destinationScopeWithin(
        { tenants: ['t2'], verticals: { ecommerce: ['orders'] }, maskFinancial: true },
        caller,
      ),
    ).toBe(false)
    expect(
      destinationScopeWithin(
        { tenants: ['t1'], verticals: { ecommerce: ['orders'] }, maskFinancial: true },
        caller,
      ),
    ).toBe(true)
    // an unrestricted caller holds everything
    expect(destinationScopeWithin({ tenants: '*' }, { tenants: '*' })).toBe(true)
  })
})

describe('PII', () => {
  it('include_pii needs revealPii and records the approver', async () => {
    let res = await req('POST', '/admin/destinations', { ...S3_BODY, includePii: true }, ALL_NO_PII)
    expect(res.statusCode).toBe(403)
    expect(res.json().error.code).toBe('PII_NOT_PERMITTED')
    res = await req(
      'POST',
      '/admin/destinations',
      { ...S3_BODY, includePii: true, actor: 'dpo' },
      ALL,
    )
    expect(res.statusCode).toBe(201)
    expect(res.json().data).toMatchObject({ includePii: true, piiApprovedBy: 'dpo' })
  })

  it('a caller without revealPii can narrow a PII destination but not re-point it', async () => {
    const d = await createDest({ ...S3_BODY, includePii: true })
    const url = `/admin/destinations/${d.id}`
    for (const patch of [
      { config: { bucket: 'attacker-bucket' } },
      { scope: { tenants: ['tenant-a'] } },
      { includePii: true },
    ]) {
      const res = await req('PATCH', url, patch, ALL_NO_PII)
      expect(res.statusCode, JSON.stringify(patch)).toBe(403)
    }
    const creds = await req(
      'PUT',
      `${url}/credentials`,
      { secrets: { accessKeyId: 'x', secretAccessKey: 'y' } },
      ALL_NO_PII,
    )
    expect(creds.statusCode).toBe(403)
    const off = await req('PATCH', url, { includePii: false, enabled: false }, ALL_NO_PII)
    expect(off.statusCode).toBe(200)
    expect(off.json().data).toMatchObject({ includePii: false, piiApprovedBy: null })
  })
})

describe('operations', () => {
  it('test reports ok or the sink error', async () => {
    const d = await createDest()
    let res = await req('POST', `/admin/destinations/${d.id}/test`, {})
    expect(res.json().data).toMatchObject({ ok: true })
    sinkTestError = new Error('AccessDenied: bucket policy')
    res = await req('POST', `/admin/destinations/${d.id}/test`, {})
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ ok: false, error: 'AccessDenied: bucket policy' })
  })

  it('run starts a run (202), refuses a disabled or already-running destination', async () => {
    const d = await createDest()
    const res = await req('POST', `/admin/destinations/${d.id}/run`, {})
    expect(res.statusCode).toBe(202)
    const runId = res.json().data.runId as string
    expect(runId).toMatch(/^[0-9a-f-]{36}$/)

    await expect.poll(async () => (await store.listRuns(d.id))[0]?.status).toBe('success')
    const runs = await req('GET', `/admin/destinations/${d.id}/runs?limit=5`)
    expect(runs.json().data[0]).toMatchObject({ id: runId, trigger: 'manual', rowsWritten: 1 })
    expect(written.some((p) => p.startsWith('vertical=crm/resource_type=contacts/'))).toBe(true)
    expect((await req('GET', `/admin/destinations/${d.id}/runs?limit=0`)).statusCode).toBe(400)

    await store.claimLease(d.id, 'elsewhere', Date.now(), 60_000)
    const busy = await req('POST', `/admin/destinations/${d.id}/run`, {})
    expect(busy.statusCode).toBe(409)
    expect(busy.json().error.code).toBe('RUN_IN_PROGRESS')

    await req('PATCH', `/admin/destinations/${d.id}`, { enabled: false })
    const off = await req('POST', `/admin/destinations/${d.id}/run`, {})
    expect(off.json().error.code).toBe('DESTINATION_DISABLED')
  })

  it('backfill resets cursors and starts a run', async () => {
    const d = await createDest()
    await store.setRowCursor(d.id, 'crm', 'contacts', 1, 'pk')
    await store.setRowCursor(d.id, 'crm', 'deals', 1, 'pk')
    let res = await req('POST', `/admin/destinations/${d.id}/backfill`, {
      vertical: 'crm',
      resourceType: 'deals',
      run: false,
    })
    expect(res.json().data).toEqual({ cursorsReset: 1, runId: null })
    res = await req('POST', `/admin/destinations/${d.id}/backfill`, { resourceType: 'x' })
    expect(res.json().error.code).toBe('INVALID_BODY')
    res = await req('POST', `/admin/destinations/${d.id}/backfill`, {})
    expect(res.json().data.cursorsReset).toBe(1)
    expect(res.json().data.runId).toMatch(/^[0-9a-f-]{36}$/)
    await expect.poll(async () => (await store.listRuns(d.id))[0]?.status).toBe('success')
    expect((await store.listRuns(d.id))[0]!.trigger).toBe('backfill')
  })
})

describe('warehouse loaders and Iceberg', () => {
  it('lists every loader in the catalog, Iceberg flagged experimental', async () => {
    const res = await req('GET', '/admin/destinations/types', undefined, null)
    const types = res.json().data as Array<{
      type: string
      available: boolean
      experimental: boolean
    }>
    for (const t of ['snowflake', 'bigquery', 'databricks', 'iceberg']) {
      expect(
        types.find((c) => c.type === t),
        t,
      ).toMatchObject({
        available: true,
        experimental: t === 'iceberg',
      })
    }
  })

  it.each(Object.keys(LOADER_BODIES))('creates, tests and runs a %s destination', async (type) => {
    const body = LOADER_BODIES[type]!
    const d = await createDest(body)
    expect(d).toMatchObject({ type, enabled: true })
    const secret = Object.values(body['secrets'] as Record<string, string>).at(-1)!
    const got = await req('GET', `/admin/destinations/${d.id}`)
    expect(got.body).not.toContain(secret)
    expect(got.json().data.secretFieldsSet.length).toBeGreaterThan(0)

    let res = await req('POST', `/admin/destinations/${d.id}/test`, {})
    expect(res.json().data).toMatchObject({ ok: true })
    sinkTestError = new Error('Insufficient privileges to operate on schema')
    res = await req('POST', `/admin/destinations/${d.id}/test`, {})
    expect(res.json().data).toMatchObject({ ok: false, error: /Insufficient privileges/ })
    sinkTestError = null

    res = await req('POST', `/admin/destinations/${d.id}/run`, {})
    expect(res.statusCode).toBe(202)
    await expect.poll(async () => (await store.listRuns(d.id))[0]?.status).toBe('success')
    const runs = await req('GET', `/admin/destinations/${d.id}/runs`)
    expect(runs.json().data[0]).toMatchObject({ rowsWritten: 1 })
    expect(loaded).toEqual([{ type, table: 'os_crm_contacts', rows: 1 }])
    expect(written).toEqual([]) // no object-store manifest for a loader
  })

  it('SSRF-checks the Snowflake account host, Databricks host and Iceberg catalog', async () => {
    const cases: Array<[string, string]> = [
      ['snowflake', 'myorg-acct.snowflakecomputing.com'],
      ['databricks', 'dbc-1234.cloud.databricks.com'],
      ['iceberg', 'catalog.example.com'],
    ]
    for (const [type, host] of cases) {
      blockedHosts = [host]
      const res = await req('POST', '/admin/destinations', LOADER_BODIES[type])
      expect(res.statusCode, type).toBe(400)
      expect(res.json().error.code).toBe('HOST_NOT_ALLOWED')
    }
    blockedHosts = []
  })

  it('refuses identifier injection and incomplete stage credentials', async () => {
    const sf = LOADER_BODIES['snowflake']!
    let res = await req('POST', '/admin/destinations', {
      ...sf,
      config: { ...(sf['config'] as object), database: 'X"; DROP DATABASE Y; --' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toMatchObject({ code: 'INVALID_CONFIG' })
    expect(res.json().error.details[0].path).toBe('database')

    res = await req('POST', '/admin/destinations', {
      ...sf,
      config: {
        ...(sf['config'] as object),
        stage: { type: 'gcs', url: 'gcs://lake/stage/' },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toMatch(/storageIntegration/)

    const dbx = LOADER_BODIES['databricks']!
    res = await req('POST', '/admin/destinations', {
      ...dbx,
      config: {
        ...(dbx['config'] as object),
        stage: { type: 'azure', url: 'abfss://c01@acct1.dfs.core.windows.net/p/' },
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toMatch(/stageAccountKey or stageSasToken/)
  })
})
