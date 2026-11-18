import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { CredentialStore, DuplicateExternalAccountError } from '../../src/auth/store'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

describe('CredentialStore external-account mapping', () => {
  let handle: DbHandle
  let store: CredentialStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await CredentialStore.create(handle, SECRET, { salt: 'test-salt' })
  })
  afterEach(async () => {
    await handle?.close()
  })

  it('links and resolves an external account to its connection', async () => {
    const id = await store.create('stripe', 't1', { accessToken: 'a' }, null, 'payments')
    await store.linkExternalAccount('stripe', 'acct_123', id, 'payments')

    const row = await store.findByExternalAccount('stripe', 'acct_123', 'payments')
    expect(row?.id).toBe(id)
  })

  it('returns null for an unmapped account', async () => {
    expect(await store.findByExternalAccount('stripe', 'acct_nope')).toBeNull()
  })

  it('scopes resolution by vertical when provided', async () => {
    const id = await store.create('stripe', 't1', { accessToken: 'a' }, null, 'payments')
    await store.linkExternalAccount('stripe', 'acct_123', id, 'payments')
    expect(await store.findByExternalAccount('stripe', 'acct_123', 'accounting')).toBeNull()
  })

  it('is idempotent for the same connection', async () => {
    const id = await store.create('stripe', 't1', { accessToken: 'a' }, null, 'payments')
    await store.linkExternalAccount('stripe', 'acct_123', id)
    await expect(store.linkExternalAccount('stripe', 'acct_123', id)).resolves.toBeUndefined()
  })

  it('rejects linking the same account to a different connection', async () => {
    const a = await store.create('stripe', 't1', { accessToken: 'a' }, 'a', 'payments')
    const b = await store.create('stripe', 't2', { accessToken: 'b' }, 'b', 'payments')
    await store.linkExternalAccount('stripe', 'acct_123', a)
    await expect(store.linkExternalAccount('stripe', 'acct_123', b)).rejects.toBeInstanceOf(
      DuplicateExternalAccountError,
    )
  })

  it('unlinks on connection delete so the id can be reclaimed', async () => {
    const a = await store.create('stripe', 't1', { accessToken: 'a' }, 'a', 'payments')
    await store.linkExternalAccount('stripe', 'acct_123', a)
    await store.deleteById(a)
    expect(await store.findByExternalAccount('stripe', 'acct_123')).toBeNull()

    // A new connection can now claim the same external account.
    const b = await store.create('stripe', 't2', { accessToken: 'b' }, 'b', 'payments')
    await expect(store.linkExternalAccount('stripe', 'acct_123', b)).resolves.toBeUndefined()
  })
})
