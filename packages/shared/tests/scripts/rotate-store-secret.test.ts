import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { openDb } from '@opensteward/shared'
import { rotateStoreSecret, parseArgs } from '../../src/scripts/rotate-store-secret'
import { CredentialStore } from '../../src/auth/store'
import { AdapterSettingsStore } from '../../src/adapter/settings-store'
import { EndUserStore } from '../../src/auth/end-users'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'
import { encrypt, decrypt } from '../../src/auth/crypto'
import { DATA_STORE_BLOBS } from '../../src/sqlite/encrypted-blobs'

const OLD_SECRET = 'old-secret-must-be-at-least-32-chars-long!'
const NEW_SECRET = 'new-secret-must-be-at-least-32-chars-long!'

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'rotate-test-'))
}

describe('rotateStoreSecret', () => {
  let dir: string
  let dbPath: string

  beforeEach(() => {
    dir = tmp()
    dbPath = join(dir, 'store.db')
  })
  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  })

  it('re-encrypts every encrypted column so the new secret decrypts the data', async () => {
    // Seed: write rows under OLD_SECRET via every encrypted-at-rest store
    // that lives in the integration-server db. All stores share ONE handle on
    // the same file (like boot); the handle is closed before the file-level
    // script reads the db so the WAL is flushed.
    const seedHandle = await openDb({ sqlitePath: dbPath })
    const credentials = await CredentialStore.create(seedHandle, OLD_SECRET)
    const connectionId = await credentials.create(
      'shopify',
      'tenant_1',
      { accessToken: 'tok_secret_value', refreshToken: 'rt' },
      'My Shopify',
      'ecommerce',
      'owner_1',
    )

    const settings = await AdapterSettingsStore.create(seedHandle, OLD_SECRET)
    await settings.upsert('ecommerce', 'shopify', {
      enabled: true,
      config: { clientId: 'cid', clientSecret: 'shhh' },
    })

    const endUsers = await EndUserStore.create(seedHandle, OLD_SECRET)
    const eu = await endUsers.create({
      tenantId: 'tenant_1',
      email: 'jane@acme.com',
      displayName: 'Jane',
      pii: { firstName: 'Jane', lastName: 'Doe', phone: '+15551234567' },
    })

    const webhooks = await WebhookSubscriptionStore.create(seedHandle, OLD_SECRET)
    const sub = await webhooks.create({ tenantId: 'tenant_1', url: 'https://acme.com/hook' })
    // One subscription with custom headers and one without: the header column
    // is nullable, so rotation has to cope with both. A header value is a
    // receiver credential — unreadable after rotation means broken deliveries.
    const subWithHeaders = await webhooks.create({
      tenantId: 'tenant_1',
      url: 'https://acme.com/hook-2',
      format: 'slack',
      headers: { 'X-Api-Key': 'receiver-credential' },
    })
    await seedHandle.close()

    // Sanity: NEW_SECRET cannot read the data yet.
    {
      const sanityHandle = await openDb({ sqlitePath: dbPath })
      const newCreds = await CredentialStore.create(sanityHandle, NEW_SECRET)
      await expect(newCreds.loadById(connectionId)).rejects.toThrow()
      await sanityHandle.close()
    }

    // Rotate.
    const stats = rotateStoreSecret({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      dbPaths: [dbPath],
      unsafeAllowLiveDb: true,
    })

    expect(stats[dbPath].rowsRotated).toBeGreaterThan(0)
    expect(stats[dbPath].rowsSkipped).toBe(0)

    // Open every store under NEW_SECRET — all data should round-trip. Share one
    // handle on the rotated file.
    const verifyHandle = await openDb({ sqlitePath: dbPath })

    const newCreds = await CredentialStore.create(verifyHandle, NEW_SECRET)
    const fetched = await newCreds.loadById(connectionId)
    expect(fetched?.accessToken).toBe('tok_secret_value')
    expect(fetched?.refreshToken).toBe('rt')

    const newSettings = await AdapterSettingsStore.create(verifyHandle, NEW_SECRET)
    expect((await newSettings.get('ecommerce', 'shopify'))?.config).toEqual({
      clientId: 'cid',
      clientSecret: 'shhh',
    })

    const newEndUsers = await EndUserStore.create(verifyHandle, NEW_SECRET)
    const fetchedEu = await newEndUsers.getById(eu.id, { includePii: true })
    expect(fetchedEu?.pii?.firstName).toBe('Jane')
    expect(fetchedEu?.pii?.phone).toBe('+15551234567')

    const newWebhooks = await WebhookSubscriptionStore.create(verifyHandle, NEW_SECRET)
    // matching() decrypts secret_encrypted via the new key — exercises the
    // same code path as the runtime webhook delivery worker.
    const matched = await newWebhooks.matching('tenant_1', 'order.created')
    expect(matched.find((m) => m.id === sub.id)?.secret).toBe(sub.secret)
    // Headers survive rotation, and the row without them is untouched.
    expect(await newWebhooks.headersFor(subWithHeaders.id)).toEqual({
      'X-Api-Key': 'receiver-credential',
    })
    expect(await newWebhooks.headersFor(sub.id)).toBeNull()
    await verifyHandle.close()

    // Backup exists.
    expect(existsSync(`${dbPath}.pre-rotation.bak`)).toBe(true)
  })

  it('re-encrypts destination credentials in the data-store db (resources.db)', () => {
    // The table is owned by @opensteward/destinations (which depends on this
    // package), so seed it at the SQL level with the registered salt — the
    // same (table, column, salt) the DestinationStore writes.
    const blob = DATA_STORE_BLOBS.find((b) => b.table === 'destinations')!
    expect(blob).toEqual({
      table: 'destinations',
      column: 'encrypted_secrets',
      salt: 'opensteward-destinations-v1',
    })
    const secrets = JSON.stringify({ accessKeyId: 'AK', secretAccessKey: 'lake-key' })
    const db = new Database(dbPath)
    db.exec('CREATE TABLE destinations (id TEXT PRIMARY KEY, encrypted_secrets TEXT)')
    db.prepare('INSERT INTO destinations VALUES (?, ?)').run(
      'd1',
      encrypt(secrets, OLD_SECRET, blob.salt),
    )
    // A destination with no credentials (default cloud chain) has NULL here.
    db.prepare('INSERT INTO destinations VALUES (?, NULL)').run('d2')
    db.close()

    const stats = rotateStoreSecret({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      dbPaths: [dbPath],
      unsafeAllowLiveDb: true,
    })
    expect(stats[dbPath].perBlob).toContainEqual({
      table: 'destinations',
      column: 'encrypted_secrets',
      rotated: 1,
      skipped: 0,
    })
    const post = new Database(dbPath)
    const row = post
      .prepare("SELECT encrypted_secrets FROM destinations WHERE id = 'd1'")
      .get() as { encrypted_secrets: string }
    post.close()
    expect(decrypt(row.encrypted_secrets, NEW_SECRET, blob.salt)).toBe(secrets)
  })

  it('is idempotent — a second run skips already-rotated rows', async () => {
    const seedHandle = await openDb({ sqlitePath: dbPath })
    const credentials = await CredentialStore.create(seedHandle, OLD_SECRET)
    await credentials.create('shopify', 'tenant_1', { accessToken: 'tok' })
    await seedHandle.close()

    const first = rotateStoreSecret({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      dbPaths: [dbPath],
      unsafeAllowLiveDb: true,
    })
    expect(first[dbPath].rowsRotated).toBe(1)
    expect(first[dbPath].rowsSkipped).toBe(0)

    const second = rotateStoreSecret({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      dbPaths: [dbPath],
      unsafeAllowLiveDb: true,
    })
    expect(second[dbPath].rowsRotated).toBe(0)
    expect(second[dbPath].rowsSkipped).toBe(1)
  })

  it('aborts when a row is encrypted under a third unknown key', async () => {
    // Pollute the db with a row encrypted under a third key the rotation
    // tool doesn't know about — must bail without writing.
    const seedHandle = await openDb({ sqlitePath: dbPath })
    const credentials = await CredentialStore.create(seedHandle, OLD_SECRET)
    await credentials.create('shopify', 'tenant_1', { accessToken: 'tok' })
    await seedHandle.close()

    // Swap in a row encrypted under THIRD_SECRET.
    const THIRD_SECRET = 'third-key-different-from-both-old-and-new!'
    const db = new Database(dbPath)
    const stmt = db.prepare('UPDATE credentials SET data = ?')
    stmt.run(encrypt(JSON.stringify({ accessToken: 'leaked' }), THIRD_SECRET, 'opensteward-v1'))
    db.close()

    expect(() =>
      rotateStoreSecret({
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        dbPaths: [dbPath],
        unsafeAllowLiveDb: true,
      }),
    ).toThrow(/decrypt failed with both/)

    // The third-key row must remain unchanged — transaction rolled back.
    const post = new Database(dbPath)
    const row = post.prepare('SELECT data FROM credentials').get() as { data: string }
    expect(decrypt(row.data, THIRD_SECRET, 'opensteward-v1')).toContain('leaked')
    post.close()
  })

  it('refuses to run when a fresh -wal sibling is detected', async () => {
    const seedHandle = await openDb({ sqlitePath: dbPath })
    const credentials = await CredentialStore.create(seedHandle, OLD_SECRET)
    await credentials.create('shopify', 'tenant_1', { accessToken: 'tok' })
    await seedHandle.close()

    // Simulate a live writer: a fresh -wal sibling with mtime "now" so the
    // freshness check trips.
    writeFileSync(`${dbPath}-wal`, '')
    const now = new Date()
    utimesSync(`${dbPath}-wal`, now, now)

    expect(() =>
      rotateStoreSecret({
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        dbPaths: [dbPath],
      }),
    ).toThrow(/writer is still attached/)
  })

  it('rejects identical --old and --new', () => {
    expect(() =>
      rotateStoreSecret({
        oldSecret: OLD_SECRET,
        newSecret: OLD_SECRET,
        dbPaths: [dbPath],
        unsafeAllowLiveDb: true,
      }),
    ).toThrow(/must differ/)
  })

  it('rejects missing --old or --new', () => {
    expect(() =>
      rotateStoreSecret({ oldSecret: '', newSecret: NEW_SECRET, dbPaths: [dbPath] }),
    ).toThrow(/--old/)
    expect(() =>
      rotateStoreSecret({ oldSecret: OLD_SECRET, newSecret: '', dbPaths: [dbPath] }),
    ).toThrow(/--new/)
  })

  it('handles a db that has none of the registered tables (no-op)', () => {
    const db = new Database(dbPath)
    db.exec('CREATE TABLE unrelated (id INTEGER)')
    db.close()
    const stats = rotateStoreSecret({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      dbPaths: [dbPath],
      unsafeAllowLiveDb: true,
    })
    expect(stats[dbPath].rowsRotated).toBe(0)
    expect(stats[dbPath].rowsSkipped).toBe(0)
  })

  it('writes a .pre-rotation.bak that byte-matches the pre-rotation file', async () => {
    const seedHandle = await openDb({ sqlitePath: dbPath })
    const credentials = await CredentialStore.create(seedHandle, OLD_SECRET)
    await credentials.create('shopify', 'tenant_1', { accessToken: 'tok' })
    await seedHandle.close()
    const before = readFileSync(dbPath)

    rotateStoreSecret({
      oldSecret: OLD_SECRET,
      newSecret: NEW_SECRET,
      dbPaths: [dbPath],
      unsafeAllowLiveDb: true,
    })

    const backup = readFileSync(`${dbPath}.pre-rotation.bak`)
    expect(backup.equals(before)).toBe(true)
  })
})

describe('parseArgs', () => {
  it('extracts --old, --new, repeated --db', () => {
    const args = parseArgs([
      '--old',
      'a',
      '--new',
      'b',
      '--db',
      'one.db',
      '--db',
      'two.db',
    ])
    expect(args).toEqual({ oldSecret: 'a', newSecret: 'b', dbPaths: ['one.db', 'two.db'] })
  })

  it('threads --unsafe-allow-live-db', () => {
    const args = parseArgs(['--old', 'a', '--new', 'b', '--db', 'x.db', '--unsafe-allow-live-db'])
    expect(args.unsafeAllowLiveDb).toBe(true)
  })

  it('throws on unknown args', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/)
  })
})

// ── Postgres ───────────────────────────────────────────────────────────────
// Runs only when TEST_DATABASE_URL is set (the dedicated CI postgres job). The
// `ctid`-based rotation has no SQLite equivalent to share, so this is its own
// suite rather than a describe.each leg.
const PG_URL = process.env.TEST_DATABASE_URL
;(PG_URL ? describe : describe.skip)('rotateStoreSecretPostgres', () => {
  it('re-encrypts a real CredentialStore row and is idempotent', async () => {
    const { rotateStoreSecretPostgres } = await import('../../src/scripts/rotate-store-secret')
    const handle = await openDb({ databaseUrl: PG_URL })
    try {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
      // Seed a credential under the OLD secret via the real store.
      const creds = await CredentialStore.create(handle, OLD_SECRET)
      const id = await creds.create('xero', 't1', { accessToken: 'super-secret-token' }, 'lbl', 'accounting')

      const stats = await rotateStoreSecretPostgres({
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        databaseUrl: PG_URL!,
      })
      expect(stats.rowsRotated).toBeGreaterThan(0)

      // A store opened under the NEW secret can read the rotated row.
      const credsNew = await CredentialStore.create(handle, NEW_SECRET)
      expect((await credsNew.getByTenant('t1', id))?.accessToken).toBe('super-secret-token')

      // Re-running is idempotent: every row is already on NEW → skipped.
      const again = await rotateStoreSecretPostgres({
        oldSecret: OLD_SECRET,
        newSecret: NEW_SECRET,
        databaseUrl: PG_URL!,
      })
      expect(again.rowsRotated).toBe(0)
      expect(again.rowsSkipped).toBe(stats.rowsRotated)
    } finally {
      await handle.close()
    }
  })

  it('refuses to rotate to the same key', async () => {
    const { rotateStoreSecretPostgres } = await import('../../src/scripts/rotate-store-secret')
    await expect(
      rotateStoreSecretPostgres({ oldSecret: OLD_SECRET, newSecret: OLD_SECRET, databaseUrl: PG_URL! }),
    ).rejects.toThrow(/must differ/)
  })
})
