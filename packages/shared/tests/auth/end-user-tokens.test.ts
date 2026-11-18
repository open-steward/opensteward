import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { EndUserTokenStore } from '../../src/auth/end-user-tokens'
import { IncompatibleMcpScopesError } from '../../src/auth/api-keys'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

// SQLite always (`:memory:` is fresh per open); Postgres when TEST_DATABASE_URL
// is set (CI service container / local docker). For Postgres each test drops the
// public schema before creating the store so the shared db stays isolated.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('EndUserTokenStore [$name]', (backend) => {
  let handle: DbHandle
  let store: EndUserTokenStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await EndUserTokenStore.create(handle, SECRET)
  })

  afterEach(async () => {
    // Stores are borrowers — close the shared handle, not the store.
    await handle?.close()
  })

  it('mint returns plaintext starting with eut_ and the default scope set', async () => {
    const s = store
    const r = await s.mint({ endUserId: 'eu_abc', tenantId: 't_acme' })
    expect(r.plaintext.startsWith('eut_')).toBe(true)
    expect(r.prefix.length).toBeGreaterThan(4)
    expect(r.scopes).toEqual(['mcp:read', 'eut:read'])
  })

  it('mint returns a complete token record (createdBy/lastUsedAt/revokedAt)', async () => {
    // The admin-api `EndUserTokenMint` schema requires every EndUserToken
    // field — `createdBy`, `lastUsedAt`, `revokedAt` are nullable but NOT
    // optional. Omitting them makes the admin-api response serializer 500
    // with "Response does not match the schema" (same class as the api-key
    // mint bug). A fresh token reports lastUsedAt/revokedAt as null.
    const s = store
    const minted = await s.mint({ endUserId: 'eu_abc', tenantId: 't_acme', label: 'Claude', createdBy: 'usr_admin' })
    expect(minted).toMatchObject({
      id: expect.any(String),
      endUserId: 'eu_abc',
      tenantId: 't_acme',
      prefix: expect.any(String),
      label: 'Claude',
      scopes: expect.any(Array),
      plaintext: expect.any(String),
      createdAt: expect.any(Number),
      createdBy: 'usr_admin',
      lastUsedAt: null,
      revokedAt: null,
    })
  })

  it('verify returns the row for a valid plaintext and updates last_used_at', async () => {
    const s = store
    const minted = await s.mint({ endUserId: 'eu_abc', tenantId: 't_acme', label: 'Claude' })
    expect((await s.list({ endUserId: 'eu_abc' }))[0].lastUsedAt).toBeNull()
    const verified = await s.verify(minted.plaintext)
    expect(verified?.endUserId).toBe('eu_abc')
    expect(verified?.tenantId).toBe('t_acme')
    expect(verified?.label).toBe('Claude')
    expect((await s.list({ endUserId: 'eu_abc' }))[0].lastUsedAt).not.toBeNull()
  })

  it('verify rejects unknown plaintext', async () => {
    const s = store
    await s.mint({ endUserId: 'eu_a', tenantId: 't' })
    expect(await s.verify('eut_a_deadbeef')).toBeNull()
    expect(await s.verify('eut_invalid')).toBeNull()
    expect(await s.verify('osk_t_abc')).toBeNull() // wrong prefix
  })

  it('revoke makes verify fail', async () => {
    const s = store
    const minted = await s.mint({ endUserId: 'eu_a', tenantId: 't' })
    const revoked = await s.revoke(minted.id)
    expect(revoked).toBe(true)
    expect(await s.verify(minted.plaintext)).toBeNull()
  })

  it('list filters by endUserId and by tenantId', async () => {
    const s = store
    await s.mint({ endUserId: 'eu_a', tenantId: 't_one' })
    await s.mint({ endUserId: 'eu_b', tenantId: 't_one' })
    await s.mint({ endUserId: 'eu_c', tenantId: 't_two' })
    expect(await s.list({ endUserId: 'eu_a' })).toHaveLength(1)
    expect(await s.list({ tenantId: 't_one' })).toHaveLength(2)
    expect(await s.list({ tenantId: 't_one', endUserId: 'eu_a' })).toHaveLength(1)
    expect(await s.list()).toHaveLength(3)
  })

  it('mint rejects mcp:read + write-granting scope', async () => {
    const s = store
    await expect(
      s.mint({
        endUserId: 'eu_a',
        tenantId: 't',
        scopes: ['mcp:read', 'vertical:write'],
      }),
    ).rejects.toThrow(IncompatibleMcpScopesError)
  })

  it('persists explicit scopes when supplied (still mcp:read-friendly)', async () => {
    const s = store
    const r = await s.mint({
      endUserId: 'eu_a',
      tenantId: 't',
      scopes: ['mcp:read', 'eut:read', 'mcp:read_pii'],
    })
    expect(r.scopes).toEqual(['mcp:read', 'eut:read', 'mcp:read_pii'])
    const verified = await s.verify(r.plaintext)
    expect(verified?.scopes).toEqual(['mcp:read', 'eut:read', 'mcp:read_pii'])
  })

})
