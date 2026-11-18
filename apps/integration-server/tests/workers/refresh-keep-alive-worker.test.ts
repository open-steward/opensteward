import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { CredentialStore, UnifiedAdapterRegistry, openDb, withRefreshLock } from '@opensteward/shared'
import type { BaseAdapter, Credentials, DbHandle } from '@opensteward/shared'
import { RefreshKeepAliveWorker } from '../../src/workers/refresh-keep-alive-worker'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

interface StubBehaviour {
  onRefresh: (creds: Credentials) => Promise<Credentials> | Credentials
}

function stubAdapter(behaviour: StubBehaviour): BaseAdapter {
  return {
    refreshCredentials: async (creds: Credentials) => behaviour.onRefresh(creds),
  } as unknown as BaseAdapter
}

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} }
}

/** Logger that keeps every line so a test can assert the cause was recorded. */
function capturingLogger() {
  const lines: string[] = []
  const push = (msg: string, ...args: unknown[]) => {
    lines.push([msg, ...args.map((a) => (a instanceof Error ? a.message : String(a)))].join(' '))
  }
  return { lines, info: push, warn: push, error: push }
}

describe('RefreshKeepAliveWorker', () => {
  let dir: string
  let handle: DbHandle
  let store: CredentialStore

  afterEach(async () => {
    // CredentialStore is a borrower — close the shared handle, never the store.
    await handle?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function open() {
    dir = mkdtempSync(join(tmpdir(), 'refresh-worker-test-'))
    handle = await openDb({ sqlitePath: join(dir, 'creds.db') })
    store = await CredentialStore.create(handle, SECRET, { salt: 'test-salt' })
    return store
  }

  function makeRegistry(slug: string, adapter: BaseAdapter): UnifiedAdapterRegistry {
    const registry = new UnifiedAdapterRegistry()
    registry.register('accounting', {
      get: (s: string) => (s === slug ? adapter : undefined),
      has: (s: string) => s === slug,
      knownSlugs: () => [slug],
      list: () => [adapter],
      enable: () => adapter,
      disable: () => false,
      setConfig: () => undefined,
      hydrate: () => undefined,
    } as unknown as Parameters<UnifiedAdapterRegistry['register']>[1])
    return registry
  }

  it('marks rows ok when refresh succeeds', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: () => ({ accessToken: 'new', refreshToken: 'r2' }),
      }),
    )
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.ok).toBe(1)
    const row = (await s.getRow(id))!
    expect(row.lastRefreshStatus).toBe('ok')
    expect(row.lastRefreshAt).not.toBeNull()
    const fresh = (await s.loadById(id))!
    expect(fresh.accessToken).toBe('new')
    expect(fresh.refreshToken).toBe('r2')
  })

  it('marks rows expired and fires onAuthorizationExpired on invalid_grant', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: () => {
          throw { response: { data: { error: 'invalid_grant' }, status: 400 } }
        },
      }),
    )
    const expiredEvents: string[] = []
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      onAuthorizationExpired: (row) => {
        expiredEvents.push(row.id)
      },
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.expired).toBe(1)
    expect((await s.getRow(id))!.lastRefreshStatus).toBe('expired')
    expect(expiredEvents).toEqual([id])
  })

  it('marks rows platform_error and fires onPlatformCredentialsInvalid on invalid_client', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: () => {
          throw { response: { data: { error: 'invalid_client' }, status: 401 } }
        },
      }),
    )
    const expiredEvents: string[] = []
    const platformEvents: string[] = []
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      onAuthorizationExpired: (row) => {
        expiredEvents.push(row.id)
      },
      onPlatformCredentialsInvalid: (row) => {
        platformEvents.push(row.id)
      },
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.platformError).toBe(1)
    expect(stats.expired).toBe(0)
    expect((await s.getRow(id))!.lastRefreshStatus).toBe('platform_error')
    expect(platformEvents).toEqual([id])
    expect(expiredEvents).toEqual([]) // must NOT be treated as a customer-reauth case
  })

  it('marks rows failed (transient) on network errors and does NOT fire the hook', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: () => {
          throw new Error('ECONNRESET')
        },
      }),
    )
    const expiredEvents: string[] = []
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      onAuthorizationExpired: (row) => {
        expiredEvents.push(row.id)
      },
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.failed).toBe(1)
    expect((await s.getRow(id))!.lastRefreshStatus).toBe('failed')
    expect(expiredEvents).toEqual([])
  })

  it('skips rows with no refresh token', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'only' }, null, 'accounting') // no refresh token
    const registry = makeRegistry(
      'xero',
      stubAdapter({ onRefresh: () => ({ accessToken: 'new' }) }),
    )
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.skipped).toBe(1)
    expect((await s.getRow(id))!.lastRefreshStatus).toBeNull()
  })

  it('skips rows whose adapter is not registered', async () => {
    const s = await open()
    await s.create('unregistered', null, { accessToken: 'a', refreshToken: 'r' }, null, 'accounting')
    const registry = new UnifiedAdapterRegistry()
    registry.register('accounting', {
      get: () => undefined,
      has: () => false,
      knownSlugs: () => [],
      list: () => [],
      enable: () => undefined,
      disable: () => false,
      setConfig: () => undefined,
      hydrate: () => undefined,
    } as unknown as Parameters<UnifiedAdapterRegistry['register']>[1])
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.skipped).toBe(1)
  })

  it('respects skipWindowMs — recently refreshed rows are skipped', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'a', refreshToken: 'r' }, null, 'accounting')
    await s.updateRefreshStatus(id, 'ok', Date.now() - 1_000) // 1 sec ago
    const registry = makeRegistry(
      'xero',
      stubAdapter({ onRefresh: () => ({ accessToken: 'new', refreshToken: 'r2' }) }),
    )
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      skipWindowMs: 60 * 60 * 1000, // 1h
      perConnectionDelayMs: 0,
      logger: silentLogger(),
    })
    const stats = await worker.tick()
    expect(stats.ok).toBe(0)
    expect(stats.skipped).toBe(0) // never selected, so not even counted as skipped
  })

  // The refresh path can throw *outside* the rotation guard's own error
  // mapping — most plausibly when the status write itself fails (SQLITE_BUSY,
  // a read-only volume, a dead Postgres). If tick swallowed such an error and
  // fell back to re-reading `last_refresh_status`, a connection that was
  // healthy last tick would still read 'ok' — this pins that the failure is
  // counted and its cause logged.
  it('does not report ok when the refresh path throws and the stored status is stale', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    // Previous tick succeeded, so the stale row status is 'ok'. 25h ago clears
    // both the skip window and the keep-warm cadence, so it is picked again.
    await s.updateRefreshStatus(id, 'ok', Date.now() - 25 * 60 * 60 * 1000)

    // Reads work, writes don't — the shape of a locked/read-only SQLite file.
    const failingStore = new Proxy(s, {
      get(target, prop, receiver) {
        if (prop === 'updateRefreshStatus') {
          return async () => {
            throw new Error('SQLITE_BUSY: database is locked')
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    }) as CredentialStore

    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: () => {
          throw new Error('ECONNRESET')
        },
      }),
    )
    const log = capturingLogger()
    const worker = new RefreshKeepAliveWorker({
      store: failingStore,
      registry,
      perConnectionDelayMs: 0,
      logger: log,
    })

    const stats = await worker.tick()
    // The refresh failed. Inheriting the previous tick's 'ok' is the bug.
    expect(stats.ok).toBe(0)
    expect(stats.failed).toBe(1)
    // ...and the cause has to be on record, not just the count.
    expect(log.lines.join('\n')).toContain('SQLITE_BUSY')
  })

  // The other half of that catch: a caller that only *waited* on someone
  // else's in-flight refresh. Its throw is the holder's story, and the holder
  // already persisted the outcome — so the waiter must still re-read it, not
  // report a failure of its own.
  it('a waiter on an in-flight refresh reports the holder-persisted outcome', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: async () => {
          // Slow enough that the second caller lands as a waiter, not a holder.
          await new Promise((r) => setTimeout(r, 20))
          throw { response: { data: { error: 'invalid_grant' }, status: 400 } }
        },
      }),
    )
    const log = capturingLogger()
    const mkWorker = () =>
      new RefreshKeepAliveWorker({ store: s, registry, perConnectionDelayMs: 0, logger: log })
    const row = (await s.getRow(id))!

    const [a, b] = await Promise.all([
      mkWorker().attemptRefresh(row),
      mkWorker().attemptRefresh(row),
    ])

    expect(a).toBe('expired')
    expect(b).toBe('expired') // the waiter re-read, it did not invent 'failed'
    expect(log.lines.join('\n')).not.toContain('refresh threw')
  })

  // The other half of the waiter path: releasing the lock is not the same as
  // recording an outcome. Under the Redis backend a waiter also stops waiting
  // when the holder's lock TTL expires (dead pod) — nothing was persisted, so
  // re-reading the row hands back whatever the last healthy tick left, which
  // for a working connection is 'ok'. Modelled here with the in-process lock
  // held by a holder that persists nothing.
  it('does not inherit a stale ok when the holder released without recording an outcome', async () => {
    const s = await open()
    const id = await s.create('xero', null, { accessToken: 'old', refreshToken: 'r' }, null, 'accounting')
    // Last tick was healthy, so the row reads 'ok' until someone overwrites it.
    await s.updateRefreshStatus(id, 'ok', Date.now() - 25 * 60 * 60 * 1000)
    const row = (await s.getRow(id))!

    let refreshes = 0
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: () => {
          refreshes++
          return { accessToken: 'new', refreshToken: 'r2' }
        },
      }),
    )
    const log = capturingLogger()
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      logger: log,
    })

    // Someone else owns the lock and writes nothing before releasing.
    const holder = withRefreshLock(id, () => new Promise<void>((r) => setTimeout(r, 30)))
    const outcome = await worker.attemptRefresh(row)
    await holder

    expect(refreshes).toBe(0) // we really were a waiter, not the acquirer
    expect(outcome).toBe('failed')
    expect(log.lines.join('\n')).toContain('recorded no outcome')
    // The store is untouched, so the next tick still sees this row as a candidate.
    expect((await s.getRow(id))!.lastRefreshStatus).toBe('ok')
  })

  it('does not double-run within the same tick (idempotency on overlap)', async () => {
    const s = await open()
    await s.create('xero', null, { accessToken: 'a', refreshToken: 'r' }, null, 'accounting')
    let calls = 0
    const registry = makeRegistry(
      'xero',
      stubAdapter({
        onRefresh: async () => {
          calls++
          await new Promise((r) => setTimeout(r, 5))
          return { accessToken: 'new', refreshToken: 'r2' }
        },
      }),
    )
    const worker = new RefreshKeepAliveWorker({
      store: s,
      registry,
      perConnectionDelayMs: 0,
      logger: silentLogger(),
    })
    await Promise.all([worker.tick(), worker.tick()])
    expect(calls).toBe(1)
  })
})
