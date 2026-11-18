import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import {
  CredentialStore,
  type ConnectionCreateIntent,
  type Credentials,
} from '../../src/auth/store'

// SQLite always; Postgres when TEST_DATABASE_URL is set (`pnpm test:pg`).
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}
const SECRET = 'store-license-guard-secret-at-least-32-chars'
const creds = (): Credentials => ({ accessToken: 'tok' })

describe.each(BACKENDS)('CredentialStore license hooks [$name]', (backend) => {
  let handle: DbHandle
  let store: CredentialStore
  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres')
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    store = await CredentialStore.create(handle, SECRET)
  })
  afterEach(async () => {
    vi.useRealTimers()
    await handle.close()
  })

  it('count() counts every row, whatever its owner or tenant', async () => {
    await store.create('hubspot', null, creds(), 'a', 'crm', 'tenant-a')
    await store.create('hubspot', 't-2', creds(), 'b', 'crm', null)
    await store.create('fortnox', null, creds(), 'c', 'accounting')
    expect(await store.count()).toBe(3)
  })

  it('count() is 0 on an empty store', async () => {
    expect(await store.count()).toBe(0)
  })

  it('listIdsInCreationOrder orders by created_at, then id, and honours a limit (review #18)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000)
    // Ids are random, so keep adding tied rows until insertion order is NOT id
    // order. Otherwise a store that dropped the id tie-break (and returned ties
    // in insertion order) would pass by luck about half the time.
    const inserted: string[] = []
    const inIdOrder = (ids: string[]) => ids.every((id, i) => i === 0 || ids[i - 1]! < id)
    while (inserted.length < 6 || (inIdOrder(inserted) && inserted.length < 40)) {
      inserted.push(await store.create('x', null, creds(), `t${inserted.length}`, 'crm'))
    }
    vi.setSystemTime(2_000)
    const c = await store.create('x', null, creds(), 'c', 'crm')
    vi.useRealTimers()
    expect(inIdOrder(inserted)).toBe(false)
    const tie = [...inserted].sort()
    expect(await store.listIdsInCreationOrder()).toEqual([...tie, c])
    expect(await store.listIdsInCreationOrder(1)).toEqual([tie[0]])
    expect(await store.listIdsInCreationOrder(3)).toEqual(tie.slice(0, 3))
  })

  it('listIdsInCreationOrder puts an older row first even when it was created second (not insertion order)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(5_000)
    const later = await store.create('x', null, creds(), 'later', 'crm')
    vi.setSystemTime(1_000)
    const earlier = await store.create('x', null, creds(), 'earlier', 'crm')
    vi.useRealTimers()
    expect(await store.listIdsInCreationOrder()).toEqual([earlier, later])
  })

  it('the guard runs before the insert, and a throw aborts it: no row, no onCreate', async () => {
    const listener = vi.fn()
    store.onCreate(listener)
    store.setCreateGuard(() => {
      throw new Error('refused')
    })
    await expect(store.create('hubspot', null, creds(), 'x', 'crm')).rejects.toThrow('refused')
    expect(await store.count()).toBe(0)
    expect(listener).not.toHaveBeenCalled()
  })

  it('an async guard is awaited', async () => {
    store.setCreateGuard(async () => Promise.reject(new Error('later')))
    await expect(store.create('hubspot', null, creds(), 'x', 'crm')).rejects.toThrow('later')
    expect(await store.count()).toBe(0)
  })

  it('the guard sees the intent: platform, vertical, tenant and owner', async () => {
    const seen: ConnectionCreateIntent[] = []
    store.setCreateGuard((intent) => {
      seen.push(intent)
    })
    await store.create('hubspot', 'tenant-t', creds(), 'x', 'crm', 'owner-o')
    await store.create('fortnox', null, creds(), 'y')
    expect(seen).toEqual([
      { platform: 'hubspot', vertical: 'crm', tenantId: 'tenant-t', ownerTenantId: 'owner-o' },
      { platform: 'fortnox', vertical: null, tenantId: null, ownerTenantId: null },
    ])
  })

  it('createWithUniqueLabel stops at a refusal instead of suffixing', async () => {
    await store.create('hubspot', null, creds(), 'taken', 'crm')
    let calls = 0
    store.setCreateGuard(() => {
      calls++
      throw new Error('refused')
    })
    await expect(
      store.createWithUniqueLabel('hubspot', null, creds(), 'taken', 'crm'),
    ).rejects.toThrow('refused')
    expect(calls).toBe(1)
    expect(await store.count()).toBe(1)
  })

  it('setCreateGuard(null) removes it', async () => {
    store.setCreateGuard(() => {
      throw new Error('refused')
    })
    store.setCreateGuard(null)
    await expect(store.create('hubspot', null, creds(), 'x', 'crm')).resolves.toBeTypeOf('string')
  })
})
