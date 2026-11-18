/**
 * Databricks loader against a fake SQL session: SHOW TABLES / DESCRIBE,
 * the Delta target DDL, COPY INTO a schemaless staging table (with and
 * without a Unity Catalog credential), the exact MERGE, record deletes by
 * MERGE … DELETE and wider ones by parameterised DELETE, the host guard and
 * the connection test.
 */
import { describe, it, expect } from 'vitest'
import {
  createDatabricksLoader,
  type DatabricksClientLike,
  type DatabricksConnectOptions,
  type DatabricksParam,
} from '../src/loaders/databricks'
import { DatabricksConfigSchema } from '../src/loaders/schemas'
import { DestinationConfigError } from '../src/types'
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

const CONFIG = DatabricksConfigSchema.parse({
  host: 'dbc-1234.cloud.databricks.com',
  httpPath: '/sql/1.0/warehouses/abc123',
  catalog: 'main',
  schema: 'opensteward',
  stage: { type: 's3', url: 's3://lake/dbx/', credentialName: 'lake_cred' },
})
const SECRETS = { token: 'dapi-test-token' }

const DESCRIBE = [
  ['_pk', 'string'],
  ['connection_id', 'string'],
  ['owner_tenant_id', 'string'],
  ['platform', 'string'],
  ['vertical', 'string'],
  ['resource_type', 'string'],
  ['resource_id', 'string'],
  ['changed_at', 'timestamp'],
  ['norm_version', 'string'],
  ['_deleted', 'boolean'],
  ['data', 'string'],
  ['_exported_at', 'timestamp'],
  ['score', 'bigint'],
  ['', ''],
  ['# Detailed Table Information', ''],
  ['Name', 'main.opensteward.os_crm_contacts'],
].map(([col_name, data_type]) => ({ col_name, data_type, comment: null }))

function fakeDatabricks(respond: (sql: string) => Array<Record<string, unknown>> = () => []) {
  const statements: Array<{ sql: string; params?: DatabricksParam[] }> = []
  const connects: DatabricksConnectOptions[] = []
  let closed = 0
  const client: DatabricksClientLike = {
    async execute(sql, params) {
      statements.push({ sql: norm(sql), ...(params ? { params } : {}) })
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
    clientFactory: async (o: DatabricksConnectOptions) => {
      connects.push(o)
      return client
    },
  }
}

describe('Databricks loader', () => {
  it('creates the Delta table, copies into staging and merges', async () => {
    let created = false
    const dbx = fakeDatabricks((sql) => {
      if (sql.startsWith('CREATE TABLE IF NOT EXISTS `main`.`opensteward`.`os_crm_contacts` (')) {
        created = true
      }
      if (sql.startsWith('SHOW TABLES')) return created ? [{ tableName: 'os_crm_contacts' }] : []
      if (sql.startsWith('DESCRIBE')) return DESCRIBE
      if (sql.startsWith('MERGE')) return [{ num_affected_rows: 2, num_inserted_rows: 2 }]
      return []
    })
    const store = fakeObjectStore()
    const guarded: string[] = []
    const sink = await createDatabricksLoader(CONFIG, SECRETS, {
      hostGuard: async (h) => void guarded.push(h),
      sink: store,
      clientFactory: dbx.clientFactory,
      newId: ids('b'),
    })
    expect(guarded).toEqual(['dbc-1234.cloud.databricks.com'])
    const res = await sink.applyBatch(
      TARGET,
      [row('a', 1, { score: 7, city: 'Oslo' }), row('b', 2, { score: 'n/a' })],
      [],
    )
    expect(res).toEqual({ upserted: 2, deleted: 0 })
    expect(dbx.connects).toEqual([
      {
        host: 'dbc-1234.cloud.databricks.com',
        path: '/sql/1.0/warehouses/abc123',
        token: 'dapi-test-token',
        catalog: 'main',
        schema: 'opensteward',
      },
    ])
    const T = '`main`.`opensteward`.`os_crm_contacts`'
    const S = '`main`.`opensteward`.`os_stage_os_crm_contacts_b2`'
    expect(dbx.statements).toEqual([
      { sql: "SHOW TABLES IN `main`.`opensteward` LIKE 'os_crm_contacts'" },
      {
        sql:
          `CREATE TABLE IF NOT EXISTS ${T} (\`_pk\` STRING NOT NULL, \`connection_id\` STRING, ` +
          '`owner_tenant_id` STRING, `platform` STRING NOT NULL, `vertical` STRING NOT NULL, ' +
          '`resource_type` STRING NOT NULL, `resource_id` STRING NOT NULL, `changed_at` TIMESTAMP NOT NULL, ' +
          '`norm_version` STRING, `_deleted` BOOLEAN NOT NULL, `data` STRING, `_exported_at` TIMESTAMP) USING DELTA',
      },
      { sql: "SHOW TABLES IN `main`.`opensteward` LIKE 'os_crm_contacts'" },
      { sql: `DESCRIBE TABLE ${T}` },
      // `score` exists (bigint); only `city` is new.
      { sql: `ALTER TABLE ${T} ADD COLUMNS (\`city\` STRING)` },
      { sql: `CREATE TABLE IF NOT EXISTS ${S}` },
      {
        sql:
          `COPY INTO ${S} FROM 's3://lake/dbx/_opensteward_stage/os_crm_contacts/' WITH (CREDENTIAL \`lake_cred\`) ` +
          "FILEFORMAT = PARQUET FILES = ('b1-rows.parquet') FORMAT_OPTIONS ('mergeSchema' = 'true') " +
          "COPY_OPTIONS ('mergeSchema' = 'true', 'force' = 'true')",
      },
      {
        sql:
          `MERGE INTO ${T} AS t USING ${S} AS s ON t.\`_pk\` = s.\`_pk\` ` +
          'WHEN MATCHED AND t.`changed_at` <= s.`changed_at` THEN UPDATE SET ' +
          't.`connection_id` = s.`connection_id`, t.`owner_tenant_id` = s.`owner_tenant_id`, ' +
          't.`platform` = s.`platform`, t.`vertical` = s.`vertical`, t.`resource_type` = s.`resource_type`, ' +
          't.`resource_id` = s.`resource_id`, t.`changed_at` = s.`changed_at`, t.`norm_version` = s.`norm_version`, ' +
          't.`_deleted` = s.`_deleted`, t.`data` = s.`data`, t.`city` = s.`city`, t.`score` = s.`score`, ' +
          't.`_exported_at` = current_timestamp() ' +
          'WHEN NOT MATCHED THEN INSERT (`_pk`, `connection_id`, `owner_tenant_id`, `platform`, `vertical`, ' +
          '`resource_type`, `resource_id`, `changed_at`, `norm_version`, `_deleted`, `data`, `city`, `score`, ' +
          '`_exported_at`) VALUES (s.`_pk`, s.`connection_id`, s.`owner_tenant_id`, s.`platform`, s.`vertical`, ' +
          's.`resource_type`, s.`resource_id`, s.`changed_at`, s.`norm_version`, s.`_deleted`, s.`data`, ' +
          's.`city`, s.`score`, current_timestamp())',
      },
      { sql: `DROP TABLE IF EXISTS ${S}` },
    ])
    expect(store.deleted).toEqual(['_opensteward_stage/os_crm_contacts/b1-rows.parquet'])
    await sink.close()
    expect(dbx.closed).toBe(1)
  })

  it('deletes records with MERGE … DELETE and wider scopes with bound parameters', async () => {
    const dbx = fakeDatabricks((sql) => {
      if (sql.startsWith('SHOW TABLES')) return [{ tableName: 'os_crm_contacts' }]
      if (sql.startsWith('DESCRIBE')) return DESCRIBE
      if (sql.startsWith('MERGE') || sql.startsWith('DELETE')) return [{ num_affected_rows: 1 }]
      return []
    })
    const sink = await createDatabricksLoader(
      { ...CONFIG, catalog: undefined, stage: { type: 'gcs', url: 'gs://lake/dbx/' } },
      SECRETS,
      {
        hostGuard: allowAll,
        sink: fakeObjectStore(),
        clientFactory: dbx.clientFactory,
        newId: ids('d'),
      },
    )
    const res = await sink.applyBatch(
      TARGET,
      [],
      [
        del({ pk: 'crm:hubspot:c1:contacts:a', deletedAt: 5 }),
        del({ scope: 'connection', connectionId: 'c9', deletedAt: 6 }),
        del({ scope: 'all', vertical: null, platform: null, connectionId: null, deletedAt: 7 }),
      ],
    )
    expect(res).toEqual({ upserted: 0, deleted: 3 })
    const T = '`opensteward`.`os_crm_contacts`'
    const D = '`opensteward`.`os_del_os_crm_contacts_d2`'
    expect(dbx.statements.slice(2)).toEqual([
      { sql: `CREATE TABLE IF NOT EXISTS ${D}` },
      {
        sql:
          `COPY INTO ${D} FROM 'gs://lake/dbx/_opensteward_stage/os_crm_contacts/' FILEFORMAT = PARQUET ` +
          "FILES = ('d1-deletes.parquet') FORMAT_OPTIONS ('mergeSchema' = 'true') " +
          "COPY_OPTIONS ('mergeSchema' = 'true', 'force' = 'true')",
      },
      {
        sql:
          `MERGE INTO ${T} AS t USING ${D} AS d ON t.\`_pk\` = d.\`_pk\` ` +
          'AND t.`changed_at` <= d.`deleted_at` WHEN MATCHED THEN DELETE',
      },
      { sql: `DROP TABLE IF EXISTS ${D}` },
      {
        sql:
          `DELETE FROM ${T} WHERE \`platform\` = ? AND \`connection_id\` <=> ? ` +
          'AND `changed_at` <= timestamp_millis(?)',
        params: ['hubspot', 'c9', 6],
      },
      { sql: `DELETE FROM ${T} WHERE \`changed_at\` <= timestamp_millis(?)`, params: [7] },
    ])
  })

  it('refuses bad names and blocked hosts before connecting', async () => {
    const dbx = fakeDatabricks()
    const deps = { hostGuard: allowAll, sink: fakeObjectStore(), clientFactory: dbx.clientFactory }
    await expect(
      createDatabricksLoader({ ...CONFIG, schema: 'x`; DROP SCHEMA y; --' }, SECRETS, deps),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createDatabricksLoader(
        { ...CONFIG, stage: { ...CONFIG.stage, credentialName: 'a b' } },
        SECRETS,
        deps,
      ),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createDatabricksLoader(
        { ...CONFIG, stage: { type: 's3', url: "s3://lake/x'y/" } },
        SECRETS,
        deps,
      ),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createDatabricksLoader(CONFIG, SECRETS, {
        ...deps,
        hostGuard: async () => {
          throw new Error('private address')
        },
      }),
    ).rejects.toThrow('private address')
    expect(dbx.connects).toEqual([])
  })

  it('tests with a staged probe copied into a throwaway table', async () => {
    const dbx = fakeDatabricks()
    const store = fakeObjectStore()
    const sink = await createDatabricksLoader(CONFIG, SECRETS, {
      hostGuard: allowAll,
      sink: store,
      clientFactory: dbx.clientFactory,
      newId: ids('p'),
    })
    await sink.test()
    expect(store.tested).toBe(1)
    expect(dbx.statements.map((s) => s.sql)).toEqual(
      startingWith([
        'CREATE TABLE IF NOT EXISTS `main`.`opensteward`.`os_probe_connection_test_p1`',
        "COPY INTO `main`.`opensteward`.`os_probe_connection_test_p1` FROM 's3://lake/dbx/_opensteward_stage/_connection_test/'",
        'DROP TABLE IF EXISTS `main`.`opensteward`.`os_probe_connection_test_p1`',
      ]),
    )
    expect(store.deleted).toEqual(['_opensteward_stage/_connection_test/probe.parquet'])
  })
})
