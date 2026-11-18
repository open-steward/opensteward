import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CredentialStore, SyncStore, openDb } from '@opensteward/shared'
import type { DbHandle, SyncJob, SyncSchedule } from '@opensteward/shared'
import { SyncScheduler, type SyncSchedulerOptions } from '../../src/workers/sync-scheduler'

const SECRET = 'sync-scheduler-test-secret-must-be-32-chars'
const MIN = 60_000
const silent = { info: () => {}, warn: () => {}, error: () => {} }

describe('SyncScheduler', () => {
  let handle: DbHandle
  let store: CredentialStore
  let syncStore: SyncStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await CredentialStore.create(handle, SECRET)
    syncStore = await SyncStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
  })

  // A label each: the unique index folds a null label to '', so two unlabelled
  // connections to one platform and tenant collide.
  let n = 0
  const connect = (schedule?: SyncSchedule, vertical = 'accounting', platform = 'fortnox') =>
    store.create(platform, null, { accessToken: 't' }, `c${n++}`, vertical, 'tenant-a', schedule)

  const scheduler = (over: Partial<SyncSchedulerOptions> = {}) =>
    new SyncScheduler({
      store,
      syncStore,
      defaultIntervalMinutes: () => 360,
      enabled: () => true,
      logger: silent,
      ...over,
    })

  /** One finished sync for a connection, finished now (real clock). */
  async function finish(connectionId: string, status: 'completed' | 'failed' = 'completed') {
    const job = await syncStore.create('accounting', connectionId, 'fortnox', null, null)
    if (status === 'completed') await syncStore.markCompleted(job.id, {})
    else await syncStore.markFailed(job.id, 'boom')
  }

  const jobsFor = (connectionId: string) => syncStore.list({ connectionId })
  const later = (minutes: number) => () => Date.now() + minutes * MIN

  it('enqueues a never-synced connection on the default schedule, for its owner', async () => {
    const id = await connect()
    expect(await scheduler().tick()).toMatchObject({ considered: 1, due: 1, enqueued: 1 })
    expect(await jobsFor(id)).toEqual([
      expect.objectContaining({
        status: 'pending',
        origin: 'schedule',
        tenantId: 'tenant-a',
        vertical: 'accounting',
        platform: 'fortnox',
      }),
    ])
  })

  it('never enqueues a trigger-only connection', async () => {
    const id = await connect({ mode: 'trigger_only' })
    expect(await scheduler({ now: later(100_000) }).tick()).toMatchObject({ considered: 0 })
    expect(await jobsFor(id)).toHaveLength(0)
  })

  it('gives a one-time connection its first sync, and never another', async () => {
    const id = await connect({ mode: 'once' })
    await scheduler().tick()
    const [job] = await jobsFor(id)
    expect(job!.origin).toBe('schedule')
    await syncStore.markCompleted(job!.id, {})
    await scheduler({ now: later(365 * 24 * 60) }).tick()
    expect(await jobsFor(id)).toHaveLength(1)
  })

  it('waits one deployment interval after the last sync', async () => {
    const id = await connect()
    await finish(id)
    expect((await scheduler({ now: later(359) }).tick()).enqueued).toBe(0)
    expect((await scheduler({ now: later(361) }).tick()).enqueued).toBe(1)
  })

  it("a custom interval overrides the deployment's", async () => {
    const id = await connect({ mode: 'custom', intervalMinutes: 30 })
    await finish(id)
    expect((await scheduler({ now: later(29) }).tick()).enqueued).toBe(0)
    expect((await scheduler({ now: later(31) }).tick()).enqueued).toBe(1)
  })

  it('retries a failed sync after 15 minutes, not after the full interval', async () => {
    const id = await connect()
    await finish(id, 'failed')
    expect((await scheduler({ now: later(14) }).tick()).enqueued).toBe(0)
    expect((await scheduler({ now: later(16) }).tick()).enqueued).toBe(1)
  })

  it('keeps at most two jobs waiting per vertical', async () => {
    for (let i = 0; i < 5; i++) await connect()
    expect(await scheduler().tick()).toMatchObject({ due: 5, enqueued: 2, deferred: 3 })
    // Nothing more while the queue is full.
    expect((await scheduler().tick()).enqueued).toBe(0)
    // Once the worker drains it, the next two go.
    for (const j of await syncStore.list({ status: 'pending' })) {
      await syncStore.markCompleted(j.id, {})
    }
    expect((await scheduler().tick()).enqueued).toBe(2)
  })

  it('counts a waiting manual sync against the limit', async () => {
    const manual = await connect()
    await syncStore.createIfIdle({
      vertical: 'accounting',
      connectionId: manual,
      platform: 'fortnox',
      tenantId: null,
      origin: 'manual',
    })
    await connect()
    await connect()
    expect(await scheduler().tick()).toMatchObject({ due: 2, enqueued: 1, deferred: 1 })
  })

  it('limits each vertical separately', async () => {
    await connect()
    await connect()
    await connect()
    await connect(undefined, 'crm', 'hubspot')
    expect(await scheduler().tick()).toMatchObject({ enqueued: 3, deferred: 1 })
  })

  it('serves the longest-waiting connection first', async () => {
    const older = await connect()
    const newer = await connect()
    await finish(older)
    await new Promise((r) => setTimeout(r, 5))
    await finish(newer)
    const r = await scheduler({ maxPendingPerVertical: 1, now: later(361) }).tick()
    expect(r).toMatchObject({ enqueued: 1, deferred: 1 })
    expect(await jobsFor(older)).toHaveLength(2)
    expect(await jobsFor(newer)).toHaveLength(1)
  })

  it('serves a never-synced connection before an overdue one', async () => {
    // Its first sync is due "now", which sorts after every overdue connection;
    // with a backlog that pushed a new connection's first sync back by hours.
    const synced = await connect()
    await finish(synced)
    const fresh = await connect()
    const r = await scheduler({ maxPendingPerVertical: 1, now: later(361) }).tick()
    expect(r).toMatchObject({ due: 2, enqueued: 1, deferred: 1 })
    expect(await jobsFor(fresh)).toHaveLength(1)
    expect(await jobsFor(synced)).toHaveLength(1)
  })

  it('serves never-synced connections oldest connection first', async () => {
    const a = await connect()
    const b = await connect()
    // Make the connection the id tiebreak would pick the newer one, so only
    // created_at can put the other first.
    const [first, second] = [a, b].sort((x, y) => x.localeCompare(y)) as [string, string]
    await handle.kysely
      .updateTable('credentials')
      .set({ created_at: 1 })
      .where('id', '=', second)
      .execute()
    const r = await scheduler({ maxPendingPerVertical: 1 }).tick()
    expect(r).toMatchObject({ due: 2, enqueued: 1, deferred: 1 })
    expect(await jobsFor(second)).toHaveLength(1)
    expect(await jobsFor(first)).toHaveLength(0)
  })

  it('skips a connection whose circuit is open', async () => {
    const id = await connect()
    const r = await scheduler({ isCircuitOpen: (c) => c === id }).tick()
    expect(r).toMatchObject({ due: 1, enqueued: 0, skippedOpenCircuit: 1 })
  })

  it('pauses a connection whose customer must re-authorize', async () => {
    const id = await connect()
    await store.updateRefreshStatus(id, 'expired', Date.now(), 'invalid_grant')
    expect(await scheduler().tick()).toMatchObject({ considered: 1, due: 0, enqueued: 0 })
  })

  it('does nothing while switched off', async () => {
    await connect()
    expect(await scheduler({ enabled: () => false }).tick()).toMatchObject({
      disabled: true,
      enqueued: 0,
    })
  })

  it('two replicas ticking together enqueue each connection once', async () => {
    const ids = [await connect(), await connect()]
    await Promise.all([scheduler().tick(), scheduler().tick()])
    for (const id of ids) expect(await jobsFor(id)).toHaveLength(1)
  })

  it('a deployment interval of 0 does not mean every tick', async () => {
    const id = await connect()
    await finish(id)
    const r = await scheduler({ defaultIntervalMinutes: () => 0, now: later(60) }).tick()
    expect(r.enqueued).toBe(0)
  })

  it('logs a failing read instead of throwing', async () => {
    const lines: string[] = []
    const r = await scheduler({
      store: {
        listSyncScheduled: async () => {
          throw new Error('db down')
        },
      },
      logger: { info: () => {}, warn: () => {}, error: (m) => lines.push(m) },
    }).tick()
    expect(r.enqueued).toBe(0)
    expect(lines.join('\n')).toContain('db down')
  })

  it('counts a job another replica just enqueued against the limit', async () => {
    // createIfIdle lost the race: the connection's job is already waiting, put
    // there by another replica. It occupies a slot all the same.
    for (let i = 0; i < 3; i++) await connect()
    const attempted: string[] = []
    const r = await scheduler({
      maxPendingPerVertical: 1,
      syncStore: {
        historyFor: async () => new Map(),
        countPending: async () => 0,
        createIfIdle: async (input) => {
          attempted.push(input.connectionId)
          return { created: false, job: { status: 'pending' } as SyncJob }
        },
      },
    }).tick()
    expect(attempted).toHaveLength(1)
    expect(r).toMatchObject({ due: 3, enqueued: 0, deferred: 2 })
  })

  it('a connection whose enqueue fails does not end the tick', async () => {
    for (let i = 0; i < 3; i++) await connect()
    // Fails for whichever connection is tried first, and only for that one.
    let failing: string | undefined
    const warnings: string[] = []
    const r = await scheduler({
      maxPendingPerVertical: 5,
      syncStore: {
        historyFor: (ids) => syncStore.historyFor(ids),
        countPending: (v) => syncStore.countPending(v),
        createIfIdle: async (input) => {
          if (failing === undefined || input.connectionId === failing) {
            failing = input.connectionId
            throw new Error('constraint exploded')
          }
          return syncStore.createIfIdle(input)
        },
      },
      logger: { info: () => {}, warn: (m) => warnings.push(m), error: () => {} },
    }).tick()
    expect(r).toMatchObject({ due: 3, enqueued: 2 })
    expect(await jobsFor(failing!)).toHaveLength(0)
    expect(await syncStore.list({ status: 'pending' })).toHaveLength(2)
    expect(warnings.join('\n')).toContain(failing!)
    expect(warnings.join('\n')).toContain('constraint exploded')
  })

  it('logs a tick only when it enqueued something', async () => {
    for (let i = 0; i < 3; i++) await connect()
    const lines: string[] = []
    const logger = { info: (m: string) => lines.push(m), warn: () => {}, error: () => {} }
    // Two go, one waits behind them.
    await scheduler({ logger }).tick()
    expect(lines).toEqual([expect.stringMatching(/enqueued 2\b.*\b1 deferred/)])
    // The queue is still full: one deferred, nothing enqueued, nothing said.
    expect(await scheduler({ logger }).tick()).toMatchObject({ enqueued: 0, deferred: 1 })
    expect(lines).toHaveLength(1)
  })

  it('overlapping ticks share one pass', async () => {
    await connect()
    const s = scheduler()
    const [x, y] = await Promise.all([s.tick(), s.tick()])
    expect(x).toBe(y)
  })

  it('start and stop leave no timer behind', async () => {
    const s = scheduler({ intervalMs: 5_000 })
    s.start()
    await s.stop()
    expect((s as unknown as { timer: unknown }).timer).toBeNull()
  })

  it('skips due connections whose vertical the license does not include (P8), counted after the due check', async () => {
    const crm = await connect(undefined, 'crm', 'hubspot')
    const acc = await connect()
    expect(await scheduler({ verticalEntitled: (v) => v !== 'crm' }).tick()).toMatchObject({
      considered: 2,
      due: 2,
      enqueued: 1,
      skippedUnentitled: 1,
    })
    expect(await jobsFor(crm)).toHaveLength(0)
    expect(await jobsFor(acc)).toHaveLength(1)
  })

  it('a connection that is not due is not counted as skipped', async () => {
    const crm = await connect(undefined, 'crm', 'hubspot')
    await syncStore.markCompleted(
      (await syncStore.create('crm', crm, 'hubspot', null, null)).id,
      {},
    )
    expect(await scheduler({ verticalEntitled: () => false }).tick()).toMatchObject({
      due: 0,
      skippedUnentitled: 0,
    })
  })

  it('reads entitlement on every tick: a vertical the license regains is scheduled again', async () => {
    const crm = await connect(undefined, 'crm', 'hubspot')
    let entitled = false
    const s = scheduler({ verticalEntitled: () => entitled })
    expect(await s.tick()).toMatchObject({ enqueued: 0, skippedUnentitled: 1 })
    entitled = true
    expect(await s.tick()).toMatchObject({ enqueued: 1, skippedUnentitled: 0 })
    expect(await jobsFor(crm)).toHaveLength(1)
  })

  it('without verticalEntitled nothing is skipped for entitlement', async () => {
    await connect(undefined, 'crm', 'hubspot')
    expect(await scheduler().tick()).toMatchObject({ enqueued: 1, skippedUnentitled: 0 })
  })
})
