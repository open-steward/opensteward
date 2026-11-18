/**
 * Sync schedules in the admin console: reading the form (connection page and
 * new Connect Link) and wording the state integration-server reports.
 *
 * The rules — modes, the 15 minute – 30 day bounds — are shared's; this module
 * only turns them into form fields and sentences, so the console can never
 * accept a schedule the API would refuse.
 */
import {
  DEFAULT_SYNC_INTERVAL_MINUTES,
  SYNC_INTERVAL_MAX_MINUTES,
  SYNC_INTERVAL_MIN_MINUTES,
  SYNC_MODES,
  type ConnectionSyncState,
  type SyncMode,
  type SyncSchedule,
} from '@opensteward/shared'

export const INTERVAL_UNITS = { minutes: 1, hours: 60, days: 1_440 } as const
export type IntervalUnit = keyof typeof INTERVAL_UNITS

export interface SyncScheduleFormBody {
  syncMode?: string
  syncIntervalValue?: string
  syncIntervalUnit?: string
}

/** `schedule: null` = the field was left blank (on a Connect Link: the deployment default). */
export type SyncScheduleFormResult = { schedule: SyncSchedule | null } | { error: string }

const isMode = (v: string): v is SyncMode => (SYNC_MODES as readonly string[]).includes(v)
const isUnit = (v: string): v is IntervalUnit =>
  Object.prototype.hasOwnProperty.call(INTERVAL_UNITS, v)

export function parseSyncScheduleForm(body: SyncScheduleFormBody): SyncScheduleFormResult {
  const mode = (body.syncMode ?? '').trim()
  if (mode === '') return { schedule: null }
  if (!isMode(mode)) return { error: 'Choose one of the listed sync schedules.' }
  if (mode !== 'custom') return { schedule: { mode } }

  const unit = (body.syncIntervalUnit ?? '').trim()
  if (!isUnit(unit)) return { error: 'Choose minutes, hours or days for the custom interval.' }
  const raw = (body.syncIntervalValue ?? '').trim()
  const value = Number(raw)
  if (raw === '' || !Number.isInteger(value) || value < 1) {
    return { error: 'Enter a whole number for the custom interval.' }
  }
  const minutes = value * INTERVAL_UNITS[unit]
  if (minutes < SYNC_INTERVAL_MIN_MINUTES) {
    return { error: `The shortest custom interval is ${SYNC_INTERVAL_MIN_MINUTES} minutes.` }
  }
  if (minutes > SYNC_INTERVAL_MAX_MINUTES) {
    return { error: 'The longest custom interval is 30 days.' }
  }
  return { schedule: { mode: 'custom', intervalMinutes: minutes } }
}

/** The largest unit that divides the interval evenly, for prefilling the form. */
export function splitInterval(minutes: number): { value: number; unit: IntervalUnit } {
  if (minutes % INTERVAL_UNITS.days === 0)
    return { value: minutes / INTERVAL_UNITS.days, unit: 'days' }
  if (minutes % INTERVAL_UNITS.hours === 0) {
    return { value: minutes / INTERVAL_UNITS.hours, unit: 'hours' }
  }
  return { value: minutes, unit: 'minutes' }
}

export function formatInterval(minutes: number): string {
  const { value, unit } = splitInterval(minutes)
  return `${value} ${value === 1 ? unit.slice(0, -1) : unit}`
}

export interface SyncChoice {
  value: SyncMode
  label: string
  hint: string
}

export interface SyncPresentation {
  /** False in passthrough mode — nothing is synced, so nothing to schedule. */
  available: boolean
  mode: SyncMode
  summary: string
  lastSynced: string
  nextSync: string
  lastFailure: string | null
  /** Set when the schedule can be shown and changed but its state cannot:
   *  an integration-server from before sync schedules reports no `sync`. */
  statusNote: string | null
  /** Prefill for the custom-interval inputs. */
  interval: { value: number; unit: IntervalUnit }
  choices: SyncChoice[]
}

export function presentSync(
  connection: {
    syncMode?: string | null
    syncIntervalMinutes?: number | null
    sync?: ConnectionSyncState | null
  },
  opts: { now?: number; formatTime?: (ms: number) => string } = {},
): SyncPresentation {
  const now = opts.now ?? Date.now()
  const fmt = opts.formatTime ?? ((ms: number) => new Date(ms).toLocaleString())
  const sync = connection.sync ?? null
  const stored = connection.syncMode ?? ''
  const mode: SyncMode = sync?.mode ?? (isMode(stored) ? stored : 'default')
  const deploymentMinutes = sync?.defaultIntervalMinutes ?? null
  const customMinutes = sync?.intervalMinutes ?? connection.syncIntervalMinutes ?? null

  const defaultLabel = deploymentMinutes
    ? `Default schedule — every ${formatInterval(deploymentMinutes)}`
    : 'Default schedule'
  const choices: SyncChoice[] = [
    {
      value: 'default',
      label: defaultLabel,
      hint: "Follows the deployment's interval (Settings → Data store).",
    },
    {
      value: 'custom',
      label: 'Custom interval',
      hint: 'Every N minutes, hours or days — 15 minutes to 30 days.',
    },
    {
      value: 'trigger_only',
      label: 'Trigger only',
      hint: 'Never syncs automatically, not even when connected. Only Sync now or the API start a sync.',
    },
    {
      value: 'once',
      label: 'One-time',
      hint: 'One sync when the connection is made, then only on request.',
    },
  ]
  const summary =
    mode === 'default'
      ? defaultLabel
      : mode === 'custom'
        ? customMinutes
          ? `Custom — every ${formatInterval(customMinutes)}`
          : 'Custom interval'
        : mode === 'trigger_only'
          ? 'Trigger only — syncs only on request'
          : 'One-time — synced once when connected'
  const interval = splitInterval(
    customMinutes ?? deploymentMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES,
  )

  // `sync` absent is not passthrough (null): it is an integration-server too
  // old to report it, which says nothing about whether it syncs. Keep the
  // form, and say the state is unknown rather than "nothing is synced".
  if (connection.sync === undefined) {
    return {
      available: true,
      mode,
      summary,
      lastSynced: 'Unknown',
      nextSync: 'Unknown',
      lastFailure: null,
      statusNote: 'Sync status unavailable from this server version.',
      interval,
      choices,
    }
  }

  if (!sync) {
    return {
      available: false,
      mode,
      summary,
      lastSynced: '—',
      nextSync: '—',
      lastFailure: null,
      statusNote: null,
      interval,
      choices,
    }
  }

  const nextSync = sync.active
    ? 'Syncing now'
    : sync.pausedReason === 'needs_reauthorization'
      ? 'Paused until the customer re-authorizes'
      : sync.pausedReason === 'platform_error'
        ? 'Paused until the platform credentials are fixed'
        : mode === 'trigger_only'
          ? 'Only on request'
          : // Reached only by a `once` connection whose one sync has already
            // finished: shared's decision is null for `once` only once a job
            // has been queued and none is active, and active, paused and
            // trigger-only are all answered above.
            sync.nextSyncAt === null
            ? 'Only on request — the one-time sync has already run'
            : sync.nextSyncAt <= now
              ? 'Due now'
              : fmt(sync.nextSyncAt)
  const lastFailure =
    sync.lastStatus === 'failed' && sync.lastAttemptAt !== null
      ? `The last attempt failed at ${fmt(sync.lastAttemptAt)}${
          sync.consecutiveFailures > 1 ? ` (${sync.consecutiveFailures} in a row)` : ''
        }.`
      : null

  return {
    available: true,
    mode,
    summary,
    lastSynced: sync.lastSyncedAt !== null ? fmt(sync.lastSyncedAt) : 'Never',
    nextSync,
    lastFailure,
    statusNote: null,
    interval,
    choices,
  }
}

const ORIGIN_LABELS: Readonly<Record<string, string>> = {
  schedule: 'Scheduled',
  manual: 'Sync now',
  api: 'API',
  connect: 'After connecting',
  boot: 'On boot',
}

/**
 * Why a sync job ran, as the Sync jobs table words it. An origin this console
 * does not know yet prints as itself. The own-property check means a value
 * such as `constructor` cannot pull a function off Object.prototype.
 */
export function originLabel(origin: string): string {
  return Object.prototype.hasOwnProperty.call(ORIGIN_LABELS, origin)
    ? ORIGIN_LABELS[origin]!
    : origin
}
