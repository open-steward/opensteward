/**
 * The thin adapters between each loader and its vendor SDK, with the SDK
 * modules mocked (no network): connection options, callback / job / session
 * plumbing, bound parameters passed through as parameters, errors
 * propagated, and connections closed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSnowflakeLoader } from '../src/loaders/snowflake'
import { createBigQueryLoader } from '../src/loaders/bigquery'
import { createDatabricksLoader } from '../src/loaders/databricks'
import {
  BigQueryConfigSchema,
  DatabricksConfigSchema,
  SnowflakeConfigSchema,
} from '../src/loaders/schemas'
import { TARGET, allowAll, del, fakeObjectStore } from './helpers/loader-fakes'

type Rec = Record<string, unknown>

const m = vi.hoisted(() => ({
  sf: {
    configured: [] as Rec[],
    created: [] as Rec[],
    executed: [] as Array<{ sqlText: string; binds?: unknown[] }>,
    destroyed: 0,
    connectError: null as Error | null,
  },
  bq: {
    ctor: [] as Rec[],
    queries: [] as Rec[],
    jobs: [] as Rec[],
    loadError: null as Error | null,
  },
  dbx: {
    connected: [] as Rec[],
    sessions: [] as Rec[],
    statements: [] as Array<{ sql: string; opts: Rec }>,
    opsClosed: 0,
    sessionClosed: 0,
    clientClosed: 0,
  },
}))

vi.mock('snowflake-sdk', () => {
  const api = {
    configure: (o: Rec) => void m.sf.configured.push(o),
    createConnection(o: Rec) {
      m.sf.created.push(o)
      return {
        connect: (cb: (err?: Error) => void) => cb(m.sf.connectError ?? undefined),
        execute(o: {
          sqlText: string
          binds?: unknown[]
          complete: (err: Error | undefined, stmt: unknown, rows?: unknown[]) => void
        }) {
          m.sf.executed.push({ sqlText: o.sqlText, ...(o.binds ? { binds: o.binds } : {}) })
          setImmediate(() => {
            if (o.sqlText.startsWith('SELECT COLUMN_NAME')) {
              o.complete(undefined, {}, [{ COLUMN_NAME: '_PK', DATA_TYPE: 'TEXT' }])
            } else if (o.sqlText.startsWith('DELETE')) {
              o.complete(undefined, {}, [{ 'number of rows deleted': 4 }])
            } else if (o.sqlText.includes('BROKEN')) {
              o.complete(new Error('SQL compilation error'), {})
            } else {
              o.complete(undefined, {}, [])
            }
          })
        },
        destroy: (cb: () => void) => {
          m.sf.destroyed++
          cb()
        },
      }
    },
  }
  return { ...api, default: api }
})

vi.mock('@google-cloud/bigquery', () => {
  class BigQuery {
    constructor(o: Rec) {
      m.bq.ctor.push(o)
    }
    async createQueryJob(o: Rec) {
      m.bq.queries.push(o)
      const sql = String(o['query'])
      return [
        {
          promise: async () => [{ statistics: { query: { numDmlAffectedRows: '3' } } }],
          getQueryResults: async () => [
            sql.startsWith('SELECT') ? [{ column_name: '_pk', data_type: 'STRING' }] : [],
          ],
        },
      ]
    }
    async createJob(o: Rec) {
      m.bq.jobs.push(o)
      return [
        {
          promise: async () => {
            if (m.bq.loadError) throw m.bq.loadError
            return [{ status: { state: 'DONE' } }]
          },
          getQueryResults: async () => [[]],
        },
      ]
    }
  }
  return { BigQuery, default: { BigQuery } }
})

vi.mock('@databricks/sql', () => {
  class DBSQLClient {
    async connect(o: Rec) {
      m.dbx.connected.push(o)
      return this
    }
    async openSession(o: Rec) {
      m.dbx.sessions.push(o)
      return {
        async executeStatement(sql: string, opts: Rec) {
          m.dbx.statements.push({ sql, opts })
          return {
            fetchAll: async () =>
              sql.startsWith('SHOW TABLES')
                ? [{ tableName: 'os_crm_contacts' }]
                : sql.startsWith('DESCRIBE')
                  ? [{ col_name: '_pk', data_type: 'string' }]
                  : sql.startsWith('DELETE')
                    ? [{ num_affected_rows: BigInt(2) }]
                    : [],
            close: async () => void m.dbx.opsClosed++,
          }
        },
        close: async () => void m.dbx.sessionClosed++,
      }
    }
    async close() {
      m.dbx.clientClosed++
    }
  }
  return { DBSQLClient, default: { DBSQLClient } }
})

beforeEach(() => {
  m.sf.configured.length = 0
  m.sf.created.length = 0
  m.sf.executed.length = 0
  m.sf.destroyed = 0
  m.sf.connectError = null
  m.bq.ctor.length = 0
  m.bq.queries.length = 0
  m.bq.jobs.length = 0
  m.bq.loadError = null
  m.dbx.connected.length = 0
  m.dbx.sessions.length = 0
  m.dbx.statements.length = 0
  m.dbx.opsClosed = m.dbx.sessionClosed = m.dbx.clientClosed = 0
})

describe('snowflake-sdk adapter', () => {
  const config = SnowflakeConfigSchema.parse({
    account: 'myorg-acct',
    warehouse: 'wh',
    database: 'db',
    schema: 'sch',
    stage: { type: 's3', url: 's3://lake/st/', storageIntegration: 'int' },
  })

  it('connects with the guarded host, binds parameters and destroys on close', async () => {
    const sink = await createSnowflakeLoader(
      config,
      { username: 'u', password: 'pw' },
      { hostGuard: allowAll, sink: fakeObjectStore() },
    )
    const res = await sink.applyBatch(
      TARGET,
      [],
      [del({ scope: 'connection', connectionId: null, deletedAt: 42 })],
    )
    expect(res).toEqual({ upserted: 0, deleted: 4 })
    expect(m.sf.configured[0]).toMatchObject({ logLevel: 'ERROR' })
    expect(m.sf.created).toEqual([
      expect.objectContaining({
        account: 'myorg-acct',
        accessUrl: 'https://myorg-acct.snowflakecomputing.com',
        username: 'u',
        password: 'pw',
        warehouse: 'wh',
        database: 'db',
        schema: 'sch',
        application: 'OpenSteward',
      }),
    ])
    expect(m.sf.executed.map((e) => e.sqlText.split(' ').slice(0, 2).join(' '))).toEqual([
      'USE SCHEMA',
      'SELECT COLUMN_NAME,',
      'DELETE FROM',
    ])
    expect(m.sf.executed[2]!.binds).toEqual(['hubspot', null, '42'])
    await sink.close()
    expect(m.sf.destroyed).toBe(1)
  })

  it('propagates connection and statement errors', async () => {
    m.sf.connectError = new Error('Incorrect username or password was specified.')
    const sink = await createSnowflakeLoader(
      config,
      { username: 'u', password: 'bad' },
      { hostGuard: allowAll, sink: fakeObjectStore() },
    )
    await expect(sink.applyBatch(TARGET, [], [del({ scope: 'all' })])).rejects.toThrow(
      /Incorrect username/,
    )
    m.sf.connectError = null
    const broken = await createSnowflakeLoader(
      { ...config, schema: 'BROKEN' },
      { username: 'u', password: 'pw' },
      { hostGuard: allowAll, sink: fakeObjectStore() },
    )
    await expect(broken.applyBatch(TARGET, [], [del({ scope: 'all' })])).rejects.toThrow(
      'SQL compilation error',
    )
  })
})

describe('@google-cloud/bigquery adapter', () => {
  const config = BigQueryConfigSchema.parse({
    projectId: 'acme-analytics',
    dataset: 'ds',
    location: 'EU',
    gcsBucket: 'stage-bucket',
  })

  it('runs typed query jobs in the location and reads DML row counts', async () => {
    const sink = await createBigQueryLoader(
      config,
      { serviceAccountJson: JSON.stringify({ client_email: 'a@b', private_key: 'k' }) },
      { hostGuard: allowAll, sink: fakeObjectStore() },
    )
    const res = await sink.applyBatch(TARGET, [], [del({ scope: 'all', deletedAt: 9 })])
    expect(res).toEqual({ upserted: 0, deleted: 3 })
    expect(m.bq.ctor).toEqual([
      {
        projectId: 'acme-analytics',
        location: 'EU',
        credentials: { client_email: 'a@b', private_key: 'k' },
      },
    ])
    expect(m.bq.queries[1]).toMatchObject({
      useLegacySql: false,
      location: 'EU',
      params: { deleted_at: 9 },
      types: { deleted_at: 'INT64' },
    })
  })

  it('runs a PARQUET WRITE_TRUNCATE load job and surfaces its error', async () => {
    const store = fakeObjectStore()
    const sink = await createBigQueryLoader(config, {}, { hostGuard: allowAll, sink: store })
    m.bq.loadError = new Error('Error while reading data, error message: Invalid parquet')
    await expect(sink.test()).rejects.toThrow('Invalid parquet')
    expect(m.bq.jobs[0]).toMatchObject({
      location: 'EU',
      configuration: {
        load: {
          sourceUris: ['gs://stage-bucket/_opensteward_stage/_connection_test/probe.parquet'],
          sourceFormat: 'PARQUET',
          writeDisposition: 'WRITE_TRUNCATE',
          createDisposition: 'CREATE_IF_NEEDED',
          destinationTable: { projectId: 'acme-analytics', datasetId: 'ds' },
        },
      },
    })
    // The probe file is removed even though the load failed.
    expect(store.deleted).toEqual(['_opensteward_stage/_connection_test/probe.parquet'])
  })
})

describe('@databricks/sql adapter', () => {
  const config = DatabricksConfigSchema.parse({
    host: 'dbc.example.com',
    httpPath: '/sql/1.0/warehouses/abc',
    catalog: 'main',
    schema: 'os',
    stage: { type: 's3', url: 's3://lake/dbx/' },
  })

  it('opens a session in the catalog/schema, passes ordinal parameters and closes', async () => {
    const sink = await createDatabricksLoader(
      config,
      { token: 'dapi-secret' },
      { hostGuard: allowAll, sink: fakeObjectStore() },
    )
    const res = await sink.applyBatch(TARGET, [], [del({ scope: 'vertical', deletedAt: 11 })])
    expect(res).toEqual({ upserted: 0, deleted: 2 })
    expect(m.dbx.connected).toEqual([
      { host: 'dbc.example.com', path: '/sql/1.0/warehouses/abc', token: 'dapi-secret' },
    ])
    expect(m.dbx.sessions).toEqual([{ initialCatalog: 'main', initialSchema: 'os' }])
    expect(m.dbx.statements.map((s) => s.opts)).toEqual([{}, {}, { ordinalParameters: [11] }])
    expect(m.dbx.opsClosed).toBe(3)
    await sink.close()
    expect(m.dbx.sessionClosed).toBe(1)
    expect(m.dbx.clientClosed).toBe(1)
  })
})
