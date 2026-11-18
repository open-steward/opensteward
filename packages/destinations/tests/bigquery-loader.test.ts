/**
 * BigQuery loader against a fake client: the GCS staging path, the load job
 * into a per-batch staging table, the exact MERGE, parameterised DML deletes
 * (with explicit parameter types, so NULLs and arrays are typed), and the
 * connection test.
 */
import { describe, it, expect } from 'vitest'
import {
  createBigQueryLoader,
  type BigQueryClientLike,
  type BigQueryClientOptions,
  type BigQueryQueryOptions,
} from '../src/loaders/bigquery'
import { BigQueryConfigSchema } from '../src/loaders/schemas'
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

const CONFIG = BigQueryConfigSchema.parse({
  projectId: 'acme-analytics',
  dataset: 'opensteward',
  location: 'EU',
  gcsBucket: 'acme-stage',
  gcsPrefix: 'bq',
})
const SA = JSON.stringify({ type: 'service_account', client_email: 'x@y', private_key: 'k' })

const FIXED_INFO = [
  ['_pk', 'STRING'],
  ['connection_id', 'STRING'],
  ['owner_tenant_id', 'STRING'],
  ['platform', 'STRING'],
  ['vertical', 'STRING'],
  ['resource_type', 'STRING'],
  ['resource_id', 'STRING'],
  ['changed_at', 'TIMESTAMP'],
  ['norm_version', 'STRING'],
  ['_deleted', 'BOOL'],
  ['data', 'JSON'],
  ['_exported_at', 'TIMESTAMP'],
].map(([column_name, data_type]) => ({ column_name, data_type }))

function fakeBigQuery(
  respond: (sql: string) => {
    rows?: Array<Record<string, unknown>>
    affectedRows?: number
  } = () => ({}),
) {
  const calls: Array<{ sql?: string; opts?: BigQueryQueryOptions; load?: [string, string] }> = []
  const built: BigQueryClientOptions[] = []
  const client: BigQueryClientLike = {
    async query(sql, opts) {
      calls.push({ sql: norm(sql), ...(opts ? { opts } : {}) })
      const r = respond(norm(sql))
      return { rows: r.rows ?? [], affectedRows: r.affectedRows ?? 0 }
    },
    async loadParquet(uri, table) {
      calls.push({ load: [uri, table] })
    },
  }
  return {
    calls,
    built,
    clientFactory: async (o: BigQueryClientOptions) => {
      built.push(o)
      return client
    },
  }
}

describe('BigQuery loader', () => {
  it('loads a staged file into a staging table and merges it', async () => {
    let created = false
    const bq = fakeBigQuery((sql) => {
      if (sql.startsWith('CREATE TABLE')) created = true
      if (sql.startsWith('SELECT column_name')) return { rows: created ? FIXED_INFO : [] }
      if (sql.startsWith('MERGE')) return { affectedRows: 2 }
      return {}
    })
    const store = fakeObjectStore()
    const sink = await createBigQueryLoader(
      CONFIG,
      { serviceAccountJson: SA },
      {
        hostGuard: allowAll,
        sink: store,
        clientFactory: bq.clientFactory,
        newId: ids('b'),
      },
    )
    const res = await sink.applyBatch(
      TARGET,
      [row('a', 1, { amount: 12.5, active: true }), row('b', 2, { amount: 3 })],
      [],
    )
    expect(res).toEqual({ upserted: 2, deleted: 0 })
    expect(bq.built).toEqual([
      {
        projectId: 'acme-analytics',
        dataset: 'opensteward',
        location: 'EU',
        credentials: JSON.parse(SA),
      },
    ])
    const T = '`acme-analytics`.`opensteward`.`os_crm_contacts`'
    const S = '`acme-analytics`.`opensteward`.`os_stage_os_crm_contacts_b2`'
    expect(bq.calls).toEqual([
      {
        sql: 'SELECT column_name, data_type FROM `acme-analytics`.`opensteward`.INFORMATION_SCHEMA.COLUMNS WHERE table_name = @table',
        opts: { params: { table: 'os_crm_contacts' }, types: { table: 'STRING' }, rows: true },
      },
      {
        sql:
          `CREATE TABLE IF NOT EXISTS ${T} (\`_pk\` STRING NOT NULL, \`connection_id\` STRING, ` +
          '`owner_tenant_id` STRING, `platform` STRING NOT NULL, `vertical` STRING NOT NULL, ' +
          '`resource_type` STRING NOT NULL, `resource_id` STRING NOT NULL, `changed_at` TIMESTAMP NOT NULL, ' +
          '`norm_version` STRING, `_deleted` BOOL NOT NULL, `data` JSON, `_exported_at` TIMESTAMP) ' +
          'CLUSTER BY `_pk`',
      },
      expect.objectContaining({ sql: expect.stringMatching(/^SELECT column_name/) }),
      {
        sql: `ALTER TABLE ${T} ADD COLUMN IF NOT EXISTS \`active\` BOOL, ADD COLUMN IF NOT EXISTS \`amount\` FLOAT64`,
      },
      {
        load: [
          'gs://acme-stage/bq/_opensteward_stage/os_crm_contacts/b1-rows.parquet',
          'os_stage_os_crm_contacts_b2',
        ],
      },
      {
        sql:
          `MERGE ${T} AS t USING ${S} AS s ON t.\`_pk\` = s.\`_pk\` ` +
          'WHEN MATCHED AND t.`changed_at` <= s.`changed_at` THEN UPDATE SET ' +
          '`connection_id` = s.`connection_id`, `owner_tenant_id` = s.`owner_tenant_id`, ' +
          '`platform` = s.`platform`, `vertical` = s.`vertical`, `resource_type` = s.`resource_type`, ' +
          '`resource_id` = s.`resource_id`, `changed_at` = s.`changed_at`, `norm_version` = s.`norm_version`, ' +
          "`_deleted` = s.`_deleted`, `data` = PARSE_JSON(s.`data`, wide_number_mode => 'round'), " +
          '`active` = s.`active`, `amount` = s.`amount`, `_exported_at` = CURRENT_TIMESTAMP() ' +
          'WHEN NOT MATCHED THEN INSERT (`_pk`, `connection_id`, `owner_tenant_id`, `platform`, `vertical`, ' +
          '`resource_type`, `resource_id`, `changed_at`, `norm_version`, `_deleted`, `data`, `active`, `amount`, ' +
          '`_exported_at`) VALUES (s.`_pk`, s.`connection_id`, s.`owner_tenant_id`, s.`platform`, s.`vertical`, ' +
          's.`resource_type`, s.`resource_id`, s.`changed_at`, s.`norm_version`, s.`_deleted`, ' +
          "PARSE_JSON(s.`data`, wide_number_mode => 'round'), s.`active`, s.`amount`, CURRENT_TIMESTAMP())",
      },
      { sql: `DROP TABLE IF EXISTS ${S}` },
    ])
    expect(store.written).toEqual(['_opensteward_stage/os_crm_contacts/b1-rows.parquet'])
    expect(store.deleted).toEqual(store.written)
  })

  it('drops the staging table even when the MERGE fails', async () => {
    const bq = fakeBigQuery((sql) => {
      if (sql.startsWith('SELECT column_name')) return { rows: FIXED_INFO }
      if (sql.startsWith('MERGE')) throw new Error('quota exceeded')
      return {}
    })
    const sink = await createBigQueryLoader(
      CONFIG,
      {},
      {
        hostGuard: allowAll,
        sink: fakeObjectStore(),
        clientFactory: bq.clientFactory,
        newId: ids('x'),
      },
    )
    await expect(sink.applyBatch(TARGET, [row('a', 1)], [])).rejects.toThrow('quota exceeded')
    expect(bq.calls.at(-1)).toEqual({
      sql: 'DROP TABLE IF EXISTS `acme-analytics`.`opensteward`.`os_stage_os_crm_contacts_x2`',
    })
    expect(bq.built[0]!.credentials).toBeUndefined()
  })

  it('applies deletes as typed, parameterised DML', async () => {
    const bq = fakeBigQuery((sql) => {
      if (sql.startsWith('SELECT column_name')) return { rows: FIXED_INFO }
      if (sql.startsWith('DELETE')) return { affectedRows: 2 }
      return {}
    })
    const store = fakeObjectStore()
    const sink = await createBigQueryLoader(
      CONFIG,
      {},
      {
        hostGuard: allowAll,
        sink: store,
        clientFactory: bq.clientFactory,
      },
    )
    const evil = "a'); DELETE FROM x; --"
    const res = await sink.applyBatch(
      TARGET,
      [],
      [
        del({ pk: 'crm:hubspot:c1:contacts:a', deletedAt: 10 }),
        del({ pk: evil, deletedAt: 20 }),
        del({ scope: 'connection', connectionId: null, deletedAt: 30 }),
        del({ scope: 'vertical', platform: null, connectionId: null, deletedAt: 40 }),
      ],
    )
    expect(res).toEqual({ upserted: 0, deleted: 6 })
    const T = '`acme-analytics`.`opensteward`.`os_crm_contacts`'
    expect(bq.calls.slice(1)).toEqual([
      {
        sql:
          `DELETE FROM ${T} AS t WHERE EXISTS (SELECT 1 FROM UNNEST(@deletes) AS d ` +
          'WHERE d.pk = t.`_pk` AND t.`changed_at` <= TIMESTAMP_MILLIS(d.at))',
        opts: {
          params: {
            deletes: [
              { pk: 'crm:hubspot:c1:contacts:a', at: 10 },
              { pk: evil, at: 20 },
            ],
          },
          types: { deletes: [{ pk: 'STRING', at: 'INT64' }] },
        },
      },
      {
        sql:
          `DELETE FROM ${T} WHERE \`platform\` = @platform AND ((\`connection_id\` IS NULL AND @connection_id IS NULL) ` +
          'OR `connection_id` = @connection_id) AND `changed_at` <= TIMESTAMP_MILLIS(@deleted_at)',
        opts: {
          params: { platform: 'hubspot', connection_id: null, deleted_at: 30 },
          types: { platform: 'STRING', connection_id: 'STRING', deleted_at: 'INT64' },
        },
      },
      {
        sql: `DELETE FROM ${T} WHERE \`changed_at\` <= TIMESTAMP_MILLIS(@deleted_at)`,
        opts: { params: { deleted_at: 40 }, types: { deleted_at: 'INT64' } },
      },
    ])
    // BigQuery deletes are pure DML: nothing is staged.
    expect(store.written).toEqual([])
  })

  it('refuses names that bypassed the schema', async () => {
    const deps = {
      hostGuard: allowAll,
      sink: fakeObjectStore(),
      clientFactory: fakeBigQuery().clientFactory,
    }
    await expect(
      createBigQueryLoader({ ...CONFIG, dataset: 'x`; DROP SCHEMA y; --' }, {}, deps),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      createBigQueryLoader({ ...CONFIG, projectId: 'P' }, {}, deps),
    ).rejects.toBeInstanceOf(DestinationConfigError)
  })

  it('tests the GCS write, a load job and CREATE in the dataset', async () => {
    const bq = fakeBigQuery()
    const store = fakeObjectStore()
    const sink = await createBigQueryLoader(
      CONFIG,
      {},
      {
        hostGuard: allowAll,
        sink: store,
        clientFactory: bq.clientFactory,
        newId: ids('p'),
      },
    )
    await sink.test()
    expect(store.tested).toBe(1)
    expect(bq.calls).toEqual([
      {
        load: [
          'gs://acme-stage/bq/_opensteward_stage/_connection_test/probe.parquet',
          'os_probe_connection_test_p1',
        ],
      },
      { sql: 'DROP TABLE IF EXISTS `acme-analytics`.`opensteward`.`os_probe_connection_test_p1`' },
    ])
    expect(store.deleted).toEqual(startingWith(['_opensteward_stage/_connection_test/probe']))
  })
})
