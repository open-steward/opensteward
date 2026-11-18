import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { SyncStore, SYNC_JOBS_MIGRATIONS } from '../../src/data-store/sync-store'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

const DAY = 86_400_000

describe.each(BACKENDS)('SyncStore scheduling support [$name]', (backend) => {
  let handle: DbHandle
  let store: SyncStore

  async function fresh(): Promise<DbHandle> {
    const h = await backend.open()
    if (h.dialect === 'postgres')
      await h.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    return h
  }

  beforeEach(async () => {
    handle = await fresh()
    store = await SyncStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
  })

  const enqueue = (connectionId: string, origin: 'manual' | 'schedule' = 'schedule') =>
    store.createIfIdle({
      vertical: 'accounting',
      connectionId,
      platform: 'fortnox',
      tenantId: 'tenant-a',
      origin,
    })

  const backdate = (id: string, createdAt: number) =>
    handle.kysely
      .updateTable('sync_jobs')
      .set({ created_at: createdAt, completed_at: createdAt })
      .where('id', '=', id)
      .execute()

  describe('createIfIdle', () => {
    it('creates a job, then hands back that job instead of a second one', async () => {
      const first = await enqueue('c1')
      const second = await enqueue('c1', 'manual')
      expect(first.created).toBe(true)
      expect(first.job.origin).toBe('schedule')
      expect(second).toEqual({ job: first.job, created: false })
    })

    it('creates a new job once the previous one has finished', async () => {
      const first = await enqueue('c1')
      await store.markCompleted(first.job.id, {})
      expect((await enqueue('c1')).created).toBe(true)
    })

    it('concurrent createIfIdle creates one job', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => enqueue('c1')))
      expect(results.filter((r) => r.created)).toHaveLength(1)
      expect(new Set(results.map((r) => r.job.id)).size).toBe(1)
      expect(await store.count({ connectionId: 'c1' })).toBe(1)
    })

    it('the database itself refuses a second active job for a connection', async () => {
      await store.create('accounting', 'c1', 'fortnox', null, null)
      await expect(store.create('accounting', 'c1', 'fortnox', null, null)).rejects.toThrow()
    })

    it('different connections are independent', async () => {
      expect((await enqueue('c1')).created).toBe(true)
      expect((await enqueue('c2')).created).toBe(true)
    })

    it('hands back the active job the index found, whatever its vertical', async () => {
      // The index is keyed on the connection alone, so the lookup after a
      // refused insert must be too, or it finds nothing and gives up.
      const crm = await store.createIfIdle({
        vertical: 'crm',
        connectionId: 'c1',
        platform: 'hubspot',
        tenantId: null,
        origin: 'api',
      })
      expect(await enqueue('c1')).toEqual({ job: crm.job, created: false })
    })
  })

  describe('claimNext', () => {
    it('claims the oldest pending job and marks it running', async () => {
      const a = (await enqueue('c1')).job
      await enqueue('c2')
      // Two enqueues usually share a millisecond, and the tiebreak after
      // created_at is a random UUID: make `a` unambiguously the oldest.
      await handle.kysely
        .updateTable('sync_jobs')
        .set({ created_at: 1 })
        .where('id', '=', a.id)
        .execute()
      const claimed = await store.claimNext('accounting')
      expect(claimed).toMatchObject({ id: a.id, status: 'running' })
      expect((await store.get(a.id))!.status).toBe('running')
      expect((await store.claimNext('accounting'))!.connectionId).toBe('c2')
      expect(await store.claimNext('accounting')).toBeNull()
    })

    it('two claimers racing for one job: only one gets it', async () => {
      await enqueue('c1')
      const [x, y] = await Promise.all([
        store.claimNext('accounting'),
        store.claimNext('accounting'),
      ])
      expect([x, y].filter(Boolean)).toHaveLength(1)
    })

    it('stays inside its vertical', async () => {
      await store.createIfIdle({
        vertical: 'crm',
        connectionId: 'c9',
        platform: 'hubspot',
        tenantId: null,
        origin: 'api',
      })
      expect(await store.claimNext('accounting')).toBeNull()
    })
  })

  it('countPending counts waiting jobs of one vertical', async () => {
    await enqueue('c1')
    const running = (await enqueue('c2')).job
    await store.markRunning(running.id)
    await store.createIfIdle({
      vertical: 'crm',
      connectionId: 'c3',
      platform: 'hubspot',
      tenantId: null,
      origin: 'api',
    })
    expect(await store.countPending('accounting')).toBe(1)
  })

  describe('historyFor', () => {
    it('leaves out connections with no jobs', async () => {
      expect((await store.historyFor(['never'])).has('never')).toBe(false)
      expect((await store.historyFor([])).size).toBe(0)
    })

    it('reports an active job', async () => {
      await enqueue('c1')
      expect((await store.historyFor(['c1'])).get('c1')).toMatchObject({
        active: true,
        everQueued: true,
        lastFinishedAt: null,
        lastStatus: null,
      })
    })

    it('reports the last success, and the failures since it', async () => {
      const ok = (await enqueue('c1')).job
      await store.markCompleted(ok.id, {})
      await backdate(ok.id, 1_000)
      const f1 = (await enqueue('c1')).job
      await store.markFailed(f1.id, 'boom')
      await backdate(f1.id, 2_000)
      const f2 = (await enqueue('c1')).job
      await store.markFailed(f2.id, 'boom')
      await backdate(f2.id, 3_000)
      expect((await store.historyFor(['c1'])).get('c1')).toEqual({
        active: false,
        everQueued: true,
        lastFinishedAt: 3_000,
        lastStatus: 'failed',
        lastSuccessAt: 1_000,
        consecutiveFailures: 2,
      })
    })

    it('a success resets the failure count', async () => {
      const f = (await enqueue('c1')).job
      await store.markFailed(f.id, 'boom')
      await backdate(f.id, 1_000)
      const ok = (await enqueue('c1')).job
      await store.markCompleted(ok.id, {})
      await backdate(ok.id, 2_000)
      expect((await store.historyFor(['c1'])).get('c1')).toMatchObject({
        lastStatus: 'completed',
        lastSuccessAt: 2_000,
        consecutiveFailures: 0,
      })
    })

    it('answers for more connections than one query chunk holds', async () => {
      const ids = Array.from({ length: 1_200 }, (_, i) => `id-${i}`)
      await enqueue('id-1150')
      const map = await store.historyFor(ids)
      expect([...map.keys()]).toEqual(['id-1150'])
    })
  })

  it('reads a job queued before origin existed as origin null', async () => {
    await handle.kysely
      .insertInto('sync_jobs')
      .values({
        id: 'legacy',
        vertical: 'accounting',
        connection_id: 'c1',
        platform: 'fortnox',
        status: 'completed',
        created_at: 1,
      })
      .execute()
    expect((await store.get('legacy'))!.origin).toBeNull()
  })

  describe('cleanup', () => {
    it("keeps each connection's latest success, and every failure since", async () => {
      const old = Date.now() - 40 * DAY
      const a = (await enqueue('c1')).job
      await store.markCompleted(a.id, {})
      await backdate(a.id, old)
      const b = (await enqueue('c1')).job
      await store.markCompleted(b.id, {})
      await backdate(b.id, old + 1_000)
      const c = (await enqueue('c1')).job
      await store.markFailed(c.id, 'boom')
      await backdate(c.id, old + 2_000)
      expect(await store.cleanup(30)).toBe(1)
      expect(await store.get(a.id)).toBeNull()
      expect(await store.get(b.id)).not.toBeNull()
      expect(await store.get(c.id)).not.toBeNull()
    })

    it('keeps a connection whose only sync is older than the retention window', async () => {
      const j = (await enqueue('c1')).job
      await store.markCompleted(j.id, {})
      await backdate(j.id, Date.now() - 400 * DAY)
      expect(await store.cleanup(30)).toBe(0)
    })
  })

  it('the v2 migration supersedes duplicate active jobs, keeping the oldest', async () => {
    const h = await fresh()
    try {
      await h.migrate('sync_jobs', SYNC_JOBS_MIGRATIONS.slice(0, 1))
      const row = (id: string, connection_id: string, status: string, created_at: number) => ({
        id,
        vertical: 'accounting',
        connection_id,
        platform: 'fortnox',
        status,
        created_at,
      })
      await h.kysely
        .insertInto('sync_jobs')
        .values([
          row('x1', 'conn-x', 'pending', 1),
          row('x2', 'conn-x', 'running', 2),
          row('x3', 'conn-x', 'pending', 3),
          row('y1', 'conn-y', 'pending', 1),
        ])
        .execute()
      const s = await SyncStore.create(h)
      expect((await s.get('x1'))!.status).toBe('pending')
      for (const id of ['x2', 'x3']) {
        const j = (await s.get(id))!
        expect(j.status).toBe('failed')
        expect(j.error).toMatch(/Superseded/)
        expect(j.completedAt).not.toBeNull()
      }
      expect((await s.get('y1'))!.status).toBe('pending')
    } finally {
      await h.close()
    }
  })

  it('history ignores a job the v2 migration superseded: it never ran', async () => {
    const h = await fresh()
    try {
      await h.migrate('sync_jobs', SYNC_JOBS_MIGRATIONS.slice(0, 1))
      const row = (id: string, created_at: number) => ({
        id,
        vertical: 'accounting',
        connection_id: 'conn-x',
        platform: 'fortnox',
        status: 'pending',
        created_at,
      })
      await h.kysely
        .insertInto('sync_jobs')
        .values([row('x1', 1), row('x2', 2)])
        .execute()
      const s = await SyncStore.create(h)
      expect((await s.get('x2'))!.error).toMatch(/^Superseded:/)
      await s.markCompleted('x1', {})
      const finished = Date.parse((await s.get('x1'))!.completedAt!)
      // x2 is the newer row and is 'failed', but it is no outcome of a sync.
      expect((await s.historyFor(['conn-x'])).get('conn-x')).toEqual({
        active: false,
        everQueued: true,
        lastFinishedAt: finished,
        lastStatus: 'completed',
        lastSuccessAt: finished,
        consecutiveFailures: 0,
      })
    } finally {
      await h.close()
    }
  })

  it('a superseded job a pre-v2 replica went on to complete is no success in any query', async () => {
    // Rolling deploy: v2 marks a running job superseded, then the old replica
    // still running it calls markCompleted, which leaves the error in place.
    const job = (id: string, status: string, at: number, error: string | null) => ({
      id,
      vertical: 'accounting',
      connection_id: 'c1',
      platform: 'fortnox',
      status,
      created_at: at,
      completed_at: at,
      error,
    })
    await handle.kysely
      .insertInto('sync_jobs')
      .values([
        job('r-1', 'failed', 1_000, 'boom'),
        job('r-2', 'completed', 2_000, 'Superseded: another sync was already queued'),
      ])
      .execute()
    // The failure before it still counts: latest, last success and the
    // failure count agree that r-2 never happened.
    expect((await store.historyFor(['c1'])).get('c1')).toEqual({
      active: false,
      everQueued: true,
      lastFinishedAt: 1_000,
      lastStatus: 'failed',
      lastSuccessAt: null,
      consecutiveFailures: 1,
    })
  })

  it('orders jobs that share a created_at by id, the same way in every query', async () => {
    // Same millisecond: the higher id is the newer job, as in claimNext.
    const at = Date.now() - 40 * DAY
    const job = (id: string, status: string) => ({
      id,
      vertical: 'accounting',
      connection_id: 'c1',
      platform: 'fortnox',
      status,
      created_at: at,
      completed_at: at,
    })
    await handle.kysely
      .insertInto('sync_jobs')
      .values([job('t-a', 'completed'), job('t-b', 'failed'), job('t-c', 'completed')])
      .execute()
    // t-c is the latest finished job and a success, so nothing failed since it.
    expect((await store.historyFor(['c1'])).get('c1')).toMatchObject({
      lastStatus: 'completed',
      consecutiveFailures: 0,
    })
    // t-c supersedes both older rows; it alone is kept.
    expect(await store.cleanup(30)).toBe(2)
    expect(await store.get('t-c')).not.toBeNull()
  })
})

describe('SyncStore history and retention at scale [sqlite]', () => {
  // Before idx_sync_jobs_connection_history, historyFor and cleanup ran a
  // correlated subquery that scanned the whole table once per outer row:
  // seconds to tens of seconds at this size, with better-sqlite3 blocking the
  // event loop throughout.
  const CONNECTIONS = 300
  const FINISHED = 60
  const T0 = 1_000_000
  let handle: DbHandle
  let store: SyncStore

  /** kind 0: all succeeded, plus a queued job; kind 1: the last 2 failed;
   *  kind 2: the last 30 failed. */
  const expected = (i: number) =>
    [
      {
        active: true,
        everQueued: true,
        lastFinishedAt: T0 + 59_500,
        lastStatus: 'completed',
        lastSuccessAt: T0 + 59_500,
        consecutiveFailures: 0,
      },
      {
        active: false,
        everQueued: true,
        lastFinishedAt: T0 + 59_500,
        lastStatus: 'failed',
        lastSuccessAt: T0 + 57_500,
        consecutiveFailures: 2,
      },
      {
        active: false,
        everQueued: true,
        lastFinishedAt: T0 + 59_500,
        lastStatus: 'failed',
        lastSuccessAt: T0 + 29_500,
        consecutiveFailures: 30,
      },
    ][i % 3]
  const ids = Array.from({ length: CONNECTIONS }, (_, i) => `h-${i}`)

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await SyncStore.create(handle)
    for (let i = 0; i < CONNECTIONS; i++) {
      const kind = i % 3
      const rows: Array<Record<string, unknown>> = Array.from({ length: FINISHED }, (_, j) => ({
        id: `h-${i}-${String(j).padStart(2, '0')}`,
        vertical: 'accounting',
        connection_id: `h-${i}`,
        platform: 'fortnox',
        status: (kind === 1 && j >= 58) || (kind === 2 && j >= 30) ? 'failed' : 'completed',
        created_at: T0 + j * 1_000,
        completed_at: T0 + j * 1_000 + 500,
      }))
      if (kind === 0) {
        rows.push({
          id: `h-${i}-queued`,
          vertical: 'accounting',
          connection_id: `h-${i}`,
          platform: 'fortnox',
          status: 'pending',
          created_at: T0 + FINISHED * 1_000,
          completed_at: null,
        })
      }
      await handle.kysely.insertInto('sync_jobs').values(rows).execute()
    }
  })

  afterEach(async () => {
    await handle.close()
  })

  it('historyFor answers 300 connections of 60 jobs each in well under a second', async () => {
    const started = performance.now()
    const map = await store.historyFor(ids)
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(1_500)
    expect(map.size).toBe(CONNECTIONS)
    for (const id of ['h-0', 'h-1', 'h-2', 'h-299']) {
      expect(map.get(id)).toEqual(expected(Number(id.slice(2))))
    }
  }, 120_000)

  it('cleanup keeps exactly what historyFor reads, quickly', async () => {
    const before = await store.historyFor(ids)
    const started = performance.now()
    const removed = await store.cleanup(30)
    const elapsed = performance.now() - started
    expect(elapsed).toBeLessThan(1_500)
    // Everything older than each connection's latest success goes:
    // 59 + 57 + 29 per three connections.
    expect(removed).toBe((CONNECTIONS / 3) * (59 + 57 + 29))
    expect(await store.historyFor(ids)).toEqual(before)
  }, 120_000)
})
