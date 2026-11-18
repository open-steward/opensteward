/**
 * Key lifecycle: rotation with a grace window, and hard expiry.
 *
 * Rotation with a grace window avoids the downtime of revoke-then-mint (a
 * window in which the old key 401s and the new one is not yet deployed):
 * during the overlap BOTH keys verify, and the old one dies on its own,
 * stamped lazily by the first verify past the deadline rather than by a
 * sweeper.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ApiKeyStore } from '../../src/auth/api-keys'

const SECRET = 'lifecycle-secret-must-be-at-least-32c!'

describe('ApiKeyStore rotation and expiry', () => {
  let handle: DbHandle
  let store: ApiKeyStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await ApiKeyStore.create(handle, SECRET)
  })
  afterEach(async () => {
    await handle?.close()
  })

  it('rotate mints a same-shape replacement and both keys verify during the overlap', async () => {
    const original = await store.mint({
      tenantId: 'acme',
      label: 'prod',
      scopes: ['customers:read', 'vertical:read'],
      mode: 'test',
    })
    const rotated = await store.rotate(original.id, { overlapMs: 60_000 })
    expect(rotated).not.toBeNull()
    expect(rotated!.tenantId).toBe('acme')
    expect(rotated!.label).toBe('prod')
    expect(rotated!.scopes).toEqual(['customers:read', 'vertical:read'])
    expect(rotated!.mode).toBe('test')
    expect(rotated!.rotatedFrom).toBe(original.id)
    expect(rotated!.plaintext).not.toBe(original.plaintext)
    expect(rotated!.oldKeyRevokeAt).toBeGreaterThan(Date.now())

    // The grace window: both keys authenticate.
    expect(await store.verify(original.plaintext)).not.toBeNull()
    expect(await store.verify(rotated!.plaintext)).not.toBeNull()
  })

  it('the old key dies at the end of the window, stamped lazily by verify', async () => {
    const original = await store.mint({ tenantId: 'acme', label: 'prod' })
    const rotated = await store.rotate(original.id, { overlapMs: 0 })
    expect(rotated).not.toBeNull()

    // overlapMs 0 → the deadline is already past on the next verify.
    expect(await store.verify(original.plaintext)).toBeNull()
    // ...and that verify stamped the actual revocation, so list agrees.
    const rows = await store.list('acme')
    const old = rows.find((r) => r.id === original.id)
    expect(old?.revokedAt).not.toBeNull()
    // The replacement is unaffected.
    expect(await store.verify(rotated!.plaintext)).not.toBeNull()
  })

  it('refuses to rotate a revoked key, and to rotate the same key twice', async () => {
    const k = await store.mint({ tenantId: 'acme' })
    expect(await store.rotate(k.id, { overlapMs: 60_000 })).not.toBeNull()
    // Second rotation inside the grace window: the replacement already exists.
    expect(await store.rotate(k.id, { overlapMs: 60_000 })).toBeNull()

    const revoked = await store.mint({ tenantId: 'acme' })
    await store.revoke(revoked.id)
    expect(await store.rotate(revoked.id)).toBeNull()

    expect(await store.rotate('no-such-id')).toBeNull()
  })

  it('the replacement does not inherit the old key expiry', async () => {
    const expiring = await store.mint({
      tenantId: 'acme',
      expiresAt: Date.now() + 60_000,
    })
    const rotated = await store.rotate(expiring.id, { overlapMs: 1000 })
    expect(rotated!.expiresAt).toBeNull()

    const withExpiry = await store.rotate(rotated!.id, {
      overlapMs: 1000,
      expiresAt: Date.now() + 120_000,
    })
    expect(withExpiry!.expiresAt).toBeGreaterThan(Date.now())
  })

  it('an expired key no longer verifies and cannot be rotated', async () => {
    const k = await store.mint({ tenantId: 'acme', expiresAt: Date.now() - 1 })
    expect(await store.verify(k.plaintext)).toBeNull()
    expect(await store.rotate(k.id)).toBeNull()
  })

  it('a future expiry leaves the key working', async () => {
    const k = await store.mint({ tenantId: 'acme', expiresAt: Date.now() + 3_600_000 })
    const row = await store.verify(k.plaintext)
    expect(row).not.toBeNull()
    expect(row!.expiresAt).toBe(k.expiresAt)
  })

  it('a plain mint (no expiry, never rotated) verifies and lists normally', async () => {
    // The lifecycle columns are nullable; a plain mint exercises the
    // no-expiry, never-rotated shape.
    const k = await store.mint({ tenantId: 'acme' })
    const row = await store.verify(k.plaintext)
    expect(row!.expiresAt).toBeNull()
    expect(row!.revokeAt).toBeNull()
    expect(row!.rotatedFrom).toBeNull()
  })
})
