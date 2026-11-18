/**
 * Snowflake loader against a fake connection: the exact statements and
 * bind values of a first batch (describe → create → add columns → temporary
 * staging table → COPY INTO → MERGE → drop), the forward-only MERGE guard,
 * deletes of every scope, the stage read clause (storage integration or
 * inline credentials), the host guard, and connection tests.
 */
import { describe, it, expect } from 'vitest'
import {
  createSnowflakeLoader,
  type SnowflakeBind,
  type SnowflakeClientLike,
  type SnowflakeConnectOptions,
} from '../src/loaders/snowflake'
import { SnowflakeConfigSchema, SnowflakeSecretsSchema } from '../src/loaders/schemas'
import { DestinationConfigError } from '../src/types'
import { readParquetRows } from '../src/writers/parquet'
import {
  TARGET,
  allowAll,
  del,
  fakeObjectStore,
  ids,
  norm,
  row,
  startingWith,
} from './helpers/loader-fakes'

const CONFIG = SnowflakeConfigSchema.parse({
  account: 'myorg-acct',
  warehouse: 'load_wh',
  database: 'analytics',
  schema: 'opensteward',
  role: 'loader',
  stage: { type: 's3', url: 's3://lake/stage/', storageIntegration: 'os_int' },
})
const SECRETS = SnowflakeSecretsSchema.parse({ username: 'LOADER', password: 'pw' })

/** Columns INFORMATION_SCHEMA reports for a freshly created table. */
const FIXED_INFO = [
  ['_PK', 'TEXT'],
  ['CONNECTION_ID', 'TEXT'],
  ['OWNER_TENANT_ID', 'TEXT'],
  ['PLATFORM', 'TEXT'],
  ['VERTICAL', 'TEXT'],
  ['RESOURCE_TYPE', 'TEXT'],
  ['RESOURCE_ID', 'TEXT'],
  ['CHANGED_AT', 'TIMESTAMP_TZ'],
  ['NORM_VERSION', 'TEXT'],
  ['_DELETED', 'BOOLEAN'],
  ['DATA', 'VARIANT'],
  ['_EXPORTED_AT', 'TIMESTAMP_TZ'],
].map(([COLUMN_NAME, DATA_TYPE]) => ({ COLUMN_NAME, DATA_TYPE }))

function fakeSnowflake(respond: (sql: string) => Array<Record<string, unknown>> = () => []) {
  const statements: Array<{ sql: string; binds?: SnowflakeBind[] }> = []
  const connects: SnowflakeConnectOptions[] = []
  let closed = 0
  const client: SnowflakeClientLike = {
    async execute(sql, binds) {
      statements.push({ sql: norm(sql), ...(binds ? { binds } : {}) })
      return respond(norm(sql))
    },
    async close() {
      closed++
    },
  }
  return {
    statements,
    connects,
    get closed() {
      return closed
    },
    clientFactory: async (o: SnowflakeConnectOptions) => {
      connects.push(o)
      return client
    },
  }
}

describe('Snowflake loader', () => {
  it('creates, stages, copies and merges a first batch', async () => {
    let created = false
    const sf = fakeSnowflake((sql) => {
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS')) created = true
      if (sql.startsWith('SELECT COLUMN_NAME')) return created ? FIXED_INFO : []
      if (sql.startsWith('MERGE')) {
        return [{ 'number of rows inserted': 2, 'number of rows updated': 0 }]
      }
      return []
    })
    const store = fakeObjectStore()
    const guarded: string[] = []
    let stagedRows: Awaited<ReturnType<typeof readParquetRows>> | undefined
    const origWrite = store.writeFile
    store.writeFile = async (path, bytes, ct) => {
      if (path.endsWith('-rows.parquet')) stagedRows = await readParquetRows(bytes)
      return origWrite(path, bytes, ct)
    }
    const sink = await createSnowflakeLoader(CONFIG, SECRETS, {
      hostGuard: async (h) => void guarded.push(h),
      sink: store,
      clientFactory: sf.clientFactory,
      newId: ids('b'),
    })
    expect(guarded).toEqual(['myorg-acct.snowflakecomputing.com'])
    expect(sf.connects).toEqual([]) // lazily connected

    const res = await sink.applyBatch(
      TARGET,
      [row('a', 1_700_000_000_000, { first_name: 'Ada', score: 7 }), row('b', 1_700_000_000_001)],
      [],
    )
    expect(res).toEqual({ upserted: 2, deleted: 0 })
    expect(sf.connects).toEqual([
      {
        account: 'myorg-acct',
        accessUrl: 'https://myorg-acct.snowflakecomputing.com',
        username: 'LOADER',
        password: 'pw',
        warehouse: 'load_wh',
        database: 'analytics',
        schema: 'opensteward',
        role: 'loader',
      },
    ])
    const dir = 's3://lake/stage/_opensteward_stage/os_crm_contacts/'
    expect(sf.statements).toEqual([
      { sql: 'USE SCHEMA "ANALYTICS"."OPENSTEWARD"' },
      {
        sql: 'SELECT COLUMN_NAME, DATA_TYPE FROM "ANALYTICS".INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        binds: ['OPENSTEWARD', 'OS_CRM_CONTACTS'],
      },
      {
        sql:
          'CREATE TABLE IF NOT EXISTS "OS_CRM_CONTACTS" ("_PK" VARCHAR NOT NULL, "CONNECTION_ID" VARCHAR, ' +
          '"OWNER_TENANT_ID" VARCHAR, "PLATFORM" VARCHAR NOT NULL, "VERTICAL" VARCHAR NOT NULL, ' +
          '"RESOURCE_TYPE" VARCHAR NOT NULL, "RESOURCE_ID" VARCHAR NOT NULL, "CHANGED_AT" TIMESTAMP_TZ NOT NULL, ' +
          '"NORM_VERSION" VARCHAR, "_DELETED" BOOLEAN NOT NULL DEFAULT FALSE, "DATA" VARIANT, ' +
          '"_EXPORTED_AT" TIMESTAMP_TZ, PRIMARY KEY ("_PK"))',
      },
      {
        sql: 'SELECT COLUMN_NAME, DATA_TYPE FROM "ANALYTICS".INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
        binds: ['OPENSTEWARD', 'OS_CRM_CONTACTS'],
      },
      { sql: 'ALTER TABLE "OS_CRM_CONTACTS" ADD COLUMN IF NOT EXISTS "FIRST_NAME" VARCHAR' },
      { sql: 'ALTER TABLE "OS_CRM_CONTACTS" ADD COLUMN IF NOT EXISTS "SCORE" NUMBER(38,0)' },
      {
        sql:
          'CREATE OR REPLACE TEMPORARY TABLE "OS_STAGE_OS_CRM_CONTACTS" ("_PK" VARCHAR, "CONNECTION_ID" VARCHAR, ' +
          '"OWNER_TENANT_ID" VARCHAR, "PLATFORM" VARCHAR, "VERTICAL" VARCHAR, "RESOURCE_TYPE" VARCHAR, ' +
          '"RESOURCE_ID" VARCHAR, "CHANGED_AT" TIMESTAMP_TZ, "NORM_VERSION" VARCHAR, "_DELETED" BOOLEAN, ' +
          '"DATA" VARCHAR, "FIRST_NAME" VARCHAR, "SCORE" NUMBER(38,0))',
      },
      {
        sql:
          `COPY INTO "OS_STAGE_OS_CRM_CONTACTS" FROM '${dir}' STORAGE_INTEGRATION = "OS_INT" ` +
          `FILES = ('b1-rows.parquet') FILE_FORMAT = (TYPE = PARQUET USE_LOGICAL_TYPE = TRUE) ` +
          'MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE ON_ERROR = ABORT_STATEMENT FORCE = TRUE',
      },
      {
        sql:
          'MERGE INTO "OS_CRM_CONTACTS" AS t USING "OS_STAGE_OS_CRM_CONTACTS" AS s ON t."_PK" = s."_PK" ' +
          'WHEN MATCHED AND t."CHANGED_AT" <= s."CHANGED_AT" THEN UPDATE SET ' +
          '"CONNECTION_ID" = s."CONNECTION_ID", "OWNER_TENANT_ID" = s."OWNER_TENANT_ID", ' +
          '"PLATFORM" = s."PLATFORM", "VERTICAL" = s."VERTICAL", "RESOURCE_TYPE" = s."RESOURCE_TYPE", ' +
          '"RESOURCE_ID" = s."RESOURCE_ID", "CHANGED_AT" = s."CHANGED_AT", "NORM_VERSION" = s."NORM_VERSION", ' +
          '"_DELETED" = s."_DELETED", "DATA" = PARSE_JSON(s."DATA"), "FIRST_NAME" = s."FIRST_NAME", ' +
          '"SCORE" = s."SCORE", "_EXPORTED_AT" = CURRENT_TIMESTAMP() ' +
          'WHEN NOT MATCHED THEN INSERT ("_PK", "CONNECTION_ID", "OWNER_TENANT_ID", "PLATFORM", "VERTICAL", ' +
          '"RESOURCE_TYPE", "RESOURCE_ID", "CHANGED_AT", "NORM_VERSION", "_DELETED", "DATA", "FIRST_NAME", ' +
          '"SCORE", "_EXPORTED_AT") VALUES (s."_PK", s."CONNECTION_ID", s."OWNER_TENANT_ID", s."PLATFORM", ' +
          's."VERTICAL", s."RESOURCE_TYPE", s."RESOURCE_ID", s."CHANGED_AT", s."NORM_VERSION", s."_DELETED", ' +
          'PARSE_JSON(s."DATA"), s."FIRST_NAME", s."SCORE", CURRENT_TIMESTAMP())',
      },
      { sql: 'DROP TABLE IF EXISTS "OS_STAGE_OS_CRM_CONTACTS"' },
    ])
    // The staged file has every table column, typed, and is removed afterwards.
    expect(stagedRows!.columns.map((c) => c.name)).toEqual([
      '_pk',
      'connection_id',
      'owner_tenant_id',
      'platform',
      'vertical',
      'resource_type',
      'resource_id',
      'changed_at',
      'norm_version',
      '_deleted',
      'data',
      'first_name',
      'score',
    ])
    expect(stagedRows!.rows[1]).toMatchObject({ resource_id: 'b', first_name: null, score: null })
    expect(store.deleted).toEqual(['_opensteward_stage/os_crm_contacts/b1-rows.parquet'])

    // Second batch: columns are cached; only the new one is added.
    sf.statements.length = 0
    await sink.applyBatch(TARGET, [row('c', 5, { first_name: 'Cy', vip: true })], [])
    expect(sf.statements.map((s) => s.sql)).toEqual(
      startingWith([
        'ALTER TABLE "OS_CRM_CONTACTS" ADD COLUMN IF NOT EXISTS "VIP" BOOLEAN',
        'CREATE OR REPLACE TEMPORARY TABLE "OS_STAGE_OS_CRM_CONTACTS"',
        `COPY INTO "OS_STAGE_OS_CRM_CONTACTS" FROM 's3://lake/stage/_op`,
        'MERGE INTO "OS_CRM_CONTACTS" AS t USING "OS_STAGE_OS_CRM_CONTACTS"',
        'DROP TABLE IF EXISTS "OS_STAGE_OS_CRM_CONTACTS"',
      ]),
    )

    await sink.close()
    expect(sf.closed).toBe(1)
    expect(store.closed).toBe(true)
  })

  it('applies record deletes from a staged file and wider scopes with binds', async () => {
    const sf = fakeSnowflake((sql) => {
      if (sql.startsWith('SELECT COLUMN_NAME')) return FIXED_INFO
      if (sql.startsWith('DELETE')) return [{ 'number of rows deleted': 1 }]
      return []
    })
    const store = fakeObjectStore()
    let stagedDeletes: Awaited<ReturnType<typeof readParquetRows>> | undefined
    const origWrite = store.writeFile
    store.writeFile = async (path, bytes, ct) => {
      if (path.endsWith('-deletes.parquet')) stagedDeletes = await readParquetRows(bytes)
      return origWrite(path, bytes, ct)
    }
    const sink = await createSnowflakeLoader(CONFIG, SECRETS, {
      hostGuard: allowAll,
      sink: store,
      clientFactory: sf.clientFactory,
      newId: ids('d'),
    })
    const res = await sink.applyBatch(
      TARGET,
      [],
      [
        del({ tombstoneId: 1, pk: 'crm:hubspot:c1:contacts:a', deletedAt: 100 }),
        del({ tombstoneId: 2, pk: 'crm:hubspot:c1:contacts:a', deletedAt: 200 }),
        del({ tombstoneId: 3, scope: 'connection', connectionId: null, deletedAt: 300 }),
        del({ tombstoneId: 4, scope: 'all', vertical: null, platform: null, deletedAt: 400 }),
      ],
    )
    expect(res).toEqual({ upserted: 0, deleted: 3 })
    // One staged row per _pk, the newest tombstone.
    expect(stagedDeletes!.rows.map((r) => [r['_pk'], r['deleted_at']])).toEqual([
      ['crm:hubspot:c1:contacts:a', 200],
    ])
    expect(sf.statements.slice(2)).toEqual([
      {
        sql:
          'CREATE OR REPLACE TEMPORARY TABLE "OS_DEL_OS_CRM_CONTACTS" ("TOMBSTONE_ID" NUMBER(38,0), ' +
          '"SCOPE" VARCHAR, "_PK" VARCHAR, "VERTICAL" VARCHAR, "PLATFORM" VARCHAR, "CONNECTION_ID" VARCHAR, ' +
          '"OWNER_TENANT_ID" VARCHAR, "RESOURCE_TYPE" VARCHAR, "RESOURCE_ID" VARCHAR, ' +
          '"DELETED_AT" TIMESTAMP_TZ, "_DELETED" BOOLEAN)',
      },
      {
        sql:
          `COPY INTO "OS_DEL_OS_CRM_CONTACTS" FROM 's3://lake/stage/_opensteward_stage/os_crm_contacts/' ` +
          `STORAGE_INTEGRATION = "OS_INT" FILES = ('d1-deletes.parquet') ` +
          'FILE_FORMAT = (TYPE = PARQUET USE_LOGICAL_TYPE = TRUE) MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE ' +
          'ON_ERROR = ABORT_STATEMENT FORCE = TRUE',
      },
      {
        sql:
          'DELETE FROM "OS_CRM_CONTACTS" USING "OS_DEL_OS_CRM_CONTACTS" AS d ' +
          'WHERE "OS_CRM_CONTACTS"."_PK" = d."_PK" AND "OS_CRM_CONTACTS"."CHANGED_AT" <= d."DELETED_AT"',
      },
      { sql: 'DROP TABLE IF EXISTS "OS_DEL_OS_CRM_CONTACTS"' },
      {
        sql:
          'DELETE FROM "OS_CRM_CONTACTS" WHERE "PLATFORM" = ? AND EQUAL_NULL("CONNECTION_ID", ?) ' +
          'AND "CHANGED_AT" <= TO_TIMESTAMP_TZ(TO_NUMBER(?), 3)',
        binds: ['hubspot', null, '300'],
      },
      {
        sql: 'DELETE FROM "OS_CRM_CONTACTS" WHERE "CHANGED_AT" <= TO_TIMESTAMP_TZ(TO_NUMBER(?), 3)',
        binds: ['400'],
      },
    ])
    expect(store.deleted).toEqual(['_opensteward_stage/os_crm_contacts/d1-deletes.parquet'])
  })

  it('never binds tombstone values into SQL text', async () => {
    const sf = fakeSnowflake((sql) => (sql.startsWith('SELECT COLUMN_NAME') ? FIXED_INFO : []))
    const sink = await createSnowflakeLoader(CONFIG, SECRETS, {
      hostGuard: allowAll,
      sink: fakeObjectStore(),
      clientFactory: sf.clientFactory,
    })
    const evil = "x'); DROP TABLE users; --"
    await sink.applyBatch(
      TARGET,
      [],
      [del({ scope: 'connection', platform: evil, connectionId: evil, deletedAt: 1 })],
    )
    const last = sf.statements.at(-1)!
    expect(last.sql).not.toContain('DROP TABLE users')
    expect(last.binds).toEqual([evil, evil, '1'])
  })

  it('passes inline S3 / Azure stage credentials when there is no storage integration', async () => {
    const s3 = SnowflakeConfigSchema.parse({
      ...CONFIG,
      stage: { type: 's3', url: 's3://lake/st/' },
    })
    const sf = fakeSnowflake((sql) => (sql.startsWith('SELECT COLUMN_NAME') ? FIXED_INFO : []))
    const sink = await createSnowflakeLoader(
      s3,
      SnowflakeSecretsSchema.parse({
        ...SECRETS,
        stageAccessKeyId: 'AKIAEXAMPLE1234',
        stageSecretAccessKey: 'abc/DEF+ghi=jkl0123',
      }),
      {
        hostGuard: allowAll,
        sink: fakeObjectStore(),
        clientFactory: sf.clientFactory,
        newId: ids(),
      },
    )
    await sink.applyBatch(TARGET, [row('a', 1)], [])
    expect(sf.statements.find((s) => s.sql.startsWith('COPY'))!.sql).toContain(
      "CREDENTIALS = (AWS_KEY_ID = 'AKIAEXAMPLE1234' AWS_SECRET_KEY = 'abc/DEF+ghi=jkl0123')",
    )

    const az = SnowflakeConfigSchema.parse({
      ...CONFIG,
      stage: { type: 'azure', url: 'azure://acct1.blob.core.windows.net/exports/st/' },
    })
    const sf2 = fakeSnowflake((sql) => (sql.startsWith('SELECT COLUMN_NAME') ? FIXED_INFO : []))
    const sink2 = await createSnowflakeLoader(
      az,
      SnowflakeSecretsSchema.parse({ ...SECRETS, stageSasToken: '?sv=2024&sig=abc%2F' }),
      {
        hostGuard: allowAll,
        sink: fakeObjectStore(),
        clientFactory: sf2.clientFactory,
        newId: ids(),
      },
    )
    await sink2.applyBatch(TARGET, [row('a', 1)], [])
    const copy = sf2.statements.find((s) => s.sql.startsWith('COPY'))!.sql
    expect(copy).toContain(
      "FROM 'azure://acct1.blob.core.windows.net/exports/st/_opensteward_stage/os_crm_contacts/'",
    )
    expect(copy).toContain("CREDENTIALS = (AZURE_SAS_TOKEN = 'sv=2024&sig=abc%2F')")
  })

  it('refuses a GCS stage without an integration, bad names and blocked hosts before connecting', async () => {
    const sf = fakeSnowflake()
    const deps = { hostGuard: allowAll, sink: fakeObjectStore(), clientFactory: sf.clientFactory }
    await expect(
      createSnowflakeLoader(
        { ...CONFIG, stage: { type: 'gcs', url: 'gcs://lake/st/' } },
        SECRETS,
        deps,
      ),
    ).rejects.toThrow(/storage integration/)
    // A config that bypassed the schema still cannot inject.
    await expect(
      createSnowflakeLoader({ ...CONFIG, database: 'X"; DROP DATABASE Y; --' }, SECRETS, deps),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createSnowflakeLoader(
        { ...CONFIG, stage: { ...CONFIG.stage, storageIntegration: 'A B' } },
        SECRETS,
        deps,
      ),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createSnowflakeLoader(
        { ...CONFIG, stage: { type: 's3', url: 's3://lake/st/' } },
        { ...SECRETS, stageAccessKeyId: 'AKIA', stageSecretAccessKey: "x'y" },
        deps,
      ),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createSnowflakeLoader(CONFIG, SECRETS, {
        ...deps,
        hostGuard: async (h) => {
          throw new Error(`blocked ${h}`)
        },
      }),
    ).rejects.toThrow('blocked myorg-acct.snowflakecomputing.com')
    expect(sf.connects).toEqual([])
  })

  it('uses key-pair auth and the host override', async () => {
    const sf = fakeSnowflake((sql) => (sql.startsWith('SELECT COLUMN_NAME') ? FIXED_INFO : []))
    const key = `-----BEGIN PRIVATE KEY-----\n${'A'.repeat(64)}\n-----END PRIVATE KEY-----`
    const sink = await createSnowflakeLoader(
      { ...CONFIG, host: 'acct.privatelink.snowflakecomputing.com' },
      SnowflakeSecretsSchema.parse({
        username: 'LOADER',
        privateKey: key,
        privateKeyPassphrase: 'pp',
      }),
      { hostGuard: allowAll, sink: fakeObjectStore(), clientFactory: sf.clientFactory },
    )
    await sink.applyBatch(TARGET, [], [del({ scope: 'all', deletedAt: 1 })])
    expect(sf.connects[0]).toMatchObject({
      accessUrl: 'https://acct.privatelink.snowflakecomputing.com',
      authenticator: 'SNOWFLAKE_JWT',
      privateKey: key,
      privateKeyPass: 'pp',
    })
    expect(sf.connects[0]).not.toHaveProperty('password')
  })

  it('tests the stage write, the warehouse read and CREATE in the schema', async () => {
    const sf = fakeSnowflake()
    const store = fakeObjectStore()
    const sink = await createSnowflakeLoader(CONFIG, SECRETS, {
      hostGuard: allowAll,
      sink: store,
      clientFactory: sf.clientFactory,
      now: () => 0,
    })
    await sink.test()
    expect(store.tested).toBe(1)
    expect(sf.statements.map((s) => s.sql)).toEqual(
      startingWith([
        'USE SCHEMA "ANALYTICS"."OPENSTEWARD"',
        'CREATE OR REPLACE TEMPORARY TABLE "OS_CONNECTION_TEST"',
        `COPY INTO "OS_CONNECTION_TEST" FROM 's3://lake/stage/_opensteward_stage/_connection_test/' STORAGE_INTEGRATION = "OS_INT" FILES = ('probe.parquet')`,
        'DROP TABLE IF EXISTS "OS_CONNECTION_TEST"',
      ]),
    )
    expect(store.written).toEqual(['_opensteward_stage/_connection_test/probe.parquet'])
    expect(store.deleted).toEqual(['_opensteward_stage/_connection_test/probe.parquet'])
  })
})
