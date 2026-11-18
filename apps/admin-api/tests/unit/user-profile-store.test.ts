/**
 * admin_store v7: console-user email + profile picture persistence.
 *
 * Runs against SQLite always, and against Postgres too when
 * TEST_DATABASE_URL is set — the migration has a twin per dialect
 * (BLOB/BYTEA, INTEGER/BIGINT) and both must round-trip the same bytes.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore, MIGRATIONS } from '../../src/core/db/admin-store'
import {
  UserAvatarStore,
  avatarApiUrl,
  avatarVersion,
  hashAvatarSourceUrl,
} from '../../src/core/db/user-avatar-store'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

/** A tiny but real PNG header followed by arbitrary bytes — the store does not
 *  validate, it must only return exactly what it was given. */
function pngBytes(extra = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(extra),
  ])
}

describe.each(BACKENDS)('admin_store v7 — user email and avatar [$name]', (backend) => {
  let admin: AdminStore | undefined

  async function freshHandle(): Promise<DbHandle> {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    return handle
  }

  afterEach(async () => {
    await admin?.close()
    admin = undefined
  })

  it('upgrades a v6 database: existing users keep working with no email and no avatar', async () => {
    const handle = await freshHandle()
    // Stop at the last version the previous release shipped, and seed a user
    // the way that release would have.
    await handle.migrate('admin_store', MIGRATIONS.filter((m) => m.version <= 6))
    await handle.kysely
      .insertInto('users')
      .values({
        id: 'u-old',
        username: 'legacy',
        password_hash: 'hash',
        role: 'admin',
        created_at: 1,
        updated_at: 1,
      })
      .execute()

    admin = await AdminStore.create(handle)
    const legacy = await admin.getUserById('u-old')
    expect(legacy?.username).toBe('legacy')
    expect(legacy?.email ?? null).toBeNull()
    expect(legacy?.email_source ?? null).toBeNull()
    expect(await UserAvatarStore.for(admin).head('u-old')).toBeNull()

    const rows = await admin.listAudit(100, 0, { action: 'schema.migrate' })
    const versions = rows
      .filter((r) => r.target_id === 'admin_store')
      .map((r) => JSON.parse(r.detail ?? '{}').version as number)
    expect(versions).toContain(7)
    expect(versions).not.toContain(6)
  })

  it('creates a user with an email owned by the admin, and changes and clears it', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('olivia', 'hash', 'viewer', {
      email: 'olivia@northwind.example',
    })
    expect(u.email).toBe('olivia@northwind.example')
    expect(u.email_source).toBe('manual')

    const plain = await admin.createUser('noemail', 'hash', 'viewer')
    expect(plain.email ?? null).toBeNull()
    expect(plain.email_source ?? null).toBeNull()

    const idp = await admin.setUserEmail(u.id, 'o@idp.example', 'idp')
    expect(idp?.email).toBe('o@idp.example')
    expect(idp?.email_source).toBe('idp')

    const cleared = await admin.setUserEmail(u.id, null, 'manual')
    expect(cleared?.email ?? null).toBeNull()
    // Clearing drops the owner too, so SSO may fill it again.
    expect(cleared?.email_source ?? null).toBeNull()

    expect(await admin.setUserEmail('nobody', 'x@y.example', 'manual')).toBeNull()
  })

  it('round-trips avatar bytes exactly, replaces them, and serves metadata without the blob', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('pic', 'hash', 'viewer')
    const avatars = UserAvatarStore.for(admin)
    const first = pngBytes(2048)

    const stored = await avatars.put({
      userId: u.id,
      contentType: 'image/png',
      bytes: first,
      source: 'upload',
      updatedBy: u.id,
    })
    expect(stored.byteSize).toBe(first.length)
    expect(stored.sha256).toMatch(/^[0-9a-f]{64}$/)

    const row = await avatars.get(u.id)
    expect(row && Buffer.compare(row.bytes, first)).toBe(0)
    expect(row?.contentType).toBe('image/png')
    expect(row?.source).toBe('upload')
    expect(row?.sourceUrlHash).toBeNull()

    const head = await avatars.head(u.id)
    expect(head).not.toHaveProperty('bytes')
    expect(head?.sha256).toBe(stored.sha256)

    // Replace with an IdP picture: one row per user, new hash, URL hash kept.
    const second = pngBytes(128)
    const urlHash = hashAvatarSourceUrl('https://idp.example/p/1.png')
    const replaced = await avatars.put({
      userId: u.id,
      contentType: 'image/png',
      bytes: second,
      source: 'idp',
      sourceUrlHash: urlHash,
      updatedBy: null,
    })
    expect(replaced.sha256).not.toBe(stored.sha256)
    const again = await avatars.get(u.id)
    expect(again && Buffer.compare(again.bytes, second)).toBe(0)
    expect(again?.source).toBe('idp')
    expect(again?.sourceUrlHash).toBe(urlHash)

    expect((await avatars.versions()).get(u.id)).toBe(replaced.sha256)
    expect((await avatars.versions([u.id, 'nobody'])).size).toBe(1)
    expect(await avatars.versions([])).toEqual(new Map())

    expect(avatarVersion(replaced.sha256)).toHaveLength(16)
    expect(avatarApiUrl(u.id, replaced.sha256)).toBe(
      `/api/users/${u.id}/avatar?v=${replaced.sha256.slice(0, 16)}`,
    )
  })

  it('refuses a content type outside the allow-list at the database level', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('svg', 'hash', 'viewer')
    await expect(
      UserAvatarStore.for(admin).put({
        userId: u.id,
        // The CHECK constraint is the last line behind the magic-byte sniff.
        contentType: 'image/svg+xml' as never,
        bytes: Buffer.from('<svg/>'),
        source: 'upload',
        updatedBy: null,
      }),
    ).rejects.toThrow()
  })

  it('an IdP write inserts or replaces an IdP picture but never an upload, in one statement', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('idp', 'hash', 'viewer')
    const avatars = UserAvatarStore.for(admin)
    const hashA = hashAvatarSourceUrl('https://idp.example/a.png')
    const hashB = hashAvatarSourceUrl('https://idp.example/b.png')

    expect(await avatars.putFromIdp({ userId: u.id, contentType: 'image/png', bytes: pngBytes(), sourceUrlHash: hashA })).toBe(true)
    expect((await avatars.head(u.id))?.sourceUrlHash).toBe(hashA)
    expect(await avatars.putFromIdp({ userId: u.id, contentType: 'image/png', bytes: pngBytes(), sourceUrlHash: hashB })).toBe(true)
    expect((await avatars.head(u.id))?.sourceUrlHash).toBe(hashB)

    const upload = pngBytes(99)
    await avatars.put({ userId: u.id, contentType: 'image/png', bytes: upload, source: 'upload', updatedBy: u.id })
    expect(await avatars.putFromIdp({ userId: u.id, contentType: 'image/png', bytes: pngBytes(), sourceUrlHash: hashA })).toBe(false)
    const row = await avatars.get(u.id)
    expect(row?.source).toBe('upload')
    expect(row && Buffer.compare(row.bytes, upload)).toBe(0)
  })

  it('an IdP write for a user that no longer exists leaves no row', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('gone-soon', 'hash', 'viewer')
    await admin.deleteUser(u.id)
    const avatars = UserAvatarStore.for(admin)
    expect(
      await avatars.putFromIdp({ userId: u.id, contentType: 'image/png', bytes: pngBytes(), sourceUrlHash: 'h' }),
    ).toBe(false)
    expect(await avatars.head(u.id)).toBeNull()
  })

  it('the IdP email write never touches an address an admin owns', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('mail', 'hash', 'viewer')
    expect(await admin.setIdpEmail(u.id, 'idp@idp.example')).toBe(true)
    expect((await admin.getUserById(u.id))?.email_source).toBe('idp')
    await admin.setUserEmail(u.id, 'mine@console.example', 'manual')
    expect(await admin.setIdpEmail(u.id, 'idp2@idp.example')).toBe(false)
    expect(await admin.setIdpEmail(u.id, null)).toBe(false)
    const row = await admin.getUserById(u.id)
    expect(row?.email).toBe('mine@console.example')
    expect(row?.email_source).toBe('manual')
  })

  it('deletes only the requested source, and deleteUser removes the avatar with the user', async () => {
    admin = await AdminStore.create(await freshHandle())
    const u = await admin.createUser('gone', 'hash', 'viewer')
    const avatars = UserAvatarStore.for(admin)
    await avatars.put({
      userId: u.id,
      contentType: 'image/png',
      bytes: pngBytes(),
      source: 'upload',
      updatedBy: null,
    })
    // An IdP sync must never remove an upload.
    expect(await avatars.delete(u.id, { onlySource: 'idp' })).toBe(false)
    expect(await avatars.head(u.id)).not.toBeNull()

    expect(await admin.deleteUser(u.id)).toBe(true)
    expect(await avatars.head(u.id)).toBeNull()
  })
})
