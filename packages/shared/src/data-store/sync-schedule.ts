/**
 * Sync schedules — how often a connection's data is re-read from its platform.
 *
 * Every connection has one of four modes:
 *
 *   default       every deployment interval
 *                 (`data_store.sync.default_interval_minutes`, 6 hours out of the box)
 *   custom        every `syncIntervalMinutes` (15 minutes to 30 days)
 *   trigger_only  never automatically — not even when connected. Only a manual
 *                 sync (the admin "Sync now", `POST /v1/{vertical}/sync`)
 *   once          one automatic sync, when the connection is made; then only
 *                 manual syncs. A failed one-time sync is not retried.
 *
 * This module decides WHEN, from a connection's schedule and its sync-job
 * history, and nothing else. The scheduler (integration-server) and the admin
 * connection API both call `describeConnectionSync`, so the "Next sync" an
 * operator reads is exactly what the scheduler acts on.
 */
import { z } from 'zod'
import type { ConnectionRow } from '../auth/store'
import type { SyncStore } from './sync-store'

export const SYNC_MODES = ['default', 'custom', 'trigger_only', 'once'] as const
export type SyncMode = (typeof SYNC_MODES)[number]

export const SYNC_INTERVAL_MIN_MINUTES = 15
export const SYNC_INTERVAL_MAX_MINUTES = 43_200
export const DEFAULT_SYNC_INTERVAL_MINUTES = 360

const MINUTE_MS = 60_000
/** The first automatic retry after a failed sync; it doubles per consecutive failure. */
export const FIRST_RETRY_DELAY_MS = 15 * MINUTE_MS

/**
 * A schedule as a caller sends it. `intervalMinutes` belongs to `custom` and
 * only to `custom`: a stray interval on another mode is refused rather than
 * silently stored, because it would read as a promise the mode does not keep.
 */
export const SyncScheduleSchema = z
  .object({
    mode: z.enum(SYNC_MODES),
    intervalMinutes: z
      .number()
      .int()
      .min(SYNC_INTERVAL_MIN_MINUTES)
      .max(SYNC_INTERVAL_MAX_MINUTES)
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.mode === 'custom' && v.intervalMinutes === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['intervalMinutes'],
        message: 'A custom schedule needs intervalMinutes.',
      })
    }
    if (v.mode !== 'custom' && v.intervalMinutes !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['intervalMinutes'],
        message: 'intervalMinutes applies only to a custom schedule.',
      })
    }
  })
export type SyncSchedule = z.infer<typeof SyncScheduleSchema>

/**
 * A stored mode, read defensively. The column is TEXT; anything that is not a
 * known mode (a hand-edited row) reads as `default` rather than "never sync",
 * because silently stopping a connection's syncs is the worse surprise.
 */
export function parseSyncMode(raw: unknown): SyncMode {
  return typeof raw === 'string' && (SYNC_MODES as readonly string[]).includes(raw)
    ? (raw as SyncMode)
    : 'default'
}

/**
 * An interval from an untrusted source — the runtime setting, which accepts
 * any finite number. `0` or less means "not set" (the built-in 6 hours), never
 * "every tick"; anything else is held to 15 minutes – 30 days.
 */
export function clampIntervalMinutes(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_SYNC_INTERVAL_MINUTES
  return Math.min(SYNC_INTERVAL_MAX_MINUTES, Math.max(SYNC_INTERVAL_MIN_MINUTES, Math.round(raw)))
}

/**
 * How long after a failed sync to try again: 15 minutes, doubling per
 * consecutive failure, never longer than the schedule's own interval — a
 * failing connection is retried sooner than a healthy one is re-synced, never
 * later.
 */
export function retryDelayMs(consecutiveFailures: number, intervalMs: number): number {
  const n = Math.max(1, Math.floor(consecutiveFailures))
  return Math.min(intervalMs, FIRST_RETRY_DELAY_MS * 2 ** Math.min(n - 1, 20))
}

/** What `SyncStore.historyFor` reports about one connection's jobs. */
export interface SyncHistory {
  /** A job is pending or running now. */
  active: boolean
  /** Any job, of any status, has ever been created for the connection. */
  everQueued: boolean
  /** When the newest finished job finished (`completed_at`, else `created_at`). */
  lastFinishedAt: number | null
  /** That job's outcome. */
  lastStatus: 'completed' | 'failed' | null
  /** When the newest completed job finished. */
  lastSuccessAt: number | null
  /** Failed jobs since the newest completed one. */
  consecutiveFailures: number
}

export const EMPTY_SYNC_HISTORY: SyncHistory = Object.freeze({
  active: false,
  everQueued: false,
  lastFinishedAt: null,
  lastStatus: null,
  lastSuccessAt: null,
  consecutiveFailures: 0,
})

export type SyncPausedReason = 'needs_reauthorization' | 'platform_error'

/** The connection fields the decision reads — a `ConnectionRow` satisfies it. */
export interface SyncScheduleInput {
  /** The raw column value; read through `parseSyncMode`. */
  syncMode: unknown
  syncIntervalMinutes: number | null
  lastRefreshStatus: 'ok' | 'failed' | 'expired' | 'platform_error' | null
}

/** Everything the console shows about a connection's syncing. Times are epoch ms. */
export interface ConnectionSyncState {
  mode: SyncMode
  /** The connection's own interval; null unless `mode` is 'custom'. */
  intervalMinutes: number | null
  /** The interval that applies: the custom one, the deployment's, or null
   *  for modes that never repeat. */
  effectiveIntervalMinutes: number | null
  /** The deployment interval, so a console can label the Default choice. */
  defaultIntervalMinutes: number
  lastSyncedAt: number | null
  lastAttemptAt: number | null
  lastStatus: 'completed' | 'failed' | null
  consecutiveFailures: number
  /** A job is pending or running now. */
  active: boolean
  /** When the scheduler will next enqueue; null when it never will on its own
   *  right now (trigger only, a spent one-time sync, a job in flight, paused). */
  nextSyncAt: number | null
  /** Why an automatic schedule is on hold. */
  pausedReason: SyncPausedReason | null
}

export function describeConnectionSync(
  conn: SyncScheduleInput,
  history: SyncHistory,
  defaultIntervalMinutes: number,
  now: number,
): ConnectionSyncState {
  const mode = parseSyncMode(conn.syncMode)
  const deploymentMinutes = clampIntervalMinutes(defaultIntervalMinutes)
  const customMinutes =
    mode === 'custom' && conn.syncIntervalMinutes !== null
      ? clampIntervalMinutes(conn.syncIntervalMinutes)
      : null
  // A custom row with no interval (only a hand edit can make one) follows the
  // deployment interval rather than never syncing.
  const effectiveIntervalMinutes =
    mode === 'custom'
      ? (customMinutes ?? deploymentMinutes)
      : mode === 'default'
        ? deploymentMinutes
        : null
  // "Paused" only means something for a connection that would otherwise sync
  // on its own: a trigger-only connection, or a one-time one already queued,
  // is not waiting on anybody.
  const wouldSync =
    mode === 'default' || mode === 'custom' || (mode === 'once' && !history.everQueued)
  const pausedReason: SyncPausedReason | null = !wouldSync
    ? null
    : conn.lastRefreshStatus === 'expired'
      ? 'needs_reauthorization'
      : conn.lastRefreshStatus === 'platform_error'
        ? 'platform_error'
        : null

  return {
    mode,
    intervalMinutes: customMinutes,
    effectiveIntervalMinutes,
    defaultIntervalMinutes: deploymentMinutes,
    lastSyncedAt: history.lastSuccessAt,
    lastAttemptAt: history.lastFinishedAt,
    lastStatus: history.lastStatus,
    consecutiveFailures: history.consecutiveFailures,
    active: history.active,
    nextSyncAt: nextSyncAt(mode, effectiveIntervalMinutes, history, pausedReason, now),
    pausedReason,
  }
}

function nextSyncAt(
  mode: SyncMode,
  effectiveIntervalMinutes: number | null,
  history: SyncHistory,
  pausedReason: SyncPausedReason | null,
  now: number,
): number | null {
  if (history.active || pausedReason !== null) return null
  if (mode === 'trigger_only') return null
  if (mode === 'once') return history.everQueued ? null : now
  // default | custom. No finished job (and none active) means never synced.
  if (history.lastFinishedAt === null || effectiveIntervalMinutes === null) return now
  const intervalMs = effectiveIntervalMinutes * MINUTE_MS
  return history.lastStatus === 'failed'
    ? history.lastFinishedAt + retryDelayMs(history.consecutiveFailures, intervalMs)
    : history.lastFinishedAt + intervalMs
}

// ── Resolver for connection responses ─────────────────────────────────────

export type SyncStateResolver = (rows: ConnectionRow[]) => Promise<Map<string, ConnectionSyncState>>

/**
 * Turn connection rows into their `ConnectionSyncState`, in one history read
 * for the whole batch — what the admin connection routes attach as `sync`.
 */
export function createSyncStateResolver(opts: {
  syncStore: Pick<SyncStore, 'historyFor'>
  defaultIntervalMinutes: () => number
  now?: () => number
}): SyncStateResolver {
  return async (rows) => {
    const history = await opts.syncStore.historyFor(rows.map((r) => r.id))
    const now = (opts.now ?? Date.now)()
    const defaultMinutes = opts.defaultIntervalMinutes()
    return new Map(
      rows.map((r) => [
        r.id,
        describeConnectionSync(r, history.get(r.id) ?? EMPTY_SYNC_HISTORY, defaultMinutes, now),
      ]),
    )
  }
}
