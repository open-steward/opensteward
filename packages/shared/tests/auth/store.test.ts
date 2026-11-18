import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { CredentialStore, DuplicateLabelError } from '../../src/auth/store'
import type { Credentials } from '../../src/auth/store'

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

const SECRET = 'test-secret-must-be-at-least-32-chars!'

function creds(overrides?: Partial<Credentials>): Credentials {
  return { accessToken: 'tok_123', ...overrides }
}

describe.each(BACKENDS)('CredentialStore (tenantMode: optional) [$name]', (backend) => {
  let handle: DbHandle
  let store: CredentialStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await CredentialStore.create(handle, SECRET, { salt: 'test-salt' })
  })

  afterEach(async () => {
    await handle.close()
  })

  it('creates and loads a credential', async () => {
    const s = store
    const id = await s.create('xero', null, creds())
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const loaded = await s.loadById(id)
    expect(loaded).not.toBeNull()
    expect(loaded!.accessToken).toBe('tok_123')
  })

  it('returns null for unknown id', async () => {
    const s = store
    expect(await s.loadById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })

  it('lists all connections', async () => {
    const s = store
    await s.create('xero', null, creds())
    await s.create('qbo', 't1', creds())
    const rows = await s.list()
    expect(rows).toHaveLength(2)
  })

  it('updates credentials by id', async () => {
    const s = store
    const id = await s.create('xero', null, creds())
    await s.updateById(id, creds({ accessToken: 'tok_new' }))
    expect((await s.loadById(id))!.accessToken).toBe('tok_new')
  })

  it('deletes by id', async () => {
    const s = store
    const id = await s.create('xero', null, creds())
    expect(await s.deleteById(id)).toBe(true)
    expect(await s.loadById(id)).toBeNull()
    expect(await s.deleteById(id)).toBe(false)
  })

  it('updates metadata (label + tenantId)', async () => {
    const s = store
    const id = await s.create('xero', null, creds())
    const row = await s.updateMetadata(id, { label: 'Production', tenantId: 'org-1' })
    expect(row.label).toBe('Production')
    expect(row.tenantId).toBe('org-1')
  })

  it('finds by platform and tenant', async () => {
    const s = store
    await s.create('xero', 't1', creds())
    await s.create('xero', 't2', creds())
    await s.create('qbo', 't1', creds())
    expect(await s.findByPlatformTenant('xero')).toHaveLength(2)
    expect(await s.findByPlatformTenant('xero', 't1')).toHaveLength(1)
    expect(await s.findByPlatformTenant('xero', 't2')).toHaveLength(1)
  })

  it('preserves expiresAt as Date', async () => {
    const s = store
    const exp = new Date('2030-01-01T00:00:00Z')
    const id = await s.create('xero', null, creds({ expiresAt: exp }))
    const loaded = (await s.loadById(id))!
    expect(loaded.expiresAt).toBeInstanceOf(Date)
    expect(loaded.expiresAt!.getTime()).toBe(exp.getTime())
  })

  it('getRow returns row without decrypting', async () => {
    const s = store
    const id = await s.create('xero', 't1', creds(), 'My Label')
    const row = await s.getRow(id)
    expect(row).not.toBeNull()
    expect(row!.platform).toBe('xero')
    expect(row!.tenantId).toBe('t1')
    expect(row!.label).toBe('My Label')
  })
})

describe.each(BACKENDS)('CredentialStore (tenantMode: required) [$name]', (backend) => {
  let handle: DbHandle
  let store: CredentialStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await CredentialStore.create(handle, SECRET, {
      salt: 'test-salt',
      tenantMode: 'required',
      tableName: 'connections',
      dataColumn: 'encrypted',
    })
  })

  afterEach(async () => {
    await handle.close()
  })

  it('rejects null tenantId', async () => {
    const s = store
    await expect(s.create('ups', null, creds())).rejects.toThrow('tenantId is required')
  })

  it('creates and retrieves by tenant', async () => {
    const s = store
    const id = await s.create('ups', 'tenant-a', creds())
    const loaded = await s.getByTenant('tenant-a', id)
    expect(loaded).not.toBeNull()
    expect(loaded!.accessToken).toBe('tok_123')
    // Different tenant cannot access
    expect(await s.getByTenant('tenant-b', id)).toBeNull()
  })

  it('updates by tenant', async () => {
    const s = store
    const id = await s.create('ups', 'tenant-a', creds())
    await s.updateByTenant('tenant-a', id, creds({ accessToken: 'refreshed' }))
    expect((await s.getByTenant('tenant-a', id))!.accessToken).toBe('refreshed')
  })

  it('deletes by tenant', async () => {
    const s = store
    const id = await s.create('ups', 'tenant-a', creds())
    // Wrong tenant → no-op
    expect(await s.deleteByTenant('tenant-b', id)).toBe(false)
    expect(await s.deleteByTenant('tenant-a', id)).toBe(true)
    expect(await s.getByTenant('tenant-a', id)).toBeNull()
  })

  it('lists by tenant', async () => {
    const s = store
    await s.create('ups', 'tenant-a', creds())
    await s.create('fedex', 'tenant-a', creds())
    await s.create('ups', 'tenant-b', creds())
    expect(await s.listByTenant('tenant-a')).toHaveLength(2)
    expect(await s.listByTenant('tenant-b')).toHaveLength(1)
  })

  it('getRowByTenant returns row scoped to tenant', async () => {
    const s = store
    const id = await s.create('ups', 'tenant-a', creds(), 'Primary')
    expect(await s.getRowByTenant('tenant-a', id)).not.toBeNull()
    expect((await s.getRowByTenant('tenant-a', id))!.label).toBe('Primary')
    expect(await s.getRowByTenant('tenant-b', id)).toBeNull()
  })

  it('findByTenantAndPlatform filters correctly', async () => {
    const s = store
    await s.create('ups', 'tenant-a', creds())
    await s.create('fedex', 'tenant-a', creds())
    await s.create('ups', 'tenant-b', creds())
    expect(await s.findByTenantAndPlatform('tenant-a', 'ups')).toHaveLength(1)
    expect(await s.findByTenantAndPlatform('tenant-a', 'fedex')).toHaveLength(1)
    expect(await s.findByTenantAndPlatform('tenant-b', 'ups')).toHaveLength(1)
  })

  it('rename updates label and throws DuplicateLabelError', async () => {
    const s = store
    const id1 = await s.create('ups', 'tenant-a', creds(), 'Primary')
    await s.create('ups', 'tenant-a', creds(), 'Secondary')
    expect(await s.rename('tenant-a', id1, 'Renamed')).toBe(true)
    expect((await s.getRowByTenant('tenant-a', id1))!.label).toBe('Renamed')
    // Rename to existing label → DuplicateLabelError
    await expect(s.rename('tenant-a', id1, 'Secondary')).rejects.toThrow(DuplicateLabelError)
  })

  /**
   * `updateMetadata` is the admin-secret path — `PATCH /admin/connections/{id}`,
   * and now the admin UI's rename box. It reached the same unique index as
   * `rename` above but did not translate the violation, so the router's
   * documented 409 branch could never fire and a collision surfaced as a 500
   * carrying a raw driver message.
   */
  it('updateMetadata throws DuplicateLabelError rather than the driver error', async () => {
    const s = store
    const id1 = await s.create('ups', 'tenant-a', creds(), 'Primary')
    await s.create('ups', 'tenant-a', creds(), 'Secondary')
    await expect(s.updateMetadata(id1, { label: 'Secondary' })).rejects.toThrow(DuplicateLabelError)
  })

  it('updateMetadata still clears a label, which collides with nothing', async () => {
    const s = store
    const id = await s.create('ups', 'tenant-a', creds(), 'Primary')
    await s.create('ups', 'tenant-a', creds(), 'Secondary')
    expect((await s.updateMetadata(id, { label: null })).label).toBeNull()
  })

  /**
   * A Connect Link's label becomes the connection's label, and a collision
   * used to surface at the very end of the OAuth dance — after the customer
   * had logged in and consented. Refusing there threw a completed grant away
   * over a naming detail.
   */
  describe('createWithUniqueLabel', () => {
    it('uses the requested label when it is free', async () => {
      const s = store
      const r = await s.createWithUniqueLabel('ups', 'tenant-a', creds(), 'Primary')
      expect(r.label).toBe('Primary')
      expect((await s.getRowByTenant('tenant-a', r.id))!.label).toBe('Primary')
    })

    it('suffixes rather than failing when the label is taken', async () => {
      const s = store
      await s.create('ups', 'tenant-a', creds(), 'Primary')
      const r = await s.createWithUniqueLabel('ups', 'tenant-a', creds(), 'Primary')
      expect(r.label).toBe('Primary (2)')
    })

    it('creates the connection — the grant is what must not be lost', async () => {
      const s = store
      await s.create('ups', 'tenant-a', creds(), 'Primary')
      const r = await s.createWithUniqueLabel('ups', 'tenant-a', creds(), 'Primary')
      expect(await s.loadById(r.id)).not.toBeNull()
    })

    it('keeps counting past the first suffix', async () => {
      const s = store
      await s.create('ups', 'tenant-a', creds(), 'Primary')
      await s.createWithUniqueLabel('ups', 'tenant-a', creds(), 'Primary')
      const third = await s.createWithUniqueLabel('ups', 'tenant-a', creds(), 'Primary')
      expect(third.label).toBe('Primary (3)')
    })

    it('does not suffix across platforms, where the label does not collide', async () => {
      const s = store
      await s.create('ups', 'tenant-a', creds(), 'Primary')
      const r = await s.createWithUniqueLabel('fedex', 'tenant-a', creds(), 'Primary')
      expect(r.label).toBe('Primary')
    })

    it('does not suffix across tenants, for the same reason', async () => {
      const s = store
      await s.create('ups', 'tenant-a', creds(), 'Primary')
      const r = await s.createWithUniqueLabel('ups', 'tenant-b', creds(), 'Primary')
      expect(r.label).toBe('Primary')
    })

    it('accepts a null label, which cannot collide', async () => {
      const s = store
      const r = await s.createWithUniqueLabel('ups', 'tenant-a', creds(), null)
      expect(r.label).toBeNull()
      expect(await s.loadById(r.id)).not.toBeNull()
    })
  })

  it('rename returns false for unknown connection', async () => {
    const s = store
    expect(await s.rename('tenant-a', '00000000-0000-0000-0000-000000000000', 'X')).toBe(false)
  })

  it('create throws DuplicateLabelError on duplicate labels', async () => {
    const s = store
    await s.create('ups', 'tenant-a', creds(), 'Primary')
    await expect(s.create('ups', 'tenant-a', creds(), 'Primary')).rejects.toThrow(DuplicateLabelError)
  })

  it('allows same label for different tenants', async () => {
    const s = store
    await s.create('ups', 'tenant-a', creds(), 'Primary')
    await expect(s.create('ups', 'tenant-b', creds(), 'Primary')).resolves.not.toThrow()
  })
})

// ── Refresh status & keep-alive worker support ─────────────────────────────
// Operates in `tenantMode: 'optional'` — same defaults as the unified service.
describe.each(BACKENDS)('CredentialStore — refresh status [$name]', (backend) => {
  let handle: DbHandle
  let store: CredentialStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await CredentialStore.create(handle, SECRET, { salt: 'test-salt' })
  })

  afterEach(async () => {
    await handle.close()
  })

  it('initializes lastRefreshAt and lastRefreshStatus as null', async () => {
    const s = store
    const id = await s.create('xero', null, creds(), null, 'accounting')
    const row = (await s.getRow(id))!
    expect(row.lastRefreshAt).toBeNull()
    expect(row.lastRefreshStatus).toBeNull()
  })

  it('updateRefreshStatus persists outcome and timestamp', async () => {
    const s = store
    const id = await s.create('xero', null, creds(), null, 'accounting')
    await s.updateRefreshStatus(id, 'ok', 1_700_000_000_000)
    const row = (await s.getRow(id))!
    expect(row.lastRefreshStatus).toBe('ok')
    expect(row.lastRefreshAt).toBe(1_700_000_000_000)
  })

  it('updateRefreshStatus does not modify the encrypted credential blob', async () => {
    const s = store
    const id = await s.create('xero', null, creds({ accessToken: 'tok_orig', refreshToken: 'r_orig' }), null, 'accounting')
    await s.updateRefreshStatus(id, 'expired')
    const loaded = (await s.loadById(id))!
    expect(loaded.accessToken).toBe('tok_orig')
    expect(loaded.refreshToken).toBe('r_orig')
  })

  it('listRefreshCandidates returns only rows outside the skip window', async () => {
    const s = store
    const fresh = await s.create('xero', null, creds(), 'fresh', 'accounting')
    const stale = await s.create('xero', null, creds(), 'stale', 'accounting')
    const now = Date.now()
    await s.updateRefreshStatus(fresh, 'ok', now - 1_000)              // 1 sec ago
    await s.updateRefreshStatus(stale, 'ok', now - 25 * 60 * 60 * 1000) // 25 hours ago

    const out = await s.listRefreshCandidates({
      skipWindowMs: 20 * 60 * 60 * 1000,
      deadRetryMs: 7 * 24 * 60 * 60 * 1000,
      limit: 10,
    })
    const ids = out.map((r) => r.id)
    expect(ids).toContain(stale)
    expect(ids).not.toContain(fresh)
  })

  it('listRefreshCandidates includes never-refreshed rows', async () => {
    const s = store
    const id = await s.create('xero', null, creds(), 'unfresh', 'accounting')
    const out = await s.listRefreshCandidates({
      skipWindowMs: 20 * 60 * 60 * 1000,
      deadRetryMs: 7 * 24 * 60 * 60 * 1000,
      limit: 10,
    })
    expect(out.map((r) => r.id)).toContain(id)
  })

  it('listRefreshCandidates re-includes expired rows after deadRetryMs', async () => {
    const s = store
    const recent = await s.create('xero', null, creds(), 'recent-dead', 'accounting')
    const old = await s.create('xero', null, creds(), 'old-dead', 'accounting')
    const now = Date.now()
    await s.updateRefreshStatus(recent, 'expired', now - 24 * 60 * 60 * 1000) // 1 day ago
    await s.updateRefreshStatus(old, 'expired', now - 8 * 24 * 60 * 60 * 1000) // 8 days ago

    const out = await s.listRefreshCandidates({
      skipWindowMs: 20 * 60 * 60 * 1000,
      deadRetryMs: 7 * 24 * 60 * 60 * 1000,
      limit: 10,
    })
    const ids = out.map((r) => r.id)
    expect(ids).toContain(old)        // 8d > deadRetryMs → eligible again
    expect(ids).not.toContain(recent) // 1d < deadRetryMs → still skipped
  })

  it('listRefreshCandidates skips rows missing a vertical', async () => {
    const s = store
    const id = await s.create('xero', null, creds(), 'no-vertical') // vertical undefined
    const out = await s.listRefreshCandidates({
      skipWindowMs: 0,
      deadRetryMs: 0,
      limit: 10,
    })
    expect(out.map((r) => r.id)).not.toContain(id)
  })
})

// ── Persistence across reopen (SQLite-file only) ───────────────────────────
// This test reopens the store from a fresh handle on the SAME on-disk path to
// verify migrations are idempotent and data survives. Postgres has no
// file-reopen equivalent here, so it stays SQLite-file-only.
describe('CredentialStore — migration idempotency (sqlite file)', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('migration adds last_refresh_* columns idempotently across opens', async () => {
    dir = mkdtempSync(join(tmpdir(), 'shared-store-test-'))
    const dbPath = join(dir, 'idem.db')

    const h1 = await openDb({ sqlitePath: dbPath })
    const s1 = await CredentialStore.create(h1, SECRET, { salt: 'test-salt' })
    const id = await s1.create('xero', null, creds(), 'a', 'accounting')
    await s1.updateRefreshStatus(id, 'ok', 1234)
    await h1.close()

    // Reopen on the SAME path with a NEW handle — migration should be a no-op
    // and existing data preserved.
    const h2 = await openDb({ sqlitePath: dbPath })
    const s2 = await CredentialStore.create(h2, SECRET, { salt: 'test-salt' })
    const row = (await s2.getRow(id))!
    expect(row.lastRefreshStatus).toBe('ok')
    expect(row.lastRefreshAt).toBe(1234)
    await h2.close()
  })
})
