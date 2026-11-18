import { describe, expect, it } from 'vitest'
import { EntitlementService, type LicenseStatus } from '@opensteward/shared/licensing'
import { ConnectionLicenseGuard } from '../../src/licensing/connection-guard'

function licensed(connections: number, features = ['mcp', 'vertical:crm']): LicenseStatus {
  return {
    source: 'env',
    clockRollbackDetected: false,
    revocationList: 'missing',
    evaluatedAt: '2026-10-09T12:00:00.000Z',
    state: 'VALID',
    features,
    limits: { connections, tenants: 1 },
    entitlementSource: 'license',
  }
}
function fakeStore(ids: string[], fail = false) {
  const calls = { count: 0, list: 0 }
  const store = {
    count: async () => {
      calls.count++
      if (fail) throw new Error('db down')
      return ids.length
    },
    listIdsInCreationOrder: async (limit?: number) => {
      calls.list++
      return ids.slice(0, limit)
    },
  }
  return { calls, ids, store }
}
const source = (s: LicenseStatus) => ({ entitlements: () => new EntitlementService(s) })

describe('ConnectionLicenseGuard', () => {
  it('assertCanCreate: under the limit passes; at it, the one LICENSE_LIMIT_EXCEEDED shape', async () => {
    const f = fakeStore(['a'])
    const g = new ConnectionLicenseGuard({ store: f.store, license: source(licensed(2)) })
    await expect(g.assertCanCreate('crm')).resolves.toBeUndefined()
    f.ids.push('b')
    await expect(g.assertCanCreate('crm')).rejects.toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      details: { limitKey: 'connections', limit: 2, used: 2 },
    })
  })
  it('assertCanCreate: an unentitled vertical is refused first; no vertical skips that check', async () => {
    const f = fakeStore([])
    const g = new ConnectionLicenseGuard({ store: f.store, license: source(licensed(5)) })
    await expect(g.assertCanCreate('accounting')).rejects.toMatchObject({
      code: 'LICENSE_FEATURE_NOT_ENTITLED',
    })
    expect(f.calls.count).toBe(0)
    await expect(g.assertCanCreate(null)).resolves.toBeUndefined()
  })
  it('writeRefusal: under the limit, never lists ids', async () => {
    const f = fakeStore(['a'])
    const g = new ConnectionLicenseGuard({ store: f.store, license: source(licensed(1)) })
    expect(await g.writeRefusal('a')).toBeNull()
    expect(f.calls.list).toBe(0)
  })
  it('writeRefusal: over the limit, the oldest N write and the rest are refused (P6)', async () => {
    const f = fakeStore(['a', 'b', 'c'])
    const g = new ConnectionLicenseGuard({ store: f.store, license: source(licensed(1)) })
    expect(await g.writeRefusal('a')).toBeNull()
    expect((await g.writeRefusal('c'))?.toBody().error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      connectionId: 'c',
      limit: 1,
      used: 3,
    })
  })
  it('names who set the limit: the license, or community mode where there is none (review m29)', async () => {
    const community: LicenseStatus = {
      ...licensed(1),
      state: 'MISSING',
      source: 'none',
      entitlementSource: 'community',
    }
    const f = fakeStore(['a', 'b'])
    const g = new ConnectionLicenseGuard({ store: f.store, license: source(community) })
    await expect(g.assertCanCreate('crm')).rejects.toMatchObject({
      message: expect.stringMatching(
        /^This deployment runs in community mode, which allows 1 connection, and 2 exist\. /,
      ),
    })
    expect((await g.writeRefusal('b'))?.message).toMatch(
      /this deployment has 2 connections and community mode allows 1\./,
    )
    const lic = new ConnectionLicenseGuard({ store: f.store, license: source(licensed(1)) })
    await expect(lic.assertCanCreate('crm')).rejects.toMatchObject({
      message: expect.stringMatching(
        /^This deployment's license allows 1 connection and 2 exist\. /,
      ),
    })
    expect((await lic.writeRefusal('b'))?.message).toMatch(/and its license allows 1\./)
  })
  it('an allow is served from the cache within the TTL', async () => {
    const f = fakeStore(['a', 'b'])
    const g = new ConnectionLicenseGuard({
      store: f.store,
      license: source(licensed(1)),
      now: () => 0,
    })
    await g.writeRefusal('a')
    await g.writeRefusal('a')
    expect(f.calls.count).toBe(1)
  })
  it('a refusal is never sent on cached data: it is re-checked fresh (Review Focus #4)', async () => {
    const f = fakeStore(['a', 'b'])
    let now = 0
    const g = new ConnectionLicenseGuard({
      store: f.store,
      license: source(licensed(1)),
      now: () => now,
    })
    expect(await g.writeRefusal('b')).not.toBeNull() // cache: only 'a' may write
    f.ids.splice(0, 1) // 'a' deleted on another replica: no invalidate() here
    now = 1_000 // well inside the 30 s TTL
    expect(await g.writeRefusal('b')).toBeNull()
  })
  it('never throws: a failing store lets the write through (it fails on its own)', async () => {
    const g = new ConnectionLicenseGuard({
      store: fakeStore(['a', 'b'], true).store,
      license: source(licensed(1)),
    })
    expect(await g.writeRefusal('b')).toBeNull()
  })
  it('invalidate() drops the cache', async () => {
    const f = fakeStore(['a', 'b'])
    const g = new ConnectionLicenseGuard({
      store: f.store,
      license: source(licensed(1)),
      now: () => 0,
    })
    await g.writeRefusal('a')
    g.invalidate()
    await g.writeRefusal('a')
    expect(f.calls.count).toBe(2)
  })
})
