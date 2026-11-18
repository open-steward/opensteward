import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import {
  ApiKeyStore,
  IncompatibleMcpScopesError,
  assertMcpScopesCompatible,
  hasScope,
} from '../../src/auth/api-keys'

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

describe.each(BACKENDS)('ApiKeyStore [$name]', (backend) => {
  let handle: DbHandle
  let store: ApiKeyStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ApiKeyStore.create(handle, SECRET)
  })

  afterEach(async () => {
    // Stores are borrowers — close the shared handle, not the store.
    await handle?.close()
  })

  it('mint returns a plaintext that verifies once', async () => {
    const s = store
    const minted = await s.mint({ tenantId: 't_demo', label: 'first' })
    expect(minted.plaintext.startsWith('osk_')).toBe(true)
    expect(minted.plaintext).toContain('t_demo')
    const verified = await s.verify(minted.plaintext)
    expect(verified).not.toBeNull()
    expect(verified!.tenantId).toBe('t_demo')
    expect(verified!.id).toBe(minted.id)
  })

  it('mint returns a complete key record (lastUsedAt/revokedAt null)', async () => {
    // The admin-api `ApiKeyMint` response schema requires every ApiKey
    // field — `lastUsedAt` and `revokedAt` are nullable but NOT optional.
    // A fresh key must report them as null, or the admin-api response
    // serializer 500s with "Response does not match the schema".
    const s = store
    const minted = await s.mint({ tenantId: 't_demo', label: 'first' })
    expect(minted).toMatchObject({
      id: expect.any(String),
      tenantId: 't_demo',
      prefix: expect.any(String),
      label: 'first',
      scopes: expect.any(Array),
      plaintext: expect.any(String),
      createdAt: expect.any(Number),
      lastUsedAt: null,
      revokedAt: null,
    })
  })

  it('verify returns null for unknown plaintext', async () => {
    const s = store
    await s.mint({ tenantId: 't_demo' })
    expect(await s.verify('osk_t_demo_deadbeefdeadbeefdeadbeefdeadbeef')).toBeNull()
    expect(await s.verify('not-a-key')).toBeNull()
    expect(await s.verify('')).toBeNull()
  })

  it('revoke makes verify fail', async () => {
    const s = store
    const minted = await s.mint({ tenantId: 't_demo' })
    expect(await s.verify(minted.plaintext)).not.toBeNull()
    expect(await s.revoke(minted.id)).toBe(true)
    expect(await s.verify(minted.plaintext)).toBeNull()
    // Idempotent: re-revoke is a no-op
    expect(await s.revoke(minted.id)).toBe(false)
  })

  it('list filters by tenantId', async () => {
    const s = store
    await s.mint({ tenantId: 't_a', label: 'a1' })
    await s.mint({ tenantId: 't_a', label: 'a2' })
    await s.mint({ tenantId: 't_b', label: 'b1' })
    expect((await s.list()).length).toBe(3)
    expect((await s.list('t_a')).map((r) => r.label).sort()).toEqual(['a1', 'a2'])
    expect((await s.list('t_b')).map((r) => r.label)).toEqual(['b1'])
  })

  it('hash collisions on prefix do not break verification', async () => {
    const s = store
    // Mint many keys for the same tenant — they share the same prefix.
    const minted = await Promise.all(
      Array.from({ length: 5 }, () => s.mint({ tenantId: 't_demo' })),
    )
    for (const m of minted) {
      const v = await s.verify(m.plaintext)
      expect(v?.id).toBe(m.id)
    }
  })

  it('updates last_used_at on verify hit', async () => {
    const s = store
    const minted = await s.mint({ tenantId: 't_demo' })
    const before = (await s.list('t_demo'))[0].lastUsedAt
    expect(before).toBeNull()
    const verified = await s.verify(minted.plaintext)
    expect(verified!.lastUsedAt).not.toBeNull()
    const after = (await s.list('t_demo'))[0].lastUsedAt
    expect(after).not.toBeNull()
  })

  it('different secrets produce different hashes (cannot verify across deployments)', async () => {
    // Two stores on the SAME shared handle but with different secrets: a key
    // minted under SECRET must not verify under a different secret.
    const s1 = await ApiKeyStore.create(handle, SECRET)
    const minted = await s1.mint({ tenantId: 't' })
    const s2 = await ApiKeyStore.create(handle, 'different-secret-' + 'x'.repeat(20))
    expect(await s2.verify(minted.plaintext)).toBeNull()
  })

  it('persists scopes and round-trips them via verify + list', async () => {
    const s = store
    const minted = await s.mint({ tenantId: 't_demo', scopes: ['customers:read', 'vertical:accounting'] })
    expect(minted.scopes).toEqual(['customers:read', 'vertical:accounting'])
    const verified = await s.verify(minted.plaintext)
    expect(verified?.scopes).toEqual(['customers:read', 'vertical:accounting'])
    expect((await s.list('t_demo'))[0].scopes).toEqual(['customers:read', 'vertical:accounting'])
  })

  it("defaults scopes to ['*'] when none supplied", async () => {
    const s = store
    const minted = await s.mint({ tenantId: 't_demo' })
    expect(minted.scopes).toEqual(['*'])
    const verified = await s.verify(minted.plaintext)
    expect(verified?.scopes).toEqual(['*'])
  })

  it('treats empty scopes array as the * default', async () => {
    const s = store
    const minted = await s.mint({ tenantId: 't', scopes: [] })
    expect(minted.scopes).toEqual(['*'])
  })

  describe('migrateVerticalWriteScopes', () => {
    it('upgrades keys with per-vertical scopes that lack vertical:write', async () => {
      const s = store
      const k = await s.mint({ tenantId: 't', scopes: ['vertical:accounting'] })
      const result = await s.migrateVerticalWriteScopes()
      expect(result.upgraded).toBe(1)
      expect(result.skipped).toBe(0)
      const updated = (await s.list('t')).find((row) => row.id === k.id)!
      expect(updated.scopes).toContain('vertical:accounting')
      expect(updated.scopes).toContain('vertical:write')
    })

    it('skips keys with `*` (already permissive)', async () => {
      const s = store
      const k = await s.mint({ tenantId: 't', scopes: ['*'] })
      const result = await s.migrateVerticalWriteScopes()
      expect(result.upgraded).toBe(0)
      expect(result.skipped).toBe(1)
      const updated = (await s.list('t')).find((row) => row.id === k.id)!
      expect(updated.scopes).toEqual(['*'])
    })

    it('skips keys that already have vertical:write', async () => {
      const s = store
      const k = await s.mint({ tenantId: 't', scopes: ['vertical:accounting', 'vertical:write'] })
      const result = await s.migrateVerticalWriteScopes()
      expect(result.upgraded).toBe(0)
      expect(result.skipped).toBe(1)
      const updated = (await s.list('t')).find((row) => row.id === k.id)!
      expect(updated.scopes).toEqual(['vertical:accounting', 'vertical:write'])
    })

    it('skips keys without any vertical:* scope', async () => {
      const s = store
      await s.mint({ tenantId: 't', scopes: ['customers:read'] })
      const result = await s.migrateVerticalWriteScopes()
      expect(result.upgraded).toBe(0)
      expect(result.skipped).toBe(1)
    })

    it('is idempotent on a second run (no extra upgrades)', async () => {
      const s = store
      await s.mint({ tenantId: 't', scopes: ['vertical:accounting'] })
      const first = await s.migrateVerticalWriteScopes()
      const second = await s.migrateVerticalWriteScopes()
      expect(first.upgraded).toBe(1)
      expect(second.upgraded).toBe(0)
      expect(second.skipped).toBe(0)
    })

    it('skips revoked keys', async () => {
      const s = store
      const k = await s.mint({ tenantId: 't', scopes: ['vertical:accounting'] })
      await s.revoke(k.id)
      const result = await s.migrateVerticalWriteScopes()
      expect(result.upgraded).toBe(0)
      expect(result.skipped).toBe(0)
    })
  })
})

describe('hasScope', () => {
  it("'*' grants any required scope", () => {
    expect(hasScope(['*'], 'customers:read')).toBe(true)
    expect(hasScope(['*'], 'vertical:accounting')).toBe(true)
  })
  it('exact match grants', () => {
    expect(hasScope(['customers:read'], 'customers:read')).toBe(true)
  })
  it('resource-wildcard grants any action on that resource', () => {
    expect(hasScope(['customers:*'], 'customers:read')).toBe(true)
    expect(hasScope(['customers:*'], 'customers:write')).toBe(true)
    expect(hasScope(['customers:*'], 'connections:read')).toBe(false)
  })
  it('mismatch rejects', () => {
    expect(hasScope(['customers:read'], 'customers:write')).toBe(false)
    expect(hasScope(['vertical:accounting'], 'vertical:crm')).toBe(false)
    expect(hasScope([], 'customers:read')).toBe(false)
  })
})

describe('assertMcpScopesCompatible', () => {
  it('allows mcp:read alongside read-only scopes', () => {
    expect(() =>
      assertMcpScopesCompatible(['mcp:read', 'vertical:read', 'customers:read']),
    ).not.toThrow()
    expect(() =>
      assertMcpScopesCompatible(['mcp:read', 'vertical:accounting', 'customers:read']),
    ).not.toThrow()
    expect(() => assertMcpScopesCompatible(['mcp:read', 'mcp:read_pii'])).not.toThrow()
  })

  it('rejects mcp:read with explicit *:write scopes', () => {
    expect(() => assertMcpScopesCompatible(['mcp:read', 'vertical:write'])).toThrow(
      IncompatibleMcpScopesError,
    )
    expect(() => assertMcpScopesCompatible(['mcp:read', 'customers:write'])).toThrow(
      IncompatibleMcpScopesError,
    )
    expect(() => assertMcpScopesCompatible(['mcp:read', 'connections:write'])).toThrow(
      IncompatibleMcpScopesError,
    )
  })

  it('rejects mcp:read with `*` or `<resource>:*` wildcards', () => {
    expect(() => assertMcpScopesCompatible(['mcp:read', '*'])).toThrow(IncompatibleMcpScopesError)
    expect(() => assertMcpScopesCompatible(['mcp:read', 'customers:*'])).toThrow(
      IncompatibleMcpScopesError,
    )
  })

  it('is a no-op when mcp:read is absent', () => {
    expect(() => assertMcpScopesCompatible(['*'])).not.toThrow()
    expect(() => assertMcpScopesCompatible(['vertical:write', 'customers:*'])).not.toThrow()
    expect(() => assertMcpScopesCompatible([])).not.toThrow()
  })

  it('lists every conflicting scope in the error', () => {
    try {
      assertMcpScopesCompatible(['mcp:read', 'vertical:write', 'customers:*'])
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(IncompatibleMcpScopesError)
      expect((err as IncompatibleMcpScopesError).conflictingScopes).toEqual([
        'vertical:write',
        'customers:*',
      ])
    }
  })
})

describe.each(BACKENDS)('ApiKeyStore — mcp:read mint guard [$name]', (backend) => {
  let handle: DbHandle
  let store: ApiKeyStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ApiKeyStore.create(handle, SECRET)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('mint accepts mcp:read + read-only scopes', async () => {
    const s = store
    const minted = await s.mint({
      tenantId: 't_demo',
      label: 'claude-desktop',
      scopes: ['mcp:read', 'vertical:read', 'customers:read'],
    })
    expect(minted.scopes).toEqual(['mcp:read', 'vertical:read', 'customers:read'])
  })

  it('mint rejects mcp:read + vertical:write', async () => {
    const s = store
    await expect(
      s.mint({
        tenantId: 't_demo',
        scopes: ['mcp:read', 'vertical:write'],
      }),
    ).rejects.toThrow(IncompatibleMcpScopesError)
  })

  it('mint rejects mcp:read + *', async () => {
    const s = store
    await expect(s.mint({ tenantId: 't_demo', scopes: ['mcp:read', '*'] })).rejects.toThrow(
      IncompatibleMcpScopesError,
    )
  })
})

describe.each(BACKENDS)('ApiKeyStore — key mode [$name]', (backend) => {
  let handle: DbHandle
  let store: ApiKeyStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ApiKeyStore.create(handle, SECRET)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('mints live keys by default, with no marker in the plaintext', async () => {
    const key = await store.mint({ tenantId: 'acme' })
    expect(key.mode).toBe('live')
    expect(key.plaintext.startsWith('osk_acme_')).toBe(true)
    expect(key.plaintext.startsWith('osk_test_')).toBe(false)
  })

  it('mints test keys with the marker, and round-trips the mode through verify', async () => {
    const key = await store.mint({ tenantId: 'acme', mode: 'test' })
    expect(key.mode).toBe('test')
    expect(key.plaintext.startsWith('osk_test_acme_')).toBe(true)

    const row = await store.verify(key.plaintext)
    expect(row?.mode).toBe('test')
    expect(row?.tenantId).toBe('acme')
  })

  it('keeps 8 chars of tenant suffix in a test key prefix', async () => {
    // A slice of `KEY_PREFIX.length + 8` would spend 5 of the 8 chars on the
    // literal `test_`, collapsing index selectivity to "every test key".
    const live = await store.mint({ tenantId: 'acme-industries' })
    const test = await store.mint({ tenantId: 'acme-industries', mode: 'test' })
    expect(live.prefix).toBe('osk_' + 'acme-ind')
    expect(test.prefix).toBe('osk_test_' + 'acme-ind')
  })

  it('does not confuse a tenant literally named `test` for a test key', async () => {
    // The plaintext reads `osk_test_<hex>`, but the row is live. This is why
    // the mode is a column and never parsed back out of the string.
    const key = await store.mint({ tenantId: 'test' })
    expect(key.mode).toBe('live')
    expect(key.plaintext.startsWith('osk_test_')).toBe(true)

    const row = await store.verify(key.plaintext)
    expect(row?.mode).toBe('live')
  })

  it('verifies live and test keys minted for the same tenant independently', async () => {
    const live = await store.mint({ tenantId: 'acme' })
    const test = await store.mint({ tenantId: 'acme', mode: 'test' })
    expect((await store.verify(live.plaintext))?.mode).toBe('live')
    expect((await store.verify(test.plaintext))?.mode).toBe('test')
    expect((await store.verify(live.plaintext))?.id).not.toBe(test.id)
  })

  it('filters list by mode', async () => {
    const live = await store.mint({ tenantId: 'acme' })
    const test = await store.mint({ tenantId: 'acme', mode: 'test' })

    expect((await store.list('acme')).map((r) => r.mode).sort()).toEqual(['live', 'test'])
    expect((await store.list('acme', { mode: 'test' })).map((r) => r.id)).toEqual([test.id])
    expect((await store.list('acme', { mode: 'live' })).map((r) => r.id)).toEqual([live.id])
  })

  it('rejects a NULL mode at the schema level', async () => {
    // The column is NOT NULL DEFAULT 'live', so no row — pre- or post-migration
    // — can carry a NULL. `parseMode`'s null branch is defence in depth for an
    // embedder with its own table, not a state this schema can reach.
    const key = await store.mint({ tenantId: 'acme' })
    await expect(
      handle.kysely
        .updateTable('developer_api_keys')
        .set({ mode: null })
        .where('id', '=', key.id)
        .execute(),
    ).rejects.toThrow()
  })

  it('reads an unrecognised mode value as live', async () => {
    const key = await store.mint({ tenantId: 'acme', mode: 'test' })
    await handle.kysely
      .updateTable('developer_api_keys')
      .set({ mode: 'wat' })
      .where('id', '=', key.id)
      .execute()
    // Grants nothing new, and refuses on /test/v1/*.
    expect((await store.verify(key.plaintext))?.mode).toBe('live')
  })
})

describe.each(BACKENDS)('ApiKeyStore — v1→v2 mode migration [$name]', (backend) => {
  let handle: DbHandle

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('backfills every pre-existing key to live', async () => {
    const int = handle.dialect === 'postgres' ? 'BIGINT' : 'INTEGER'
    // The v1 schema, verbatim — no `mode` column.
    await handle.execScript(`
      CREATE TABLE developer_api_keys (
        id                   TEXT PRIMARY KEY,
        tenant_id            TEXT NOT NULL,
        prefix               TEXT NOT NULL,
        hash                 TEXT NOT NULL,
        label                TEXT,
        scopes               TEXT NOT NULL DEFAULT '["*"]',
        created_at           ${int} NOT NULL,
        last_used_at         ${int},
        revoked_at           ${int},
        v_write_migrated_at  ${int}
      );
      CREATE TABLE IF NOT EXISTS _schema_migrations (
        namespace  TEXT NOT NULL,
        version    INTEGER NOT NULL,
        applied_at ${int} NOT NULL,
        PRIMARY KEY (namespace, version)
      );
      INSERT INTO _schema_migrations (namespace, version, applied_at)
        VALUES ('developer_api_keys', 1, 0);
      INSERT INTO developer_api_keys
        (id, tenant_id, prefix, hash, label, scopes, created_at)
        VALUES ('old-key', 'acme', 'osk_acme-in', 'x', 'legacy', '["*"]', 1);
    `)

    // Opening the store applies v2 over the existing v1 schema.
    const store = await ApiKeyStore.create(handle, SECRET)
    const rows = await store.list('acme')

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('old-key')
    expect(rows[0].mode).toBe('live')
    expect(await store.list('acme', { mode: 'live' })).toHaveLength(1)
    expect(await store.list('acme', { mode: 'test' })).toHaveLength(0)
  })
})
