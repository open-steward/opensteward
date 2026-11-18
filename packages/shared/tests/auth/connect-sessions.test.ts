import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ConnectSessionStore } from '../../src/auth/connect-sessions'

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

describe.each(BACKENDS)('ConnectSessionStore — oneTimeOnly [$name]', (backend) => {
  let handle: DbHandle
  let store: ConnectSessionStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ConnectSessionStore.create(handle)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('defaults oneTimeOnly to false', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'persistent link' })
    expect(session.oneTimeOnly).toBe(false)
    expect((await s.getById(session.id))!.oneTimeOnly).toBe(false)
  })

  it('persists oneTimeOnly when true and round-trips on reads', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'one-time link', oneTimeOnly: true })
    expect(session.oneTimeOnly).toBe(true)
    expect((await s.getById(session.id))!.oneTimeOnly).toBe(true)
    expect((await s.getByToken(session.token))!.oneTimeOnly).toBe(true)
    expect((await s.list({ tenantId: 'tenant-a' }))[0]!.oneTimeOnly).toBe(true)
  })

  it('getByConnectionId returns the consuming session', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'l', oneTimeOnly: true })
    const connectionId = '11111111-1111-1111-1111-111111111111'
    await s.markConsumed(session.id, connectionId)
    const found = await s.getByConnectionId(connectionId)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(session.id)
    expect(found!.oneTimeOnly).toBe(true)
    expect(found!.connectionId).toBe(connectionId)
  })

  it('getByConnectionId returns null when no session points at the id', async () => {
    const s = store
    expect(await s.getByConnectionId('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe.each(BACKENDS)('ConnectSessionStore — scopes override [$name]', (backend) => {
  let handle: DbHandle
  let store: ConnectSessionStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ConnectSessionStore.create(handle)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('defaults scopes to null when not provided', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'no-override' })
    expect(session.scopes).toBeNull()
  })

  it('persists scopes array and round-trips on reads', async () => {
    const s = store
    const session = await s.create({
      tenantId: 'tenant-a',
      label: 'read-only',
      scopes: ['accounting.transactions', 'accounting.contacts'],
    })
    expect(session.scopes).toEqual(['accounting.transactions', 'accounting.contacts'])
    expect((await s.getById(session.id))!.scopes).toEqual(['accounting.transactions', 'accounting.contacts'])
    expect((await s.getByToken(session.token))!.scopes).toEqual(['accounting.transactions', 'accounting.contacts'])
  })

  it('treats empty scopes array as null', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'empty', scopes: [] })
    expect(session.scopes).toBeNull()
  })
})

describe.each(BACKENDS)('ConnectSessionStore — allowSelfRegister + attachEndUser [$name]', (backend) => {
  let handle: DbHandle
  let store: ConnectSessionStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await ConnectSessionStore.create(handle)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('defaults allowSelfRegister to false', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'l' })
    expect(session.allowSelfRegister).toBe(false)
  })

  it('persists allowSelfRegister=true and round-trips', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'l', allowSelfRegister: true })
    expect(session.allowSelfRegister).toBe(true)
    expect((await s.getById(session.id))!.allowSelfRegister).toBe(true)
    expect((await s.getByToken(session.token))!.allowSelfRegister).toBe(true)
  })

  it('attachEndUser binds the customer when self-register is allowed and no end_user_id is set', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'l', allowSelfRegister: true })
    const userId = '11111111-1111-1111-1111-111111111111'
    const updated = await s.attachEndUser(session.id, userId)
    expect(updated).not.toBeNull()
    expect(updated!.endUserId).toBe(userId)
  })

  it('attachEndUser refuses to overwrite an existing end_user_id (idempotent)', async () => {
    const s = store
    const original = '11111111-1111-1111-1111-111111111111'
    const usurper = '22222222-2222-2222-2222-222222222222'
    const session = await s.create({
      tenantId: 'tenant-a',
      label: 'l',
      allowSelfRegister: true,
      endUserId: original,
    })
    expect(await s.attachEndUser(session.id, usurper)).toBeNull()
    expect((await s.getById(session.id))!.endUserId).toBe(original)
  })

  it('attachEndUser refuses to bind when allow_self_register is false', async () => {
    const s = store
    const session = await s.create({ tenantId: 'tenant-a', label: 'l' /* allowSelfRegister: false */ })
    expect(await s.attachEndUser(session.id, '11111111-1111-1111-1111-111111111111')).toBeNull()
    expect((await s.getById(session.id))!.endUserId).toBeNull()
  })
})

// Persistence across reopens is a SQLite-on-disk concern: open a fresh handle on
// the SAME file path and confirm the store re-reads the prior rows (migrations
// stay idempotent). Kept SQLite-file-only by design.
describe('ConnectSessionStore — migration idempotency across reopens (sqlite file)', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('adds one_time_only column idempotently across opens', async () => {
    dir = mkdtempSync(join(tmpdir(), 'connect-sessions-test-'))
    const dbPath = join(dir, 'idem.db')
    const h1 = await openDb({ sqlitePath: dbPath })
    const s1 = await ConnectSessionStore.create(h1)
    const session = await s1.create({ tenantId: 'tenant-a', label: 'l', oneTimeOnly: true })
    await h1.close()
    const h2 = await openDb({ sqlitePath: dbPath })
    const s2 = await ConnectSessionStore.create(h2)
    expect((await s2.getById(session.id))!.oneTimeOnly).toBe(true)
    await h2.close()
  })

  it('adds scopes column idempotently', async () => {
    dir = mkdtempSync(join(tmpdir(), 'connect-sessions-test-'))
    const dbPath = join(dir, 'idem.db')
    const h1 = await openDb({ sqlitePath: dbPath })
    const s1 = await ConnectSessionStore.create(h1)
    const session = await s1.create({ tenantId: 'tenant-a', label: 'l', scopes: ['a', 'b'] })
    await h1.close()
    const h2 = await openDb({ sqlitePath: dbPath })
    const s2 = await ConnectSessionStore.create(h2)
    expect((await s2.getById(session.id))!.scopes).toEqual(['a', 'b'])
    await h2.close()
  })

  it('adds allow_self_register column idempotently', async () => {
    dir = mkdtempSync(join(tmpdir(), 'connect-sessions-test-'))
    const dbPath = join(dir, 'idem.db')
    const h1 = await openDb({ sqlitePath: dbPath })
    const s1 = await ConnectSessionStore.create(h1)
    const session = await s1.create({ tenantId: 'tenant-a', label: 'l', allowSelfRegister: true })
    await h1.close()
    const h2 = await openDb({ sqlitePath: dbPath })
    const s2 = await ConnectSessionStore.create(h2)
    expect((await s2.getById(session.id))!.allowSelfRegister).toBe(true)
    await h2.close()
  })
})
