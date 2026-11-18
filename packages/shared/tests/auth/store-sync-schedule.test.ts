import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { CredentialStore } from '../../src/auth/store'
import type { SyncSchedule } from '../../src/data-store/sync-schedule'

const SECRET = 'store-sync-schedule-secret-must-be-32-chars'

// SQLite always; Postgres when TEST_DATABASE_URL is set (`pnpm test:pg`).
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('CredentialStore sync schedule [$name]', (backend) => {
  let handle: DbHandle
  let store: CredentialStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await CredentialStore.create(handle, SECRET)
  })

  afterEach(async () => {
    await handle.close()
  })

  // A label each: the unique index folds a null label to '', so two unlabelled
  // connections to one platform and tenant collide.
  let n = 0
  const make = (schedule?: SyncSchedule | null, vertical: string | null = 'accounting') =>
    store.create('fortnox', null, { accessToken: 't' }, `c${n++}`, vertical, 'tenant-a', schedule)

  it('a new connection is on the default schedule', async () => {
    const row = await store.getRow(await make())
    expect(row).toMatchObject({ syncMode: 'default', syncIntervalMinutes: null })
  })

  it('stores a custom schedule with its interval', async () => {
    const row = await store.getRow(await make({ mode: 'custom', intervalMinutes: 30 }))
    expect(row).toMatchObject({ syncMode: 'custom', syncIntervalMinutes: 30 })
  })

  it('stores a trigger-only schedule without an interval', async () => {
    const row = await store.getRow(await make({ mode: 'trigger_only' }))
    expect(row).toMatchObject({ syncMode: 'trigger_only', syncIntervalMinutes: null })
  })

  it('a row written without the new columns reads as the default schedule', async () => {
    // What every connection that existed before v3 looks like after the migration.
    await handle.kysely
      .insertInto('credentials')
      .values({
        id: 'legacy',
        data: 'x',
        platform: 'fortnox',
        vertical: 'accounting',
        created_at: 1,
        updated_at: 1,
      })
      .execute()
    expect(await store.getRow('legacy')).toMatchObject({
      syncMode: 'default',
      syncIntervalMinutes: null,
    })
  })

  it('updateSyncSchedule switches modes and drops a stale interval', async () => {
    const id = await make({ mode: 'custom', intervalMinutes: 30 })
    const updated = await store.updateSyncSchedule(id, { mode: 'default' })
    expect(updated).toMatchObject({ id, syncMode: 'default', syncIntervalMinutes: null })
    expect(await store.getRow(id)).toMatchObject({ syncMode: 'default', syncIntervalMinutes: null })
  })

  it('updateSyncSchedule answers null for an unknown connection', async () => {
    expect(await store.updateSyncSchedule('nope', { mode: 'once' })).toBeNull()
  })

  it('listSyncScheduled leaves out trigger-only connections and rows with no vertical', async () => {
    const a = await make({ mode: 'default' })
    const b = await make({ mode: 'custom', intervalMinutes: 60 })
    const c = await make({ mode: 'once' })
    await make({ mode: 'trigger_only' })
    await make(undefined, null)
    expect((await store.listSyncScheduled()).map((r) => r.id).sort()).toEqual([a, b, c].sort())
  })

  it('createWithUniqueLabel carries the schedule', async () => {
    const { id } = await store.createWithUniqueLabel(
      'fortnox',
      null,
      { accessToken: 't' },
      'Books',
      'accounting',
      'tenant-a',
      { mode: 'trigger_only' },
    )
    expect((await store.getRow(id))!.syncMode).toBe('trigger_only')
  })
})
