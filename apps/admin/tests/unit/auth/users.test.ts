import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { AdminStore } from '../../../src/core/db/admin-store'
import { createUser, verifyPassword } from '../../../src/core/auth/users'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'admin-test-'))
}

describe('User auth', () => {
  let dir: string
  let store: AdminStore

  afterEach(() => {
    store?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  function open() {
    dir = makeTmpDir()
    store = new AdminStore(join(dir, 'admin.db'))
    return store
  }

  it('creates a user and verifies password', async () => {
    const s = open()
    const user = await createUser(s, 'admin', 'password123', 'admin')
    expect(user.username).toBe('admin')
    expect(user.role).toBe('admin')

    const verified = await verifyPassword(s, 'admin', 'password123')
    expect(verified).not.toBeNull()
    expect(verified!.id).toBe(user.id)
  })

  it('rejects wrong password', async () => {
    const s = open()
    await createUser(s, 'admin', 'password123', 'admin')
    const result = await verifyPassword(s, 'admin', 'wrong')
    expect(result).toBeNull()
  })

  it('rejects unknown username', async () => {
    const s = open()
    const result = await verifyPassword(s, 'nobody', 'password123')
    expect(result).toBeNull()
  })

  it('hasUsers returns false when empty, true after creation', async () => {
    const s = open()
    expect(s.hasUsers()).toBe(false)
    await createUser(s, 'admin', 'password123', 'admin')
    expect(s.hasUsers()).toBe(true)
  })

  it('lists users', async () => {
    const s = open()
    await createUser(s, 'alice', 'pass1', 'admin')
    await createUser(s, 'bob', 'pass2', 'viewer')
    expect(s.listUsers()).toHaveLength(2)
  })

  it('deletes user', async () => {
    const s = open()
    const user = await createUser(s, 'admin', 'pass', 'admin')
    expect(s.deleteUser(user.id)).toBe(true)
    expect(s.hasUsers()).toBe(false)
  })
})
