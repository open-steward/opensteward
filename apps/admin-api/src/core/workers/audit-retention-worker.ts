import { SETTING } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * AuditRetentionWorker — periodically prunes audit-log rows older than the
 * operator-configured retention window (`audit_log.retention_days`).
 *
 * Modelled on HealthPoller: runs once on start, then on a daily interval. A
 * retention of 0 (the default) keeps everything forever and the sweep is a
 * no-op. When rows are actually removed, an `audit.retention.prune` entry is
 * written so the deletion itself is auditable — that new row is always newer
 * than the cutoff, so it can never be caught by the next sweep.
 */
export class AuditRetentionWorker {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private adminStore: AdminStore,
    private settings: RuntimeSettingsStore,
    private intervalMs = ONE_DAY_MS,
  ) {}

  start(): void {
    if (this.timer) return
    void this.sweep()
    this.timer = setInterval(() => void this.sweep(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async sweep(): Promise<void> {
    try {
      const row = await this.settings.get(SETTING.AUDIT_LOG_RETENTION_DAYS)
      const days = typeof row?.value === 'number' ? row.value : 0
      if (!Number.isFinite(days) || days <= 0) return // keep forever

      const cutoff = Date.now() - days * ONE_DAY_MS
      const deleted = await this.adminStore.pruneAuditLogBefore(cutoff)
      if (deleted > 0) {
        await this.adminStore.writeAudit({
          userId: 'system',
          action: 'audit.retention.prune',
          detail: { deleted, retentionDays: days },
        })
      }
    } catch {
      // Pruning errors are non-fatal — never crash the process over retention.
    }
  }
}
