import { describe, it, expect } from 'vitest'
import {
  formatInterval,
  originLabel,
  parseSyncScheduleForm,
  presentSync,
  splitInterval,
} from '../../src/core/views/sync-schedule'

const NOW = 1_800_000_000_000
const MIN = 60_000
const fmt = (ms: number) => `t+${(ms - NOW) / MIN}m`

const state = (over: Record<string, unknown> = {}) => ({
  mode: 'default' as const,
  intervalMinutes: null,
  effectiveIntervalMinutes: 360,
  defaultIntervalMinutes: 360,
  lastSyncedAt: NOW - 60 * MIN,
  lastAttemptAt: NOW - 60 * MIN,
  lastStatus: 'completed' as const,
  consecutiveFailures: 0,
  active: false,
  nextSyncAt: NOW + 300 * MIN,
  pausedReason: null,
  ...over,
})

describe('parseSyncScheduleForm', () => {
  it.each([
    [{ syncMode: '' }, { schedule: null }],
    [{}, { schedule: null }],
    [{ syncMode: 'default' }, { schedule: { mode: 'default' } }],
    [{ syncMode: 'trigger_only' }, { schedule: { mode: 'trigger_only' } }],
    [{ syncMode: 'once' }, { schedule: { mode: 'once' } }],
    [
      { syncMode: 'custom', syncIntervalValue: '2', syncIntervalUnit: 'hours' },
      { schedule: { mode: 'custom', intervalMinutes: 120 } },
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '15', syncIntervalUnit: 'minutes' },
      { schedule: { mode: 'custom', intervalMinutes: 15 } },
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '30', syncIntervalUnit: 'days' },
      { schedule: { mode: 'custom', intervalMinutes: 43_200 } },
    ],
  ])('%j', (body, expected) => {
    expect(parseSyncScheduleForm(body)).toEqual(expected)
  })

  it.each([
    [{ syncMode: 'weekly' }, 'Choose one of the listed sync schedules.'],
    [
      { syncMode: 'custom', syncIntervalValue: '10', syncIntervalUnit: 'minutes' },
      'The shortest custom interval is 15 minutes.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '31', syncIntervalUnit: 'days' },
      'The longest custom interval is 30 days.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '1.5', syncIntervalUnit: 'hours' },
      'Enter a whole number for the custom interval.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '', syncIntervalUnit: 'hours' },
      'Enter a whole number for the custom interval.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '0', syncIntervalUnit: 'hours' },
      'Enter a whole number for the custom interval.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '2', syncIntervalUnit: 'weeks' },
      'Choose minutes, hours or days for the custom interval.',
    ],
    [
      { syncMode: 'custom', syncIntervalValue: '2', syncIntervalUnit: 'constructor' },
      'Choose minutes, hours or days for the custom interval.',
    ],
  ])('refuses %j', (body, error) => {
    expect(parseSyncScheduleForm(body)).toEqual({ error })
  })
})

describe('intervals', () => {
  it.each([
    [360, { value: 6, unit: 'hours' }, '6 hours'],
    [1_440, { value: 1, unit: 'days' }, '1 day'],
    [2_880, { value: 2, unit: 'days' }, '2 days'],
    [90, { value: 90, unit: 'minutes' }, '90 minutes'],
    [60, { value: 1, unit: 'hours' }, '1 hour'],
  ])('%d', (minutes, split, text) => {
    expect(splitInterval(minutes)).toEqual(split)
    expect(formatInterval(minutes)).toBe(text)
  })
})

describe('presentSync', () => {
  const show = (c: Record<string, unknown>) => presentSync(c, { now: NOW, formatTime: fmt })

  it('describes the default schedule with the deployment interval', () => {
    const p = show({ syncMode: 'default', sync: state() })
    expect(p).toMatchObject({
      available: true,
      summary: 'Default schedule — every 6 hours',
      lastSynced: 't+-60m',
      nextSync: 't+300m',
      lastFailure: null,
    })
    expect(p.choices[0]!.label).toBe('Default schedule — every 6 hours')
  })

  it('describes a custom interval and prefills it', () => {
    const p = show({
      syncMode: 'custom',
      syncIntervalMinutes: 90,
      sync: state({ mode: 'custom', intervalMinutes: 90, effectiveIntervalMinutes: 90 }),
    })
    expect(p.summary).toBe('Custom — every 90 minutes')
    expect(p.interval).toEqual({ value: 90, unit: 'minutes' })
  })

  it('says a trigger-only connection syncs only on request', () => {
    const p = show({
      syncMode: 'trigger_only',
      sync: state({ mode: 'trigger_only', nextSyncAt: null }),
    })
    expect(p.nextSync).toBe('Only on request')
  })

  // shared reports no next sync for `once` only after its one sync has been
  // queued and finished — a running one is `active`, caught above it.
  it('says a spent one-time connection syncs only on request', () => {
    expect(
      show({ syncMode: 'once', sync: state({ mode: 'once', nextSyncAt: null }) }).nextSync,
    ).toBe('Only on request — the one-time sync has already run')
  })

  it('says a connection is due now rather than printing a past time', () => {
    expect(show({ sync: state({ nextSyncAt: NOW - MIN }) }).nextSync).toBe('Due now')
  })

  it('says a sync is running', () => {
    expect(show({ sync: state({ active: true, nextSyncAt: null }) }).nextSync).toBe('Syncing now')
  })

  it('says why a schedule is paused', () => {
    expect(
      show({ sync: state({ nextSyncAt: null, pausedReason: 'needs_reauthorization' }) }).nextSync,
    ).toBe('Paused until the customer re-authorizes')
    expect(
      show({ sync: state({ nextSyncAt: null, pausedReason: 'platform_error' }) }).nextSync,
    ).toBe('Paused until the platform credentials are fixed')
  })

  it('reports a run of failures', () => {
    const p = show({
      sync: state({ lastStatus: 'failed', lastAttemptAt: NOW, consecutiveFailures: 3 }),
    })
    expect(p.lastFailure).toBe('The last attempt failed at t+0m (3 in a row).')
  })

  it('says never when nothing has synced', () => {
    expect(show({ sync: state({ lastSyncedAt: null }) }).lastSynced).toBe('Never')
  })

  it('is unavailable in passthrough mode', () => {
    const p = show({ syncMode: 'default', sync: null })
    expect(p.available).toBe(false)
    expect(p.statusNote).toBeNull()
  })

  // No `sync` at all is not passthrough: it is an integration-server from
  // before sync schedules, which reports nothing either way.
  it('keeps the form but says the status is unknown when the server reports none', () => {
    const p = show({ syncMode: 'custom', syncIntervalMinutes: 90 })
    expect(p).toMatchObject({
      available: true,
      mode: 'custom',
      summary: 'Custom — every 90 minutes',
      lastSynced: 'Unknown',
      nextSync: 'Unknown',
      lastFailure: null,
      statusNote: 'Sync status unavailable from this server version.',
    })
  })

  it('has no status note when the server reports the state', () => {
    expect(show({ sync: state() }).statusNote).toBeNull()
  })
})

describe('originLabel', () => {
  it.each([
    ['schedule', 'Scheduled'],
    ['manual', 'Sync now'],
    ['api', 'API'],
    ['connect', 'After connecting'],
    ['boot', 'On boot'],
    // Not an own key of the map, so the raw value — never Object.prototype's.
    ['constructor', 'constructor'],
  ])('%s', (origin, label) => {
    expect(originLabel(origin)).toBe(label)
  })
})
