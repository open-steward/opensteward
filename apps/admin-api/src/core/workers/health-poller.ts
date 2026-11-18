import type { Aggregator, TaggedConnection } from '../proxy/aggregator'
import { dashboardTaskFingerprint, type AdminStore } from '../db/admin-store'

/** Dismissals older than this whose condition is no longer live are pruned
 *  on every poll that can see the connection list. */
export const DISMISSAL_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

/**
 * HealthPoller — periodically checks all verticals for expiring/expired connections
 * and creates notifications in the admin database.
 *
 * Dashboard task dismissals (see `DashboardDismissal` in the store) are
 * honoured here: once an operator clears an expired connection or a rejected
 * platform on the dashboard, the matching notification is acknowledged by the
 * dismissal route, and this poller must not raise it again while the live
 * fingerprint still equals the one that was cleared. A changed fingerprint —
 * a new expiry, a rejection after a successful refresh — re-raises it as
 * before. The poller also owns retention: clears older than
 * `DISMISSAL_RETENTION_MS` are pruned once their condition is gone.
 */
export class HealthPoller {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private aggregator: Aggregator,
    private adminStore: AdminStore,
    private intervalMs = 5 * 60 * 1000, // 5 minutes
  ) {}

  start(): void {
    if (this.timer) return
    // Run immediately on start, then on interval
    void this.poll()
    this.timer = setInterval(() => void this.poll(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async poll(): Promise<void> {
    try {
      // Check vertical health
      const verticals = await this.aggregator.healthCheck()
      for (const v of verticals) {
        if (v.status === 'down') {
          await this.adminStore.createNotificationIfAbsent(
            'vertical_down',
            `Vertical "${v.name}" is unreachable`,
            v.name,
          )
        }
      }

      // Check connection health
      const connections = await this.aggregator.allConnections()

      // Housekeeping, only when the connection list is trustworthy: an
      // unreachable integration-server reads as "no connections", and
      // pruning against that would expire every standing clear. Deferring
      // is the safe direction — the rows are retried next poll.
      if (verticals.some((v) => v.status === 'up')) {
        await this.pruneDismissals(connections)
      }

      const dismissed = await this.loadDismissals()

      // `platform_error` means the platform's OAuth client credentials were
      // rejected — one bad secret breaks every connection for that platform,
      // so raise a single de-duplicated notification per (vertical, platform)
      // rather than one per affected connection. The whole group is needed
      // before raising: the dismissal fingerprint is the NEWEST token expiry
      // across the affected connections.
      const platformErrors = new Map<string, TaggedConnection[]>()
      for (const c of connections) {
        if (c.status === 'platform_error') {
          const key = `${c.vertical}/${c.platform}`
          const group = platformErrors.get(key)
          if (group) group.push(c)
          else platformErrors.set(key, [c])
        } else if (c.status === 'expired') {
          if (dismissed.get(`conn:expired:${c.id}`) === expiredFingerprint(c)) continue
          await this.adminStore.createNotificationIfAbsent(
            'credential_expired',
            `Connection "${c.platform}" (${c.label ?? c.id}) has expired and needs re-authorization`,
            c.vertical,
            c.id,
            c.platform,
          )
        } else if (c.status === 'expiring_soon') {
          await this.adminStore.createNotificationIfAbsent(
            'credential_expiring',
            `Connection "${c.platform}" (${c.label ?? c.id}) is expiring soon`,
            c.vertical,
            c.id,
            c.platform,
          )
        }
      }
      for (const [key, group] of platformErrors) {
        if (dismissed.get(`platform:creds:${key}`) === platformCredsFingerprint(group)) continue
        const c = group[0]!
        await this.adminStore.createNotificationIfAbsent(
          'platform_credentials_invalid',
          `Platform "${c.platform}" (${c.vertical}) OAuth credentials were rejected — update the client ID/secret in Platforms. Customer re-authorization will not fix this.`,
          c.vertical,
          undefined,
          c.platform,
        )
      }
    } catch {
      // Polling errors are non-fatal — log but don't crash
    }
  }

  /** Drop clears older than the retention window whose condition this poll
   *  cannot see any more; a clear on a still-live condition is kept. On its
   *  own guard so a store hiccup here does not stop the health checks. */
  private async pruneDismissals(connections: readonly TaggedConnection[]): Promise<void> {
    const live = new Set<string>()
    for (const c of connections) {
      if (c.status === 'expired') live.add(`conn:expired:${c.id}`)
      else if (c.status === 'platform_error') live.add(`platform:creds:${c.vertical}/${c.platform}`)
    }
    try {
      await this.adminStore.pruneDashboardDismissals(Date.now() - DISMISSAL_RETENTION_MS, {
        keep: live,
      })
    } catch {
      // Non-fatal — retried next poll.
    }
  }

  /** key → fingerprint for every stored dismissal; empty when the read fails
   *  (then nothing is suppressed, which is the safe direction). */
  private async loadDismissals(): Promise<Map<string, string>> {
    try {
      const rows = await this.adminStore.listDashboardDismissals()
      return new Map(rows.map((r) => [r.key, r.fingerprint]))
    } catch {
      return new Map()
    }
  }
}

/** Fingerprint of a `conn:expired:<id>` task — see `DashboardDismissal`.
 *  `createdAt` (immutable) is the fallback, not `updatedAt`: a label rename
 *  must not re-surface a cleared task. */
export function expiredFingerprint(c: Pick<TaggedConnection, 'expiresAt' | 'createdAt'>): string {
  return dashboardTaskFingerprint(c.expiresAt ?? c.createdAt)
}

/** Fingerprint of a `platform:creds:<vertical>/<platform>` task: the newest
 *  `expiresAt ?? createdAt` across the affected connections. Not
 *  `lastRefreshAt` — every retry of the same rejected secret rewrites it,
 *  which would undo a clear within minutes on a busy deployment. */
export function platformCredsFingerprint(
  group: ReadonlyArray<Pick<TaggedConnection, 'expiresAt' | 'createdAt'>>,
): string {
  let newest = ''
  for (const c of group) {
    const fp = dashboardTaskFingerprint(c.expiresAt ?? c.createdAt)
    // ISO 8601 strings of one format order lexically; a non-ISO leftover
    // still compares deterministically.
    if (fp > newest) newest = fp
  }
  return newest
}
