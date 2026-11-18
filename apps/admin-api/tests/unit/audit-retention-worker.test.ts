import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { SETTING, openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { RuntimeSettingsStore } from '../../src/core/db/runtime-settings-store'
import { AuditRetentionWorker } from '../../src/core/workers/audit-retention-worker'

describe('AuditRetentionWorker', () => {
  let dir: string
  let store: AdminStore
  let runtimeSettings: RuntimeSettingsStore

  afterEach(async () => {
    await store?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function open() {
    dir = mkdtempSync(join(tmpdir(), 'audit-retention-test-'))
    const handle = await openDb({ sqlitePath: join(dir, 'admin.db') })
    store = await AdminStore.create(handle)
    runtimeSettings = await RuntimeSettingsStore.create(handle)
    return store
  }

  /** Insert an audit row with a back-dated created_at to simulate history. */
  async function backdate(s: AdminStore, ageMs: number) {
    await s
      .getHandle()
      .kysely.insertInto('audit_log')
      .values({
        user_id: 'u',
        action: 'user.login',
        vertical: null,
        target_id: null,
        detail: null,
        created_at: Date.now() - ageMs,
      })
      .execute()
  }

  it('does nothing when retention is 0 (keep forever)', async () => {
    const s = await open()
    await backdate(s, 100 * 24 * 60 * 60 * 1000) // 100 days old
    const before = await s.countAudit()
    await new AuditRetentionWorker(s, runtimeSettings).sweep()
    expect(await s.countAudit()).toBe(before)
  })

  it('prunes rows older than the retention window and audits the prune', async () => {
    const s = await open()
    await runtimeSettings.set(SETTING.AUDIT_LOG_RETENTION_DAYS, 30, 'tester')

    await backdate(s, 60 * 24 * 60 * 60 * 1000) // 60 days → should be pruned
    await s.writeAudit('u', 'user.login') // fresh → should survive

    await new AuditRetentionWorker(s, runtimeSettings).sweep()

    const remaining = await s.listAudit(100, 0)
    // The 60-day-old row is gone; the fresh login survives.
    expect(remaining.some((e) => e.action === 'user.login')).toBe(true)
    // The prune itself is recorded.
    const prune = remaining.find((e) => e.action === 'audit.retention.prune')
    expect(prune).toBeDefined()
    expect(prune!.user_id).toBe('system')
    expect(JSON.parse(prune!.detail!)).toMatchObject({ retentionDays: 30 })
  })

  it('does not log a prune when nothing is old enough', async () => {
    const s = await open()
    await runtimeSettings.set(SETTING.AUDIT_LOG_RETENTION_DAYS, 30, 'tester')
    // Boot rows (schema.migrate) are fresh; nothing exceeds 30 days.
    await new AuditRetentionWorker(s, runtimeSettings).sweep()
    expect((await s.listAudit(100, 0)).some((e) => e.action === 'audit.retention.prune')).toBe(false)
  })
})
