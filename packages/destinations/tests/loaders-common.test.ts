/**
 * What every loader shares: staging-URL parsing and rendering, identifier
 * quoting and literal refusal (the injection guard), the config schemas'
 * allow-lists, the host list each loader type dials, and the engine's
 * dedupe / column planning / typed Parquet staging.
 */
import { describe, it, expect } from 'vitest'
import { parseStageUrl, renderStageUrl } from '../src/loaders/stage-url'
import { bigqueryIdent, databricksIdent, snowflakeIdent, sqlLiteral } from '../src/loaders/sql'
import {
  BigQueryConfigSchema,
  DatabricksConfigSchema,
  IcebergConfigSchema,
  SnowflakeConfigSchema,
  SnowflakeSecretsSchema,
} from '../src/loaders/schemas'
import {
  createLoaderSink,
  dedupeRows,
  planNewColumns,
  type LoaderDriver,
} from '../src/loaders/engine'
import { createStage } from '../src/loaders/stage'
import { destinationHosts } from '../src/hosts'
import { createSink } from '../src/sinks'
import { DestinationConfigError, assertComplete, parseConfig, parseSecrets } from '../src/types'
import { readParquetRows } from '../src/writers/parquet'
import { MAX_FLATTENED_COLUMNS } from '../src/sinks/postgres'
import { TARGET, allowAll, del, fakeObjectStore, ids, row } from './helpers/loader-fakes'

const SNOWFLAKE = {
  account: 'myorg-acct',
  warehouse: 'LOAD_WH',
  database: 'ANALYTICS',
  schema: 'OPENSTEWARD',
  stage: { type: 's3', url: 's3://lake/stage/', storageIntegration: 'OS_INT' },
}

describe('stage URLs', () => {
  it('parses every spelling and renders each dialect', () => {
    const s3 = parseStageUrl('s3://lake-bucket/exports/prod')
    expect(s3).toEqual({ type: 's3', bucket: 'lake-bucket', prefix: 'exports/prod/' })
    expect(renderStageUrl(s3, 'snowflake')).toBe('s3://lake-bucket/exports/prod/')
    expect(renderStageUrl(s3, 'spark')).toBe('s3://lake-bucket/exports/prod/')

    const gcs = parseStageUrl('gcs://lake/p/')
    expect(gcs).toEqual({ type: 'gcs', bucket: 'lake', prefix: 'p/' })
    expect(renderStageUrl(gcs, 'snowflake')).toBe('gcs://lake/p/')
    expect(renderStageUrl(gcs, 'spark')).toBe('gs://lake/p/')
    expect(parseStageUrl('gs://lake')).toEqual({ type: 'gcs', bucket: 'lake', prefix: '' })

    const az = parseStageUrl('azure://acct1.blob.core.windows.net/exports/os/')
    expect(az).toEqual({ type: 'azure', account: 'acct1', container: 'exports', prefix: 'os/' })
    expect(renderStageUrl(az, 'snowflake')).toBe('azure://acct1.blob.core.windows.net/exports/os/')
    expect(renderStageUrl(az, 'spark')).toBe('abfss://exports@acct1.dfs.core.windows.net/os/')
    expect(parseStageUrl('abfss://exports@acct1.dfs.core.windows.net/os')).toEqual(az)
  })

  it.each([
    ["s3://lake/pre'fix/"],
    ['s3://lake/a/../b'],
    ['s3://lake/a b/'],
    ['s3://LAKE/'],
    ['s3://lake/x\\y'],
    ["s3://lake/x';DROP TABLE t;--"],
    ['http://lake/'],
    ['azure://evil.example.com/c/'],
    ['abfss://c@acct.dfs.core.windows.net.evil.com/'],
    ['s3://lake/?q=1'],
  ])('refuses %s', (url) => {
    expect(() => parseStageUrl(url)).toThrow()
  })
})

describe('SQL quoting', () => {
  it('quotes identifiers behind allow-lists', () => {
    expect(snowflakeIdent('os_crm_contacts')).toBe('"OS_CRM_CONTACTS"')
    expect(snowflakeIdent('order')).toBe('"ORDER"')
    expect(databricksIdent('main')).toBe('`main`')
    expect(bigqueryIdent('my-project-1', 'project')).toBe('`my-project-1`')
    expect(bigqueryIdent('example.com:my-proj', 'project')).toBe('`example.com:my-proj`')
    expect(bigqueryIdent('raw_data', 'dataset')).toBe('`raw_data`')
  })

  it.each([
    'a"b',
    'x"; DROP TABLE t; --',
    'db.schema',
    'has space',
    '',
    '1abc',
    'a`b',
    "a'b",
    'a\nb',
  ])('refuses identifier %j everywhere', (bad) => {
    expect(() => snowflakeIdent(bad)).toThrow(DestinationConfigError)
    expect(() => databricksIdent(bad)).toThrow(DestinationConfigError)
    expect(() => bigqueryIdent(bad, 'dataset')).toThrow(DestinationConfigError)
    expect(() => bigqueryIdent(bad, 'column')).toThrow(DestinationConfigError)
  })

  it('refuses literals that could break out of their quotes', () => {
    expect(sqlLiteral('s3://lake/p/_opensteward_stage/t/')).toBe(
      "'s3://lake/p/_opensteward_stage/t/'",
    )
    for (const bad of ["x'y", 'x\\y', 'x;y', 'x\ny', 'x"y', 'x`y', 'x$$y']) {
      expect(() => sqlLiteral(bad), bad).toThrow(DestinationConfigError)
    }
  })

  it('does not echo a hostile value verbatim in the error', () => {
    try {
      snowflakeIdent(`x\u0000${'y'.repeat(200)}`)
      expect.unreachable()
    } catch (err) {
      expect((err as Error).message.length).toBeLessThan(100)
      expect((err as Error).message).not.toContain('\u0000')
    }
  })
})

describe('loader config schemas', () => {
  it('accepts a valid Snowflake config and refuses injection in every name', () => {
    expect(SnowflakeConfigSchema.parse(SNOWFLAKE)).toMatchObject({ database: 'ANALYTICS' })
    for (const [key, value] of [
      ['database', 'X"; DROP DATABASE Y; --'],
      ['schema', 'a.b'],
      ['warehouse', "wh'"],
      ['role', 'r ole'],
      ['account', 'acct/../../evil'],
      ['account', 'evil.com#'],
      ['host', 'https://evil.com'],
    ] as const) {
      const r = SnowflakeConfigSchema.safeParse({ ...SNOWFLAKE, [key]: value })
      expect(r.success, `${key}=${value}`).toBe(false)
    }
    const badStage = SnowflakeConfigSchema.safeParse({
      ...SNOWFLAKE,
      stage: { type: 'gcs', url: 's3://lake/stage/' },
    })
    expect(badStage.success).toBe(false)
    expect(
      SnowflakeConfigSchema.safeParse({
        ...SNOWFLAKE,
        stage: { ...SNOWFLAKE.stage, storageIntegration: 'X; DROP' },
      }).success,
    ).toBe(false)
  })

  it('requires exactly one Snowflake credential', () => {
    expect(SnowflakeSecretsSchema.safeParse({ username: 'u' }).success).toBe(false)
    expect(SnowflakeSecretsSchema.safeParse({ username: 'u', password: 'p' }).success).toBe(true)
    expect(
      SnowflakeSecretsSchema.safeParse({
        username: 'u',
        password: 'p',
        privateKey: `-----BEGIN PRIVATE KEY-----${'A'.repeat(64)}-----END PRIVATE KEY-----`,
      }).success,
    ).toBe(false)
    expect(
      SnowflakeSecretsSchema.safeParse({
        username: 'u',
        password: 'p',
        stageAccessKeyId: 'AKIAXXXXXXXX',
      }).success,
    ).toBe(false)
    // Inline stage credentials may not carry quote characters into the COPY statement.
    expect(
      SnowflakeSecretsSchema.safeParse({
        username: 'u',
        password: 'p',
        stageAccessKeyId: 'AKIAXXXXXXXX',
        stageSecretAccessKey: "abc'); DROP TABLE x; --",
      }).success,
    ).toBe(false)
  })

  it('validates BigQuery, Databricks and Iceberg names', () => {
    const bq = { projectId: 'my-project', dataset: 'opensteward', gcsBucket: 'lake-stage' }
    expect(BigQueryConfigSchema.parse(bq)).toMatchObject({ gcsPrefix: '' })
    expect(BigQueryConfigSchema.safeParse({ ...bq, dataset: 'a-b' }).success).toBe(false)
    expect(BigQueryConfigSchema.safeParse({ ...bq, projectId: 'x`y' }).success).toBe(false)

    const dbx = {
      host: 'dbc-1234.cloud.databricks.com',
      httpPath: '/sql/1.0/warehouses/abc123',
      schema: 'opensteward',
      stage: { type: 's3', url: 's3://lake/stage/' },
    }
    expect(DatabricksConfigSchema.parse(dbx)).toMatchObject({ schema: 'opensteward' })
    expect(
      DatabricksConfigSchema.safeParse({ ...dbx, host: 'https://dbc.example.com' }).success,
    ).toBe(false)
    expect(DatabricksConfigSchema.safeParse({ ...dbx, catalog: 'main`; --' }).success).toBe(false)

    const ice = {
      catalogUri: 'https://catalog.example.com/api/catalog',
      storage: { type: 's3', url: 's3://lake/iceberg/' },
    }
    expect(IcebergConfigSchema.parse(ice)).toMatchObject({ namespace: 'opensteward' })
    expect(IcebergConfigSchema.safeParse({ ...ice, namespace: 'a..b' }).success).toBe(false)
    expect(IcebergConfigSchema.safeParse({ ...ice, catalogUri: 'file:///etc' }).success).toBe(false)
  })

  it('parses loader types through parseConfig / parseSecrets / assertComplete', () => {
    const cfg = parseConfig('snowflake', SNOWFLAKE)
    const secrets = parseSecrets('snowflake', { username: 'u', password: 'p', privateKey: '' })
    expect(secrets).toEqual({ username: 'u', password: 'p' })
    expect(() => assertComplete('snowflake', secrets, cfg)).not.toThrow()
    const noIntegration = parseConfig('snowflake', {
      ...SNOWFLAKE,
      stage: { type: 'gcs', url: 'gcs://lake/stage/' },
    })
    expect(() => assertComplete('snowflake', secrets, noIntegration)).toThrow(/storageIntegration/)
    const azure = parseConfig('databricks', {
      host: 'dbc.example.com',
      httpPath: '/sql/1.0/warehouses/x',
      schema: 's',
      stage: { type: 'azure', url: 'abfss://c01@acct1.dfs.core.windows.net/p/' },
    })
    expect(() => assertComplete('databricks', { token: 'dapi12345678' }, azure)).toThrow(
      /stageAccountKey or stageSasToken/,
    )
  })

  it('lists the operator-controlled hosts of each loader type', () => {
    expect(destinationHosts('snowflake', SNOWFLAKE)).toEqual(['myorg-acct.snowflakecomputing.com'])
    expect(
      destinationHosts('snowflake', { ...SNOWFLAKE, account: 'My_Acct', host: undefined }),
    ).toEqual(['my-acct.snowflakecomputing.com'])
    expect(
      destinationHosts('snowflake', {
        ...SNOWFLAKE,
        host: 'acct.privatelink.snowflakecomputing.com',
      }),
    ).toEqual(['acct.privatelink.snowflakecomputing.com'])
    expect(destinationHosts('databricks', { host: 'dbc.example.com' })).toEqual(['dbc.example.com'])
    expect(destinationHosts('bigquery', { projectId: 'p' })).toEqual([])
    expect(
      destinationHosts('iceberg', {
        catalogUri: 'https://cat.example.com/api',
        storage: { endpoint: 'http://minio:9000' },
      }),
    ).toEqual(['cat.example.com', 'minio'])
  })

  it('builds each loader through the sink factory without touching the network', async () => {
    const guarded: string[] = []
    const hostGuard = async (h: string) => void guarded.push(h)
    const sf = await createSink(
      'snowflake',
      parseConfig('snowflake', SNOWFLAKE),
      { username: 'u', password: 'p' },
      { hostGuard },
    )
    expect(sf.kind).toBe('table')
    await sf.close()
    const dbx = await createSink(
      'databricks',
      parseConfig('databricks', {
        host: 'dbc.example.com',
        httpPath: '/sql/1.0/warehouses/x',
        schema: 's',
        stage: { type: 's3', url: 's3://lake/stage/' },
      }),
      { token: 'dapi12345678' },
      { hostGuard },
    )
    expect(dbx.kind).toBe('table')
    await dbx.close()
    const ice = await createSink(
      'iceberg',
      parseConfig('iceberg', {
        catalogUri: 'https://cat.example.com/api',
        storage: { type: 's3', url: 's3://lake/ice/' },
      }),
      {},
      { hostGuard },
    )
    expect(ice.kind).toBe('table')
    await ice.close()
    expect(guarded).toEqual([
      'myorg-acct.snowflakecomputing.com',
      'dbc.example.com',
      'cat.example.com',
    ])
  })
})

describe('loader engine', () => {
  it('dedupes rows on _pk keeping the newest', () => {
    const rows = [row('a', 10), row('b', 5), row('a', 30), row('a', 20)]
    expect(dedupeRows(rows).map((r) => [r.resource_id, r.changed_at])).toEqual([
      ['a', 30],
      ['b', 5],
    ])
    const unique = [row('a', 1)]
    expect(dedupeRows(unique)).toBe(unique)
  })

  it('plans new columns sorted, typed and capped', () => {
    const existing = new Map([
      ['_pk', 'string' as const],
      ['email', 'string' as const],
    ])
    const rows = [
      row('a', 1, { email: 'x', zeta: 1, alpha: true, mid: 1.5 }),
      row('b', 1, { zeta: 2.5 }),
    ]
    expect(planNewColumns(existing, rows)).toEqual([
      { name: 'alpha', kind: 'bool' },
      { name: 'mid', kind: 'float' },
      { name: 'zeta', kind: 'float' },
    ])
    expect(planNewColumns(existing, rows, 2)).toEqual([{ name: 'alpha', kind: 'bool' }])
    const full = new Map([...Array(MAX_FLATTENED_COLUMNS)].map((_, i) => [`c${i}`, 'int' as const]))
    expect(planNewColumns(full, rows)).toEqual([])
  })

  it('stages one file typed to the table, merges, applies deletes, cleans up', async () => {
    const store = fakeObjectStore()
    const calls: string[] = []
    let cols: Map<string, 'string' | 'int' | 'float' | 'bool'> | null = null
    let staged: Awaited<ReturnType<typeof readParquetRows>> | undefined
    const driver: LoaderDriver = {
      async describe(table) {
        calls.push(`describe ${table}`)
        return cols
      },
      async createTable(table) {
        calls.push(`create ${table}`)
        cols = new Map([
          ['_pk', 'string'],
          ['count', 'int'], // established earlier as an integer column
        ])
      },
      async addColumns(table, columns) {
        calls.push(`add ${columns.map((c) => `${c.name}:${c.kind}`).join(',')}`)
      },
      async mergeRows(table, file, columns, rowCount) {
        calls.push(`merge ${file.url} ${columns.map((c) => c.name).join(',')} ${rowCount}`)
        staged = await readParquetRows(store.files.get(file.path)!.bytes)
        return rowCount
      },
      async applyDeletes(table, deletes, stageDeletes) {
        const file = await stageDeletes(deletes)
        calls.push(`deletes ${file.name} ${deletes.length}`)
        return deletes.length
      },
      async test() {
        calls.push('test')
      },
      async close() {
        calls.push('close')
      },
    }
    const stage = await createStage({ type: 's3', url: 's3://lake/stage/' }, {}, 'snowflake', {
      hostGuard: allowAll,
      sink: store,
    })
    const sink = createLoaderSink({ stage, driver, newId: ids('b') })
    const res = await sink.applyBatch(
      TARGET,
      [
        row('a', 1, { count: 3, name: 'Ada' }),
        row('b', 2, { count: 'many', name: 'Bob' }), // doesn't fit the int column → null
        row('a', 5, { count: 4, name: 'Ada L.' }),
      ],
      [del({ pk: 'crm:hubspot:c1:contacts:z', deletedAt: 9 })],
    )
    expect(res).toEqual({ upserted: 2, deleted: 1 })
    expect(calls).toEqual([
      'describe os_crm_contacts',
      'create os_crm_contacts',
      'describe os_crm_contacts',
      'add name:string',
      'merge s3://lake/stage/_opensteward_stage/os_crm_contacts/b1-rows.parquet count,name 2',
      'deletes b2-deletes.parquet 1',
    ])
    expect(staged!.columns.map((c) => c.name).slice(-2)).toEqual(['count', 'name'])
    expect(staged!.rows.map((r) => [r['resource_id'], r['count'], r['name']])).toEqual([
      ['a', 4n, 'Ada L.'],
      ['b', null, 'Bob'],
    ])
    // Both staged files removed after the batch.
    expect(store.deleted).toEqual([
      '_opensteward_stage/os_crm_contacts/b1-rows.parquet',
      '_opensteward_stage/os_crm_contacts/b2-deletes.parquet',
    ])
    expect(store.files.size).toBe(0)

    // Deletes for a table that doesn't exist are skipped.
    cols = null
    const empty = createLoaderSink({ stage, driver, newId: ids('c') })
    calls.length = 0
    expect(await empty.applyBatch(TARGET, [], [del({ scope: 'all' })])).toEqual({
      upserted: 0,
      deleted: 0,
    })
    expect(calls).toEqual(['describe os_crm_contacts'])

    await sink.test()
    expect(store.tested).toBe(1)
    await sink.close()
    expect(calls.at(-1)).toBe('close')
    expect(store.closed).toBe(true)
  })

  it('removes the staged file and forgets cached columns when the merge fails', async () => {
    const store = fakeObjectStore()
    let describes = 0
    const driver: LoaderDriver = {
      describe: async () => (describes++, new Map([['_pk', 'string']])),
      createTable: async () => {},
      addColumns: async () => {},
      mergeRows: async () => {
        throw new Error('warehouse down')
      },
      applyDeletes: async () => 0,
      test: async () => {},
      close: async () => {},
    }
    const stage = await createStage({ type: 's3', url: 's3://lake/' }, {}, 'spark', {
      hostGuard: allowAll,
      sink: store,
    })
    const sink = createLoaderSink({ stage, driver, newId: ids() })
    await expect(sink.applyBatch(TARGET, [row('a', 1)], [])).rejects.toThrow('warehouse down')
    expect(store.files.size).toBe(0)
    await expect(sink.applyBatch(TARGET, [row('a', 1)], [])).rejects.toThrow('warehouse down')
    expect(describes).toBe(2)
  })
})
