/**
 * Postgres sink against a real database (TEST_DATABASE_URL; skipped when
 * unset): table creation, flattened columns, the forward-only upsert, and
 * tombstone deletes guarded by `changed_at <= deleted_at` — record,
 * connection and whole-vertical.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { Client } from 'pg'
import { CredentialStore, ResourceStore, deriveMaskKey, openDb } from '@opensteward/shared'
import { DestinationStore } from '../src/store'
import { DestinationWorker } from '../src/worker'
import { createSink } from '../src/sinks'
import { createPostgresSink, tableNameFor } from '../src/sinks/postgres'
import { createHostGuard } from '../src/hosts'
import type { DeleteSpec, ExportRow, PostgresConfig, TableSink } from '../src/types'
import { PostgresConfigSchema } from '../src/types'

const URL_ = process.env.TEST_DATABASE_URL
const SCHEMA = 'os_dest_sink_test'
const SECRET = 'p'.repeat(40)

function configFromUrl(url: string): { config: PostgresConfig; password?: string } {
  const u = new URL(url)
  return {
    config: PostgresConfigSchema.parse({
      host: u.hostname,
      port: Number(u.port || 5432),
      database: u.pathname.replace(/^\//, ''),
      user: decodeURIComponent(u.username || 'postgres'),
      schema: SCHEMA,
      ssl: 'disable',
    }),
    password: u.password ? decodeURIComponent(u.password) : undefined,
  }
}

function row(id: string, changedAt: number, fields: ExportRow['fields'], conn = 'c1'): ExportRow {
  return {
    _pk: `crm:hubspot:${conn}:contacts:${id}`,
    connection_id: conn,
    owner_tenant_id: 'tenant-a',
    platform: 'hubspot',
    vertical: 'crm',
    resource_type: 'contacts',
    resource_id: id,
    changed_at: changedAt,
    norm_version: 'v1',
    _deleted: false,
    data: JSON.stringify({ id, ...fields }),
    fields,
  }
}

function del(over: Partial<DeleteSpec>): DeleteSpec {
  return {
    tombstoneId: 1,
    scope: 'record',
    pk: null,
    vertical: 'crm',
    platform: 'hubspot',
    connectionId: 'c1',
    ownerTenantId: 'tenant-a',
    resourceType: 'contacts',
    resourceId: null,
    deletedAt: 0,
    ...over,
  }
}

const TARGET = { vertical: 'crm', resourceType: 'contacts' }

;(URL_ ? describe : describe.skip)('Postgres sink', () => {
  let admin: Client
  let sink: TableSink
  const { config, password } = URL_ ? configFromUrl(URL_) : ({} as ReturnType<typeof configFromUrl>)
  const guard = createHostGuard([config?.host ?? 'localhost'])

  beforeAll(async () => {
    admin = new Client({ connectionString: URL_ })
    await admin.connect()
  })
  afterAll(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await admin.end()
  })
  beforeEach(async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    sink?.close().catch(() => {})
    sink = await createPostgresSink(config, { password }, { hostGuard: guard })
  })

  async function rows(): Promise<Array<Record<string, unknown>>> {
    const r = await admin.query(`SELECT * FROM ${SCHEMA}.${tableNameFor(TARGET)} ORDER BY _pk`)
    return r.rows
  }

  it('refuses a private host that is not allow-listed', async () => {
    const prev = process.env['OST_ALLOW_PRIVATE_HOSTS']
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    try {
      await expect(
        createPostgresSink(
          { ...config, host: '127.0.0.1' },
          {},
          { hostGuard: createHostGuard([]) },
        ),
      ).rejects.toThrow(/private|blocked|SSRF/i)
    } finally {
      if (prev !== undefined) process.env['OST_ALLOW_PRIVATE_HOSTS'] = prev
    }
  })

  it('test() connects and proves CREATE without leaving anything behind', async () => {
    await sink.test()
    const r = await admin.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1`,
      [SCHEMA],
    )
    expect(r.rows[0].n).toBe(0)
  })

  it('creates the table, upserts on _pk and flattens scalar fields', async () => {
    expect(tableNameFor(TARGET)).toBe('os_crm_contacts')
    const res = await sink.applyBatch(
      TARGET,
      [
        row('a', 1000, { status: 'active', score: 3, vip: true }),
        row('b', 1000, { status: 'lead' }),
      ],
      [],
    )
    expect(res).toEqual({ upserted: 2, deleted: 0 })
    const cols = await admin.query(
      `SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'os_crm_contacts' ORDER BY ordinal_position`,
      [SCHEMA],
    )
    const types = Object.fromEntries(cols.rows.map((c) => [c.column_name, c.data_type]))
    expect(types).toMatchObject({
      _pk: 'text',
      changed_at: 'timestamp with time zone',
      data: 'jsonb',
      _deleted: 'boolean',
      status: 'text',
      score: 'bigint',
      vip: 'boolean',
    })
    const [a, b] = await rows()
    expect(a).toMatchObject({ resource_id: 'a', status: 'active', score: '3', vip: true })
    expect(a!['data']).toEqual({ id: 'a', status: 'active', score: 3, vip: true })
    expect((a!['changed_at'] as Date).getTime()).toBe(1000)
    expect(b).toMatchObject({ status: 'lead', score: null, vip: null })

    // Newer version replaces; an older replay (at-least-once) does not.
    await sink.applyBatch(TARGET, [row('a', 2000, { status: 'churned', score: 'n/a' })], [])
    await sink.applyBatch(TARGET, [row('a', 1500, { status: 'stale' })], [])
    const [a2] = await rows()
    // 'n/a' does not fit the bigint column → NULL there, still in `data`.
    expect(a2).toMatchObject({ status: 'churned', score: null, vip: null })
    expect(a2!['data']).toEqual({ id: 'a', status: 'churned', score: 'n/a' })
  })

  it('record deletes only remove rows not changed after the tombstone', async () => {
    await sink.applyBatch(TARGET, [row('a', 1000, {}), row('b', 5000, {})], [])
    const res = await sink.applyBatch(
      TARGET,
      [],
      [
        del({ pk: 'crm:hubspot:c1:contacts:a', resourceId: 'a', deletedAt: 2000 }),
        // b was re-created after this deletion: it stays.
        del({ pk: 'crm:hubspot:c1:contacts:b', resourceId: 'b', deletedAt: 3000 }),
      ],
    )
    expect(res.deleted).toBe(1)
    expect((await rows()).map((r) => r['resource_id'])).toEqual(['b'])
  })

  it('connection and vertical deletes (NULL type/id) remove by scope', async () => {
    await sink.applyBatch(
      TARGET,
      [row('a', 1000, {}, 'c1'), row('b', 1000, {}, 'c2'), row('c', 1000, {}, 'c2')],
      [],
    )
    let res = await sink.applyBatch(
      TARGET,
      [],
      [del({ scope: 'connection', connectionId: 'c1', resourceType: null, deletedAt: 2000 })],
    )
    expect(res.deleted).toBe(1)
    expect((await rows()).map((r) => r['connection_id'])).toEqual(['c2', 'c2'])
    res = await sink.applyBatch(
      TARGET,
      [],
      [
        del({
          scope: 'vertical',
          platform: null,
          connectionId: null,
          resourceType: null,
          deletedAt: 2000,
        }),
      ],
    )
    expect(res.deleted).toBe(2)
    expect(await rows()).toEqual([])
  })

  it('deletes against a table that was never created are a no-op', async () => {
    const res = await sink.applyBatch(
      { vertical: 'crm', resourceType: 'deals' },
      [],
      [del({ scope: 'all', vertical: null, deletedAt: 1 })],
    )
    expect(res).toEqual({ upserted: 0, deleted: 0 })
  })

  it('strips NUL, which Postgres text and jsonb refuse', async () => {
    const r = row('nul', 1000, { note: 'a\u0000b' })
    await sink.applyBatch(TARGET, [r], [])
    const [got] = await rows()
    expect(got!['note']).toBe('ab')
    expect(got!['data']).toEqual({ id: 'nul', note: 'ab' })
    // A literal backslash-u-0000 in the text is not an escape and survives.
    await sink.applyBatch(TARGET, [row('lit', 2000, { note: 'x\\u0000y' })], [])
    const lit = (await rows()).find((r) => r['resource_id'] === 'lit')!
    expect(lit['data']).toEqual({ id: 'lit', note: 'x\\u0000y' })
  })

  it('end to end: the worker upserts rows and fans wide tombstones out to every table', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const T0 = Date.UTC(2026, 0, 1)
    vi.setSystemTime(T0)
    const handle = await openDb({ sqlitePath: ':memory:' })
    try {
      const creds = await CredentialStore.create(handle, SECRET)
      const resources = await ResourceStore.create(handle)
      const store = await DestinationStore.create(handle, SECRET)
      const conn = await creds.create(
        'hubspot',
        null,
        { accessToken: 'x' } as never,
        'A',
        'crm',
        't1',
      )
      await resources.upsertMany('crm', 'hubspot', conn, 'contacts', [
        { id: 'a', email: 'a@example.com' },
        { id: 'b', email: 'b@example.com' },
      ] as Array<{ id: string } & Record<string, unknown>>)
      await resources.upsertMany('crm', 'hubspot', conn, 'deals', [{ id: 'd', amount: 1 }] as Array<
        { id: string } & Record<string, unknown>
      >)
      const d = await store.create({
        name: 'pg',
        type: 'postgres',
        config: { ...config },
        secrets: password ? { password } : {},
        scope: { tenants: ['t1'] },
      })
      const worker = new DestinationWorker({
        store,
        feed: resources,
        connections: creds,
        resourceTypes: () => [
          { vertical: 'crm', resourceType: 'contacts' },
          { vertical: 'crm', resourceType: 'deals' },
        ],
        classificationFor: () => ({
          email: { class: 'pii', mask: 'email' },
          '*': { class: 'internal' },
        }),
        sinkFactory: (dest, secrets) =>
          createSink(dest.type, dest.config, secrets, { hostGuard: guard }),
        hmacKey: deriveMaskKey(SECRET),
      })
      vi.setSystemTime(T0 + 200_000)
      const run = await worker.runOnce(d.id)
      expect(run).toMatchObject({ status: 'success', rowsWritten: 3 })
      const contacts = await rows()
      expect(contacts.map((r) => r['email'])).toEqual(['a***@example.com', 'b***@example.com'])

      vi.setSystemTime(T0 + 300_000)
      await resources.delete('crm', 'hubspot', conn, 'contacts', 'a')
      await resources.deleteConnection('crm', 'hubspot', conn)
      vi.setSystemTime(T0 + 500_000)
      const del2 = await worker.runOnce(d.id)
      expect(del2).toMatchObject({ status: 'success', deletesWritten: 2 })
      expect(await rows()).toEqual([])
      const deals = await admin.query(`SELECT count(*)::int AS n FROM ${SCHEMA}.os_crm_deals`)
      expect(deals.rows[0].n).toBe(0)
    } finally {
      vi.useRealTimers()
      await handle.close()
    }
  })
})
