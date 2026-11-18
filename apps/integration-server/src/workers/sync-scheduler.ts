/**
 * SyncScheduler — enqueues the syncs each connection's schedule says are due.
 *
 * Every tick (60 s by default) it:
 *   1. reads the connections that may sync on their own
 *      (`CredentialStore.listSyncScheduled` — every mode but trigger_only),
 *   2. reads their sync history in one batch (`SyncStore.historyFor`),
 *   3. asks `describeConnectionSync` when each is next due — the same answer
 *      the admin console shows as "Next sync",
 *   4. enqueues them through `SyncStore.createIfIdle`, with origin 'schedule':
 *      connections that have never finished a sync first (oldest connection
 *      first), then the most overdue.
 *
 * It only enqueues; the per-vertical SyncWorkers run the jobs.
 *
 * Load is bounded by back-pressure, not a timetable: a vertical that already
 * has `maxPendingPerVertical` jobs waiting gets nothing more this tick. That
 * keeps a manual Sync now from queueing behind hundreds of scheduled jobs, and
 * it is what staggers the first runs after an upgrade — every connection is
 * overdue at once, and they drain at the workers' pace.
 *
 * Replica-safe without a lease: each replica computes the same due set from
 * the shared database, and the one-active-job index behind `createIfIdle` lets
 * only one of them enqueue a given connection.
 */
import {
  describeConnectionSync,
  EMPTY_SYNC_HISTORY,
  type ConnectionRow,
  type CredentialStore,
  type SyncStore,
} from '@opensteward/shared'

export interface SyncSchedulerLogger {
  info(msg: string): void
  warn(msg: string): void
  error(msg: string): void
}

export interface SyncSchedulerOptions {
  store: Pick<CredentialStore, 'listSyncScheduled'>
  syncStore: Pick<SyncStore, 'historyFor' | 'createIfIdle' | 'countPending'>
  /** The deployment interval. Read every tick, so an admin's change applies within one settings poll. */
  defaultIntervalMinutes: () => number
  /** The kill switch. Read every tick. */
  enabled: () => boolean
  /** True while this process's circuit breaker is open for the connection. */
  isCircuitOpen?: (connectionId: string) => boolean
  /** False for a vertical the license does not include: its connections are not scheduled (P8). Read every tick. */
  verticalEntitled?: (vertical: string) => boolean
  intervalMs?: number
  maxPendingPerVertical?: number
  now?: () => number
  logger?: SyncSchedulerLogger
}

export interface SyncSchedulerTickResult {
  considered: number
  due: number
  enqueued: number
  /** Due, but its vertical already had `maxPendingPerVertical` jobs waiting. */
  deferred: number
  /** Due, but this process's circuit breaker is open for it. */
  skippedOpenCircuit: number
  /** Due, but the license does not include its vertical (P8). */
  skippedUnentitled: number
  disabled: boolean
}

export const DEFAULT_SCHEDULER_INTERVAL_MS = 60_000
export const MIN_SCHEDULER_INTERVAL_MS = 5_000
export const DEFAULT_MAX_PENDING_PER_VERTICAL = 2

export class SyncScheduler {
  private timer: ReturnType<typeof setInterval> | null = null
  private running: Promise<SyncSchedulerTickResult> | null = null
  private readonly intervalMs: number
  private readonly maxPendingPerVertical: number
  private readonly now: () => number
  private readonly logger: SyncSchedulerLogger

  constructor(private readonly opts: SyncSchedulerOptions) {
    this.intervalMs = Math.max(
      MIN_SCHEDULER_INTERVAL_MS,
      opts.intervalMs ?? DEFAULT_SCHEDULER_INTERVAL_MS,
    )
    this.maxPendingPerVertical = Math.max(
      1,
      opts.maxPendingPerVertical ?? DEFAULT_MAX_PENDING_PER_VERTICAL,
    )
    this.now = opts.now ?? Date.now
    this.logger = opts.logger ?? {
      info: (m) => console.log(`[sync-scheduler] ${m}`),
      warn: (m) => console.warn(`[sync-scheduler] ${m}`),
      error: (m) => console.error(`[sync-scheduler] ${m}`),
    }
  }

  start(): void {
    if (this.timer) return
    void this.tick()
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    this.timer.unref?.()
    this.logger.info(
      `Sync scheduler started (tick=${this.intervalMs}ms, maxPendingPerVertical=${this.maxPendingPerVertical})`,
    )
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.running) await this.running
  }

  /** One pass. A call made while a pass is in flight shares it rather than starting a second. */
  tick(): Promise<SyncSchedulerTickResult> {
    if (!this.running) {
      this.running = this.runTick().finally(() => {
        this.running = null
      })
    }
    return this.running
  }

  private async runTick(): Promise<SyncSchedulerTickResult> {
    const result: SyncSchedulerTickResult = {
      considered: 0,
      due: 0,
      enqueued: 0,
      deferred: 0,
      skippedOpenCircuit: 0,
      skippedUnentitled: 0,
      disabled: false,
    }
    try {
      if (!this.opts.enabled()) return { ...result, disabled: true }
      const rows = await this.opts.store.listSyncScheduled()
      result.considered = rows.length
      if (rows.length === 0) return result

      const history = await this.opts.syncStore.historyFor(rows.map((r) => r.id))
      const now = this.now()
      const defaultMinutes = this.opts.defaultIntervalMinutes()
      const due: Array<{
        row: ConnectionRow & { vertical: string }
        at: number
        neverSynced: boolean
      }> = []
      for (const row of rows) {
        if (!row.vertical) continue
        const past = history.get(row.id) ?? EMPTY_SYNC_HISTORY
        const state = describeConnectionSync(row, past, defaultMinutes, now)
        if (state.nextSyncAt !== null && state.nextSyncAt <= now) {
          due.push({
            row: row as ConnectionRow & { vertical: string },
            at: state.nextSyncAt,
            neverSynced: past.lastFinishedAt === null,
          })
        }
      }
      result.due = due.length

      // A connection that has never finished a sync goes first, oldest
      // connection first: its "due" time is `now`, which would sort it behind
      // every overdue connection and hold a new connection's first sync back
      // for as long as its vertical has a backlog. The rest go longest-waiting
      // first: when a vertical's slots are scarce, the connection that has
      // been due the longest gets the next one.
      due.sort((a, b) => {
        if (a.neverSynced !== b.neverSynced) return a.neverSynced ? -1 : 1
        const order = a.neverSynced ? a.row.createdAt - b.row.createdAt : a.at - b.at
        return order || a.row.id.localeCompare(b.row.id)
      })
      const waiting = new Map<string, number>()
      for (const { row } of due) {
        if (this.opts.verticalEntitled && !this.opts.verticalEntitled(row.vertical)) {
          result.skippedUnentitled++
          continue
        }
        if (this.opts.isCircuitOpen?.(row.id)) {
          result.skippedOpenCircuit++
          continue
        }
        let pending = waiting.get(row.vertical)
        if (pending === undefined) {
          pending = await this.opts.syncStore.countPending(row.vertical)
          waiting.set(row.vertical, pending)
        }
        if (pending >= this.maxPendingPerVertical) {
          result.deferred++
          continue
        }
        // One connection's failure is that connection's problem: log it and
        // move on, so it cannot starve every connection sorted after it.
        let outcome: Awaited<ReturnType<SyncStore['createIfIdle']>>
        try {
          outcome = await this.opts.syncStore.createIfIdle({
            vertical: row.vertical,
            connectionId: row.id,
            platform: row.platform,
            tenantId: row.ownerTenantId ?? row.tenantId,
            origin: 'schedule',
          })
        } catch (err) {
          this.logger.warn(
            `could not enqueue a scheduled sync for connection ${row.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          )
          continue
        }
        if (outcome.created) result.enqueued++
        // A pending job takes a slot whoever created it — including another
        // replica that won the race to createIfIdle. A running one does not.
        if (outcome.created || outcome.job.status === 'pending') {
          waiting.set(row.vertical, pending + 1)
        }
      }
      if (result.enqueued > 0) {
        this.logger.info(
          `enqueued ${result.enqueued} scheduled sync(s); ${result.deferred} deferred behind waiting jobs`,
        )
      }
    } catch (err) {
      this.logger.error(`tick failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    return result
  }
}
