import { describe, it, expect, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { createUser, verifyPassword } from '../../src/core/auth/users'

describe('Admin API auth', () => {
  let store: AdminStore

  afterEach(async () => {
    await store?.close()
  })

  async function open() {
    const handle = await openDb({ sqlitePath: ':memory:' })
    store = await AdminStore.create(handle)
    return store
  }

  it('creates a user and verifies password', async () => {
    const s = await open()
    const user = await createUser(s, 'admin', 'SecurePass123!', 'admin')
    expect(user.username).toBe('admin')
    const verified = await verifyPassword(s, 'admin', 'SecurePass123!')
    expect(verified).not.toBeNull()
    expect(verified!.id).toBe(user.id)
  })

  it('rejects wrong password', async () => {
    const s = await open()
    await createUser(s, 'admin', 'SecurePass123!', 'admin')
    const result = await verifyPassword(s, 'admin', 'wrongpassword')
    expect(result).toBeNull()
  })

  it('hasUsers returns false when empty', async () => {
    const s = await open()
    expect(await s.hasUsers()).toBe(false)
  })

  it('notification CRUD works', async () => {
    const s = await open()
    await s.createNotification('test', 'Test notification')
    const notifs = await s.listUnacknowledged()
    expect(notifs).toHaveLength(1)
    await s.acknowledgeNotification(notifs[0].id)
    expect(await s.listUnacknowledged()).toHaveLength(0)
  })

  it('audit log works', async () => {
    const s = await open()
    const user = await createUser(s, 'admin', 'SecurePass123!', 'admin')
    await s.writeAudit(user.id, 'connection.delete', 'accounting', 'conn-1')
    // Filter out the schema.migrate row auto-written at boot.
    const entries = (await s.listAudit()).filter((e) => e.action !== 'schema.migrate')
    expect(entries).toHaveLength(1)
    expect(entries[0].action).toBe('connection.delete')
  })
})
