import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'

describe('ConnectSessionStore — scopePolicy', () => {
  let handle: DbHandle
  let store: ConnectSessionStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await ConnectSessionStore.create(handle)
  })
  afterEach(async () => {
    await handle?.close()
  })

  it("defaults to 'platform_default' when no scopes and no policy given", async () => {
    const s = await store.create({ tenantId: 't', label: 'l' })
    expect(s.scopePolicy).toBe('platform_default')
    expect(s.scopes).toBeNull()
    expect((await store.getById(s.id))!.scopePolicy).toBe('platform_default')
  })

  it("infers 'custom' when scopes are given without an explicit policy", async () => {
    const s = await store.create({ tenantId: 't', label: 'l', scopes: ['a.read', 'b.read'] })
    expect(s.scopePolicy).toBe('custom')
    expect(s.scopes).toEqual(['a.read', 'b.read'])
  })

  it("persists 'read_only' and drops any scope array (read scopes resolve per-platform)", async () => {
    const s = await store.create({
      tenantId: 't',
      label: 'l',
      scopePolicy: 'read_only',
      scopes: ['ignored'],
    })
    expect(s.scopePolicy).toBe('read_only')
    expect(s.scopes).toBeNull()
    expect((await store.getByToken(s.token))!.scopePolicy).toBe('read_only')
  })

  it("round-trips 'custom' with its scope array", async () => {
    const s = await store.create({
      tenantId: 't',
      label: 'l',
      scopePolicy: 'custom',
      scopes: ['x.read'],
    })
    const read = (await store.getById(s.id))!
    expect(read.scopePolicy).toBe('custom')
    expect(read.scopes).toEqual(['x.read'])
  })

  // A NULL scope_policy hydrates by presence of scopes: scopes present →
  // custom, else platform_default.
  it('maps a NULL scope_policy by presence of scopes', async () => {
    const base = {
      tenant_id: 't',
      label: 'legacy',
      allowed_verticals: '[]',
      allowed_platforms: '[]',
      expires_at: Date.now() + 60_000,
      created_at: Date.now(),
      one_time_only: 0,
      allow_self_register: 0,
      scope_policy: null,
    }
    await handle.kysely
      .insertInto('connect_sessions')
      .values({ ...base, id: 'legacy-1', token: 'tok-legacy-1', scopes: JSON.stringify(['a.read']) })
      .execute()
    await handle.kysely
      .insertInto('connect_sessions')
      .values({ ...base, id: 'legacy-2', token: 'tok-legacy-2', scopes: null })
      .execute()

    expect((await store.getById('legacy-1'))!.scopePolicy).toBe('custom')
    expect((await store.getById('legacy-2'))!.scopePolicy).toBe('platform_default')
  })
})
