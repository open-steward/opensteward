import { describe, it, expect } from 'vitest'
import {
  SyncScheduleSchema,
  EMPTY_SYNC_HISTORY,
  clampIntervalMinutes,
  describeConnectionSync,
  parseSyncMode,
  retryDelayMs,
  type SyncHistory,
} from '../../src/data-store/sync-schedule'

const MIN = 60_000
const NOW = 1_800_000_000_000

type RefreshStatus = 'ok' | 'failed' | 'expired' | 'platform_error' | null
const conn = (
  syncMode: unknown,
  syncIntervalMinutes: number | null = null,
  lastRefreshStatus: RefreshStatus = null,
) => ({ syncMode, syncIntervalMinutes, lastRefreshStatus })
const history = (h: Partial<SyncHistory>): SyncHistory => ({ ...EMPTY_SYNC_HISTORY, ...h })
const synced = (at: number) =>
  history({ everQueued: true, lastFinishedAt: at, lastStatus: 'completed', lastSuccessAt: at })
const failed = (at: number, n: number, lastSuccessAt: number | null = null) =>
  history({
    everQueued: true,
    lastFinishedAt: at,
    lastStatus: 'failed',
    consecutiveFailures: n,
    lastSuccessAt,
  })

describe('SyncScheduleSchema', () => {
  it.each([
    [{ mode: 'default' }],
    [{ mode: 'trigger_only' }],
    [{ mode: 'once' }],
    [{ mode: 'custom', intervalMinutes: 15 }],
    [{ mode: 'custom', intervalMinutes: 43_200 }],
  ])('accepts %j', (input) => {
    expect(SyncScheduleSchema.safeParse(input).success).toBe(true)
  })

  it.each([
    [{ mode: 'custom' }, 'A custom schedule needs intervalMinutes.'],
    [
      { mode: 'default', intervalMinutes: 60 },
      'intervalMinutes applies only to a custom schedule.',
    ],
    [{ mode: 'custom', intervalMinutes: 14 }, null],
    [{ mode: 'custom', intervalMinutes: 43_201 }, null],
    [{ mode: 'custom', intervalMinutes: 1.5 }, null],
    [{ mode: 'weekly' }, null],
    [{ mode: 'default', extra: true }, null],
    [{}, null],
  ])('refuses %j', (input, message) => {
    const r = SyncScheduleSchema.safeParse(input)
    expect(r.success).toBe(false)
    if (message) expect(r.error!.issues.map((i) => i.message)).toContain(message)
  })
})

describe('describeConnectionSync — when a connection is next due', () => {
  it('a default connection that has never synced is due now', () => {
    const s = describeConnectionSync(conn('default'), EMPTY_SYNC_HISTORY, 360, NOW)
    expect(s).toMatchObject({ mode: 'default', nextSyncAt: NOW, effectiveIntervalMinutes: 360 })
  })

  it('a default connection is due one deployment interval after its last sync', () => {
    const s = describeConnectionSync(conn('default'), synced(NOW - 60 * MIN), 360, NOW)
    expect(s.nextSyncAt).toBe(NOW - 60 * MIN + 360 * MIN)
    expect(s.defaultIntervalMinutes).toBe(360)
  })

  it('follows a change to the deployment interval at once', () => {
    const s = describeConnectionSync(conn('default'), synced(NOW - 60 * MIN), 30, NOW)
    expect(s.nextSyncAt).toBe(NOW - 30 * MIN)
  })

  it('a custom connection uses its own interval', () => {
    const s = describeConnectionSync(conn('custom', 30), synced(NOW - 10 * MIN), 360, NOW)
    expect(s).toMatchObject({ intervalMinutes: 30, effectiveIntervalMinutes: 30 })
    expect(s.nextSyncAt).toBe(NOW + 20 * MIN)
  })

  it('a custom row without an interval falls back to the deployment interval', () => {
    const s = describeConnectionSync(conn('custom', null), synced(NOW), 120, NOW)
    expect(s.effectiveIntervalMinutes).toBe(120)
    expect(s.nextSyncAt).toBe(NOW + 120 * MIN)
  })

  it('retries a failed sync after 15 minutes, doubling per consecutive failure', () => {
    const at = (n: number) =>
      describeConnectionSync(conn('default'), failed(NOW, n), 360, NOW).nextSyncAt
    expect(at(1)).toBe(NOW + 15 * MIN)
    expect(at(2)).toBe(NOW + 30 * MIN)
    expect(at(3)).toBe(NOW + 60 * MIN)
  })

  it('never waits longer than the interval to retry', () => {
    const s = describeConnectionSync(conn('custom', 20), failed(NOW, 5), 360, NOW)
    expect(s.nextSyncAt).toBe(NOW + 20 * MIN)
  })

  it('trigger_only is never due, synced or not', () => {
    for (const h of [EMPTY_SYNC_HISTORY, synced(NOW - 10_000 * MIN)]) {
      const s = describeConnectionSync(conn('trigger_only'), h, 360, NOW)
      expect(s).toMatchObject({ nextSyncAt: null, effectiveIntervalMinutes: null })
    }
  })

  it('once is due only until its first sync has been queued', () => {
    expect(describeConnectionSync(conn('once'), EMPTY_SYNC_HISTORY, 360, NOW).nextSyncAt).toBe(NOW)
    expect(describeConnectionSync(conn('once'), failed(NOW, 1), 360, NOW).nextSyncAt).toBeNull()
    expect(describeConnectionSync(conn('once'), synced(NOW), 360, NOW).nextSyncAt).toBeNull()
  })

  it('is not due while a sync is pending or running', () => {
    const s = describeConnectionSync(
      conn('default'),
      history({ active: true, everQueued: true }),
      360,
      NOW,
    )
    expect(s).toMatchObject({ active: true, nextSyncAt: null })
  })

  it('pauses while the customer must re-authorize', () => {
    const s = describeConnectionSync(conn('default', null, 'expired'), synced(0), 360, NOW)
    expect(s).toMatchObject({ nextSyncAt: null, pausedReason: 'needs_reauthorization' })
  })

  it('pauses on rejected platform credentials', () => {
    const s = describeConnectionSync(conn('custom', 60, 'platform_error'), synced(0), 360, NOW)
    expect(s).toMatchObject({ nextSyncAt: null, pausedReason: 'platform_error' })
  })

  it('does not call a connection paused when it would not sync anyway', () => {
    expect(
      describeConnectionSync(conn('trigger_only', null, 'expired'), synced(0), 360, NOW)
        .pausedReason,
    ).toBeNull()
    expect(
      describeConnectionSync(conn('once', null, 'expired'), synced(0), 360, NOW).pausedReason,
    ).toBeNull()
  })

  it('reads an unknown stored mode as the default schedule', () => {
    expect(describeConnectionSync(conn('weekly'), EMPTY_SYNC_HISTORY, 360, NOW).mode).toBe(
      'default',
    )
  })

  it('reports the last success and the last attempt separately', () => {
    const s = describeConnectionSync(conn('default'), failed(NOW, 2, NOW - 100 * MIN), 360, NOW)
    expect(s).toMatchObject({
      lastSyncedAt: NOW - 100 * MIN,
      lastAttemptAt: NOW,
      lastStatus: 'failed',
      consecutiveFailures: 2,
    })
  })
})

describe('clampIntervalMinutes', () => {
  it.each([
    [0, 360],
    [-5, 360],
    [Number.NaN, 360],
    [Number.POSITIVE_INFINITY, 360],
    [5, 15],
    [15, 15],
    [90.4, 90],
    [100_000, 43_200],
  ])('%d -> %d', (raw, expected) => {
    expect(clampIntervalMinutes(raw)).toBe(expected)
  })
})

describe('retryDelayMs', () => {
  it.each([
    [0, 15],
    [1, 15],
    [2, 30],
    [3, 60],
    [4, 120],
  ])('%d failures -> %d minutes', (n, minutes) => {
    expect(retryDelayMs(n, 10_000 * MIN)).toBe(minutes * MIN)
  })

  it('is capped at the interval', () => {
    expect(retryDelayMs(30, 45 * MIN)).toBe(45 * MIN)
  })
})

describe('parseSyncMode', () => {
  it.each([
    ['custom', 'custom'],
    ['trigger_only', 'trigger_only'],
    [42, 'default'],
    [null, 'default'],
    ['Default', 'default'],
  ])('%j -> %s', (raw, expected) => {
    expect(parseSyncMode(raw)).toBe(expected)
  })
})
