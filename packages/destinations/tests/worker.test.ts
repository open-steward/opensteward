/**
 * DestinationWorker against a real ResourceStore/CredentialStore (SQLite, or
 * Postgres with TEST_DATABASE_URL) and an in-memory object-store sink:
 * file layout, masking, cursor resume, the lag window, flush + failure
 * semantics (cursor only after a successful write), lease contention,
 * tombstones and tenant/vertical scope filtering.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CredentialStore,
  ResourceStore,
  deriveMaskKey,
  openDb,
  type DbHandle,
  type ResourceClassification,
} from '@opensteward/shared'
import { DestinationStore } from '../src/store'
import { DestinationWorker, LeaseHeldError, type DestinationWorkerOptions } from '../src/worker'
import { readParquetRows } from '../src/writers/parquet'
import type { ObjectStoreSink } from '../src/types'

const SECRET = 'k'.repeat(40)
const T0 = Date.UTC(2026, 8, 29, 12, 0, 0)
const LAG = 120_000

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

const CLS: Record<string, ResourceClassification> = {
  contacts: {
    email: { class: 'pii', mask: 'email' },
    token: { class: 'secret' },
    '*': { class: 'internal' },
  },
  deals: { '*': { class: 'internal' } },
}

class MemorySink implements ObjectStoreSink {
  readonly kind = 'object_store' as const
  files = new Map<string, { bytes: Uint8Array; contentType: string }>()
  failOnWrite: number | null = null
  writes = 0
  closed = 0
  async test() {}
  async writeFile(path: string, bytes: Uint8Array, contentType: string) {
    this.writes++
    if (this.failOnWrite !== null && this.writes === this.failOnWrite) {
      throw new Error('bucket unavailable')
    }
    this.files.set(path, { bytes, contentType })
  }
  async close() {
    this.closed++
  }
  paths(prefix = ''): string[] {
    return [...this.files.keys()].filter((p) => p.startsWith(prefix)).sort()
  }
  async rows(path: string) {
    return (await readParquetRows(this.files.get(path)!.bytes)).rows
  }
  async allRows(prefix: string) {
    const out: Array<Record<string, unknown>> = []
    for (const p of this.paths(prefix)) out.push(...(await this.rows(p)))
    return out
  }
}

describe.each(BACKENDS)('DestinationWorker [$name]', (backend) => {
  let handle: DbHandle
  let creds: CredentialStore
  let resources: ResourceStore
  let store: DestinationStore
  let sink: MemorySink
  let connA: string // crm/hubspot, tenant-a
  let connB: string // crm/hubspot, tenant-b
  let connE: string // ecommerce/shopify, tenant-a

  function setTime(ms: number) {
    vi.setSystemTime(ms)
  }

  function worker(over: Partial<DestinationWorkerOptions> = {}) {
    return new DestinationWorker({
      store,
      feed: resources,
      connections: creds,
      resourceTypes: () => [
        { vertical: 'crm', resourceType: 'contacts' },
        { vertical: 'crm', resourceType: 'deals' },
        { vertical: 'ecommerce', resourceType: 'orders' },
      ],
      classificationFor: (_v, t) => CLS[t] ?? { '*': { class: 'pii', mask: 'redact' } },
      sinkFactory: async () => sink,
      hmacKey: deriveMaskKey(SECRET),
      lagMs: LAG,
      workerId: 'w1',
      ...over,
    })
  }

  async function dest(over: Record<string, unknown> = {}) {
    return store.create({
      name: 'lake',
      type: 's3',
      config: { bucket: 'bkt', prefix: 'exports' },
      scope: { tenants: '*' },
      ...over,
    } as Parameters<DestinationStore['create']>[0])
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    setTime(T0)
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    creds = await CredentialStore.create(handle, SECRET)
    resources = await ResourceStore.create(handle)
    store = await DestinationStore.create(handle, SECRET)
    sink = new MemorySink()
    const c = { accessToken: 'x' } as never
    connA = await creds.create('hubspot', null, c, 'A', 'crm', 'tenant-a')
    connB = await creds.create('hubspot', null, c, 'B', 'crm', 'tenant-b')
    connE = await creds.create('shopify', null, c, 'E', 'ecommerce', 'tenant-a')
    await resources.upsertMany('crm', 'hubspot', connA, 'contacts', [
      { id: 'a1', email: 'ann@example.com', token: 'tok-a1', firstName: 'Ann' },
      { id: 'a2', email: 'al@example.com', token: 'tok-a2', firstName: 'Al' },
    ] as Array<{ id: string } & Record<string, unknown>>)
    await resources.upsertMany('crm', 'hubspot', connB, 'contacts', [
      { id: 'b1', email: 'bea@example.com', firstName: 'Bea' },
    ] as Array<{ id: string } & Record<string, unknown>>)
    await resources.upsertMany('crm', 'hubspot', connA, 'deals', [
      { id: 'd1', amount: 10 },
    ] as Array<{ id: string } & Record<string, unknown>>)
    await resources.upsertMany('ecommerce', 'shopify', connE, 'orders', [
      { id: 'o1', total: 5 },
    ] as Array<{ id: string } & Record<string, unknown>>)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await handle.close()
  })

  it('exports every in-scope row as Parquet under the partitioned layout, masked', async () => {
    const d = await dest()
    setTime(T0 + LAG + 1)
    const run = await worker({ newRunId: () => 'run-1' }).runOnce(d.id)
    expect(run).toMatchObject({ status: 'success', rowsWritten: 5, deletesWritten: 0 })

    expect(sink.paths()).toEqual([
      '_manifests/run-1.json',
      'vertical=crm/resource_type=contacts/dt=2026-09-29/run-1-00000.parquet',
      'vertical=crm/resource_type=deals/dt=2026-09-29/run-1-00001.parquet',
      'vertical=ecommerce/resource_type=orders/dt=2026-09-29/run-1-00002.parquet',
    ])
    const contacts = await sink.rows(
      'vertical=crm/resource_type=contacts/dt=2026-09-29/run-1-00000.parquet',
    )
    expect(contacts.map((r) => r['resource_id']).sort()).toEqual(['a1', 'a2', 'b1'])
    const a1 = contacts.find((r) => r['resource_id'] === 'a1')!
    expect(a1).toMatchObject({
      connection_id: connA,
      owner_tenant_id: 'tenant-a',
      platform: 'hubspot',
      vertical: 'crm',
      resource_type: 'contacts',
      email: 'a***@example.com',
      first_name: 'Ann',
      _deleted: false,
    })
    expect(a1['token']).toBeUndefined()
    expect(JSON.stringify(contacts)).not.toContain('ann@example.com')
    expect(JSON.stringify(contacts)).not.toContain('tok-a1')

    const manifest = JSON.parse(
      new TextDecoder().decode(sink.files.get('_manifests/run-1.json')!.bytes),
    ) as { runId: string; files: Array<{ path: string; rows: number }>; rowsWritten: number }
    expect(manifest.runId).toBe('run-1')
    expect(manifest.rowsWritten).toBe(5)
    expect(manifest.files.map((f) => f.rows)).toEqual([3, 1, 1])

    const [recorded] = await store.listRuns(d.id)
    expect(recorded).toMatchObject({ id: 'run-1', status: 'success', rowsWritten: 5 })
    expect(recorded!.files).toHaveLength(4)
    expect(await store.get(d.id)).toMatchObject({ lastStatus: 'success', lastRunAt: T0 + LAG + 1 })
    expect(await store.leaseOf(d.id)).toEqual({ owner: null, expiresAt: null })
    expect(sink.closed).toBe(1)
  })

  it('reveals PII only with include_pii — secrets never', async () => {
    const d = await dest({
      includePii: true,
      actor: 'admin',
      scope: { tenants: '*', verticals: { crm: ['contacts'] } },
    })
    setTime(T0 + LAG + 1)
    await worker().runOnce(d.id)
    const rows = await sink.allRows('vertical=crm/resource_type=contacts/')
    expect(rows.find((r) => r['resource_id'] === 'a1')!['email']).toBe('ann@example.com')
    expect(JSON.stringify(rows)).not.toContain('tok-a1')
  })

  it('resumes from its cursor: only changed rows go out on the next run', async () => {
    const d = await dest({ scope: { tenants: '*', verticals: { crm: ['contacts'] } } })
    setTime(T0 + LAG + 1)
    let n = 0
    const w = worker({ newRunId: () => `run-${++n}` })
    expect((await w.runOnce(d.id))!.rowsWritten).toBe(3)

    // Nothing changed → nothing written, not even a manifest.
    setTime(T0 + 2 * LAG)
    expect((await w.runOnce(d.id))!.rowsWritten).toBe(0)
    expect(sink.paths('_manifests/')).toEqual(['_manifests/run-1.json'])

    // A re-sync of identical data does not move changed_at: still nothing.
    await resources.upsertMany('crm', 'hubspot', connA, 'contacts', [
      { id: 'a1', email: 'ann@example.com', token: 'tok-a1', firstName: 'Ann' },
    ] as Array<{ id: string } & Record<string, unknown>>)
    setTime(T0 + 4 * LAG)
    expect((await w.runOnce(d.id))!.rowsWritten).toBe(0)

    // A real change → exactly that row.
    await resources.upsert('crm', 'hubspot', connA, 'contacts', 'a2', {
      id: 'a2',
      email: 'al@example.com',
      firstName: 'Alan',
    })
    setTime(T0 + 6 * LAG)
    const run = await w.runOnce(d.id)
    expect(run!.rowsWritten).toBe(1)
    const rows = await sink.rows(run!.files[0]!.path)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ resource_id: 'a2', first_name: 'Alan' })
  })

  it('holds back rows inside the lag window', async () => {
    const d = await dest({ scope: { tenants: '*', verticals: { crm: ['contacts'] } } })
    setTime(T0 + LAG - 1) // rows stamped at T0 are 1 ms too fresh
    const w = worker()
    expect((await w.runOnce(d.id))!.rowsWritten).toBe(0)
    setTime(T0 + LAG)
    expect((await w.runOnce(d.id))!.rowsWritten).toBe(3)
  })

  it('flushes by row count and only advances the cursor past written files', async () => {
    const d = await dest({ scope: { tenants: '*', verticals: { crm: ['contacts'] } } })
    setTime(T0 + LAG + 1)
    // Page size 1 + flush every row → one file per row. The second write fails.
    sink.failOnWrite = 2
    const w = worker({ pageLimit: 1, flushRows: 1, newRunId: () => 'r1' })
    const failed = await w.runOnce(d.id)
    expect(failed).toMatchObject({ status: 'failed', rowsWritten: 1, error: 'bucket unavailable' })
    expect(await store.get(d.id)).toMatchObject({
      lastStatus: 'failed',
      lastError: 'bucket unavailable',
    })
    expect((await store.listRuns(d.id))[0]).toMatchObject({ status: 'failed', rowsWritten: 1 })
    const firstFile = await sink.allRows('vertical=')
    expect(firstFile).toHaveLength(1)

    // The retry picks up exactly where the successful write left off.
    sink.failOnWrite = null
    const retry = await worker({ pageLimit: 1, flushRows: 1, newRunId: () => 'r2' }).runOnce(d.id)
    expect(retry).toMatchObject({ status: 'success', rowsWritten: 2 })
    const ids = (await sink.allRows('vertical=')).map((r) => r['resource_id']).sort()
    expect(ids).toEqual(['a1', 'a2', 'b1'])
  })

  it('lease contention: a second worker cannot run a leased destination', async () => {
    const d = await dest()
    setTime(T0 + LAG + 1)
    expect(await store.claimLease(d.id, 'other-replica', Date.now(), 60_000)).toBe(true)
    const w = worker()
    expect(await w.runOnce(d.id)).toBeNull()
    await expect(w.runNow(d.id)).rejects.toBeInstanceOf(LeaseHeldError)
    expect(await w.tick()).toEqual([])
    expect(sink.files.size).toBe(0)
    // Once the other lease expires the destination runs.
    setTime(T0 + LAG + 60_002)
    expect((await w.tick()).map((r) => r.status)).toEqual(['success'])
  })

  it('tick runs due destinations once per interval', async () => {
    const d = await dest({ intervalSec: 600 })
    await dest({ name: 'off', enabled: false })
    setTime(T0 + LAG + 1)
    const w = worker()
    const first = await w.tick()
    expect(first.map((r) => r.destinationId)).toEqual([d.id])
    setTime(T0 + LAG + 1 + 599_000)
    expect(await w.tick()).toEqual([])
    setTime(T0 + LAG + 1 + 600_000)
    expect(await w.tick()).toHaveLength(1)
  })

  it('runNow returns the run id at once and settles `done`', async () => {
    const d = await dest()
    setTime(T0 + LAG + 1)
    const { runId, done } = await worker({ newRunId: () => 'manual-1' }).runNow(d.id)
    expect(runId).toBe('manual-1')
    expect((await done).status).toBe('success')
    expect((await store.listRuns(d.id))[0]).toMatchObject({ id: 'manual-1', trigger: 'manual' })
  })

  it('tombstones: record, connection and vertical deletes land in _deletes/', async () => {
    // A deletion from BEFORE the destination existed is never replayed.
    await resources.delete('crm', 'hubspot', connA, 'deals', 'd1')
    const d = await dest()
    setTime(T0 + LAG + 1)
    let n = 0
    const w = worker({ newRunId: () => `run-${++n}` })
    expect((await w.runOnce(d.id))!.deletesWritten).toBe(0)

    setTime(T0 + 10 * LAG)
    await resources.delete('crm', 'hubspot', connA, 'contacts', 'a1')
    await resources.deleteConnection('crm', 'hubspot', connB)
    await resources.deleteAll('ecommerce')
    // Fresh tombstones are inside the lag window: held back.
    expect((await w.runOnce(d.id))!.deletesWritten).toBe(0)

    setTime(T0 + 12 * LAG)
    const run = await w.runOnce(d.id)
    expect(run).toMatchObject({ status: 'success', deletesWritten: 3, rowsWritten: 0 })
    const [path] = sink.paths('_deletes/')
    expect(path).toBe(`_deletes/dt=2026-09-29/run-3-00000.parquet`)
    const deletes = await sink.rows(path!)
    expect(deletes.map((r) => r['scope'])).toEqual(['record', 'connection', 'vertical'])
    expect(deletes[0]).toMatchObject({
      _pk: `crm:hubspot:${connA}:contacts:a1`,
      owner_tenant_id: 'tenant-a',
      deleted_at: T0 + 10 * LAG,
      _deleted: true,
    })
    expect(deletes[1]).toMatchObject({
      connection_id: connB,
      owner_tenant_id: 'tenant-b',
      _pk: null,
    })
    expect(deletes[2]).toMatchObject({ vertical: 'ecommerce', connection_id: null })

    // The watermark moved: the next run sends nothing again.
    setTime(T0 + 14 * LAG)
    expect((await w.runOnce(d.id))!.deletesWritten).toBe(0)
  })

  it('scope: a tenant-scoped destination sees only its tenant, verticals and types', async () => {
    const d = await dest({ scope: { tenants: ['tenant-a'], verticals: { crm: ['contacts'] } } })
    setTime(T0 + LAG + 1)
    const w = worker()
    const run = await w.runOnce(d.id)
    expect(run!.rowsWritten).toBe(2)
    expect(sink.paths('vertical=')).toHaveLength(1)
    const rows = await sink.allRows('vertical=')
    expect(rows.map((r) => r['resource_id']).sort()).toEqual(['a1', 'a2'])
    expect(new Set(rows.map((r) => r['owner_tenant_id']))).toEqual(new Set(['tenant-a']))

    // Deletes: tenant-b's connection and the out-of-scope deal are not ours.
    setTime(T0 + 10 * LAG)
    await resources.deleteConnection('crm', 'hubspot', connB)
    await resources.delete('crm', 'hubspot', connA, 'deals', 'd1')
    await resources.delete('crm', 'hubspot', connA, 'contacts', 'a2')
    // A connection this destination exported, deleted outright: its tombstone
    // still applies even though the credential row is gone.
    await creds.deleteById(connA)
    await resources.deleteConnection('crm', 'hubspot', connA)
    setTime(T0 + 12 * LAG)
    const del = await w.runOnce(d.id)
    expect(del!.deletesWritten).toBe(2)
    const deletes = await sink.allRows('_deletes/')
    expect(deletes.map((r) => [r['scope'], r['connection_id'], r['owner_tenant_id']])).toEqual([
      ['record', connA, 'tenant-a'],
      ['connection', connA, 'tenant-a'],
    ])
  })

  it('a connection with no owner tenant is exported only to an all-tenant scope', async () => {
    const orphan = await creds.create(
      'hubspot',
      null,
      { accessToken: 'x' } as never,
      'N',
      'crm',
      null,
    )
    await resources.upsertMany('crm', 'hubspot', orphan, 'contacts', [
      { id: 'n1', email: 'n@example.com' },
    ] as Array<{ id: string } & Record<string, unknown>>)
    const scoped = await dest({
      scope: { tenants: ['tenant-a', 'tenant-b'], verticals: { crm: ['contacts'] } },
    })
    const all = await dest({ scope: { tenants: '*', verticals: { crm: ['contacts'] } } })
    setTime(T0 + LAG + 1)
    const w = worker()
    expect((await w.runOnce(scoped.id))!.rowsWritten).toBe(3)
    expect((await w.runOnce(all.id))!.rowsWritten).toBe(4)
  })

  it('start/stop: closes orphaned runs and stops cleanly', async () => {
    const d = await dest()
    await store.startRun(d.id, 'schedule', T0)
    setTime(T0 + LAG + 1)
    const w = worker({ intervalMs: 60_000 })
    w.start()
    await vi.waitFor(async () => {
      const runs = await store.listRuns(d.id)
      expect(runs.some((r) => r.status === 'success')).toBe(true)
    })
    await w.stop()
    const statuses = (await store.listRuns(d.id)).map((r) => r.status).sort()
    expect(statuses).toEqual(['failed', 'success'])
  })
})
